import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';
import { PostgresError } from 'postgres';

import { requireAuth } from '../middleware/require-auth';
import { createOrganization } from '../organizations/queries';
import { createUser } from '../users/queries';
import { createOrganizationRouter } from './organizations';
import type { DbClient } from '../db/client';
import type { SessionUser, User } from '../users/types';
import type { Organization } from '../organizations/types';

jest.mock('../middleware/require-auth');
jest.mock('../organizations/queries');
jest.mock('../users/queries');
jest.mock( 'argon2', () => ( {
  hash: jest.fn().mockResolvedValue( 'hashed-password' ),
} ) );

// --- Helpers ---

function makePostgresError( code: string ): PostgresError {
  const err = Object.create( PostgresError.prototype ) as PostgresError;
  Object.assign( err, { code, message: `postgres error ${ code }` } );
  return err;
}

// Controls which user requireAuth injects. Set to undefined to simulate unauthenticated.
let mockSessionUser: SessionUser | undefined;

beforeEach( () => {
  mockSessionUser = undefined;
  ( requireAuth as jest.Mock ).mockImplementation(
    ( req: Request, res: Response, next: NextFunction ) => {
      if( !mockSessionUser ) {
        res.status( 401 ).json( { error: true, message: 'Unauthorized' } );
        return;
      }
      req.user = mockSessionUser;
      next();
    }
  );
} );

// --- Fixtures ---

const fakeOrg: Organization = {
  id: 'org-uuid',
  name: 'Acme',
  slug: 'acme',
  createdAt: new Date( '2026-01-01' ),
  updatedAt: new Date( '2026-01-01' ),
  deletedAt: null,
};

const fakeUser: User = {
  id: 'user-uuid',
  organizationId: 'org-uuid',
  email: 'worker@acme.com',
  passwordHash: 'should-not-appear',
  firstName: 'Joe',
  lastName: 'Worker',
  role: 'employee',
  isSuperadmin: false,
  createdAt: new Date( '2026-01-01' ),
  updatedAt: new Date( '2026-01-01' ),
  deletedAt: null,
};

const superadmin: SessionUser = { id: 'sa-uuid', organizationId: 'mallow-uuid', role: 'owner', isSuperadmin: true };
const owner: SessionUser     = { id: 'owner-uuid', organizationId: 'org-uuid', role: 'owner', isSuperadmin: false };
const manager: SessionUser   = { id: 'mgr-uuid', organizationId: 'org-uuid', role: 'manager', isSuperadmin: false };

// --- App ---

const app = ( () => {
  const a = express();
  a.use( express.json() );
  a.use( '/organizations', createOrganizationRouter( {} as DbClient ) );
  // Minimal error handler so Express 5 async errors don't go unhandled in tests.
  a.use( ( err: Error, _req: Request, res: Response, _next: NextFunction ) => {
    res.status( 500 ).json( { error: true, message: err.message } );
  } );
  return a;
} )();

// ─── POST /organizations ──────────────────────────────────────────────────────

describe( 'POST /organizations', () => {

  it( 'returns 401 when not authenticated', async () => {
    await request( app )
      .post( '/organizations' )
      .send( { name: 'Acme', slug: 'acme' } )
      .expect( 401 );
  } );

  it( 'returns 403 when authenticated but not superadmin', async () => {
    mockSessionUser = owner;
    await request( app )
      .post( '/organizations' )
      .send( { name: 'Acme', slug: 'acme' } )
      .expect( 403 );
  } );

  it( 'returns 400 when name is missing', async () => {
    mockSessionUser = superadmin;
    await request( app )
      .post( '/organizations' )
      .send( { slug: 'acme' } )
      .expect( 400 );
  } );

  it( 'returns 400 when slug contains invalid characters', async () => {
    mockSessionUser = superadmin;
    await request( app )
      .post( '/organizations' )
      .send( { name: 'Acme', slug: 'Acme Corp' } )
      .expect( 400 );
  } );

  it( 'returns 201 with the created organization', async () => {
    mockSessionUser = superadmin;
    ( createOrganization as jest.Mock ).mockResolvedValueOnce( fakeOrg );

    const res = await request( app )
      .post( '/organizations' )
      .send( { name: 'Acme', slug: 'acme' } )
      .expect( 201 );

    expect( res.body.organization ).toMatchObject( { name: 'Acme', slug: 'acme' } );
    expect( createOrganization ).toHaveBeenCalledWith(
      expect.anything(),
      { name: 'Acme', slug: 'acme' },
    );
  } );

  it( 'returns 409 on duplicate slug', async () => {
    mockSessionUser = superadmin;
    ( createOrganization as jest.Mock ).mockRejectedValueOnce( makePostgresError( '23505' ) );

    await request( app )
      .post( '/organizations' )
      .send( { name: 'Acme', slug: 'acme' } )
      .expect( 409 );
  } );

  it( 'rethrows non-Postgres errors', async () => {
    mockSessionUser = superadmin;
    ( createOrganization as jest.Mock ).mockRejectedValueOnce( new Error( 'unexpected' ) );

    await request( app )
      .post( '/organizations' )
      .send( { name: 'Acme', slug: 'acme' } )
      .expect( 500 );
  } );

} );

