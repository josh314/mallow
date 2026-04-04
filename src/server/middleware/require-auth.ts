import type { Request, Response, NextFunction } from 'express';

import type { SessionUser } from '../users/types';

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: SessionUser;
    }
  }
}

export function requireAuth( req: Request, res: Response, next: NextFunction ): void {

  if( !req.session?.user ) {
    res.status( 401 ).json( { error: true, message: 'Unauthorized' } );
    return;
  }

  req.user = req.session.user;
  next();

}
