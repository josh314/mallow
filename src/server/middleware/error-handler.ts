import type { Request, Response, NextFunction } from 'express';

import {
  AppError,
  ConfigurationError
} from '../util/errors';

export function errorHandler( err: Error, _req: Request, res: Response, _next: NextFunction ) {

  if( err instanceof ConfigurationError ) {

    console.error( 'Configuration error:', err.flattened );
    console.error( 'Exiting process due to configuration error.' );
    process.exit( 1 );

  }
  else if( err instanceof AppError ) {

    console.error( err );

    res.status( 500 ).json(
      err.expose
        ? { error: err.message }
        : { error: 'Internal server error' }
    );

    return;
  }

  console.error( err );

  res.status( 500 ).json( {
    error: 'Internal server error',
  } );

};