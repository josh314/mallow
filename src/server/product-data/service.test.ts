import type { DbClient } from '../db/client';
import { ProductDataService } from './service';

const fakeDb = {} as DbClient;

describe( 'ProductDataService', () => {

  test( 'getProductData returns mock product data for the given barcode', async () => {

    const service = new ProductDataService( fakeDb );
    const result = await service.getProductData( '041598000539' );

    expect( result ).toEqual( {
      barcode: '041598000539',
      name: 'Mock Product',
    } );

  } );

} );
