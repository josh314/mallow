import type { ProductDataSource } from './source';
import type { ProductData } from './types';
import type { ProductIdentifier } from './identifier';
import type { UpcItemDbClient } from './upc-item-db-client';

const SUPPORTED_ID_TYPES = new Set( [ 'upc', 'ean', 'gtin' ] );

export class UpcItemDbSource implements ProductDataSource {

  private client: UpcItemDbClient;

  constructor( client: UpcItemDbClient ) {
    this.client = client;
  }

  public async lookup( identifier: ProductIdentifier ): Promise<ProductData | null> {

    if( !SUPPORTED_ID_TYPES.has( identifier.idType ) ) {
      return null;
    }

    const item = await this.client.lookup( identifier.value );
    if( !item?.title ) {
      return null;
    }

    return {
      identifier,
      name: item.title,
      description: item.description,
      brand: item.brand,
      price: item.lowest_recorded_price,
      images: item.images,
    };

  }

}
