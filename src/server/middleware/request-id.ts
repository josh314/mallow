import type { Request, Response, NextFunction } from "express";
import * as crypto from "node:crypto";

const requestIdHeader = "x-request-id";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

export type RequestForId = {
  requestId?: string;
  headers: Record<string, unknown>;
};

function getRequestId( req: RequestForId ): string | undefined {

  if( req.requestId ) {
    return req.requestId;
  }
  else {
    const headerValue = req.headers[ requestIdHeader ];

    let headerId: string | undefined;

    if( typeof headerValue === "string" ) {
      headerId = headerValue;
    }
    else if( Array.isArray( headerValue ) ) {
      headerId = headerValue[ 0 ] as string;
    } else {
      headerId = undefined;
    }

    return headerId;
  }

}

function setRequestId( req: RequestForId, requestId: string ) {
  req.requestId = requestId;
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}

export function ensureRequestId( req: RequestForId, res: Response, generateRequestIdFn: () => string = generateRequestId ) {
  const existing = getRequestId( req );
  if( !existing ) {
    const rid = generateRequestIdFn();
    setRequestId( req, rid );
    res.setHeader( requestIdHeader, rid );
  } else {
    setRequestId( req, existing );
    res.setHeader( requestIdHeader, existing );
  }
}

export function createRequestIdMiddleware( generateRequestIdFn: () => string = generateRequestId ) {
  return function requestIdMiddleware( req: Request, res: Response, next: NextFunction ) {

    ensureRequestId( req, res, generateRequestIdFn );

    next();

  };
}
