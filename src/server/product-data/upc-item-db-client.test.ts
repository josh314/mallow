import ky from 'ky';

import { UpcItemDbClient } from './upc-item-db-client';
import type { DbClient } from '../db/client';
import type { UpcItemDbItem, UpcItemDbLookupResponse } from './upc-item-db-types';

const createMock = ky.create as jest.Mock;
const getMock    = ky.get as jest.Mock;
const jsonMock   = ( getMock() as { json: jest.Mock } ).json;

const fakeDb = {} as DbClient;

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

  it( 'looks up a upc and returns the first item from the response', async () => {

    const item: UpcItemDbItem = { upc: '041598000539', title: 'Test Product' };
    const response: UpcItemDbLookupResponse = { code: 'OK', total: 1, items: [ item ] };
    jsonMock.mockResolvedValueOnce( response );

    const client = new UpcItemDbClient( fakeDb, { userKey: 'secret-key' } );
    const result = await client.lookup( '041598000539' );

    expect( getMock ).toHaveBeenCalledWith( 'lookup', { searchParams: { upc: '041598000539' } } );
    expect( result ).toEqual( item );

  } );

  it( 'returns null when the response has no items', async () => {

    const response: UpcItemDbLookupResponse = { code: 'OK', total: 0, items: [] };
    jsonMock.mockResolvedValueOnce( response );

    const client = new UpcItemDbClient( fakeDb, { userKey: 'secret-key' } );
    const result = await client.lookup( '000000000000' );

    expect( result ).toBeNull();

  } );

} );
