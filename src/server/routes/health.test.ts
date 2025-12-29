import express from "express";
import request from "supertest";

import { createHealthRouter } from "./health";

describe( "GET /health", () => {

  it( "returns 200 and { status: \"ok\" }", async () => {

    const app = express();
    app.use( "/", createHealthRouter() );

    const response = await request( app )
      .get( "/" )
      .expect( 200 );

    expect( response.body ).toEqual( { status: "ok" } );

  } );

} );
