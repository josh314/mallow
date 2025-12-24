import * as crypto from "node:crypto";

import type { Response } from "express";

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

    jest.spyOn( crypto, "randomUUID" ).mockReturnValue( "abc-123-def-456-ghi" );

    const req: RequestForId = {
      headers: {},
    };

    const res = new MockRes();

    ensureRequestId( req, res as unknown as Response );

    expect( req.requestId ).toBe( "abc-123-def-456-ghi" );
    expect( res.getHeader( "x-request-id" ) ).toBe( "abc-123-def-456-ghi" );

  } );

  test( "uses existing req.requestId when present" , () => {

    const uuidSpy = jest.spyOn( crypto, "randomUUID" );

    const req: RequestForId = {
      requestId: "rid-existing",
      headers: {},
    };

    const res = new MockRes();

    ensureRequestId( req, res as unknown as Response );

    expect( uuidSpy ).not.toHaveBeenCalled();
    expect( req.requestId ).toBe( "rid-existing" );
    expect( res.getHeader( "x-request-id" ) ).toBe( "rid-existing" );

  } );

  test( "uses x-request-id header when req.requestId is missing and sets it on req" , () => {

    const uuidSpy = jest.spyOn( crypto, "randomUUID" );

    const req: RequestForId = {
      headers: { "x-request-id": "rid-from-header" },
    };

    const res = new MockRes();

    ensureRequestId( req, res as unknown as Response );

    expect( uuidSpy ).not.toHaveBeenCalled();
    expect( req.requestId ).toBe( "rid-from-header" );
    expect( res.getHeader( "x-request-id" ) ).toBe( "rid-from-header" );

  } );

} );
