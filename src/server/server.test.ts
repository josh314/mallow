import request from "supertest";

import { createServer } from "./server";
import { makeTestConfig } from "./config/test-config";

describe( "server", () => {

  it( "returns 404 for unknown routes", async () => {

    const server = await createServer( makeTestConfig() );
    const app = server.getApp();

    await request( app )
      .get( "/does-not-exist" )
      .expect( 404 );

  } );

} );
