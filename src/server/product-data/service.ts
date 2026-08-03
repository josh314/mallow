import type { DbClient } from '../db/client';
import type { ProductData } from './types';

// Skeleton: getProductData is mocked below. The real implementation will
// cascade through a primary external API, secondary API, internal cache,
// and manual override records, per the LCJ reference behavior.
export class ProductDataService {

  private db: DbClient;

  constructor( db: DbClient ) {
    this.db = db;
  }

  public getProductData( barcode: string ): Promise<ProductData | null> {
    return Promise.resolve( {
      barcode,
      name: 'Mock Product',
    } );
  }

}
