import ky, { HTTPError, type KyInstance } from 'ky';

import type { DbClient } from '../db/client';
import type { UpcItemDbItem, UpcItemDbLookupResponse } from './upc-item-db-types';
import { getCachedUpcItem, upsertCachedUpcItem } from './upc-item-db-cache-queries';

// Trailing slash matters: ky's `baseUrl` uses standard URL resolution, so
// without it the last path segment (`v1`) gets replaced by the relative
// request path instead of extended.
const BASE_URL = 'https://api.upcitemdb.com/prod/v1/';

const DEFAULT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface UpcItemDbCredentials {
  userKey: string;
}

export class UpcItemDbClient {

  private db: DbClient;
  private http: KyInstance;
  private cacheTtlMs: number;

  constructor( db: DbClient, credentials: UpcItemDbCredentials, cacheTtlMs: number = DEFAULT_CACHE_TTL_MS ) {
    this.db = db;
    this.cacheTtlMs = cacheTtlMs;

    this.http = ky.create( {
      baseUrl: BASE_URL,
      headers: {
        key_type: '3scale',
        user_key: credentials.userKey,
      },
    } );
  }

  public async lookup( upc: string ): Promise<UpcItemDbItem | null> {

    const cached = await getCachedUpcItem( this.db, upc, this.cacheTtlMs );
    if( cached ) {
      return cached;
    }

    let response: UpcItemDbLookupResponse;
    try {
      response = await this.http
        .get( 'lookup', { searchParams: { upc } } )
        .json<UpcItemDbLookupResponse>();
    }
    catch( err ) {
      // UPCItemDB responds 400 when it considers the UPC itself invalid
      // (bad checksum/format) — treat that as "no product data", not an error.
      if( err instanceof HTTPError && err.response.status === 400 ) {
        console.log( `UPCItemDB rejected UPC ${ upc } as invalid (400)` );
        return null;
      }
      throw err;
    }

    const item = response.items?.[ 0 ] ?? null;

    if( item ) {
      await upsertCachedUpcItem( this.db, upc, item );
    }

    return item;

  }

}
