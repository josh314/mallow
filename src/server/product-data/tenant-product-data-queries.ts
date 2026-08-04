import type { DbClient } from '../db/client';
import type { ProductIdentifier, ProductIdType } from './identifier';
import type { TenantProductData } from './tenant-product-data-types';

const columns = `
  id,
  organization_id  AS "organizationId",
  id_type          AS "idType",
  identifier,
  name,
  description,
  brand,
  price::float8    AS price,
  images,
  custom_fields    AS "customFields",
  created_at       AS "createdAt",
  updated_at       AS "updatedAt",
  deleted_at       AS "deletedAt"
`;

export interface CreateTenantProductDataInput {
  organizationId: string;
  idType: ProductIdType;
  identifier: string;
  name?: string;
  description?: string;
  brand?: string;
  price?: number;
  images?: string[];
  customFields?: Record<string, unknown>;
}

export async function createTenantProductData(
  db: DbClient,
  input: CreateTenantProductDataInput,
): Promise<TenantProductData> {

  const rows = await db.sql<TenantProductData[]>`
    INSERT INTO tenant_product_data (
      organization_id, id_type, identifier, name, description, brand, price, images, custom_fields
    )
    VALUES (
      ${ input.organizationId },
      ${ input.idType },
      ${ input.identifier },
      ${ input.name ?? null },
      ${ input.description ?? null },
      ${ input.brand ?? null },
      ${ input.price ?? null },
      ${ input.images ? db.sql.json( input.images ) : null },
      ${ db.sql.json( ( input.customFields ?? {} ) as unknown as import( 'postgres' ).JSONValue ) }
    )
    RETURNING ${ db.sql.unsafe( columns ) }
  `;

  return rows[ 0 ];

}

export async function findTenantProductData(
  db: DbClient,
  organizationId: string,
  identifier: ProductIdentifier,
): Promise<TenantProductData | null> {

  const rows = await db.sql<TenantProductData[]>`
    SELECT ${ db.sql.unsafe( columns ) }
    FROM tenant_product_data
    WHERE organization_id = ${ organizationId }
      AND id_type = ${ identifier.idType }
      AND identifier = ${ identifier.value }
      AND deleted_at IS NULL
  `;

  return rows[ 0 ] ?? null;

}

export async function findTenantProductDataById(
  db: DbClient,
  organizationId: string,
  id: string,
): Promise<TenantProductData | null> {

  const rows = await db.sql<TenantProductData[]>`
    SELECT ${ db.sql.unsafe( columns ) }
    FROM tenant_product_data
    WHERE id = ${ id }
      AND organization_id = ${ organizationId }
      AND deleted_at IS NULL
  `;

  return rows[ 0 ] ?? null;

}

export async function listTenantProductData(
  db: DbClient,
  params: { organizationId: string; limit: number; offset: number },
): Promise<TenantProductData[]> {

  const { organizationId, limit, offset } = params;

  return db.sql<TenantProductData[]>`
    SELECT ${ db.sql.unsafe( columns ) }
    FROM tenant_product_data
    WHERE organization_id = ${ organizationId }
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${ limit } OFFSET ${ offset }
  `;

}

export async function countTenantProductData(
  db: DbClient,
  params: { organizationId: string },
): Promise<number> {

  const rows = await db.sql<{ count: string }[]>`
    SELECT COUNT(*) AS count
    FROM tenant_product_data
    WHERE organization_id = ${ params.organizationId }
      AND deleted_at IS NULL
  `;

  return parseInt( rows[ 0 ].count, 10 );

}

export interface UpdateTenantProductDataInput {
  name?: string;
  description?: string;
  brand?: string;
  price?: number;
  images?: string[];
  customFields?: Record<string, unknown>;
}

export async function updateTenantProductData(
  db: DbClient,
  organizationId: string,
  id: string,
  patch: UpdateTenantProductDataInput,
): Promise<TenantProductData | null> {

  const rows = await db.sql<TenantProductData[]>`
    UPDATE tenant_product_data
    SET
      name          = ${ patch.name          !== undefined ? patch.name : db.sql`name` },
      description   = ${ patch.description   !== undefined ? patch.description : db.sql`description` },
      brand         = ${ patch.brand         !== undefined ? patch.brand : db.sql`brand` },
      price         = ${ patch.price         !== undefined ? patch.price : db.sql`price` },
      images        = ${ patch.images        !== undefined ? db.sql.json( patch.images ) : db.sql`images` },
      custom_fields = ${ patch.customFields  !== undefined ? db.sql.json( patch.customFields as unknown as import( 'postgres' ).JSONValue ) : db.sql`custom_fields` }
    WHERE id = ${ id }
      AND organization_id = ${ organizationId }
      AND deleted_at IS NULL
    RETURNING ${ db.sql.unsafe( columns ) }
  `;

  return rows[ 0 ] ?? null;

}

export async function softDeleteTenantProductData(
  db: DbClient,
  organizationId: string,
  id: string,
): Promise<boolean> {

  const rows = await db.sql`
    UPDATE tenant_product_data
    SET deleted_at = now()
    WHERE id = ${ id }
      AND organization_id = ${ organizationId }
      AND deleted_at IS NULL
    RETURNING id
  `;

  return rows.length > 0;

}
