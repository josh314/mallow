# Mallow

## Project Intent
Multi-tenant rewrite of `Lot Commander Jr` (LCJ) to be productized as a SaaS for liquidation businesses. Note that `Lot Commander Jr` has been extracted from `Lot Commander`, an internal app used in production by a single business. The extracted code encapsulates the functionality that we intend to generalize and productize in `Mallow`. Along the way, we will improve bad design decisions and remove business-specific logic that doesn't make sense in a multi-tenant context. 

Source of truth for prior design: `../lot-commander-jr/`.

## Notes on developer team

- this project is projected to be done entirely by a solo developer.
- scope bets practices and ambitiousness to this constraint, 
- push back on my assumptions and ideas where appropriate, but also be pragmatic about what can be achieved in a reasonable timeframe by one person.

## Mallow: Active Decisions
- multi-tenant architecture with tenant-specific datasets and users. Some shared resources (e.g. product data) may be global, but the core entities are partitioned by tenant. Schema specifics are TBD
- Load configuration from envvars
- no ORMs, use raw SQL
- Don't mirror the prototype's exact DB schema 
  - manifest items have an extensible field set
  - For the core container models -- lots,pallets,shipments -- use a less opinionated schema which is perhaps even modular/recursive, allowing users to create their own container hierarchy with the manifest items attached at arbitrary levels. Use the existing prototype schema as a reference implementation and inspiration.
- In LCJ, there's presumably some artifacts of functionality removed from the original Lot Commander so flag and bring to my attention anything that appears like legacy cruft before carrying into the new design
- Soft deletes are retained, implemented with a `deleted_at` timestamp column rather than an `isDeleted` boolean
- Functionality that we are focused on is ingesting, creating and downloading, and managing the lifecycle of the core entities.
- Data ownership is at row-level. Flag any queries that do not filter by tenant_id or equivalent.

- Maintain an OpenAPI spec and ensure changes in the API are reflected in the spec. 

### Stack
- DB: PostgreSQL replacing Mongo
- Frontend: React/TS replacing AngularJS (note that's *old* Angular)
- Language: TypeScript throughout
- Build system: We will replace webpack with something but that's TBD for now.
- Probably use Docker for local testing, including spinning up a local Postgres instance

### Aspirations

- integrations with ERBs, marketplaces, and shipping providers
- a platform on which users can share manifests and entities and perhaps even resell inventory to each other

## Prototype Architectural Reference

This section describes LCJ as it was. It informs design but is not authoritative. Where Mallow diverges, the "Active Decisions" section takes precedence.

### Core Entities & Relationships

- **Lot** → central unit of sale; referenced one `InventoryPallet` OR one `Manifest` (mutually exclusive), plus zero-to-many third-party manifests
- **Manifest** → structured product-quantity list; stored separately from lots; could be reused across lots
- **InventoryPallet** → physical pallet; belonged to one `IncomingShipment`; could be split into child pallets (tracked via `splitFrom` parent reference)
- **IncomingShipment** → tracked expected vs. received pallets; also owned `packages` (high-value individual items)
- **Package** → individual item from a shipment; could contain `Bundle` records
- **Bundle** → curated grouping of items (e.g., cosmetics sub-types); packed into a package

### Lifecycle State Machines

**Lot:** `In Preparation → Ready → Reviewed → Listed → Sold → Shipped` (also `Error → Decommissioned`)
- `Shipped` could revert to `Sold` (unship action)

**Pallet:** additive boolean flags — `isReceived`, `isRepacked`, `isBrokendown` — not a strict FSM

**Package:** `created → isInstantiated → isFulfilled` (reversible)

**Bundle:** `created → isPacked` (reversible)

### Business Logic Invariants

- **Lot number** was assigned via an atomic counter (find-and-modify); lot numbers were never reused or reset
- **`packagingType`** was a computed field derived from `shippingItems` dimensions in a pre-save hook; it was never stored as user input
- **`priceValuePercentage`** defaulted to 20% at lot, pallet, and shipment level independently; negative values were coerced to the default
- **`isDeleted`** was set by a pre-save hook to `false` if absent; all queries filtered deleted records
- **Shipment-level cascade:** setting `category`, `condition`, or `priceValuePercentage` on a shipment propagated to all `palletsExpected` entries at write time (not read time)
- **Shipment `hasProblem`** was derived by diffing `palletsExpected[].handle` against received pallet handles — it was not a stored flag. Individual pallet `hasProblem` flags were separate and covered damage/anomalies
- **Pallet split was two-phase:** first creating `splitGroups` sub-documents (reversible), then committing to instantiate each as a child `InventoryPallet` (irreversible)
- **Unmanifested lots:** `unmanifested: true` with manually entered `totalUnits` was a valid first-class lot type, not an error state

### API Design Patterns

Standard CRUD per resource:
```
GET    /resource            → list + filtering
GET    /resource/count      → count for pagination
GET    /resource/:id        → by DB id
GET    /resource/by-handle/:handle → by slug
POST   /resource            → create
PATCH  /resource/:id        → partial update
DELETE /resource/:id        → soft delete
```

**State transitions used action sub-routes** rather than PATCH on status field:
```
POST /lots/:id/mark-as-sold       POST /lots/:id/unship
POST /pallets/:id/breakdown       POST /pallets/:id/repack
POST /pallets/:id/split           POST /packages/:id/instantiate
POST /receiving/:id/receive       POST /receiving/:id/close
```

**Response envelope:** `{ [resourceName]: Object|Array }` on success; `{ error: true, code, message? }` on failure. `message` was only present on client/auth errors.

**Auth:** session-based; a cookie carried `{ _id, firstName, lastName, roles, permissions }`. Permission checks happened in routing middleware before business logic. Site announcements were delivered as a cookie at login (snapshot — not live-updated).

**Media** was a two-phase upload: POST returned a record with `isProcessing: true`; after async processing the record gained an `s3` location. Lot media was managed via lot sub-routes (`/lots/:id/media/:type`).

**Manifest files** lived in object storage (not the DB). The API was a thin proxy with path passthrough (`GET/PUT /manifests/*`). The `Manifest` DB record (structured product-quantity pairs) was distinct from the raw file.

**Product data lookup** (`GET /product-data?barcode=`) executed a cascading chain: primary external API → secondary API → internal cache → manual override records. The chain was an implementation detail; callers always received the same response shape regardless of which source resolved it.

### Non-Obvious Decisions

- **Lot number vs. handle:** lot numbers were sequential integers (human/verbal use); handles were slugs (URL use). The two were kept distinct
- **Manifests were first-class:** stored in their own collection, not embedded in lots, enabling reuse and an independent lifecycle
- **Third-party manifests were additive:** `thirdPartyManifests[]` supplemented rather than replaced the primary `manifestId`
- **Audit events were fire-and-forget:** event write failures did not block the primary operation
- **Counters were atomic:** find-and-modify semantics were used; a read-then-write approach would cause duplicate lot numbers under concurrency
- Configuration (including loading of secrets) was done via a non-versioned document `server/config.js` 

