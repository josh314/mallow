import type { Request, Response, NextFunction } from "express";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

export type ResponseForLog = {
  statusCode: number;
  getHeader( name: string ): unknown;
};

export type RequestForLog = {
  requestId?: string;
  method: string;
  path: string;
  originalUrl?: string;
  url: string;
  query: unknown;
  headers: Record<string, unknown>;
  socket: { remoteAddress?: string };
};

interface RequestLogInput {
  req: RequestForLog;
  res: ResponseForLog;
  startHr: bigint;
  endHr: bigint;
  now: () => Date;
}

export function buildRequestLogEvent( input: RequestLogInput ) {

  const { req, res, startHr, endHr, now } = input;

  const durationMs = Number( endHr - startHr ) / 1_000_000;

  const contentLengthHeader = res.getHeader( "content-length" );
  const contentLength =
    typeof contentLengthHeader === "string" ? Number( contentLengthHeader ) :
      typeof contentLengthHeader === "number" ? contentLengthHeader :
        undefined;

  const forwardedFor = ( req.headers[ "x-forwarded-for" ] as string | undefined );
  const clientIp =
    forwardedFor?.split( "," )[ 0 ]?.trim()
    ?? req.socket.remoteAddress
    ?? undefined;

  const event = {
    time: now().toISOString(),

    // “access log” envelope
    kind: "access",
    requestId: req.requestId,

    http: {
      method: req.method,
      path: req.path,
      url: req.originalUrl ?? req.url,
      query: req.query, // consider omitting if you might log sensitive data
      status: res.statusCode,
      durationMs: Number( durationMs.toFixed( 3 ) ),
      contentLength,
      userAgent: req.headers[ "user-agent" ],
      referrer: req.headers[ "referer" ] ?? req.headers[ "referrer" ],
    },

    client: {
      ip: clientIp,
    },
  };

  return event;
}


function onFinishedFactory(
  req: RequestForLog,
  res: Response,
  startHr: bigint,
  logger: ( msg: string ) => void,
) {
  return function onFinished() {
    res.removeListener( "finish", onFinished );
    res.removeListener( "close", onFinished );

    const endHr = process.hrtime.bigint();

    const event = buildRequestLogEvent( {
      req,
      res: {
        statusCode: res.statusCode,
        getHeader: res.getHeader.bind( res ),
      },
      startHr,
      endHr,
      now: () => new Date(),
    } );

    logger( JSON.stringify( event ) );
  };
}

interface RequestLogOptions {
  skip?: ( req: Request, res: Response ) => boolean;
  logger?: ( msg: string ) => void;
}

export function requestLog( opts: RequestLogOptions = {} ) {
  const {
    skip,
    logger = console.log,
  } = opts;

  return function requestLogMiddleware( req: Request, res: Response, next: NextFunction ) {
    if( skip?.( req, res ) ) {
      return next();
    }

    const startHr = process.hrtime.bigint();

    const onFinished = onFinishedFactory( req, res, startHr, logger );
    res.on( "finish", onFinished );
    res.on( "close", onFinished );

    next();
  };
}