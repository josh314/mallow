import { createDbClient } from "./client";

function getTestDbUrl(): string {

  // Integration tests should be explicit: we are using the host-mapped port.
  const host = process.env.POSTGRES_TEST_HOST ?? "127.0.0.1";
  const port = Number( process.env.POSTGRES_TEST_PORT ?? "5433" );

  const database = process.env.POSTGRES_TEST_DB
    ?? ( process.env.POSTGRES_DB ? `${ process.env.POSTGRES_DB }_test` : "postgres" );

  const user = process.env.POSTGRES_TEST_USER ?? process.env.POSTGRES_USER ?? "postgres";
  const password = process.env.POSTGRES_TEST_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? "";

  // Keep it simple; no special encoding here unless you actually use special chars.
  return `postgres://${ encodeURIComponent( user ) }:${ encodeURIComponent( password ) }@${ host }:${ port }/${ database }`;

}

describe( "DbClient integration", () => {

  it( "connects, isReady() succeeds, and can run a trivial query", async () => {

    const dbClient = createDbClient( {
      databaseUrl: getTestDbUrl(),
      maxConnections: 2,
    } );

    try {

      await dbClient.isReady();

      const rows = await dbClient.sql<{ ok: number }[]>`select 1 as ok`;
      expect( rows[ 0 ]?.ok ).toBe( 1 );

    }
    finally {
      await dbClient.close();
    }

  } );

} );
