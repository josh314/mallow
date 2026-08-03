import ky, { type KyInstance } from 'ky';

import type { DbClient } from '../db/client';
import type { UpcItemDbItem, UpcItemDbLookupResponse } from './upc-item-db-types';

// Trailing slash matters: ky's `baseUrl` uses standard URL resolution, so
// without it the last path segment (`v1`) gets replaced by the relative
// request path instead of extended.
const BASE_URL = 'https://api.upcitemdb.com/prod/v1/';

export interface UpcItemDbCredentials {
  userKey: string;
}

export class UpcItemDbClient {

  private db: DbClient;
  private http: KyInstance;

  constructor( db: DbClient, credentials: UpcItemDbCredentials ) {
    this.db = db;

    this.http = ky.create( {
      baseUrl: BASE_URL,
      headers: {
        key_type: '3scale',
        user_key: credentials.userKey,
      },
    } );
  }

  public async lookup( upc: string ): Promise<UpcItemDbItem | null> {

    const cached = await this.getCached( upc );
    if( cached ) {
      return cached;
    }

    const response = await this.http
      .get( 'lookup', { searchParams: { upc } } )
      .json<UpcItemDbLookupResponse>();

    const item = response.items?.[ 0 ] ?? null;

    if( item ) {
      await this.storeCached( upc, item );
    }

    return item;

  }

  // Placeholder — PG-backed cache table/queries aren't designed yet.
  private getCached( _upc: string ): Promise<UpcItemDbItem | null> {
    return Promise.resolve( null );
  }

  // Placeholder — PG-backed cache table/queries aren't designed yet.
  private storeCached( _upc: string, _item: UpcItemDbItem ): Promise<void> {
    return Promise.resolve();
  }

}