// ─── POST /organizations/:id/users ───────────────────────────────────────────

describe( 'POST /organizations/:id/users', () => {

  const validBody = {
    email: 'new@acme.com',
    password: 'password123',
    firstName: 'New',
    lastName: 'Person',
    role: 'employee',
  };

  it( 'returns 401 when not authenticated', async () => {
    await request( app )
      .post( '/organizations/org-uuid/users' )
      .send( validBody )
      .expect( 401 );
  } );

  it( 'returns 403 when non-superadmin targets a different org', async () => {
    mockSessionUser = owner; // owner of org-uuid
    await request( app )
      .post( '/organizations/other-org-uuid/users' )
      .send( validBody )
      .expect( 403 );
  } );

  it( 'returns 400 on invalid body', async () => {
    mockSessionUser = owner;
    await request( app )
      .post( '/organizations/org-uuid/users' )
      .send( { ...validBody, email: 'not-an-email' } )
      .expect( 400 );
  } );

  it( 'returns 400 on invalid role', async () => {
    mockSessionUser = owner;
    await request( app )
      .post( '/organizations/org-uuid/users' )
      .send( { ...validBody, role: 'superuser' } )
      .expect( 400 );
  } );

  it( 'returns 403 when non-superadmin tries to assign an equal role', async () => {
    mockSessionUser = manager; // role: manager
    await request( app )
      .post( '/organizations/org-uuid/users' )
      .send( { ...validBody, role: 'manager' } )
      .expect( 403 );
  } );

  it( 'returns 403 when non-superadmin tries to assign a higher role', async () => {
    mockSessionUser = manager; // role: manager
    await request( app )
      .post( '/organizations/org-uuid/users' )
      .send( { ...validBody, role: 'owner' } )
      .expect( 403 );
  } );

  it( 'returns 201 and hashes the password', async () => {
    mockSessionUser = owner;
    ( createUser as jest.Mock ).mockResolvedValueOnce( fakeUser );

    await request( app )
      .post( '/organizations/org-uuid/users' )
      .send( validBody )
      .expect( 201 );

    const argon2 = jest.requireMock( 'argon2' );
    expect( argon2.hash ).toHaveBeenCalledWith( validBody.password );
    expect( createUser ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining( { passwordHash: 'hashed-password' } ),
    );
  } );

  it( 'does not include passwordHash in the response', async () => {
    mockSessionUser = owner;
    ( createUser as jest.Mock ).mockResolvedValueOnce( fakeUser );

    const res = await request( app )
      .post( '/organizations/org-uuid/users' )
      .send( validBody )
      .expect( 201 );

    expect( res.body.user ).toBeDefined();
    expect( res.body.user.passwordHash ).toBeUndefined();
  } );

  it( 'superadmin can create an owner in any org', async () => {
    mockSessionUser = superadmin;
    ( createUser as jest.Mock ).mockResolvedValueOnce( { ...fakeUser, role: 'owner' } );

    await request( app )
      .post( '/organizations/some-other-org/users' )
      .send( { ...validBody, role: 'owner' } )
      .expect( 201 );
  } );

  it( 'returns 409 on duplicate email', async () => {
    mockSessionUser = owner;
    ( createUser as jest.Mock ).mockRejectedValueOnce( makePostgresError( '23505' ) );

    await request( app )
      .post( '/organizations/org-uuid/users' )
      .send( validBody )
      .expect( 409 );
  } );

  it( 'returns 404 when the org does not exist', async () => {
    mockSessionUser = superadmin;
    ( createUser as jest.Mock ).mockRejectedValueOnce( makePostgresError( '23503' ) );

    await request( app )
      .post( '/organizations/nonexistent/users' )
      .send( { ...validBody, role: 'owner' } )
      .expect( 404 );
  } );

  it( 'rethrows non-Postgres errors', async () => {
    mockSessionUser = owner;
    ( createUser as jest.Mock ).mockRejectedValueOnce( new Error( 'unexpected' ) );

    await request( app )
      .post( '/organizations/org-uuid/users' )
      .send( validBody )
      .expect( 500 );
  } );

} );
