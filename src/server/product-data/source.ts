import type { ProductIdentifier } from './identifier';
import type { ProductData } from './types';

export interface ProductDataSource {
  lookup( identifier: ProductIdentifier ): Promise<ProductData | null>;
}
