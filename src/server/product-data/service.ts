import type { DbClient } from '../db/client';
import type { ProductData } from './types';
import type { ProductDataSource } from './source';
import type { ProductIdentifier } from './identifier';
import { parseIdentifier } from './identifier';
import { findTenantProductData } from './tenant-product-data-queries';

export class ProductDataService {

  private db: DbClient;
  private sources: ProductDataSource[];

  constructor( db: DbClient, sources: ProductDataSource[] ) {
    this.db = db;
    this.sources = sources;
  }

  public async getProductData( organizationId: string, rawIdentifier: string ): Promise<ProductData | null> {

    const identifier = parseIdentifier( rawIdentifier );

    const [ override, cascadeResult ] = await Promise.all( [
      findTenantProductData( this.db, organizationId, identifier ),
      this.runCascade( identifier ),
    ] );

    const merged: Partial<ProductData> = { ...cascadeResult };

    if( override?.name        != null ) merged.name        = override.name;
    if( override?.description != null ) merged.description = override.description;
    if( override?.brand       != null ) merged.brand       = override.brand;
    if( override?.price       != null ) merged.price       = override.price;
    if( override?.images      != null ) merged.images      = override.images;

    merged.identifier   = identifier;
    merged.customFields = override?.customFields ?? {};

    if( !merged.name ) {
      return null;
    }

    return merged as ProductData;

  }

  private async runCascade( identifier: ProductIdentifier ): Promise<ProductData | null> {

    for( const source of this.sources ) {
      const result = await source.lookup( identifier );
      if( result ) {
        return result;
      }
    }

    return null;

  }

}
