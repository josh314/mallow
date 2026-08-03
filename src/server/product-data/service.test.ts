import type { DbClient } from '../db/client';
import { ProductDataService } from './service';
import { UpcItemDbClient } from './upc-item-db-client';
import type { UpcItemDbItem } from './upc-item-db-types';

jest.mock( './upc-item-db-client' );

const { lookup: lookupMock } = UpcItemDbClient.prototype as unknown as { lookup: jest.Mock };

const fakeDb = {} as DbClient;

function makeService(): ProductDataService {
  return new ProductDataService( fakeDb, { upcItemDbUserKey: 'test-upcitemdb-key' } );
}

describe( 'ProductDataService', () => {

  test( 'getProductData maps a UPCItemDB item to ProductData', async () => {

    const item: UpcItemDbItem = { upc: '041598000539', title: 'Test Product', description: 'A test product' };
    lookupMock.mockResolvedValueOnce( item );

    const result = await makeService().getProductData( '041598000539' );

    expect( lookupMock ).toHaveBeenCalledWith( '041598000539' );
    expect( result ).toEqual( {
      barcode: '041598000539',
      name: 'Test Product',
      description: 'A test product',
    } );

  } );

  test( 'getProductData returns null when no item is found', async () => {

    lookupMock.mockResolvedValueOnce( null );

    const result = await makeService().getProductData( '000000000000' );

    expect( result ).toBeNull();

  } );

  test( 'getProductData returns null when the item has no title', async () => {

    const item: UpcItemDbItem = { upc: '041598000539' };
    lookupMock.mockResolvedValueOnce( item );

    const result = await makeService().getProductData( '041598000539' );

    expect( result ).toBeNull();

  } );

} );
