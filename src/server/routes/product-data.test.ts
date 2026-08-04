import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';
import { PostgresError } from 'postgres';

import { requireAuth } from '../middleware/require-auth';
import { createProductDataRouter } from './product-data';
import type { ProductDataService } from '../product-data/service';
import type { SessionUser } from '../users/types';
import type { ProductData } from '../product-data/types';
import type { DbClient } from '../db/client';
import type { TenantProductData } from '../product-data/tenant-product-data-types';
import {
  createTenantProductData,
  listTenantProductData,
  countTenantProductData,
  updateTenantProductData,
  softDeleteTenantProductData,
} from '../product-data/tenant-product-data-queries';

jest.mock( '../middleware/require-auth' );
jest.mock( '../product-data/tenant-product-data-queries' );

function makePostgresError( code: string ): PostgresError {
  const err = Object.create( PostgresError.prototype ) as PostgresError;
  Object.assign( err, { code, message: `postgres error ${ code }` } );
  return err;
}

// --- Helpers ---

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

const employee: SessionUser = { id: 'user-uuid', organizationId: 'org-uuid', role: 'employee', isSuperadmin: false };

const fakeProductData: ProductData = {
  identifier: { idType: 'upc', value: '041598000539' },
  name: 'Mock Product',
};

const fakeOverride: TenantProductData = {
  id: 'override-uuid',
  organizationId: 'org-uuid',
  idType: 'upc',
  identifier: '041598000539',
  name: 'Tenant Name',
  description: null,
  brand: null,
  price: null,
  images: null,
  customFields: {},
  createdAt: new Date( '2026-01-01' ),
  updatedAt: new Date( '2026-01-01' ),
  deletedAt: null,
};

const getProductData = jest.fn<Promise<ProductData | null>, [ string, string ]>();
const productDataService = { getProductData } as unknown as ProductDataService;

// --- App ---

const app = ( () => {
  const a = express();
  a.use( express.json() );
  a.use( '/product-data', createProductDataRouter( productDataService, {} as DbClient ) );
  a.use( ( err: Error, _req: Request, res: Response, _next: NextFunction ) => {
    res.status( 500 ).json( { error: true, message: err.message } );
  } );
  return a;
} )();

// ─── GET /product-data ────────────────────────────────────────────────────────

describe( 'GET /product-data', () => {

  it( 'returns 401 when not authenticated', async () => {
    await request( app )
      .get( '/product-data' )
      .query( { barcode: '041598000539' } )
      .expect( 401 );
  } );

  it( 'returns 400 when barcode is missing', async () => {
    mockSessionUser = employee;
    await request( app )
      .get( '/product-data' )
      .expect( 400 );
  } );

  it( 'returns 404 when no product data is found', async () => {
    mockSessionUser = employee;
    getProductData.mockResolvedValueOnce( null );

    await request( app )
      .get( '/product-data' )
      .query( { barcode: '041598000539' } )
      .expect( 404 );
  } );

  it( 'returns product data for a valid barcode', async () => {
    mockSessionUser = employee;
    getProductData.mockResolvedValueOnce( fakeProductData );

    const res = await request( app )
      .get( '/product-data' )
      .query( { barcode: '041598000539' } )
      .expect( 200 );

    expect( res.body ).toEqual( { productData: fakeProductData } );
    expect( getProductData ).toHaveBeenCalledWith( 'org-uuid', '041598000539' );
  } );

} );

describe( 'GET /product-data/overrides', () => {

  it( 'returns 401 when not authenticated', async () => {
    await request( app ).get( '/product-data/overrides' ).expect( 401 );
  } );

  it( 'returns the caller org\'s overrides', async () => {

    mockSessionUser = employee;
    ( listTenantProductData as jest.Mock ).mockResolvedValueOnce( [ fakeOverride ] );
    ( countTenantProductData as jest.Mock ).mockResolvedValueOnce( 1 );

    const res = await request( app ).get( '/product-data/overrides' ).expect( 200 );

    expect( res.body ).toEqual( { overrides: [ { ...fakeOverride, createdAt: fakeOverride.createdAt.toISOString(), updatedAt: fakeOverride.updatedAt.toISOString() } ], total: 1, limit: 20, offset: 0 } );
    expect( listTenantProductData ).toHaveBeenCalledWith( expect.anything(), { organizationId: 'org-uuid', limit: 20, offset: 0 } );

  } );

} );

