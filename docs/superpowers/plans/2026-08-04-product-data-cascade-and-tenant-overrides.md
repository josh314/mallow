# Product Data: Uniform Schema, Source Cascade & Tenant Overrides — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-source `ProductDataService` with a pluggable multi-source cascade behind a uniform `ProductData` schema, add tenant-owned product-data overrides that merge over the cascade result, and expose CRUD for those overrides — per `docs/superpowers/specs/2026-08-03-product-data-design.md`.

**Architecture:** A `ProductIdentifier` (`{ idType, value }`) replaces the bare `barcode` string everywhere. `ProductDataService` tries an ordered array of `ProductDataSource` implementations (currently just `UpcItemDbSource`, wrapping the existing `UpcItemDbClient`) and takes the first non-null hit, then merges a tenant's `tenant_product_data` override row on top (non-null tenant fields win; `customFields` always attached). Everything is built and shipped in two working increments: (1) cascade-only, org-agnostic — a complete, valuable milestone on its own — then (2) tenant overrides layered on top, which changes `getProductData`'s signature to take `organizationId`.

**Tech Stack:** TypeScript, Express 5, Zod v4, `postgres` (raw SQL, no ORM), Jest + Supertest, Flyway migrations, `@asteasolutions/zod-to-openapi`.

## Global Constraints

