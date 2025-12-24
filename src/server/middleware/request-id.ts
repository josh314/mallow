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

function getRequestId( req: RequestForId ) {

  if( req.requestId ) {
    return req.requestId;
  }
  else {
    const headerValue = req.headers[ requestIdHeader ];
    const headerId =
      typeof headerValue === "string" ? headerValue :
      Array.isArray( headerValue ) ? headerValue[ 0 ] :
      undefined;
    return headerId;
  }

}

function setRequestId( req: RequestForId, requestId: string ) {
  req.requestId = requestId;
}

export function ensureRequestId( req: RequestForId, res: Response ) {
  const existing = getRequestId( req );
  if( !existing ) {
    const rid = crypto.randomUUID();
    setRequestId( req, rid );
    res.setHeader( requestIdHeader, rid );
  } else {
    setRequestId( req, existing );
    res.setHeader( requestIdHeader, existing );
  }
}

export function requestIdMiddleware( req: Request, res: Response, next: NextFunction ) {

  ensureRequestId( req, res );

  next();

};