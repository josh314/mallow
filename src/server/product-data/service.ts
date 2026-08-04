import type { ProductData } from './types';
import type { ProductDataSource } from './source';
import { parseIdentifier } from './identifier';

export class ProductDataService {

  private sources: ProductDataSource[];

  constructor( sources: ProductDataSource[] ) {
    this.sources = sources;
  }

  public async getProductData( rawIdentifier: string ): Promise<ProductData | null> {

    const identifier = parseIdentifier( rawIdentifier );

    for( const source of this.sources ) {
      const result = await source.lookup( identifier );
      if( result ) {
        return result;
      }
    }

    return null;

  }

}
