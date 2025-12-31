import type { Response } from "express";

import * as requestIdModule from "./request-id";
import { ensureRequestId, type RequestForId } from "./request-id";

class MockRes {
  private readonly headers = new Map<string, string>();

  setHeader( name: string, value: string ) {
    this.headers.set( name.toLowerCase(), value );
  }

  getHeader( name: string ) {
    return this.headers.get( name.toLowerCase() );
  }
}

describe( "ensureRequestId" , () => {

  beforeEach( () => {
    jest.restoreAllMocks();
  } );

  test( "generates and sets requestId when missing" , () => {

    const req: RequestForId = {
      headers: {},
    };

    const res = new MockRes();

    ensureRequestId( req, res as unknown as Response, () => "abc-123-def-456-ghi" );

    expect( req.requestId ).toBe( "abc-123-def-456-ghi" );
    expect( res.getHeader( "x-request-id" ) ).toBe( "abc-123-def-456-ghi" );

  } );

  test( "uses existing req.requestId when present" , () => {

    const idSpy = jest.spyOn( requestIdModule, "generateRequestId" );

    const req: RequestForId = {
      requestId: "rid-existing",
      headers: {},
    };

    const res = new MockRes();

    ensureRequestId( req, res as unknown as Response );

    expect( idSpy ).not.toHaveBeenCalled();
    expect( req.requestId ).toBe( "rid-existing" );
    expect( res.getHeader( "x-request-id" ) ).toBe( "rid-existing" );

  } );

  test( "uses x-request-id header when req.requestId is missing and sets it on req" , () => {

    const idSpy = jest.spyOn( requestIdModule, "generateRequestId" );

    const req: RequestForId = {
      headers: { "x-request-id": "rid-from-header" },
    };

    const res = new MockRes();

    ensureRequestId( req, res as unknown as Response );

    expect( idSpy ).not.toHaveBeenCalled();
    expect( req.requestId ).toBe( "rid-from-header" );
    expect( res.getHeader( "x-request-id" ) ).toBe( "rid-from-header" );

  } );

} );
