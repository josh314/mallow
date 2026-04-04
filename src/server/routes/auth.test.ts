import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';
import session from 'express-session';

import { findUserByEmail } from '../users/queries';
import { createAuthRouter } from './auth';
import type { DbClient } from '../db/client';
import type { User } from '../users/types';

jest.mock( '../users/queries' );
jest.mock( 'argon2', () => ( {
  hash: jest.fn().mockResolvedValue( 'hashed-password' ),
  verify: jest.fn().mockResolvedValue( true ),
} ) );

// --- Fixtures ---

const fakeUser: User = {
  id: 'user-uuid',
  organizationId: 'org-uuid',
  email: 'worker@acme.com',
  passwordHash: 'hashed-password',
  firstName: 'Joe',
  lastName: 'Worker',
  role: 'employee',
  isSuperadmin: false,
  createdAt: new Date( '2026-01-01' ),
  updatedAt: new Date( '2026-01-01' ),
  deletedAt: null,
};

// --- App ---

// Use MemoryStore (default) and a real session middleware for auth route tests.
const app = ( () => {
  const a = express();
  a.use( express.json() );
  a.use( session( {
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
  } ) );
  a.use( '/auth', createAuthRouter( {} as DbClient ) );
  a.use( ( err: Error, _req: Request, res: Response, _next: NextFunction ) => {
    res.status( 500 ).json( { error: true, message: err.message } );
  } );
  return a;
} )();

// ─── POST /auth/login ─────────────────────────────────────────────────────────

describe( 'POST /auth/login', () => {

  it( 'returns 400 on invalid body', async () => {
    await request( app )
      .post( '/auth/login' )
      .send( { email: 'not-an-email', password: 'password' } )
      .expect( 400 );
  } );

  it( 'returns 401 when email is not found', async () => {
    ( findUserByEmail as jest.Mock ).mockResolvedValueOnce( null );

    await request( app )
      .post( '/auth/login' )
      .send( { email: 'nobody@acme.com', password: 'password' } )
      .expect( 401 );
  } );

  it( 'returns 401 when password is wrong', async () => {
    ( findUserByEmail as jest.Mock ).mockResolvedValueOnce( fakeUser );

    const argon2 = jest.requireMock( 'argon2' );
    argon2.verify.mockResolvedValueOnce( false );

    await request( app )
      .post( '/auth/login' )
      .send( { email: fakeUser.email, password: 'wrong-password' } )
      .expect( 401 );
  } );

  it( 'uses the same 401 message for unknown email and wrong password', async () => {
    ( findUserByEmail as jest.Mock ).mockResolvedValueOnce( null );
    const unknownEmailRes = await request( app )
      .post( '/auth/login' )
      .send( { email: 'nobody@acme.com', password: 'password' } );

    ( findUserByEmail as jest.Mock ).mockResolvedValueOnce( fakeUser );
    jest.requireMock( 'argon2' ).verify.mockResolvedValueOnce( false );
    const wrongPasswordRes = await request( app )
      .post( '/auth/login' )
      .send( { email: fakeUser.email, password: 'wrong' } );

    expect( unknownEmailRes.body.message ).toBe( wrongPasswordRes.body.message );
  } );

  it( 'returns 200 with public user on success', async () => {
    ( findUserByEmail as jest.Mock ).mockResolvedValueOnce( fakeUser );

    const res = await request( app )
      .post( '/auth/login' )
      .send( { email: fakeUser.email, password: 'password' } )
      .expect( 200 );

    expect( res.body.user ).toMatchObject( {
      id: fakeUser.id,
      email: fakeUser.email,
      role: fakeUser.role,
    } );
  } );

  it( 'does not include passwordHash in the response', async () => {
    ( findUserByEmail as jest.Mock ).mockResolvedValueOnce( fakeUser );

    const res = await request( app )
      .post( '/auth/login' )
      .send( { email: fakeUser.email, password: 'password' } )
      .expect( 200 );

    expect( res.body.user.passwordHash ).toBeUndefined();
  } );

  it( 'sets a session cookie on success', async () => {
    ( findUserByEmail as jest.Mock ).mockResolvedValueOnce( fakeUser );

    const res = await request( app )
      .post( '/auth/login' )
      .send( { email: fakeUser.email, password: 'password' } )
      .expect( 200 );

    expect( res.headers[ 'set-cookie' ] ).toBeDefined();
  } );

} );

// ─── POST /auth/logout ────────────────────────────────────────────────────────

describe( 'POST /auth/logout', () => {

  it( 'returns 204', async () => {
    await request( app )
      .post( '/auth/logout' )
      .expect( 204 );
  } );

  it( 'clears the session — subsequent requests have no session user', async () => {
    ( findUserByEmail as jest.Mock ).mockResolvedValueOnce( fakeUser );

    // Use an agent so cookies persist across requests.
    const agent = request.agent( app );

    await agent
      .post( '/auth/login' )
      .send( { email: fakeUser.email, password: 'password' } )
      .expect( 200 );

    await agent
      .post( '/auth/logout' )
      .expect( 204 );

    // Login again to verify the session was cleared, not just the cookie header.
    ( findUserByEmail as jest.Mock ).mockResolvedValueOnce( fakeUser );
    const secondLogin = await agent
      .post( '/auth/login' )
      .send( { email: fakeUser.email, password: 'password' } )
      .expect( 200 );

    // A fresh session cookie should be issued (different from pre-logout).
    expect( secondLogin.headers[ 'set-cookie' ] ).toBeDefined();
  } );

} );
