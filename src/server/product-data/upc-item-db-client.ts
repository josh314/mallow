import ky, { type KyInstance } from 'ky';

import type { DbClient } from '../db/client';
import type { UpcItemDbItem, UpcItemDbLookupResponse } from './upc-item-db-types';

const PROD_BASE_URL  = 'https://api.upcitemdb.com/prod/v1';
const TRIAL_BASE_URL = 'https://api.upcitemdb.com/prod/trial';

export interface UpcItemDbCredentials {
  // Omit to fall back to the (rate-limited) trial tier.
  userKey?: string;
}

export class UpcItemDbClient {

  private db: DbClient;
  private http: KyInstance;

  constructor( db: DbClient, credentials: UpcItemDbCredentials ) {
    this.db = db;

    this.http = ky.create( {
      baseUrl: credentials.userKey ? PROD_BASE_URL : TRIAL_BASE_URL,
      headers: {
        key_type: '3scale',
        ...( credentials.userKey ? { user_key: credentials.userKey } : {} ),
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
