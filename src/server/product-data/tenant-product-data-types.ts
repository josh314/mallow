import type { ProductIdType } from './identifier';

export interface TenantProductData {
  id: string;
  organizationId: string;
  idType: ProductIdType;
  identifier: string;
  name: string | null;
  description: string | null;
  brand: string | null;
  price: number | null;
  images: string[] | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
