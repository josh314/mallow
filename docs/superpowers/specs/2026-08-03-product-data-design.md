# Product Data: Uniform Schema, Tenant Overrides, and Manifest Storage

Date: 2026-08-03
Status: Approved (design phase) — implementation not yet started

## Context

The product-data module currently has one concrete source (`UpcItemDbClient`, PG-backed cache-aside) directly wired into `ProductDataService`. This design generalizes that into an architecture that can:

1. Accommodate multiple product-data sources beyond UPCItemDB (traject, fnsku-to-asin, and eventually AI-search backfill), sharing one uniform schema.
2. Let tenants add or override product data, without mingling across tenants, with tenant data taking precedence and merging (not replacing) our data.
3. Decide how manifests (not yet built) will consume product data — reference vs. denormalized copy.
4. Address entity matching between data sets/sources.

Liquidation inventory identifiers aren't uniform: UPC/EAN/GTIN (numeric barcodes), ASIN (Amazon, `B0...`), and FNSKU (Amazon, `X...`) are all in play, and different sources only understand certain types (e.g. `fnsku-to-asin` resolves FNSKU → ASIN; `traject` looks up ASIN/GTIN). The design treats "identifier" as a first-class `(idType, value)` pair rather than assuming a single barcode namespace.

## Identifier model

```ts
type ProductIdType = 'upc' | 'ean' | 'gtin' | 'asin' | 'fnsku';

interface ProductIdentifier {
  idType: ProductIdType;
  value: string; // normalized (UPC-A/EAN-13 padding resolved)
}
```

- `detectIdType(raw: string): ProductIdType` — auto-detects type from string shape (numeric → upc/ean/gtin, `X`-prefix → fnsku, otherwise → asin), matching LCJ's existing heuristic. Callers (routes, tenants) always pass a raw identifier string; detection happens once, centrally.
- `normalizeIdentifier(raw: string, idType: ProductIdType): string` — resolves UPC-A/EAN-13 formatting differences so the same physical barcode entered in different formats still matches.
- All source cache tables and the tenant override table key on `(id_type, identifier)` using the normalized value — never a bare, unqualified "barcode" column.

## Uniform `ProductData` schema

```ts
interface ProductData {
  identifier: ProductIdentifier;
  name: string;
  description?: string;
  brand?: string;
  price?: number;
  images?: string[];
  customFields?: Record<string, unknown>; // populated only via tenant overrides
}
```

This supersedes the current `{ barcode, name, description }` shape in `src/server/product-data/types.ts`.

## Source cascade architecture

```ts
interface ProductDataSource {
  lookup(identifier: ProductIdentifier): Promise<ProductData | null>;
}
```

