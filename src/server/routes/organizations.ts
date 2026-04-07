import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { PostgresError } from 'postgres';

import type { DbClient } from '../db/client';
import { requireAuth } from '../middleware/require-auth';
import { userRoles, roleRank } from '../users/types';
import {
  createOrganization,
  findOrganizationById,
  listOrganizations,
  countOrganizations,
} from '../organizations/queries';
import {
  createUser,
  findUserById,
  listUsers,
  countUsers,
} from '../users/queries';

export const createOrgBody = z.object( {
  name: z.string().min( 1 ),
  slug: z.string().min( 1 ).regex( /^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens' ),
} );

export const createUserBody = z.object( {
  email: z.string().email(),
  password: z.string().min( 8 ),
  firstName: z.string().min( 1 ),
  lastName: z.string().min( 1 ),
  role: z.enum( userRoles ),
} );

export const listOrgsQuery = z.object( {
  limit:  z.coerce.number().int().min( 1 ).max( 100 ).default( 20 ),
  offset: z.coerce.number().int().min( 0 ).default( 0 ),
  search: z.string().optional(),
} );

export const listUsersQuery = z.object( {
  limit:  z.coerce.number().int().min( 1 ).max( 100 ).default( 20 ),
  offset: z.coerce.number().int().min( 0 ).default( 0 ),
  email:  z.string().optional(),
  role:   z.enum( userRoles ).optional(),
} );

export function createOrganizationRouter( db: DbClient ): Router {

  const router = Router();

  // GET /organizations — superadmin only
  router.get( '/', requireAuth, async ( req: Request, res: Response ) => {

    if( !req.user.isSuperadmin ) {
      res.status( 403 ).json( { error: true, message: 'Forbidden' } );
      return;
    }

    const query = listOrgsQuery.safeParse( req.query );
    if( !query.success ) {
      res.status( 400 ).json( { error: true, message: query.error.issues[ 0 ]?.message } );
      return;
    }

    const { limit, offset, search } = query.data;
    const [ organizations, total ] = await Promise.all( [
      listOrganizations( db, { search, limit, offset } ),
      countOrganizations( db, { search } ),
    ] );

    res.json( { organizations, total, limit, offset } );

  } );

  // GET /organizations/:id — superadmin or any member of that org
  router.get( '/:id', requireAuth, async ( req: Request, res: Response ) => {

    const orgId = req.params.id;
    const { user } = req;

    if( !user.isSuperadmin && user.organizationId !== orgId ) {
      res.status( 403 ).json( { error: true, message: 'Forbidden' } );
      return;
    }

    const organization = await findOrganizationById( db, orgId );
    if( !organization ) {
      res.status( 404 ).json( { error: true, message: 'Organization not found' } );
      return;
    }

    res.json( { organization } );

  } );

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

  // GET /organizations/:id/users — superadmin or owner/manager of that org
  // FLAG: user list exposes email and role data — restrict to owner/manager and above
  router.get( '/:id/users', requireAuth, async ( req: Request, res: Response ) => {

    const orgId = req.params.id;
    const { user } = req;

    const canAccess = user.isSuperadmin
      || ( user.organizationId === orgId && roleRank( user.role ) <= roleRank( 'manager' ) );

    if( !canAccess ) {
      res.status( 403 ).json( { error: true, message: 'Forbidden' } );
      return;
    }

    const query = listUsersQuery.safeParse( req.query );
    if( !query.success ) {
      res.status( 400 ).json( { error: true, message: query.error.issues[ 0 ]?.message } );
      return;
    }

    const { limit, offset, email, role } = query.data;
    const [ users, total ] = await Promise.all( [
      listUsers( db, { organizationId: orgId, email, role, limit, offset } ),
      countUsers( db, { organizationId: orgId, email, role } ),
    ] );

    const publicUsers = users.map( ( { passwordHash: _omit, ...u } ) => u );
    res.json( { users: publicUsers, total, limit, offset } );

  } );

  // GET /organizations/:id/users/:userId — superadmin, owner/manager of that org, or self
  router.get( '/:id/users/:userId', requireAuth, async ( req: Request, res: Response ) => {

    const orgId = req.params.id;
    const userId = req.params.userId;
    const { user } = req;

    const isSelf    = user.id === userId;
    const canAccess = user.isSuperadmin
      || ( user.organizationId === orgId && ( roleRank( user.role ) <= roleRank( 'manager' ) || isSelf ) );

    if( !canAccess ) {
      res.status( 403 ).json( { error: true, message: 'Forbidden' } );
      return;
    }

    const found = await findUserById( db, userId, user.isSuperadmin ? undefined : orgId );
    if( !found ) {
      res.status( 404 ).json( { error: true, message: 'User not found' } );
      return;
    }

    const { passwordHash: _omit, ...publicUser } = found;
    res.json( { user: publicUser } );

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
