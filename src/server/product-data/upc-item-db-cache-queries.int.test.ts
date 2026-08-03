import { createDbClient } from '../db/client';
import type { DbClient } from '../db/client';
import { getCachedUpcItem, upsertCachedUpcItem } from './upc-item-db-cache-queries';
import type { UpcItemDbItem } from './upc-item-db-types';

function getTestDbUrl(): string {

  // Integration tests should be explicit: we are using the host-mapped port.
  const host = process.env.POSTGRES_TEST_HOST ?? "127.0.0.1";
  const port = Number( process.env.POSTGRES_TEST_PORT ?? "5433" );

  const database = process.env.POSTGRES_TEST_DB
    ?? ( process.env.POSTGRES_DB ? `${ process.env.POSTGRES_DB }_test` : "postgres" );

  const user = process.env.POSTGRES_TEST_USER ?? process.env.POSTGRES_USER ?? "postgres";
  const password = process.env.POSTGRES_TEST_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? "";

  return `postgres://${ encodeURIComponent( user ) }:${ encodeURIComponent( password ) }@${ host }:${ port }/${ database }`;

}

describe( "upc-item-db cache queries", () => {

  let db: DbClient;

  beforeAll( () => {
    db = createDbClient( { databaseUrl: getTestDbUrl(), maxConnections: 2 } );
  } );

  afterEach( async () => {
    await db.sql`DELETE FROM upc_item_db_cache`;
  } );

  afterAll( async () => {
    await db.close();
  } );

  it( "returns null on a cache miss", async () => {

    const result = await getCachedUpcItem( db, "no-such-upc", 60_000 );

    expect( result ).toBeNull();

  } );

  it( "stores and retrieves an item via upsert/get", async () => {

    const item: UpcItemDbItem = { upc: "041598000539", title: "Test Product", images: [ "a", "b" ] };
    await upsertCachedUpcItem( db, "041598000539", item );

    const result = await getCachedUpcItem( db, "041598000539", 60_000 );

    expect( result ).toEqual( item );

  } );

  it( "overwrites an existing cache entry on conflict", async () => {

    const upc = "041598000539";
    await upsertCachedUpcItem( db, upc, { upc, title: "Old Title" } );
    await upsertCachedUpcItem( db, upc, { upc, title: "New Title" } );

    const result = await getCachedUpcItem( db, upc, 60_000 );

    expect( result ).toEqual( { upc, title: "New Title" } );

  } );

  it( "treats entries older than maxAgeMs as a miss", async () => {

    const upc = "041598000539";
    const item: UpcItemDbItem = { upc, title: "Stale Product" };

    // Insert directly with a backdated updated_at — the set_updated_at
    // trigger only fires on UPDATE, so this is the only way to get a row
    // that's actually outside the TTL window.
    await db.sql`
      INSERT INTO upc_item_db_cache ( upc, item, updated_at )
      VALUES ( ${ upc }, ${ db.sql.json( item as unknown as import( 'postgres' ).JSONValue ) }, now() - interval '1 hour' )
    `;

    const result = await getCachedUpcItem( db, upc, 60_000 ); // 1 minute TTL

    expect( result ).toBeNull();

  } );

} );
