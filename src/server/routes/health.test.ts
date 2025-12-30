import express from "express";
import request from "supertest";

import packageJson from "../util/package-json";
import { createHealthRouter, type HealthResponse } from "./health";

describe( "GET /health", () => {

  it( "returns 200 and { status: \"ok\", version: <current_version> }", async () => {

    const app = express();
    app.use( "/", createHealthRouter() );

    const response = await request( app )
      .get( "/" )
      .expect( 200 );

    const expectedResponse: HealthResponse = {
      status: "ok",
      version: packageJson.version,
    };

    expect( response.body ).toEqual( expectedResponse );

  } );

} );
