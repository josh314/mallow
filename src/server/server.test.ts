import request from "supertest";

import { createServer } from "./server";
import { makeTestConfig } from "./config/test-config";
import type { DbClient } from "./db/client";

function makeMockDbClient( overrides: Partial<DbClient> = {} ): DbClient {

  return {

    sql: ( ( () => {
      throw new Error( "sql should not be called in server routing test" );
    } ) as unknown as DbClient["sql"] ),

    isReady: jest.fn( async () => undefined ),
    close: jest.fn( async () => undefined ),
    ...overrides,
  };

}

describe( "server init", () => {

  it( "rethrows if db.isReady fails and attempts db.close", async () => {

    const initError = new Error( "db not ready" );

    const db = makeMockDbClient( {
      isReady: jest.fn( async () => { throw initError; } ),
      close: jest.fn( async () => undefined ),
    } );

    await expect(
      createServer( makeTestConfig(), db )
    ).rejects.toThrow( "db not ready" );

    expect( db.isReady ).toHaveBeenCalledTimes( 1 );
    expect( db.close ).toHaveBeenCalledTimes( 1 );

  } );

  it( "still rethrows even if db.close fails during init cleanup", async () => {

    const initError = new Error( "db not ready" );

    const db = makeMockDbClient( {
      isReady: jest.fn( async () => { throw initError; } ),
      close: jest.fn( async () => { throw new Error( "close failed" ); } ),
    } );

    await expect(
      createServer( makeTestConfig(), db )
    ).rejects.toThrow( "db not ready" );

    expect( db.close ).toHaveBeenCalledTimes( 1 );

  } );

} );

describe( "server listen/close", () => {

  it( "listen resolves when the http server starts, and close shuts down db", async () => {

    const db = makeMockDbClient();

    const config = {
      ...makeTestConfig(),
      port: 0,
    };

    const server = await createServer( config, db );

    await expect( server.listen() ).resolves.toBeUndefined();

    await server.close();

    expect( db.close ).toHaveBeenCalledTimes( 1 );

  } );

  it( "close is safe to call before listen", async () => {

    const db = makeMockDbClient();
    const server = await createServer( makeTestConfig(), db );

    await expect( server.close() ).resolves.toBeUndefined();
    expect( db.close ).toHaveBeenCalledTimes( 1 );

  } );

} );


describe( "server", () => {

  it( "returns 404 for unknown routes", async () => {

    const db = makeMockDbClient();

    const server = await createServer(
      makeTestConfig(),
      db,
    );
    const app = server.getApp();

    await request( app )
      .get( "/does-not-exist" )
      .expect( 404 );

    expect( db.isReady ).toHaveBeenCalledTimes( 1 );

  } );

} );
