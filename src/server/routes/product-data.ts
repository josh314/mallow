import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import type { ProductDataService } from '../product-data/service';
import { requireAuth } from '../middleware/require-auth';

export const getProductDataQuery = z.object( {
  barcode: z.string().min( 1 ).regex( /^\d+$/, 'barcode must be numeric' ),
} );

export function createProductDataRouter( productDataService: ProductDataService ): Router {

  const router = Router();

  // GET /product-data?barcode= — any authenticated user
  router.get( '/', requireAuth, async ( req: Request, res: Response ) => {

    const query = getProductDataQuery.safeParse( req.query );
    if( !query.success ) {
      res.status( 400 ).json( { error: true, message: query.error.issues[ 0 ]?.message } );
      return;
    }

    const productData = await productDataService.getProductData( query.data.barcode );
    if( !productData ) {
      res.status( 404 ).json( { error: true, message: 'Product data not found' } );
      return;
    }

    res.json( { productData } );

  } );

  return router;

}
