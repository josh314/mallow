import express from 'express';

import type { DbClient } from '../db/client';
import { createHealthRouter } from './health';
import { createAuthRouter } from './auth';
import { createOrganizationRouter } from './organizations';
import { createOpenApiRouter } from './openapi';

interface RouterOptions {
  db: DbClient;
}

export function createRouter( options: RouterOptions ): express.Router {
  const router = express.Router();

  router.use( '/health', createHealthRouter() );
  router.use( '/openapi.json', createOpenApiRouter() );
  router.use( '/auth', createAuthRouter( options.db ) );
  router.use( '/organizations', createOrganizationRouter( options.db ) );

  return router;
}