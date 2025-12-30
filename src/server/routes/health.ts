import { Router, type Request, type Response } from "express";

import packageJson from "../util/package-json";

export interface HealthResponse {
  status: "ok";
  version: string;
}

export function createHealthRouter(): Router {

  const router = Router();

  router.get( "/", ( req: Request, res: Response ) => {

    const healthResponse: HealthResponse = {
      status: "ok",
      version: packageJson.version,
    };

    res.status( 200 ).json( healthResponse );

  } );

  return router;
}