- No ORM — raw SQL via the `postgres` package only.
- Every tenant-scoped query MUST filter by `organization_id`.
- Soft deletes via a `deleted_at` timestamp column, never an `isDeleted` boolean.
- Manual constructor DI through `server.ts` as the sole composition root — no DI framework, no globals/module-level singletons.
- JSONB values: wrap with `db.sql.json(value)` on write; cast the TS value `as unknown as import('postgres').JSONValue`.
- The `set_updated_at()` trigger only fires on `UPDATE`, not `INSERT` — relevant if a test needs a backdated row.
- Keep `docs/api.md` and the OpenAPI registry (`src/server/openapi/index.ts`) in sync with every route change.
- Match existing code style exactly: 2-space indent, single quotes, semicolons, a space just inside parens/brackets (`fn( x )`, `arr[ 0 ]`, `{ a, b }`).
- Out of scope for this plan (per spec's "Deferred" section — do not implement): `traject`/`fnsku-to-asin` source clients, AI-search backfill, cross-type/fuzzy entity resolution, the bare `products` stub table.

---

## File Structure

New files:
- `src/server/product-data/identifier.ts` — `ProductIdType`, `ProductIdentifier`, `detectIdType`, `normalizeIdentifier`, `parseIdentifier`.
- `src/server/product-data/identifier.test.ts`
- `src/server/product-data/source.ts` — `ProductDataSource` interface.
- `src/server/product-data/upc-item-db-source.ts` — adapts `UpcItemDbClient` to `ProductDataSource`.
- `src/server/product-data/upc-item-db-source.test.ts`
- `src/server/product-data/tenant-product-data-types.ts` — `TenantProductData` interface.
- `src/server/product-data/tenant-product-data-queries.ts` — CRUD raw SQL for `tenant_product_data`.
- `src/server/product-data/tenant-product-data-queries.int.test.ts`
- `db/migrations/V13__tenant_product_data.sql`

Modified files:
- `src/server/product-data/types.ts` — `ProductData` becomes identifier-based, gains `brand`/`price`/`images`/`customFields`.
- `src/server/product-data/service.ts` — becomes a source cascade, then gains tenant-override merge.
- `src/server/product-data/service.test.ts`
- `src/server/routes/product-data.ts` — relax `barcode` validation, org-scope the lookup, add `/overrides` CRUD sub-routes.
- `src/server/routes/product-data.test.ts`
- `src/server/routes/index.ts` — thread `db` into `createProductDataRouter`.
- `src/server/openapi/index.ts` — update `ProductData` schema, add override paths.
- `src/server/server.ts` — build `UpcItemDbSource`/`ProductDataService` with the new constructor shapes.
- `docs/api.md` — update Product Data section, document override endpoints.

Untouched by design: `src/server/product-data/upc-item-db-client.ts`, `upc-item-db-cache-queries.ts`, `upc-item-db-types.ts` (still speak UPCItemDB's own vendor shape; `UpcItemDbSource` is the only thing that wraps them).

---

## Task 1: Identifier model

**Files:**
- Create: `src/server/product-data/identifier.ts`
- Test: `src/server/product-data/identifier.test.ts`

**Interfaces:**
- Produces: `ProductIdType = 'upc' | 'ean' | 'gtin' | 'asin' | 'fnsku'`; `ProductIdentifier { idType: ProductIdType; value: string }`; `detectIdType(raw: string): ProductIdType`; `normalizeIdentifier(raw: string, idType: ProductIdType): string`; `parseIdentifier(raw: string): ProductIdentifier`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/server/product-data/identifier.test.ts
import { detectIdType, normalizeIdentifier, parseIdentifier } from './identifier';

describe( 'detectIdType', () => {

  it( 'detects a 12-digit numeric string as upc', () => {
    expect( detectIdType( '041598000539' ) ).toBe( 'upc' );
  } );

  it( 'detects a 13-digit numeric string as ean', () => {
    expect( detectIdType( '4006381333931' ) ).toBe( 'ean' );
  } );

  it( 'detects a 14-digit numeric string as gtin', () => {
    expect( detectIdType( '00012345678905' ) ).toBe( 'gtin' );
  } );

  it( 'detects an X-prefixed alphanumeric string as fnsku, case-insensitively', () => {
    expect( detectIdType( 'X001ABCDEF' ) ).toBe( 'fnsku' );
    expect( detectIdType( 'x001abcdef' ) ).toBe( 'fnsku' );
  } );

  it( 'detects any other alphanumeric string as asin', () => {
    expect( detectIdType( 'B08N5WRWNW' ) ).toBe( 'asin' );
  } );

} );

describe( 'normalizeIdentifier', () => {

  it( 'strips non-digit characters and left-pads a upc to 12 digits', () => {
    expect( normalizeIdentifier( '0415-9800-0539', 'upc' ) ).toBe( '041598000539' );
    expect( normalizeIdentifier( '41598000539', 'upc' ) ).toBe( '041598000539' );
  } );

  it( 'left-pads an ean to 13 digits without truncating', () => {
    expect( normalizeIdentifier( '4006381333931', 'ean' ) ).toBe( '4006381333931' );
  } );

  it( 'left-pads a gtin to 14 digits', () => {
    expect( normalizeIdentifier( '12345678905', 'gtin' ) ).toBe( '00012345678905' );
  } );

  it( 'trims and uppercases asin and fnsku values', () => {
    expect( normalizeIdentifier( ' b08n5wrwnw ', 'asin' ) ).toBe( 'B08N5WRWNW' );
    expect( normalizeIdentifier( 'x001abcdef', 'fnsku' ) ).toBe( 'X001ABCDEF' );
  } );

} );

describe( 'parseIdentifier', () => {

  it( 'combines detection and normalization', () => {
    expect( parseIdentifier( '41598000539' ) ).toEqual( { idType: 'upc', value: '041598000539' } );
    expect( parseIdentifier( 'x001abcdef' ) ).toEqual( { idType: 'fnsku', value: 'X001ABCDEF' } );
  } );

} );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/server/product-data/identifier.test.ts`
Expected: FAIL — `Cannot find module './identifier'`

- [ ] **Step 3: Write the implementation**

```ts
// src/server/product-data/identifier.ts

export type ProductIdType = 'upc' | 'ean' | 'gtin' | 'asin' | 'fnsku';

export interface ProductIdentifier {
  idType: ProductIdType;
  value: string;
}

export function detectIdType( raw: string ): ProductIdType {

  const trimmed = raw.trim();

  if( /^\d+$/.test( trimmed ) ) {
    if( trimmed.length <= 12 ) return 'upc';
    if( trimmed.length === 13 ) return 'ean';
    return 'gtin';
  }

  if( /^x/i.test( trimmed ) ) return 'fnsku';

  return 'asin';

}

const STANDARD_DIGIT_LENGTH: Record<'upc' | 'ean' | 'gtin', number> = {
  upc: 12,
  ean: 13,
  gtin: 14,
};

export function normalizeIdentifier( raw: string, idType: ProductIdType ): string {

  const trimmed = raw.trim();

  if( idType === 'upc' || idType === 'ean' || idType === 'gtin' ) {
    const digits = trimmed.replace( /\D/g, '' );
    return digits.padStart( STANDARD_DIGIT_LENGTH[ idType ], '0' );
  }

  return trimmed.toUpperCase();

}

export function parseIdentifier( raw: string ): ProductIdentifier {
  const idType = detectIdType( raw );
  return { idType, value: normalizeIdentifier( raw, idType ) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/server/product-data/identifier.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/server/product-data/identifier.ts src/server/product-data/identifier.test.ts
git commit -m "feat: add ProductIdentifier model with type detection and normalization"
```

---

## Task 2: Uniform ProductData shape, ProductDataSource interface, UpcItemDbSource adapter

**Files:**
- Modify: `src/server/product-data/types.ts`
- Create: `src/server/product-data/source.ts`
- Create: `src/server/product-data/upc-item-db-source.ts`
- Test: `src/server/product-data/upc-item-db-source.test.ts`

**Interfaces:**
- Consumes: `ProductIdentifier` from `./identifier` (Task 1); `UpcItemDbClient` (`lookup(upc: string): Promise<UpcItemDbItem | null>`) and `UpcItemDbItem` from `./upc-item-db-client` / `./upc-item-db-types` (existing, unchanged).
- Produces: `ProductData { identifier: ProductIdentifier; name: string; description?: string; brand?: string; price?: number; images?: string[]; customFields?: Record<string, unknown> }`; `ProductDataSource { lookup(identifier: ProductIdentifier): Promise<ProductData | null> }`; `UpcItemDbSource` class implementing `ProductDataSource`.

- [ ] **Step 1: Update the ProductData type**

```ts
// src/server/product-data/types.ts
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
```

- [ ] **Step 2: Add the ProductDataSource interface**

```ts
// src/server/product-data/source.ts
import type { ProductIdentifier } from './identifier';
import type { ProductData } from './types';

export interface ProductDataSource {
  lookup( identifier: ProductIdentifier ): Promise<ProductData | null>;
}
```

- [ ] **Step 3: Write the failing tests for UpcItemDbSource**

```ts
// src/server/product-data/upc-item-db-source.test.ts
import { UpcItemDbSource } from './upc-item-db-source';
import type { UpcItemDbClient } from './upc-item-db-client';
import type { UpcItemDbItem } from './upc-item-db-types';

function makeFakeClient(): UpcItemDbClient {
  return { lookup: jest.fn() } as unknown as UpcItemDbClient;
}

describe( 'UpcItemDbSource', () => {

  it( 'returns null without calling the client for an unsupported id type (asin)', async () => {

    const client = makeFakeClient();
    const source = new UpcItemDbSource( client );

    const result = await source.lookup( { idType: 'asin', value: 'B08N5WRWNW' } );

    expect( result ).toBeNull();
    expect( client.lookup ).not.toHaveBeenCalled();

  } );

  it( 'returns null without calling the client for an unsupported id type (fnsku)', async () => {

    const client = makeFakeClient();
    const source = new UpcItemDbSource( client );

    const result = await source.lookup( { idType: 'fnsku', value: 'X001ABCDEF' } );

    expect( result ).toBeNull();
    expect( client.lookup ).not.toHaveBeenCalled();

  } );

  it( 'maps a UPCItemDB item to ProductData for a upc identifier', async () => {

    const item: UpcItemDbItem = {
      upc: '041598000539',
      title: 'Test Product',
      description: 'A test product',
      brand: 'Acme',
      images: [ 'https://example.com/a.jpg' ],
      lowest_recorded_price: 9.99,
    };

    const client = makeFakeClient();
    ( client.lookup as jest.Mock ).mockResolvedValueOnce( item );

    const source = new UpcItemDbSource( client );
    const identifier = { idType: 'upc' as const, value: '041598000539' };
    const result = await source.lookup( identifier );

    expect( client.lookup ).toHaveBeenCalledWith( '041598000539' );
    expect( result ).toEqual( {
      identifier,
      name: 'Test Product',
      description: 'A test product',
      brand: 'Acme',
      price: 9.99,
      images: [ 'https://example.com/a.jpg' ],
    } );

  } );

  it( 'returns null when the client finds nothing', async () => {

    const client = makeFakeClient();
    ( client.lookup as jest.Mock ).mockResolvedValueOnce( null );

    const source = new UpcItemDbSource( client );
    const result = await source.lookup( { idType: 'ean', value: '4006381333931' } );

    expect( result ).toBeNull();

  } );

  it( 'returns null when the item has no title', async () => {

    const client = makeFakeClient();
    ( client.lookup as jest.Mock ).mockResolvedValueOnce( { upc: '041598000539' } );

    const source = new UpcItemDbSource( client );
    const result = await source.lookup( { idType: 'upc', value: '041598000539' } );

    expect( result ).toBeNull();

  } );

} );
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx jest src/server/product-data/upc-item-db-source.test.ts`
Expected: FAIL — `Cannot find module './upc-item-db-source'`

- [ ] **Step 5: Write the implementation**

```ts
// src/server/product-data/upc-item-db-source.ts
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/server/product-data/upc-item-db-source.test.ts`
Expected: PASS (all 5 cases)

- [ ] **Step 7: Commit**

```bash
git add src/server/product-data/types.ts src/server/product-data/source.ts src/server/product-data/upc-item-db-source.ts src/server/product-data/upc-item-db-source.test.ts
git commit -m "feat: introduce ProductDataSource interface and UpcItemDbSource adapter"
```

---

## Task 3: ProductDataService as a source cascade

**Files:**
- Modify: `src/server/product-data/service.ts`
- Modify: `src/server/product-data/service.test.ts`

**Interfaces:**
- Consumes: `ProductDataSource` (Task 2), `parseIdentifier` (Task 1), `ProductData` (Task 2).
- Produces: `ProductDataService` with `constructor( sources: ProductDataSource[] )` and `getProductData( rawIdentifier: string ): Promise<ProductData | null>`. (Signature changes again in Task 6 — that's expected.)

- [ ] **Step 1: Rewrite the failing/changed tests**

```ts
// src/server/product-data/service.test.ts
import { ProductDataService } from './service';
import type { ProductDataSource } from './source';
import type { ProductData } from './types';

function makeSource( lookupImpl: jest.Mock ): ProductDataSource {
  return { lookup: lookupImpl };
}

const identifier = { idType: 'upc' as const, value: '041598000539' };

const productData: ProductData = { identifier, name: 'Test Product' };

describe( 'ProductDataService', () => {

  it( 'returns the first non-null result from the source cascade', async () => {

    const firstLookup = jest.fn().mockResolvedValue( productData );
    const secondLookup = jest.fn().mockResolvedValue( null );

    const service = new ProductDataService( [ makeSource( firstLookup ), makeSource( secondLookup ) ] );
    const result = await service.getProductData( '041598000539' );

    expect( result ).toEqual( productData );
    expect( firstLookup ).toHaveBeenCalledWith( identifier );
    expect( secondLookup ).not.toHaveBeenCalled();

  } );

  it( 'falls through to the next source when the first misses', async () => {

    const firstLookup = jest.fn().mockResolvedValue( null );
    const secondLookup = jest.fn().mockResolvedValue( productData );

    const service = new ProductDataService( [ makeSource( firstLookup ), makeSource( secondLookup ) ] );
    const result = await service.getProductData( '041598000539' );

    expect( result ).toEqual( productData );
    expect( secondLookup ).toHaveBeenCalledWith( identifier );

  } );

  it( 'returns null when every source misses', async () => {

    const service = new ProductDataService( [ makeSource( jest.fn().mockResolvedValue( null ) ) ] );
    const result = await service.getProductData( '041598000539' );

    expect( result ).toBeNull();

  } );

  it( 'returns null when there are no sources', async () => {

    const service = new ProductDataService( [] );
    const result = await service.getProductData( '041598000539' );

    expect( result ).toBeNull();

  } );

} );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/server/product-data/service.test.ts`
Expected: FAIL — old tests reference a `db`/credentials constructor and `UpcItemDbClient` mock that no longer match; new tests fail because `ProductDataService` still has the old constructor/behavior.

- [ ] **Step 3: Rewrite the implementation**

```ts
// src/server/product-data/service.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/server/product-data/service.test.ts`
Expected: PASS (all 4 cases)

- [ ] **Step 5: Commit**

```bash
git add src/server/product-data/service.ts src/server/product-data/service.test.ts
git commit -m "refactor: turn ProductDataService into a source cascade"
```

---

## Task 4: Wire the cascade into the app — server.ts, GET /product-data, OpenAPI, docs

**Files:**
- Modify: `src/server/server.ts`
- Modify: `src/server/routes/product-data.ts`
- Modify: `src/server/routes/product-data.test.ts`
- Modify: `src/server/openapi/index.ts`
- Modify: `docs/api.md`

**Interfaces:**
- Consumes: `ProductDataService`, `UpcItemDbSource` (Task 2/3), existing `UpcItemDbClient`.
- Produces: no new exports; `GET /product-data?barcode=` now accepts any non-empty identifier string (not numeric-only) and returns the new `ProductData` shape.

- [ ] **Step 1: Relax the query schema — barcode is no longer numeric-only**

The old regex (`/^\d+$/`) rejected ASIN/FNSKU identifiers, which the cascade now supports. Edit `src/server/routes/product-data.ts`:

```ts
export const getProductDataQuery = z.object( {
  barcode: z.string().min( 1 ),
} );
```

(Leave the rest of the router — the `router.get( '/', ... )` handler body — unchanged for this task; it already just forwards to `productDataService.getProductData(...)`.)

- [ ] **Step 2: Update the composition root**

Edit `src/server/server.ts`. Add imports and replace the `ProductDataService` construction:

```ts
import { UpcItemDbClient } from './product-data/upc-item-db-client';
import { UpcItemDbSource } from './product-data/upc-item-db-source';
```

```ts
  constructor( config: Config, db: DbClient) {
    this.app = express();
    this.config = config;
    this.db = db;
    const upcItemDbClient = new UpcItemDbClient( this.db, { userKey: this.config.upcItemDbUserKey } );
    this.productDataService = new ProductDataService( [ new UpcItemDbSource( upcItemDbClient ) ] );
  }
```

- [ ] **Step 3: Update route test fixtures and expectations**

Edit `src/server/routes/product-data.test.ts`:

```ts
const fakeProductData: ProductData = {
  identifier: { idType: 'upc', value: '041598000539' },
  name: 'Mock Product',
};
```

Remove the `'returns 400 when barcode is non-numeric'` test (it's no longer invalid input). Keep `'returns 400 when barcode is missing'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/server/routes/product-data.test.ts src/server/product-data`
Expected: PASS

- [ ] **Step 5: Update the OpenAPI schema**

Edit `src/server/openapi/index.ts`. Replace the `ProductData` registration:

```ts
const ProductIdentifierSchema = registry.register( 'ProductIdentifier',
  z.object( {
    idType: z.enum( [ 'upc', 'ean', 'gtin', 'asin', 'fnsku' ] ),
    value: z.string(),
  } )
);

const ProductData = registry.register( 'ProductData',
  z.object( {
    identifier: ProductIdentifierSchema,
    name: z.string(),
    description: z.string().optional(),
    brand: z.string().optional(),
    price: z.number().optional(),
    images: z.array( z.string() ).optional(),
    customFields: z.record( z.string(), z.unknown() ).optional(),
  } )
);
```

Update the `GET /product-data` path's `summary` to mention the wider identifier support:

```ts
registry.registerPath( {
  method: 'get',
  path: '/product-data',
  summary: 'Look up product data by barcode, ASIN, or FNSKU',
  security: cookieAuth,
  request: { query: getProductDataQuery },
  responses: {
    ...jsonResponse( 200, 'Product data found', z.object( { productData: ProductData } ) ),
    ...errorResponse( 400, 'Missing barcode' ),
    ...errorResponse( 401, 'Not authenticated' ),
    ...errorResponse( 404, 'No product data found for barcode' ),
  },
} );
```

- [ ] **Step 6: Update docs/api.md**

Replace the `GET /product-data` section (lines ~159–184) with:

```markdown
### `GET /product-data`

**Auth:** any authenticated user.

**Query params**
| Field     | Type   | Rules         |
|-----------|--------|---------------|
| `barcode` | string | non-empty — UPC/EAN/GTIN, ASIN, or FNSKU; type is auto-detected |

**Response `200`**
```json
{
  "productData": {
    "identifier": { "idType": "upc | ean | gtin | asin | fnsku", "value": "string" },
    "name": "string",
    "description": "string (optional)",
    "brand": "string (optional)",
    "price": "number (optional)",
    "images": ["string"] ,
    "customFields": { "...": "..." }
  }
}
```

**Errors**
| Status | Condition |
|--------|-----------|
| `400`  | Missing barcode |
| `401`  | Not authenticated |
| `404`  | No product data found for barcode |
```

- [ ] **Step 7: Run the full unit suite and lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/server/server.ts src/server/routes/product-data.ts src/server/routes/product-data.test.ts src/server/openapi/index.ts docs/api.md
git commit -m "feat: wire the product-data source cascade into the app and widen barcode input"
```

---

## Task 5: tenant_product_data — migration, queries, integration tests

**Files:**
- Create: `db/migrations/V13__tenant_product_data.sql`
- Create: `src/server/product-data/tenant-product-data-types.ts`
- Create: `src/server/product-data/tenant-product-data-queries.ts`
- Test: `src/server/product-data/tenant-product-data-queries.int.test.ts`

**Interfaces:**
- Consumes: `ProductIdType`, `ProductIdentifier` (Task 1); `DbClient` (existing).
- Produces: `TenantProductData` type; `createTenantProductData`, `findTenantProductData`, `listTenantProductData`, `countTenantProductData`, `updateTenantProductData`, `softDeleteTenantProductData` — imported by Task 6 (merge logic, uses `findTenantProductData`) and Task 8 (routes, uses the rest). `findTenantProductDataById` is also produced here for completeness/parity with the other query modules and is exercised directly by this task's own integration tests, but isn't consumed by a later task.

- [ ] **Step 1: Write the migration**

```sql
-- db/migrations/V13__tenant_product_data.sql
-- Tenant-owned product data overrides/additions. Merged over the global
-- source cascade at read time (see ProductDataService.getProductData) --
-- never referenced by FK from anywhere, matching the no-FK/join-by-value
-- pattern used across the product-data sources.

CREATE TABLE tenant_product_data (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations (id),
  id_type          TEXT        NOT NULL,
  identifier       TEXT        NOT NULL,
  name             TEXT,
  description      TEXT,
  brand            TEXT,
  price            NUMERIC,
  images           JSONB,
  custom_fields    JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,

  CONSTRAINT tenant_product_data_org_identifier_key
    UNIQUE (organization_id, id_type, identifier)
);

CREATE INDEX tenant_product_data_organization_id_idx ON tenant_product_data (organization_id);

CREATE TRIGGER tenant_product_data_set_updated_at
  BEFORE UPDATE ON tenant_product_data
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 2: Apply the migration locally**

Run: `npm run db:dev`
Expected: Flyway logs `Successfully applied 1 migration` (or equivalent) including `V13__tenant_product_data`. Confirm via Adminer or `docker compose exec db psql -U postgres -c '\d tenant_product_data'` that the table exists with the expected columns.

- [ ] **Step 3: Add the TenantProductData type**

```ts
// src/server/product-data/tenant-product-data-types.ts
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
```

- [ ] **Step 4: Write the failing integration tests**

```ts
// src/server/product-data/tenant-product-data-queries.int.test.ts
import { randomUUID } from 'node:crypto';

import { createDbClient } from '../db/client';
import type { DbClient } from '../db/client';
import {
  createTenantProductData,
  findTenantProductData,
  findTenantProductDataById,
  listTenantProductData,
  countTenantProductData,
  updateTenantProductData,
  softDeleteTenantProductData,
} from './tenant-product-data-queries';

function getTestDbUrl(): string {

  const host = process.env.POSTGRES_TEST_HOST ?? "127.0.0.1";
  const port = Number( process.env.POSTGRES_TEST_PORT ?? "5433" );

  const database = process.env.POSTGRES_TEST_DB
    ?? ( process.env.POSTGRES_DB ? `${ process.env.POSTGRES_DB }_test` : "postgres" );

  const user = process.env.POSTGRES_TEST_USER ?? process.env.POSTGRES_USER ?? "postgres";
  const password = process.env.POSTGRES_TEST_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? "";

  return `postgres://${ encodeURIComponent( user ) }:${ encodeURIComponent( password ) }@${ host }:${ port }/${ database }`;

}

describe( "tenant-product-data queries", () => {

  let db: DbClient;
  let orgAId: string;
  let orgBId: string;

  beforeAll( async () => {

    db = createDbClient( { databaseUrl: getTestDbUrl(), maxConnections: 2 } );

    const [ orgA ] = await db.sql<{ id: string }[]>`
      INSERT INTO organizations ( name, slug ) VALUES ( 'Org A', ${ 'org-a-' + randomUUID() } ) RETURNING id
    `;
    const [ orgB ] = await db.sql<{ id: string }[]>`
      INSERT INTO organizations ( name, slug ) VALUES ( 'Org B', ${ 'org-b-' + randomUUID() } ) RETURNING id
    `;

    orgAId = orgA.id;
    orgBId = orgB.id;

  } );

  afterEach( async () => {
    await db.sql`DELETE FROM tenant_product_data`;
  } );

  afterAll( async () => {
    await db.sql`DELETE FROM organizations WHERE id IN ( ${ orgAId }, ${ orgBId } )`;
    await db.close();
  } );

  it( "creates and finds an override by (organizationId, idType, identifier)", async () => {

    await createTenantProductData( db, {
      organizationId: orgAId,
      idType: 'upc',
      identifier: '041598000539',
      name: 'Tenant Name',
      customFields: { color: 'red' },
    } );

    const found = await findTenantProductData( db, orgAId, { idType: 'upc', value: '041598000539' } );

    expect( found ).not.toBeNull();
    expect( found?.name ).toBe( 'Tenant Name' );
    expect( found?.customFields ).toEqual( { color: 'red' } );
    expect( found?.description ).toBeNull();

  } );

  it( "does not find another org's override (tenant isolation)", async () => {

    await createTenantProductData( db, {
      organizationId: orgAId,
      idType: 'upc',
      identifier: '041598000539',
      name: 'Org A Name',
    } );

    const found = await findTenantProductData( db, orgBId, { idType: 'upc', value: '041598000539' } );

    expect( found ).toBeNull();

  } );

  it( "finds an override by id, scoped to organizationId", async () => {

    const created = await createTenantProductData( db, {
      organizationId: orgAId,
      idType: 'upc',
      identifier: '041598000539',
      name: 'Tenant Name',
    } );

    expect( await findTenantProductDataById( db, orgAId, created.id ) ).not.toBeNull();
    expect( await findTenantProductDataById( db, orgBId, created.id ) ).toBeNull();

  } );

  it( "lists and counts an org's overrides with pagination", async () => {

    await createTenantProductData( db, { organizationId: orgAId, idType: 'upc', identifier: '111111111111', name: 'One' } );
    await createTenantProductData( db, { organizationId: orgAId, idType: 'upc', identifier: '222222222222', name: 'Two' } );
    await createTenantProductData( db, { organizationId: orgBId, idType: 'upc', identifier: '333333333333', name: 'Three' } );

    const page = await listTenantProductData( db, { organizationId: orgAId, limit: 1, offset: 0 } );
    const total = await countTenantProductData( db, { organizationId: orgAId } );

    expect( page ).toHaveLength( 1 );
    expect( total ).toBe( 2 );

  } );

  it( "partially updates an override, leaving unspecified fields unchanged", async () => {

    const created = await createTenantProductData( db, {
      organizationId: orgAId,
      idType: 'upc',
      identifier: '041598000539',
      name: 'Original Name',
      brand: 'Original Brand',
    } );

    const updated = await updateTenantProductData( db, orgAId, created.id, { price: 12.5 } );

    expect( updated?.price ).toBe( 12.5 );
    expect( updated?.name ).toBe( 'Original Name' );
    expect( updated?.brand ).toBe( 'Original Brand' );

  } );

  it( "returns null when updating an override outside the caller's org", async () => {

    const created = await createTenantProductData( db, {
      organizationId: orgAId,
      idType: 'upc',
      identifier: '041598000539',
      name: 'Original Name',
    } );

    const updated = await updateTenantProductData( db, orgBId, created.id, { price: 12.5 } );

    expect( updated ).toBeNull();

  } );

  it( "soft-deletes an override so it no longer appears in find/list", async () => {

    const created = await createTenantProductData( db, {
      organizationId: orgAId,
      idType: 'upc',
      identifier: '041598000539',
      name: 'Original Name',
    } );

    const deleted = await softDeleteTenantProductData( db, orgAId, created.id );
    expect( deleted ).toBe( true );

    expect( await findTenantProductDataById( db, orgAId, created.id ) ).toBeNull();
    expect( await listTenantProductData( db, { organizationId: orgAId, limit: 20, offset: 0 } ) ).toHaveLength( 0 );

  } );

  it( "returns false when soft-deleting an override that doesn't exist", async () => {
    expect( await softDeleteTenantProductData( db, orgAId, randomUUID() ) ).toBe( false );
  } );

  it( "rejects a duplicate (organizationId, idType, identifier)", async () => {

    await createTenantProductData( db, { organizationId: orgAId, idType: 'upc', identifier: '041598000539', name: 'First' } );

    await expect(
      createTenantProductData( db, { organizationId: orgAId, idType: 'upc', identifier: '041598000539', name: 'Second' } )
    ).rejects.toThrow();

  } );

} );
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npm run test:int -- tenant-product-data-queries`
Expected: FAIL — `Cannot find module './tenant-product-data-queries'`

- [ ] **Step 6: Write the implementation**

```ts
// src/server/product-data/tenant-product-data-queries.ts
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
      ${ input.images ? db.sql.json( input.images as unknown as import( 'postgres' ).JSONValue ) : null },
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
      images        = ${ patch.images        !== undefined ? db.sql.json( patch.images as unknown as import( 'postgres' ).JSONValue ) : db.sql`images` },
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
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:int -- tenant-product-data-queries`
Expected: PASS (all 9 cases)

- [ ] **Step 8: Commit**

```bash
git add db/migrations/V13__tenant_product_data.sql src/server/product-data/tenant-product-data-types.ts src/server/product-data/tenant-product-data-queries.ts src/server/product-data/tenant-product-data-queries.int.test.ts
git commit -m "feat: add tenant_product_data table and query layer"
```

---

## Task 6: Merge tenant overrides into ProductDataService

**Files:**
- Modify: `src/server/product-data/service.ts`
- Modify: `src/server/product-data/service.test.ts`

**Interfaces:**
- Consumes: `findTenantProductData` (Task 5); `DbClient` (existing).
- Produces: `ProductDataService` with `constructor( db: DbClient, sources: ProductDataSource[] )` and `getProductData( organizationId: string, rawIdentifier: string ): Promise<ProductData | null>`.

- [ ] **Step 1: Rewrite the failing/changed tests**

```ts
// src/server/product-data/service.test.ts
import { ProductDataService } from './service';
import type { ProductDataSource } from './source';
import type { ProductData } from './types';
import type { DbClient } from '../db/client';
import { findTenantProductData } from './tenant-product-data-queries';

jest.mock( './tenant-product-data-queries' );

const findTenantProductDataMock = findTenantProductData as jest.Mock;

function makeSource( result: ProductData | null ): ProductDataSource {
  return { lookup: jest.fn().mockResolvedValue( result ) };
}

const fakeDb = {} as DbClient;
const identifier = { idType: 'upc' as const, value: '041598000539' };

beforeEach( () => {
  findTenantProductDataMock.mockReset();
  findTenantProductDataMock.mockResolvedValue( null );
} );

describe( 'ProductDataService', () => {

  it( 'returns the cascade result unchanged when there is no tenant override', async () => {

    const cascadeResult: ProductData = { identifier, name: 'Cascade Name', description: 'Cascade Desc' };
    const service = new ProductDataService( fakeDb, [ makeSource( cascadeResult ) ] );

    const result = await service.getProductData( 'org-uuid', '041598000539' );

    expect( result ).toEqual( { ...cascadeResult, customFields: {} } );
    expect( findTenantProductDataMock ).toHaveBeenCalledWith( fakeDb, 'org-uuid', identifier );

  } );

  it( 'overlays non-null tenant fields on top of the cascade result', async () => {

    const cascadeResult: ProductData = { identifier, name: 'Cascade Name', description: 'Cascade Desc' };
    findTenantProductDataMock.mockResolvedValue( {
      name: null, description: null, brand: 'Tenant Brand', price: 9.99, images: null,
      customFields: { color: 'red' },
    } );

    const service = new ProductDataService( fakeDb, [ makeSource( cascadeResult ) ] );
    const result = await service.getProductData( 'org-uuid', '041598000539' );

    expect( result ).toEqual( {
      identifier,
      name: 'Cascade Name',
      description: 'Cascade Desc',
      brand: 'Tenant Brand',
      price: 9.99,
      customFields: { color: 'red' },
    } );

  } );

  it( 'uses tenant data alone when the cascade misses entirely', async () => {

    findTenantProductDataMock.mockResolvedValue( {
      name: 'Tenant-only Name', description: null, brand: null, price: null, images: null,
      customFields: { note: 'manual entry' },
    } );

    const service = new ProductDataService( fakeDb, [ makeSource( null ) ] );
    const result = await service.getProductData( 'org-uuid', '041598000539' );

    expect( result ).toEqual( { identifier, name: 'Tenant-only Name', customFields: { note: 'manual entry' } } );

  } );

  it( 'returns null when neither the cascade nor the tenant override has a name', async () => {

    findTenantProductDataMock.mockResolvedValue( {
      name: null, description: null, brand: null, price: null, images: null,
      customFields: { note: 'incomplete' },
    } );

    const service = new ProductDataService( fakeDb, [ makeSource( null ) ] );
    const result = await service.getProductData( 'org-uuid', '041598000539' );

    expect( result ).toBeNull();

  } );

  it( 'still short-circuits the cascade once a source hits', async () => {

    const cascadeResult: ProductData = { identifier, name: 'First Source' };
    const firstSource = makeSource( cascadeResult );
    const secondSource = makeSource( null );

    const service = new ProductDataService( fakeDb, [ firstSource, secondSource ] );
    await service.getProductData( 'org-uuid', '041598000539' );

    expect( secondSource.lookup ).not.toHaveBeenCalled();

  } );

} );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/server/product-data/service.test.ts`
Expected: FAIL — `getProductData` still takes one argument and there's no tenant merge.

- [ ] **Step 3: Rewrite the implementation**

```ts
// src/server/product-data/service.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/server/product-data/service.test.ts`
Expected: PASS (all 5 cases)

- [ ] **Step 5: Commit**

```bash
git add src/server/product-data/service.ts src/server/product-data/service.test.ts
git commit -m "feat: merge tenant product-data overrides into the cascade result"
```

---

## Task 7: Org-scope GET /product-data

**Files:**
- Modify: `src/server/server.ts`
- Modify: `src/server/routes/product-data.ts`
- Modify: `src/server/routes/product-data.test.ts`
- Modify: `docs/api.md`

**Interfaces:**
- Consumes: `ProductDataService.getProductData( organizationId, rawIdentifier )` (Task 6).

- [ ] **Step 1: Update the composition root for the new constructor shape**

Edit `src/server/server.ts` — `ProductDataService` now also takes `db`:

```ts
    const upcItemDbClient = new UpcItemDbClient( this.db, { userKey: this.config.upcItemDbUserKey } );
    this.productDataService = new ProductDataService( this.db, [ new UpcItemDbSource( upcItemDbClient ) ] );
```

- [ ] **Step 2: Update the route to pass the caller's organizationId**

Edit `src/server/routes/product-data.ts`, in the `router.get( '/', ... )` handler:

```ts
    const productData = await productDataService.getProductData( req.user.organizationId, query.data.barcode );
```

- [ ] **Step 3: Update the failing test expectations**

Edit `src/server/routes/product-data.test.ts`:

```ts
const getProductData = jest.fn<Promise<ProductData | null>, [ string, string ]>();
```

And in the `'returns product data for a valid barcode'` test:

```ts
    expect( getProductData ).toHaveBeenCalledWith( 'org-uuid', '041598000539' );
```

(`employee.organizationId` is already `'org-uuid'` in the existing fixture — no fixture change needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/server/routes/product-data.test.ts`
Expected: PASS

- [ ] **Step 5: Update docs/api.md**

In the `GET /product-data` section, append a line under **Auth**:

```markdown
**Auth:** any authenticated user. Results reflect the caller's own tenant overrides merged over the shared source data.
```

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/server.ts src/server/routes/product-data.ts src/server/routes/product-data.test.ts docs/api.md
git commit -m "feat: scope product-data lookups to the caller's organization"
```

---

## Task 8: Tenant product-data override CRUD routes

**Files:**
- Modify: `src/server/routes/product-data.ts`
- Modify: `src/server/routes/product-data.test.ts`
- Modify: `src/server/routes/index.ts`
- Modify: `src/server/openapi/index.ts`
- Modify: `docs/api.md`

**Interfaces:**
- Consumes: `createTenantProductData`, `listTenantProductData`, `countTenantProductData`, `updateTenantProductData`, `softDeleteTenantProductData` (Task 5); `parseIdentifier` (Task 1).
- Produces: `GET/POST /product-data/overrides`, `PATCH/DELETE /product-data/overrides/:id`. `createProductDataRouter` now takes `( productDataService: ProductDataService, db: DbClient )`.

- [ ] **Step 1: Write the failing route tests**

Add to `src/server/routes/product-data.test.ts` (alongside the existing imports/mocks):

```ts
import { PostgresError } from 'postgres';
import type { DbClient } from '../db/client';
import type { TenantProductData } from '../product-data/tenant-product-data-types';
import {
  createTenantProductData,
  listTenantProductData,
  countTenantProductData,
  updateTenantProductData,
  softDeleteTenantProductData,
} from '../product-data/tenant-product-data-queries';

jest.mock( '../product-data/tenant-product-data-queries' );

function makePostgresError( code: string ): PostgresError {
  const err = Object.create( PostgresError.prototype ) as PostgresError;
  Object.assign( err, { code, message: `postgres error ${ code }` } );
  return err;
}

const fakeOverride: TenantProductData = {
  id: 'override-uuid',
  organizationId: 'org-uuid',
  idType: 'upc',
  identifier: '041598000539',
  name: 'Tenant Name',
  description: null,
  brand: null,
  price: null,
  images: null,
  customFields: {},
  createdAt: new Date( '2026-01-01' ),
  updatedAt: new Date( '2026-01-01' ),
  deletedAt: null,
};
```

Update the app harness's router mount to pass a `db`:

```ts
  a.use( '/product-data', createProductDataRouter( productDataService, {} as DbClient ) );
```

Then append these describe blocks (in the same file, after the existing `GET /product-data` block):

```ts
describe( 'GET /product-data/overrides', () => {

  it( 'returns 401 when not authenticated', async () => {
    await request( app ).get( '/product-data/overrides' ).expect( 401 );
  } );

  it( 'returns the caller org\'s overrides', async () => {

    mockSessionUser = employee;
    ( listTenantProductData as jest.Mock ).mockResolvedValueOnce( [ fakeOverride ] );
    ( countTenantProductData as jest.Mock ).mockResolvedValueOnce( 1 );

    const res = await request( app ).get( '/product-data/overrides' ).expect( 200 );

    expect( res.body ).toEqual( { overrides: [ { ...fakeOverride, createdAt: fakeOverride.createdAt.toISOString(), updatedAt: fakeOverride.updatedAt.toISOString() } ], total: 1, limit: 20, offset: 0 } );
    expect( listTenantProductData ).toHaveBeenCalledWith( expect.anything(), { organizationId: 'org-uuid', limit: 20, offset: 0 } );

  } );

} );

describe( 'POST /product-data/overrides', () => {

  it( 'returns 401 when not authenticated', async () => {
    await request( app ).post( '/product-data/overrides' ).send( { identifier: '041598000539', name: 'X' } ).expect( 401 );
  } );

  it( 'returns 400 when no override fields are provided', async () => {
    mockSessionUser = employee;
    await request( app ).post( '/product-data/overrides' ).send( { identifier: '041598000539' } ).expect( 400 );
  } );

  it( 'creates an override, auto-detecting the id type from the identifier', async () => {

    mockSessionUser = employee;
    ( createTenantProductData as jest.Mock ).mockResolvedValueOnce( fakeOverride );

    const res = await request( app )
      .post( '/product-data/overrides' )
      .send( { identifier: '041598000539', name: 'Tenant Name' } )
      .expect( 201 );

    expect( res.body.override.id ).toBe( 'override-uuid' );
    expect( createTenantProductData ).toHaveBeenCalledWith( expect.anything(), expect.objectContaining( {
      organizationId: 'org-uuid',
      idType: 'upc',
      identifier: '041598000539',
      name: 'Tenant Name',
    } ) );

  } );

  it( 'returns 409 on a duplicate override', async () => {

    mockSessionUser = employee;
    ( createTenantProductData as jest.Mock ).mockRejectedValueOnce( makePostgresError( '23505' ) );

    await request( app )
      .post( '/product-data/overrides' )
      .send( { identifier: '041598000539', name: 'Tenant Name' } )
      .expect( 409 );

  } );

} );

describe( 'PATCH /product-data/overrides/:id', () => {

  it( 'returns 401 when not authenticated', async () => {
    await request( app ).patch( '/product-data/overrides/override-uuid' ).send( { price: 1 } ).expect( 401 );
  } );

  it( 'returns 400 when no fields are provided', async () => {
    mockSessionUser = employee;
    await request( app ).patch( '/product-data/overrides/override-uuid' ).send( {} ).expect( 400 );
  } );

  it( 'returns 404 when the override is not found in the caller\'s org', async () => {

    mockSessionUser = employee;
    ( updateTenantProductData as jest.Mock ).mockResolvedValueOnce( null );

    await request( app ).patch( '/product-data/overrides/override-uuid' ).send( { price: 1 } ).expect( 404 );

  } );

  it( 'updates an override', async () => {

    mockSessionUser = employee;
    ( updateTenantProductData as jest.Mock ).mockResolvedValueOnce( { ...fakeOverride, price: 12.5 } );

    const res = await request( app ).patch( '/product-data/overrides/override-uuid' ).send( { price: 12.5 } ).expect( 200 );

    expect( res.body.override.price ).toBe( 12.5 );
    expect( updateTenantProductData ).toHaveBeenCalledWith( expect.anything(), 'org-uuid', 'override-uuid', { price: 12.5 } );

  } );

} );

describe( 'DELETE /product-data/overrides/:id', () => {

  it( 'returns 401 when not authenticated', async () => {
    await request( app ).delete( '/product-data/overrides/override-uuid' ).expect( 401 );
  } );

  it( 'returns 404 when the override is not found in the caller\'s org', async () => {

    mockSessionUser = employee;
    ( softDeleteTenantProductData as jest.Mock ).mockResolvedValueOnce( false );

    await request( app ).delete( '/product-data/overrides/override-uuid' ).expect( 404 );

  } );

  it( 'soft-deletes an override', async () => {

    mockSessionUser = employee;
    ( softDeleteTenantProductData as jest.Mock ).mockResolvedValueOnce( true );

    await request( app ).delete( '/product-data/overrides/override-uuid' ).expect( 204 );

  } );

} );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/server/routes/product-data.test.ts`
Expected: FAIL — no `/overrides` routes exist yet, and `createProductDataRouter` doesn't accept a second `db` argument.

- [ ] **Step 3: Implement the routes**

Edit `src/server/routes/product-data.ts` — add imports and the new schemas/routes, and change the router factory's signature:

```ts
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
```

(This router doesn't need `findTenantProductDataById` — `updateTenantProductData` and `softDeleteTenantProductData` already re-check `organizationId` themselves and return `null`/`false` on a miss.)

Edit `src/server/routes/index.ts`:

```ts
  router.use( '/product-data', createProductDataRouter( options.productDataService, options.db ) );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/server/routes/product-data.test.ts`
Expected: PASS

- [ ] **Step 5: Register the OpenAPI paths**

Edit `src/server/openapi/index.ts` — add after the `GET /product-data` path:

```ts
const TenantProductData = registry.register( 'TenantProductData',
  z.object( {
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    idType: z.enum( [ 'upc', 'ean', 'gtin', 'asin', 'fnsku' ] ),
    identifier: z.string(),
    name: z.string().nullable(),
    description: z.string().nullable(),
    brand: z.string().nullable(),
    price: z.number().nullable(),
    images: z.array( z.string() ).nullable(),
    customFields: z.record( z.string(), z.unknown() ),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    deletedAt: z.string().datetime().nullable(),
  } )
);

const overrideIdParam = z.object( { id: z.string().uuid() } );

// ─── GET /product-data/overrides ───────────────────────────────────────────────

registry.registerPath( {
  method: 'get',
  path: '/product-data/overrides',
  summary: 'List the caller\'s tenant product-data overrides',
  security: cookieAuth,
  request: { query: listOverridesQuery },
  responses: {
    ...jsonResponse( 200, 'Paginated override list', z.object( {
      overrides: z.array( TenantProductData ),
      total: z.number().int(),
      limit: z.number().int(),
      offset: z.number().int(),
    } ) ),
    ...errorResponse( 400, 'Invalid query params' ),
    ...errorResponse( 401, 'Not authenticated' ),
  },
} );

// ─── POST /product-data/overrides ──────────────────────────────────────────────

registry.registerPath( {
  method: 'post',
  path: '/product-data/overrides',
  summary: 'Create a tenant product-data override',
  security: cookieAuth,
  request: { body: jsonBody( createOverrideBody ) },
  responses: {
    ...jsonResponse( 201, 'Override created', z.object( { override: TenantProductData } ) ),
    ...errorResponse( 400, 'Invalid request body' ),
    ...errorResponse( 401, 'Not authenticated' ),
    ...errorResponse( 409, 'An override for this identifier already exists' ),
  },
} );

// ─── PATCH /product-data/overrides/:id ─────────────────────────────────────────

registry.registerPath( {
  method: 'patch',
  path: '/product-data/overrides/{id}',
  summary: 'Update a tenant product-data override',
  security: cookieAuth,
  request: { params: overrideIdParam, body: jsonBody( updateOverrideBody ) },
  responses: {
    ...jsonResponse( 200, 'Override updated', z.object( { override: TenantProductData } ) ),
    ...errorResponse( 400, 'Invalid request body' ),
    ...errorResponse( 401, 'Not authenticated' ),
    ...errorResponse( 404, 'Override not found' ),
  },
} );

// ─── DELETE /product-data/overrides/:id ────────────────────────────────────────

registry.registerPath( {
  method: 'delete',
  path: '/product-data/overrides/{id}',
  summary: 'Soft-delete a tenant product-data override',
  security: cookieAuth,
  request: { params: overrideIdParam },
  responses: {
    204: { description: 'Override deleted' },
    ...errorResponse( 401, 'Not authenticated' ),
    ...errorResponse( 404, 'Override not found' ),
  },
} );
```

Also update the import line at the top of the file to pull in the new schemas:

```ts
import {
  getProductDataQuery,
  listOverridesQuery,
  createOverrideBody,
  updateOverrideBody,
} from '../routes/product-data';
```

- [ ] **Step 6: Update docs/api.md**

Append under the existing `## Product Data` section:

```markdown
### `GET /product-data/overrides`

**Auth:** any authenticated user, scoped to their organization.

**Query params**
| Field    | Type   | Rules |
|----------|--------|-------|
| `limit`  | number | 1–100, default 20 |
| `offset` | number | ≥0, default 0 |

**Response `200`**
```json
{ "overrides": [ { "id": "uuid", "organizationId": "uuid", "idType": "upc | ean | gtin | asin | fnsku", "identifier": "string", "name": "string | null", "description": "string | null", "brand": "string | null", "price": "number | null", "images": ["string"], "customFields": {}, "createdAt": "ISO date", "updatedAt": "ISO date", "deletedAt": "ISO date | null" } ], "total": 0, "limit": 20, "offset": 0 }
```

**Errors**
| Status | Condition |
|--------|-----------|
| `400`  | Invalid query params |
| `401`  | Not authenticated |

---

### `POST /product-data/overrides`

**Auth:** any authenticated user, scoped to their organization.

**Request body**
| Field          | Type   | Rules |
|----------------|--------|-------|
| `identifier`   | string | non-empty; type is auto-detected |
| `name`         | string | optional |
| `description`  | string | optional |
| `brand`        | string | optional |
| `price`        | number | optional, ≥0 |
| `images`       | string[] | optional |
| `customFields` | object | optional |

At least one of `name`/`description`/`brand`/`price`/`images`/`customFields` is required.

**Response `201`**
```json
{ "override": { "...": "same shape as GET /product-data/overrides items" } }
```

**Errors**
| Status | Condition |
|--------|-----------|
| `400`  | Invalid body, or no override fields provided |
| `401`  | Not authenticated |
| `409`  | An override for this identifier already exists |

---

### `PATCH /product-data/overrides/:id`

**Auth:** any authenticated user, scoped to their organization.

**Request body:** same optional fields as `POST`, minus `identifier`. At least one required.

**Response `200`**
```json
{ "override": { "...": "same shape as GET /product-data/overrides items" } }
```

**Errors**
| Status | Condition |
|--------|-----------|
| `400`  | Invalid body, or no fields provided |
| `401`  | Not authenticated |
| `404`  | Override not found in caller's org |

---

### `DELETE /product-data/overrides/:id`

**Auth:** any authenticated user, scoped to their organization.

**Response `204`** — no body.

**Errors**
| Status | Condition |
|--------|-----------|
| `401`  | Not authenticated |
| `404`  | Override not found in caller's org |
```

- [ ] **Step 7: Run the full suite, lint, and generate the OpenAPI doc**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/server/routes/product-data.ts src/server/routes/product-data.test.ts src/server/routes/index.ts src/server/openapi/index.ts docs/api.md
git commit -m "feat: add tenant product-data override CRUD routes"
```

---

## Final Verification

- [ ] Run `npm run db:dev` from a clean volume (or `docker compose down -v` first) to confirm `V13__tenant_product_data.sql` applies cleanly alongside all prior migrations.
- [ ] Run `npm test && npm run test:int && npm run lint` — all green.
- [ ] Manually exercise the API: log in, `GET /product-data?barcode=<a real UPC>`, `POST /product-data/overrides`, re-run the `GET` and confirm the override fields appear merged in, `PATCH` and `DELETE` the override.
- [ ] Re-read `docs/superpowers/specs/2026-08-03-product-data-design.md` end to end and confirm every in-scope section (identifier model, uniform schema, source cascade, tenant overrides, entity matching scope) is reflected in the code — manifest storage and everything under "Deferred" are intentionally not implemented here.
