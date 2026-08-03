import express from 'express';

import type { DbClient } from '../db/client';
import type { ProductDataService } from '../product-data/service';
import { createHealthRouter } from './health';
import { createAuthRouter } from './auth';
import { createOrganizationRouter } from './organizations';
import { createProductDataRouter } from './product-data';
import { createOpenApiRouter } from './openapi';

interface RouterOptions {
  db: DbClient;
  productDataService: ProductDataService;
}

export function createRouter( options: RouterOptions ): express.Router {
  const router = express.Router();

  router.use( '/health', createHealthRouter() );
  router.use( '/openapi.json', createOpenApiRouter() );
  router.use( '/auth', createAuthRouter( options.db ) );
  router.use( '/organizations', createOrganizationRouter( options.db ) );
  router.use( '/product-data', createProductDataRouter( options.productDataService ) );

  return router;
}