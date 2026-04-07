import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';

import type { DbClient } from '../db/client';
import { findUserByEmail } from '../users/queries';

export const loginBody = z.object( {
  email: z.string().email(),
  password: z.string().min( 1 ),
} );

export function createAuthRouter( db: DbClient ): Router {

  const router = Router();

  // POST /auth/login
  router.post( '/login', async ( req: Request, res: Response ) => {

    const body = loginBody.safeParse( req.body );
    if( !body.success ) {
      res.status( 400 ).json( { error: true, message: body.error.issues[ 0 ]?.message } );
      return;
    }

    const user = await findUserByEmail( db, body.data.email );

    // Use the same message for unknown email and wrong password — don't leak which emails are registered.
    const invalid = () => res.status( 401 ).json( { error: true, message: 'Invalid email or password' } );

    if( !user ) {
      invalid();
      return;
    }

    const passwordOk = await argon2.verify( user.passwordHash, body.data.password );
    if( !passwordOk ) {
      invalid();
      return;
    }

    // Regenerate session ID before storing credentials (prevents session fixation).
    await new Promise<void>( ( resolve, reject ) => {
      req.session.regenerate( ( err ) => err ? reject( err instanceof Error ? err : new Error( String( err ) ) ) : resolve() );
    } );

    req.session.user = {
      id: user.id,
      organizationId: user.organizationId,
      role: user.role,
      isSuperadmin: user.isSuperadmin,
    };

    const { passwordHash: _omit, ...publicUser } = user;
    res.status( 200 ).json( { user: publicUser } );

  } );

  // POST /auth/logout
  router.post( '/logout', async ( req: Request, res: Response ) => {

    await new Promise<void>( ( resolve, reject ) => {
      req.session.destroy( ( err ) => err ? reject( err instanceof Error ? err : new Error( String( err ) ) ) : resolve() );
    } );

    res.clearCookie( 'connect.sid' );
    res.status( 204 ).send();

  } );

  return router;

}
