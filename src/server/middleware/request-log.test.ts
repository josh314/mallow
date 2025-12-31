import { EventEmitter } from "node:events";
import type { Request, Response, NextFunction } from "express";

import { buildRequestLogEvent, requestLog, type RequestForLog } from "./request-log";

type MockReq = RequestForLog;

class MockRes extends EventEmitter {
  public statusCode = 200;

  private readonly headers = new Map<string, string | number>();

  setHeader( name: string, value: string ) {
    this.headers.set( name.toLowerCase(), value );
  }

  getHeader( name: string ) {
    return this.headers.get( name.toLowerCase() );
  }
}

function makeReq( overrides: Partial<MockReq> = {} ): Request {
  return {

    requestId: "rid-000",
    method: "GET",
    path: "/health",
    url: "/health",
    originalUrl: "/health",
    query: {},

    headers: {},
    socket: { remoteAddress: "10.0.0.1" },

    ...overrides,

  } as Request;
}

function makeRes(): Response {
  const res = new MockRes();

  return res as unknown as Response;
}

describe( "buildRequestLogEvent" , () => {

  test( "uses now() for time and computes durationMs + contentLength" , () => {

    const req = makeReq( {
      method: "POST",
      path: "/x",
      originalUrl: "/x?y=1",
      url: "/x?y=1",
      query: { y: "1" },
      headers: { "user-agent": "ua" },
    } );

    const res = {
      statusCode: 201,
      getHeader: ( name: string ) => name === "content-length" ? "123" : undefined,
    };

    const event = buildRequestLogEvent( {
      req,
      res,
      startHr: 0n,
      endHr: 12_345_678n, // 12.345678ms
      now: () => new Date( "2025-12-23T00:00:00.000Z" ),
    } );

    expect( event.time ).toBe( "2025-12-23T00:00:00.000Z" );
    expect( event.http.durationMs ).toBe( 12.346 );
    expect( event.http.contentLength ).toBe( 123 );

    expect( event.http ).toMatchObject( {

      method: "POST",
      path: "/x",
      url: "/x?y=1",
      status: 201,

    } );

  } );

  test( "client ip prefers first x-forwarded-for IP over socket address" , () => {

    const req = makeReq( {
      headers: { "x-forwarded-for": "1.2.3.4, 9.9.9.9" },
      socket: { remoteAddress: "10.0.0.1" },
    } );

    const event = buildRequestLogEvent( {
      req,
      res: { statusCode: 200, getHeader: () => undefined },
      startHr: 0n,
      endHr: 0n,
      now: () => new Date( "2025-12-23T00:00:00.000Z" ),
    } );

    expect( event.client.ip ).toBe( "1.2.3.4" );

  } );

  test( "referrer uses referer header first, then referrer" , () => {

    const req1 = makeReq( { headers: { "referer": "a" } } );

    const event1 = buildRequestLogEvent( {
      req: req1,
      res: { statusCode: 200, getHeader: () => undefined },
      startHr: 0n,
      endHr: 0n,
      now: () => new Date( "2025-12-23T00:00:00.000Z" ),
    } );

    expect( event1.http.referrer ).toBe( "a" );

    const req2 = makeReq( { headers: { "referrer": "b" } } );

    const event2 = buildRequestLogEvent( {
      req: req2,
      res: { statusCode: 200, getHeader: () => undefined },
      startHr: 0n,
      endHr: 0n,
      now: () => new Date( "2025-12-23T00:00:00.000Z" ),
    } );

    expect( event2.http.referrer ).toBe( "b" );

  } );

} );

describe( "requestLog middleware wiring" , () => {

  beforeEach( () => {
    jest.restoreAllMocks();
  } );

  test( "skip bypasses logging" , () => {

    const logger = jest.fn();

    const req = makeReq();
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    requestLog( { skip: () => true, logger } )( req, res, next );

    expect( res.listenerCount( "finish" ) ).toBe( 0 );
    expect( res.listenerCount( "close" ) ).toBe( 0 );

    expect( next ).toHaveBeenCalledTimes( 1 );

    res.emit( "finish" );
    expect( logger ).not.toHaveBeenCalled();

  } );

  test( "logs once on finish" , () => {

    const logger = jest.fn();

    jest
      .spyOn( process.hrtime, "bigint" )
      .mockReturnValueOnce( 0n )
      .mockReturnValueOnce( 1_000_000n ); // 1ms

    const req = makeReq( { requestId: "rid-123" } );
    const res = makeRes();
    const next = ( () => {} ) as unknown as NextFunction;

    requestLog( { logger } )( req, res, next );

    res.emit( "finish" );

    expect( logger ).toHaveBeenCalledTimes( 1 );

    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payload: { kind: string; requestId: string } = JSON.parse( logger.mock.calls[ 0 ]![ 0 ] as string );
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */

    expect( payload.kind ).toBe( "access" );
    expect( payload.requestId ).toBe( "rid-123" );

  } );



} );