`ProductDataService` holds an ordered array of `ProductDataSource` implementations (constructor-injected, per the project's manual-DI convention) and tries each in order, returning the first non-null hit. Currently the array has one entry: `UpcItemDbClient`, adapted to this interface.

- Each source owns its own PG cache table, keyed by `(id_type, identifier)` — no FK between source tables or to `products`. Sources are joined by identifier value, matching the existing `upc_item_db_cache` pattern.
- Cross-type resolution (e.g. FNSKU → ASIN before an ASIN-only source can be queried) is internal to the source client that needs it — `ProductDataService` never orchestrates identifier-type conversions itself. It always just calls `lookup(identifier)` and gets back `ProductData | null`.
- Adding `traject` or `fnsku-to-asin` later is a new client + cache table + one line in `server.ts`'s composition root — no changes to `ProductDataService`.
- The eventual AI-search backfill source (see below) fits the same interface but is cache-only on the read path — see "Deferred: AI-search backfill."

## Tenant overrides

New table:

```sql
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
```

All standard fields are nullable — a tenant may override a single field (e.g. just `price`) or provide a full record. Matching is exact on `(organization_id, id_type, identifier)`; no pattern/regex-based fallback matching (LCJ's `FallbackProductData` was an Amazon-barcode-specific hack, not a precedent to carry forward here). Row-level tenant scoping: every query filters by `organization_id`.

**Merge logic**, in `ProductDataService.getProductData(organizationId, rawIdentifier)`:

1. Detect + normalize the identifier.
2. Look up the tenant override row and run the global source cascade (both are cheap/local or already-cached in the common case — no need to skip one based on the other).
3. Merge: start from the global cascade result (or `{}` if none), overlay every **non-null** tenant field on top, and attach `custom_fields` as `customFields` regardless of whether a global result exists.
4. If neither tenant data nor the global cascade produced a `name`, return `null`.

## Manifest storage: denormalized snapshot

Manifests (not yet built) will store a **denormalized snapshot** of the merged `ProductData` on each manifest item at creation time, plus the `ProductIdentifier` for traceability — not a foreign key to any product-data table.

Rationale:

- **Manifests are effectively contracts** — records of what was represented about a lot/shipment at the time it was prepared, listed, or shipped, often downloaded and sent to third parties. A live FK would mean a manifest's contents could silently change after the fact if a tenant edits an override or a source cache refreshes.
- There is no single row an FK could point to anyway — the value shown to a user is always a *computed merge* of cascade + override + custom fields, not a persisted row.
- Manifest items already need an "extensible field set" (existing CLAUDE.md decision) for arbitrary per-line data. A snapshot satisfies this for free, since `ProductData` is already a plain serializable object.
- Cost: no automatic propagation. Fixing a typo in canonical product data doesn't retroactively fix already-created manifest items. If needed later, that's an explicit "refresh this line" action — not implicit. Cross-manifest analytics by product identity still work, since the identifier is stored alongside the snapshot.

This decision doesn't require any manifest schema work now; it just means `ProductData` must stay a clean, self-contained, serializable object, since that's what gets copied wholesale into a manifest item later.

## Entity matching (resolved scope)

Matching across sources, tenant overrides, and (eventually) manifests is **exact match on `(id_type, normalized identifier)`**. There is no fuzzy or cross-type entity resolution (e.g. recognizing that a given UPC and a given ASIN represent the same physical product, absent an explicit bridging source like `fnsku-to-asin`). That's a materially harder, deferred problem — out of scope for v1.

## API surface

Following the existing REST conventions in this codebase (`organizations`, `users`):

- `GET /product-data?barcode=` — existing endpoint, unchanged externally. Internally now calls the merged cascade + tenant-override lookup using the caller's `organization_id` (from the authenticated session) rather than the raw UPCItemDB-only path.
- `GET /product-data/overrides` — list the caller's tenant's overrides.
- `POST /product-data/overrides` — create an override.
- `PATCH /product-data/overrides/:id` — partial update.
- `DELETE /product-data/overrides/:id` — soft delete (`deleted_at`).

All behind `requireAuth`, all scoped to `req.user.organizationId` — no cross-tenant access. Response envelope and OpenAPI registration follow the existing pattern (`docs/api.md`, `src/server/openapi/index.ts`).

## Error handling & testing

Follows patterns already established for `UpcItemDbClient`:

- Source-specific HTTP error handling (e.g. UPCItemDB's 400-for-invalid-UPC → `null`) stays local to each source client.
- Unit tests per new module: `detectIdType`/`normalizeIdentifier`, cascade iteration/short-circuit logic in `ProductDataService`, tenant-override merge precedence, tenant-override CRUD routes.
- Integration tests (real Postgres, `*.int.test.ts`) for `tenant_product_data` queries, mirroring `upc-item-db-cache-queries.int.test.ts`.
- ESM manual-mock pattern (`__mocks__/ky.ts`) and the `no-unbound-method` destructuring workaround already documented in `CLAUDE.md` apply to any new HTTP-based source clients.

## Deferred / explicitly out of scope for this round

- **traject and fnsku-to-asin clients.** The cascade architecture is designed to accommodate them, but they are not implemented now — follow-up work once API credentials exist, using `UpcItemDbClient` as the template.
- **AI-search backfill.** On a total cascade miss (no source, no tenant override), the intent is to log a JSON blob to S3, triggering a Lambda (or a scheduled scan of the bucket) that performs an AI search and writes the result into a dedicated cache table — fitting the same cache-only `ProductDataSource` interface as other sources, populated out-of-band rather than synchronously. This mirrors LCJ's own `queueProductDataFetching` S3-job-file precedent. Populating the AI-search cache table is safe and independent of manifests. **Not addressed by this design:** whether/how a completed backfill should retroactively patch an already-created manifest item. That's in tension with the "manifest as contract" principle above, and likely depends on lot/manifest lifecycle states (e.g. a mutable "in preparation" stage vs. a frozen "listed/sold" stage) that don't exist yet. Sketch for later: only patch manifest items that are still in a mutable lifecycle state, and only fill fields that are still blank (never overwrite a populated value) — turning the race condition into "worst case, a fill-in is skipped this cycle" rather than a correctness risk. Exact mechanism deliberately shelved until manifests exist.
- **Cross-type/fuzzy entity resolution** (see "Entity matching" above).
- **The `products` table** (currently a bare stub, FK'd from `inventory_items`) is not touched by this design — it's an orthogonal inventory-tracking concern, not part of the product-data subsystem.
