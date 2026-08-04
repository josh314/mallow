import { ProductDataService } from './service';
import type { ProductDataSource } from './source';
import type { ProductData } from './types';
import type { DbClient } from '../db/client';
import { findTenantProductData } from './tenant-product-data-queries';

jest.mock( './tenant-product-data-queries' );

const findTenantProductDataMock = findTenantProductData as jest.Mock;

function makeSource( result: ProductData | null ): ProductDataSource {
  return { lookup: jest.fn().mockResolvedValue( result ) };
}

const fakeDb = {} as DbClient;
const identifier = { idType: 'upc' as const, value: '041598000539' };

beforeEach( () => {
  findTenantProductDataMock.mockReset();
  findTenantProductDataMock.mockResolvedValue( null );
} );

describe( 'ProductDataService', () => {

  it( 'returns the cascade result unchanged when there is no tenant override', async () => {

    const cascadeResult: ProductData = { identifier, name: 'Cascade Name', description: 'Cascade Desc' };
    const service = new ProductDataService( fakeDb, [ makeSource( cascadeResult ) ] );

    const result = await service.getProductData( 'org-uuid', '041598000539' );

    expect( result ).toEqual( { ...cascadeResult, customFields: {} } );
    expect( findTenantProductDataMock ).toHaveBeenCalledWith( fakeDb, 'org-uuid', identifier );

  } );

  it( 'overlays non-null tenant fields on top of the cascade result', async () => {

    const cascadeResult: ProductData = { identifier, name: 'Cascade Name', description: 'Cascade Desc' };
    findTenantProductDataMock.mockResolvedValue( {
      name: null, description: null, brand: 'Tenant Brand', price: 9.99, images: null,
      customFields: { color: 'red' },
    } );

    const service = new ProductDataService( fakeDb, [ makeSource( cascadeResult ) ] );
    const result = await service.getProductData( 'org-uuid', '041598000539' );

    expect( result ).toEqual( {
      identifier,
      name: 'Cascade Name',
      description: 'Cascade Desc',
      brand: 'Tenant Brand',
      price: 9.99,
      customFields: { color: 'red' },
    } );

  } );

  it( 'uses tenant data alone when the cascade misses entirely', async () => {

    findTenantProductDataMock.mockResolvedValue( {
      name: 'Tenant-only Name', description: null, brand: null, price: null, images: null,
      customFields: { note: 'manual entry' },
    } );

    const service = new ProductDataService( fakeDb, [ makeSource( null ) ] );
    const result = await service.getProductData( 'org-uuid', '041598000539' );

    expect( result ).toEqual( { identifier, name: 'Tenant-only Name', customFields: { note: 'manual entry' } } );

  } );

  it( 'returns null when neither the cascade nor the tenant override has a name', async () => {

    findTenantProductDataMock.mockResolvedValue( {
      name: null, description: null, brand: null, price: null, images: null,
      customFields: { note: 'incomplete' },
    } );

    const service = new ProductDataService( fakeDb, [ makeSource( null ) ] );
    const result = await service.getProductData( 'org-uuid', '041598000539' );

    expect( result ).toBeNull();

  } );

  it( 'still short-circuits the cascade once a source hits', async () => {

    const cascadeResult: ProductData = { identifier, name: 'First Source' };
    const firstSource = makeSource( cascadeResult );
    const secondSource = makeSource( null );
    const { lookup: secondLookupMock } = secondSource as unknown as { lookup: jest.Mock };

    const service = new ProductDataService( fakeDb, [ firstSource, secondSource ] );
    await service.getProductData( 'org-uuid', '041598000539' );

    expect( secondLookupMock ).not.toHaveBeenCalled();

  } );

} );
