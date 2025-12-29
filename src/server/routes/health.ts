import { Router, type Request, type Response } from "express";

export function createHealthRouter(): Router {

  const router = Router();

  router.get( "/", ( req: Request, res: Response ) => {

    res.status( 200 ).json( {
      status: "ok",
    } );

  } );

  return router;
}
