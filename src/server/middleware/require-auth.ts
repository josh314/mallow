import type { Request, Response, NextFunction } from 'express';

import type { SessionUser } from '../users/types';

declare global {
  namespace Express {
    interface Request {
      user: SessionUser;
    }
  }
}

// TODO: resolve session and populate req.user, then call next().
export function requireAuth( _req: Request, res: Response, _next: NextFunction ): void {
  res.status( 401 ).json( { error: true, message: 'Unauthorized' } );
}
