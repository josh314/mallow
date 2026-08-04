import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PostgresError } from 'postgres';

import type { DbClient } from '../db/client';
import type { ProductDataService } from '../product-data/service';
import { requireAuth } from '../middleware/require-auth';
import { parseIdentifier } from '../product-data/identifier';
import {
  createTenantProductData,
  listTenantProductData,
  countTenantProductData,
  updateTenantProductData,
  softDeleteTenantProductData,
} from '../product-data/tenant-product-data-queries';

export const getProductDataQuery = z.object( {
  barcode: z.string().min( 1 ),
} );

const overrideFieldsBody = z.object( {
  name: z.string().min( 1 ).optional(),
  description: z.string().min( 1 ).optional(),
  brand: z.string().min( 1 ).optional(),
  price: z.number().nonnegative().optional(),
  images: z.array( z.string() ).optional(),
  customFields: z.record( z.string(), z.unknown() ).optional(),
} );

function hasAtLeastOneField( data: z.infer<typeof overrideFieldsBody> ): boolean {
  return data.name !== undefined || data.description !== undefined || data.brand !== undefined
    || data.price !== undefined || data.images !== undefined || data.customFields !== undefined;
}

export const createOverrideBody = z.object( { identifier: z.string().min( 1 ) } )
  .extend( overrideFieldsBody.shape )
  .refine( hasAtLeastOneField, { message: 'At least one of name, description, brand, price, images, or customFields must be provided' } );

export const updateOverrideBody = overrideFieldsBody
  .refine( hasAtLeastOneField, { message: 'At least one field must be provided' } );

export const listOverridesQuery = z.object( {
  limit:  z.coerce.number().int().min( 1 ).max( 100 ).default( 20 ),
  offset: z.coerce.number().int().min( 0 ).default( 0 ),
} );

export function createProductDataRouter( productDataService: ProductDataService, db: DbClient ): Router {

  const router = Router();

  // GET /product-data?barcode= — any authenticated user
  router.get( '/', requireAuth, async ( req: Request, res: Response ) => {

    const query = getProductDataQuery.safeParse( req.query );
    if( !query.success ) {
      res.status( 400 ).json( { error: true, message: query.error.issues[ 0 ]?.message } );
      return;
    }

    const productData = await productDataService.getProductData( req.user.organizationId, query.data.barcode );
    if( !productData ) {
      res.status( 404 ).json( { error: true, message: 'Product data not found' } );
      return;
    }

    res.json( { productData } );

  } );

  // GET /product-data/overrides — any authenticated user, scoped to their org
  router.get( '/overrides', requireAuth, async ( req: Request, res: Response ) => {

    const query = listOverridesQuery.safeParse( req.query );
    if( !query.success ) {
      res.status( 400 ).json( { error: true, message: query.error.issues[ 0 ]?.message } );
      return;
    }

    const { limit, offset } = query.data;
    const [ overrides, total ] = await Promise.all( [
      listTenantProductData( db, { organizationId: req.user.organizationId, limit, offset } ),
      countTenantProductData( db, { organizationId: req.user.organizationId } ),
    ] );

    res.json( { overrides, total, limit, offset } );

  } );

  // POST /product-data/overrides — any authenticated user, scoped to their org
  router.post( '/overrides', requireAuth, async ( req: Request, res: Response ) => {

    const body = createOverrideBody.safeParse( req.body );
    if( !body.success ) {
      res.status( 400 ).json( { error: true, message: body.error.issues[ 0 ]?.message } );
      return;
    }

    const identifier = parseIdentifier( body.data.identifier );

    try {
      const override = await createTenantProductData( db, {
        organizationId: req.user.organizationId,
        idType: identifier.idType,
        identifier: identifier.value,
        name: body.data.name,
        description: body.data.description,
        brand: body.data.brand,
        price: body.data.price,
        images: body.data.images,
        customFields: body.data.customFields,
      } );
      res.status( 201 ).json( { override } );
    }
    catch( err ) {
      if( err instanceof PostgresError && err.code === '23505' ) {
        res.status( 409 ).json( { error: true, message: 'An override for this identifier already exists' } );
        return;
      }
      throw err;
    }

  } );

  // PATCH /product-data/overrides/:id — any authenticated user, scoped to their org
  router.patch( '/overrides/:id', requireAuth, async ( req: Request, res: Response ) => {

    const body = updateOverrideBody.safeParse( req.body );
    if( !body.success ) {
      res.status( 400 ).json( { error: true, message: body.error.issues[ 0 ]?.message } );
      return;
    }

    const override = await updateTenantProductData( db, req.user.organizationId, req.params.id, body.data );
    if( !override ) {
      res.status( 404 ).json( { error: true, message: 'Override not found' } );
      return;
    }

    res.json( { override } );

  } );

  // DELETE /product-data/overrides/:id — any authenticated user, scoped to their org
  router.delete( '/overrides/:id', requireAuth, async ( req: Request, res: Response ) => {

    const deleted = await softDeleteTenantProductData( db, req.user.organizationId, req.params.id );
    if( !deleted ) {
      res.status( 404 ).json( { error: true, message: 'Override not found' } );
      return;
    }

    res.status( 204 ).send();

  } );

  return router;

}
