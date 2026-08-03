import type { DbClient } from '../db/client';
import type { ProductData } from './types';
import { UpcItemDbClient } from './upc-item-db-client';

export interface ProductDataCredentials {
  upcItemDbUserKey: string;
}

// getProductData currently only sources from UPCItemDB. The real cascade
// (secondary API, internal cache, manual override records, per the LCJ
// reference behavior) will be layered in later.
export class ProductDataService {

  private db: DbClient;
  private upcItemDbClient: UpcItemDbClient;

  constructor( db: DbClient, credentials: ProductDataCredentials ) {
    this.db = db;
    this.upcItemDbClient = new UpcItemDbClient( db, { userKey: credentials.upcItemDbUserKey } );
  }

  public async getProductData( barcode: string ): Promise<ProductData | null> {

    const item = await this.upcItemDbClient.lookup( barcode );
    if( !item?.title ) {
      return null;
    }

    return {
      barcode,
      name: item.title,
      description: item.description,
    };

  }

}
