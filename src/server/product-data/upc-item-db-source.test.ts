import { UpcItemDbSource } from './upc-item-db-source';
import type { UpcItemDbClient } from './upc-item-db-client';
import type { UpcItemDbItem } from './upc-item-db-types';

function makeFakeClient(): UpcItemDbClient {
  return { lookup: jest.fn() } as unknown as UpcItemDbClient;
}

describe( 'UpcItemDbSource', () => {

  it( 'returns null without calling the client for an unsupported id type (asin)', async () => {

    const client = makeFakeClient();
    const { lookup: lookupMock } = client as unknown as { lookup: jest.Mock };
    const source = new UpcItemDbSource( client );

    const result = await source.lookup( { idType: 'asin', value: 'B08N5WRWNW' } );

    expect( result ).toBeNull();
    expect( lookupMock ).not.toHaveBeenCalled();

  } );

  it( 'returns null without calling the client for an unsupported id type (fnsku)', async () => {

    const client = makeFakeClient();
    const { lookup: lookupMock } = client as unknown as { lookup: jest.Mock };
    const source = new UpcItemDbSource( client );

    const result = await source.lookup( { idType: 'fnsku', value: 'X001ABCDEF' } );

    expect( result ).toBeNull();
    expect( lookupMock ).not.toHaveBeenCalled();

  } );

  it( 'maps a UPCItemDB item to ProductData for a upc identifier', async () => {

    const item: UpcItemDbItem = {
      upc: '041598000539',
      title: 'Test Product',
      description: 'A test product',
      brand: 'Acme',
      images: [ 'https://example.com/a.jpg' ],
      lowest_recorded_price: 9.99,
    };

    const client = makeFakeClient();
    const { lookup: lookupMock } = client as unknown as { lookup: jest.Mock };
    lookupMock.mockResolvedValueOnce( item );

    const source = new UpcItemDbSource( client );
    const identifier = { idType: 'upc' as const, value: '041598000539' };
    const result = await source.lookup( identifier );

    expect( lookupMock ).toHaveBeenCalledWith( '041598000539' );
    expect( result ).toEqual( {
      identifier,
      name: 'Test Product',
      description: 'A test product',
      brand: 'Acme',
      price: 9.99,
      images: [ 'https://example.com/a.jpg' ],
    } );

  } );

  it( 'returns null when the client finds nothing', async () => {

    const client = makeFakeClient();
    ( client.lookup as jest.Mock ).mockResolvedValueOnce( null );

    const source = new UpcItemDbSource( client );
    const result = await source.lookup( { idType: 'ean', value: '4006381333931' } );

    expect( result ).toBeNull();

  } );

  it( 'returns null when the item has no title', async () => {

    const client = makeFakeClient();
    ( client.lookup as jest.Mock ).mockResolvedValueOnce( { upc: '041598000539' } );

    const source = new UpcItemDbSource( client );
    const result = await source.lookup( { idType: 'upc', value: '041598000539' } );

    expect( result ).toBeNull();

  } );

} );
