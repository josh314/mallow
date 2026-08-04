import type { ProductIdentifier } from './identifier';

export interface ProductData {
  identifier: ProductIdentifier;
  name: string;
  description?: string;
  brand?: string;
  price?: number;
  images?: string[];
  customFields?: Record<string, unknown>;
}
