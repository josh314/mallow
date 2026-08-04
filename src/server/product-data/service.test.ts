import { ProductDataService } from './service';
import type { ProductDataSource } from './source';
import type { ProductData } from './types';

function makeSource( lookupImpl: jest.Mock ): ProductDataSource {
  return { lookup: lookupImpl };
}

const identifier = { idType: 'upc' as const, value: '041598000539' };

const productData: ProductData = { identifier, name: 'Test Product' };

describe( 'ProductDataService', () => {

  it( 'returns the first non-null result from the source cascade', async () => {

    const firstLookup = jest.fn().mockResolvedValue( productData );
    const secondLookup = jest.fn().mockResolvedValue( null );

    const service = new ProductDataService( [ makeSource( firstLookup ), makeSource( secondLookup ) ] );
    const result = await service.getProductData( '041598000539' );

    expect( result ).toEqual( productData );
    expect( firstLookup ).toHaveBeenCalledWith( identifier );
    expect( secondLookup ).not.toHaveBeenCalled();

  } );

  it( 'falls through to the next source when the first misses', async () => {

    const firstLookup = jest.fn().mockResolvedValue( null );
    const secondLookup = jest.fn().mockResolvedValue( productData );

    const service = new ProductDataService( [ makeSource( firstLookup ), makeSource( secondLookup ) ] );
    const result = await service.getProductData( '041598000539' );

    expect( result ).toEqual( productData );
    expect( secondLookup ).toHaveBeenCalledWith( identifier );

  } );

  it( 'returns null when every source misses', async () => {

    const service = new ProductDataService( [ makeSource( jest.fn().mockResolvedValue( null ) ) ] );
    const result = await service.getProductData( '041598000539' );

    expect( result ).toBeNull();

  } );

  it( 'returns null when there are no sources', async () => {

    const service = new ProductDataService( [] );
    const result = await service.getProductData( '041598000539' );

    expect( result ).toBeNull();

  } );

} );
