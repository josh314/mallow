import { Router, type Request, type Response } from 'express';

import { buildOpenApiSpec } from '../openapi';

export function createOpenApiRouter(): Router {

  const router = Router();

  router.get( '/', ( _req: Request, res: Response ) => {
    res.json( buildOpenApiSpec() );
  } );

  return router;

}