describe( 'POST /product-data/overrides', () => {

  it( 'returns 401 when not authenticated', async () => {
    await request( app ).post( '/product-data/overrides' ).send( { identifier: '041598000539', name: 'X' } ).expect( 401 );
  } );

  it( 'returns 400 when no override fields are provided', async () => {
    mockSessionUser = employee;
    await request( app ).post( '/product-data/overrides' ).send( { identifier: '041598000539' } ).expect( 400 );
  } );

  it( 'creates an override, auto-detecting the id type from the identifier', async () => {

    mockSessionUser = employee;
    ( createTenantProductData as jest.Mock ).mockResolvedValueOnce( fakeOverride );

    const res = await request( app )
      .post( '/product-data/overrides' )
      .send( { identifier: '041598000539', name: 'Tenant Name' } )
      .expect( 201 );

    expect( res.body.override.id ).toBe( 'override-uuid' );
    expect( createTenantProductData ).toHaveBeenCalledWith( expect.anything(), expect.objectContaining( {
      organizationId: 'org-uuid',
      idType: 'upc',
      identifier: '041598000539',
      name: 'Tenant Name',
    } ) );

  } );

  it( 'returns 409 on a duplicate override', async () => {

    mockSessionUser = employee;
    ( createTenantProductData as jest.Mock ).mockRejectedValueOnce( makePostgresError( '23505' ) );

    await request( app )
      .post( '/product-data/overrides' )
      .send( { identifier: '041598000539', name: 'Tenant Name' } )
      .expect( 409 );

  } );

} );

describe( 'PATCH /product-data/overrides/:id', () => {

  it( 'returns 401 when not authenticated', async () => {
    await request( app ).patch( '/product-data/overrides/override-uuid' ).send( { price: 1 } ).expect( 401 );
  } );

  it( 'returns 400 when no fields are provided', async () => {
    mockSessionUser = employee;
    await request( app ).patch( '/product-data/overrides/override-uuid' ).send( {} ).expect( 400 );
  } );

  it( 'returns 404 when the override is not found in the caller\'s org', async () => {

    mockSessionUser = employee;
    ( updateTenantProductData as jest.Mock ).mockResolvedValueOnce( null );

    await request( app ).patch( '/product-data/overrides/override-uuid' ).send( { price: 1 } ).expect( 404 );

  } );

  it( 'updates an override', async () => {

    mockSessionUser = employee;
    ( updateTenantProductData as jest.Mock ).mockResolvedValueOnce( { ...fakeOverride, price: 12.5 } );

    const res = await request( app ).patch( '/product-data/overrides/override-uuid' ).send( { price: 12.5 } ).expect( 200 );

    expect( res.body.override.price ).toBe( 12.5 );
    expect( updateTenantProductData ).toHaveBeenCalledWith( expect.anything(), 'org-uuid', 'override-uuid', { price: 12.5 } );

  } );

} );

describe( 'DELETE /product-data/overrides/:id', () => {

  it( 'returns 401 when not authenticated', async () => {
    await request( app ).delete( '/product-data/overrides/override-uuid' ).expect( 401 );
  } );

  it( 'returns 404 when the override is not found in the caller\'s org', async () => {

    mockSessionUser = employee;
    ( softDeleteTenantProductData as jest.Mock ).mockResolvedValueOnce( false );

    await request( app ).delete( '/product-data/overrides/override-uuid' ).expect( 404 );

  } );

  it( 'soft-deletes an override', async () => {

    mockSessionUser = employee;
    ( softDeleteTenantProductData as jest.Mock ).mockResolvedValueOnce( true );

    await request( app ).delete( '/product-data/overrides/override-uuid' ).expect( 204 );

  } );

} );
