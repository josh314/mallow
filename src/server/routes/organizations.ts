import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { PostgresError } from 'postgres';

import type { DbClient } from '../db/client';
import { requireAuth } from '../middleware/require-auth';
import { userRoles, roleRank } from '../users/types';
import { createOrganization } from '../organizations/queries';
import { createUser } from '../users/queries';

const createOrgBody = z.object( {
  name: z.string().min( 1 ),
  slug: z.string().min( 1 ).regex( /^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens' ),
} );

const createUserBody = z.object( {
  email: z.string().email(),
  password: z.string().min( 8 ),
  firstName: z.string().min( 1 ),
  lastName: z.string().min( 1 ),
  role: z.enum( userRoles ),
} );

export function createOrganizationRouter( db: DbClient ): Router {

  const router = Router();

  // POST /organizations — superadmin only
  router.post( '/', requireAuth, async ( req: Request, res: Response ) => {

    if( !req.user.isSuperadmin ) {
      res.status( 403 ).json( { error: true, message: 'Forbidden' } );
      return;
    }

    const body = createOrgBody.safeParse( req.body );
    if( !body.success ) {
      res.status( 400 ).json( { error: true, message: body.error.issues[ 0 ]?.message } );
      return;
    }

    try {
      const organization = await createOrganization( db, body.data );
      res.status( 201 ).json( { organization } );
    }
    catch( err ) {
      if( err instanceof PostgresError && err.code === '23505' ) {
        res.status( 409 ).json( { error: true, message: 'Slug already taken' } );
        return;
      }
      throw err;
    }

  } );

  // POST /organizations/:id/users — superadmin, or owner/manager within own org
  router.post( '/:id/users', requireAuth, async ( req: Request, res: Response ) => {

    const orgId = req.params.id;
    const { user } = req;

    if( !user.isSuperadmin && user.organizationId !== orgId ) {
      res.status( 403 ).json( { error: true, message: 'Forbidden' } );
      return;
    }

    const body = createUserBody.safeParse( req.body );
    if( !body.success ) {
      res.status( 400 ).json( { error: true, message: body.error.issues[ 0 ]?.message } );
      return;
    }

    const { role } = body.data;

    // Non-superadmins may only create users with a strictly lower role than their own.
    if( !user.isSuperadmin && roleRank( role ) <= roleRank( user.role ) ) {
      res.status( 403 ).json( { error: true, message: 'Cannot assign a role equal to or higher than your own' } );
      return;
    }

    const passwordHash = await argon2.hash( body.data.password );

    try {
      const created = await createUser( db, {
        organizationId: orgId,
        email: body.data.email,
        passwordHash,
        firstName: body.data.firstName,
        lastName: body.data.lastName,
        role,
      } );

      const { passwordHash: _omit, ...publicUser } = created;
      res.status( 201 ).json( { user: publicUser } );
    }
    catch( err ) {
      if( err instanceof PostgresError ) {
        if( err.code === '23505' ) {
          res.status( 409 ).json( { error: true, message: 'Email already in use' } );
          return;
        }
        if( err.code === '23503' ) {
          res.status( 404 ).json( { error: true, message: 'Organization not found' } );
          return;
        }
      }
      throw err;
    }

  } );

  return router;

}
