import express from 'express';
import { createHealthRouter } from './health';

interface RouterOptions {

}

export function createRouter( options: RouterOptions ): express.Router {
  const router = express.Router();

  router.use( '/health', createHealthRouter() );

  return router;
}