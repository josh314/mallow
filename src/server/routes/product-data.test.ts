import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';

import { requireAuth } from '../middleware/require-auth';
import { createProductDataRouter } from './product-data';
import type { ProductDataService } from '../product-data/service';
import type { SessionUser } from '../users/types';
import type { ProductData } from '../product-data/types';

jest.mock( '../middleware/require-auth' );

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

const getProductData = jest.fn<Promise<ProductData | null>, [ string, string ]>();
const productDataService = { getProductData } as unknown as ProductDataService;

// --- App ---

const app = ( () => {
  const a = express();
  a.use( express.json() );
  a.use( '/product-data', createProductDataRouter( productDataService ) );
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
