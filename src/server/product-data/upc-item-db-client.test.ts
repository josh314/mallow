import ky, { HTTPError } from 'ky';

import { UpcItemDbClient } from './upc-item-db-client';
import { getCachedUpcItem, upsertCachedUpcItem } from './upc-item-db-cache-queries';
import type { DbClient } from '../db/client';
import type { UpcItemDbItem, UpcItemDbLookupResponse } from './upc-item-db-types';

jest.mock( './upc-item-db-cache-queries' );

const createMock = ky.create as jest.Mock;
const getMock    = ky.get as jest.Mock;
const jsonMock   = ( getMock() as { json: jest.Mock } ).json;

const getCachedUpcItemMock   = getCachedUpcItem as jest.Mock;
const upsertCachedUpcItemMock = upsertCachedUpcItem as jest.Mock;

const fakeDb = {} as DbClient;

function makeHttpError( status: number ): HTTPError {
  const err = Object.create( HTTPError.prototype ) as HTTPError;
  Object.assign( err, { response: { status } } );
  return err;
}

beforeEach( () => {
  getCachedUpcItemMock.mockResolvedValue( null );
} );

describe( 'UpcItemDbClient', () => {

  it( 'uses the base URL and user_key header from the given userKey', () => {

    new UpcItemDbClient( fakeDb, { userKey: 'secret-key' } );

    expect( createMock ).toHaveBeenCalledWith( {
      baseUrl: 'https://api.upcitemdb.com/prod/v1/',
      headers: {
        key_type: '3scale',
        user_key: 'secret-key',
      },
    } );

  } );

  it( 'returns the cached item without hitting the API when the cache has a fresh entry', async () => {

    const cachedItem: UpcItemDbItem = { upc: '041598000539', title: 'Cached Product' };
    getCachedUpcItemMock.mockResolvedValueOnce( cachedItem );

    const client = new UpcItemDbClient( fakeDb, { userKey: 'secret-key' } );
    const result = await client.lookup( '041598000539' );

    expect( getCachedUpcItemMock ).toHaveBeenCalledWith( fakeDb, '041598000539', 30 * 24 * 60 * 60 * 1000 );
    expect( getMock ).not.toHaveBeenCalled();
    expect( result ).toEqual( cachedItem );

  } );

  it( 'looks up a upc via the API on a cache miss, and caches the result', async () => {

    const item: UpcItemDbItem = { upc: '041598000539', title: 'Test Product' };
    const response: UpcItemDbLookupResponse = { code: 'OK', total: 1, items: [ item ] };
    jsonMock.mockResolvedValueOnce( response );

    const client = new UpcItemDbClient( fakeDb, { userKey: 'secret-key' } );
    const result = await client.lookup( '041598000539' );

    expect( getMock ).toHaveBeenCalledWith( 'lookup', { searchParams: { upc: '041598000539' } } );
    expect( upsertCachedUpcItemMock ).toHaveBeenCalledWith( fakeDb, '041598000539', item );
    expect( result ).toEqual( item );

  } );

  it( 'returns null and does not cache when the response has no items', async () => {

    const response: UpcItemDbLookupResponse = { code: 'OK', total: 0, items: [] };
    jsonMock.mockResolvedValueOnce( response );

    const client = new UpcItemDbClient( fakeDb, { userKey: 'secret-key' } );
    const result = await client.lookup( '000000000000' );

    expect( result ).toBeNull();
    expect( upsertCachedUpcItemMock ).not.toHaveBeenCalled();

  } );

  it( 'returns null and does not cache when UPCItemDB responds 400 (invalid UPC)', async () => {

    jsonMock.mockRejectedValueOnce( makeHttpError( 400 ) );

    const client = new UpcItemDbClient( fakeDb, { userKey: 'secret-key' } );
    const result = await client.lookup( 'not-a-real-upc' );

    expect( result ).toBeNull();
    expect( upsertCachedUpcItemMock ).not.toHaveBeenCalled();

  } );

  it( 'rethrows HTTP errors other than 400', async () => {

    jsonMock.mockRejectedValueOnce( makeHttpError( 500 ) );

    const client = new UpcItemDbClient( fakeDb, { userKey: 'secret-key' } );

    await expect( client.lookup( '041598000539' ) ).rejects.toThrow( HTTPError );

  } );

  it( 'rethrows non-HTTP errors', async () => {

    jsonMock.mockRejectedValueOnce( new Error( 'network down' ) );

    const client = new UpcItemDbClient( fakeDb, { userKey: 'secret-key' } );

    await expect( client.lookup( '041598000539' ) ).rejects.toThrow( 'network down' );

  } );

  it( 'respects a custom cache TTL', async () => {

    const response: UpcItemDbLookupResponse = { code: 'OK', total: 0, items: [] };
    jsonMock.mockResolvedValueOnce( response );

    const client = new UpcItemDbClient( fakeDb, { userKey: 'secret-key' }, 60_000 );
    await client.lookup( '041598000539' );

    expect( getCachedUpcItemMock ).toHaveBeenCalledWith( fakeDb, '041598000539', 60_000 );

  } );

} );
