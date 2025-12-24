import express from 'express';

interface RouterOptions {

}

export function createRouter( options: RouterOptions ): express.Router {
  const router = express.Router();



  return router;
}