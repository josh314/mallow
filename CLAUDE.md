# Mallow

## Project Intent
Multi-tenant rewrite of `Lot Commander Jr` (LCJ) to be productized as a SaaS for liquidation businesses. Note that `Lot Commander Jr` has been extracted from `Lot Commander`, an internal app used in production by a single business. The extracted code encapsulates the functionality that we intend to generalize and productize in `Mallow`. Along the way, we will improve bad design decisions and remove business-specific logic that doesn't make sense in a multi-tenant context. 

Source of truth for prior design: `../lot-commander-jr/`.

## Notes on developer team

- this project is projected to be done entirely by a solo developer.
- scope bets practices and ambitiousness to this constraint, 
- push back on my assumptions and ideas where appropriate, but also be pragmatic about what can be achieved in a reasonable timeframe by one person.

## Work In Progress
Track partially-built features here so state isn't lost between sessions. Remove/update entries as they're completed.

- **Auth**: session-based login/logout is implemented (`routes/auth.ts`, `middleware/require-auth.ts`, argon2 hashing, role/tenant checks in `organizations.ts`) and is in the OpenAPI spec. Missing: signup/registration route (users are currently only created via the admin `POST /organizations/:id/users` endpoint), password reset, login rate-limiting, CSRF protection.
- **IaC / ECS deploy**: not started — no Terraform/CDK/task-definition files in the repo yet. When we get to it: task definitions should be checked-in IaC (not console-edited) so they're the source of truth for which env vars exist and which are secret-backed, per the envvar/ECS `secrets` decision above. Also need to decide how the underlying secret values are stored/managed in SSM — likely one parameter per secret to match the `secrets` field, but consider whether a JSON blob (parsed by the IaC tooling into individual task-def `secrets` entries, not fetched by the app) is easier to manage/rotate than many discrete parameters.
- **Session secret rotation**: `getConfig()` (`src/server/config/index.ts`) reads a single `SESSION_SECRET` string and `server.ts` passes it straight to `express-session` — no rotation support. `express-session`'s `secret` option accepts an array (first signs new cookies, all are accepted for verification), same mechanism LCJ used via its comma-delimited SSM `session-secrets` parameter. Worth adopting when IaC/secret storage is designed above, so rotating the secret doesn't invalidate every active session.

## Mallow: Active Decisions
- multi-tenant architecture with tenant-specific datasets and users. Some shared resources (e.g. product data) may be global, but the core entities are partitioned by tenant.
- Schema so far (`db/migrations/`): organizations/users, warehouses → warehouse_sections → inventory_locations → inventory_items, and an inventory_ledger/inventory_current_state/inventory_snapshots layer for stock tracking. The lot/pallet/manifest container hierarchy described in the Prototype Architectural Reference below hasn't been built yet — this warehouse/location/ledger layer came first.
- Load configuration from envvars. Deploy target is ECS/Fargate; secrets are sourced via the task definition's `secrets` field (SSM Parameter Store `SecureString` or Secrets Manager, one parameter per secret), which injects them as plain env vars before the container starts. The app itself never calls the AWS SDK or SSM at runtime — no in-app config-fetch/blob pattern like LCJ's `server/load-config.js`. Locally, `.env` covers the same shape without touching AWS.
- no ORMs, use raw SQL
- Don't mirror the prototype's exact DB schema 
  - manifest items have an extensible field set
  - For the core container models -- lots,pallets,shipments -- use a less opinionated schema which is perhaps even modular/recursive, allowing users to create their own container hierarchy with the manifest items attached at arbitrary levels. Use the existing prototype schema as a reference implementation and inspiration.
- In LCJ, there's presumably some artifacts of functionality removed from the original Lot Commander so flag and bring to my attention anything that appears like legacy cruft before carrying into the new design
- Soft deletes are retained, implemented with a `deleted_at` timestamp column rather than an `isDeleted` boolean
- Functionality that we are focused on is ingesting, creating and downloading, and managing the lifecycle of the core entities.
- Data ownership is at row-level. Flag any queries that do not filter by tenant_id or equivalent.
- The `set_updated_at()` trigger (V1) only fires on `UPDATE`, not `INSERT` — to test staleness/TTL logic, insert a row directly with an explicit `updated_at` rather than insert-then-update (the trigger stomps the update back to `now()`).
- For JSONB columns via the `postgres` package, wrap values with `db.sql.json(value)`; plain TS interfaces usually need `as unknown as import('postgres').JSONValue` since they lack the index signature `JSONValue` requires.
- `ky`'s `baseUrl` option does standard WHATWG URL resolution, not path-joining — without a trailing slash, the last path segment is replaced (not extended) by the relative request path (e.g. `.../prod/v1` + `lookup` → `.../prod/lookup`, silently dropping `v1`). Always trailing-slash a `baseUrl` that has a path.

- Maintain an OpenAPI spec and ensure changes in the API are reflected in the spec. 

- Dependency injection: manual constructor injection through a single composition root (`server.ts`), no DI framework/container. Each module/factory takes its exact named dependencies as constructor/factory params — never a spread/bag of unrelated deps (e.g. don't pass a whole `models` object when a module only needs two of them). No injection through globals or module-level singletons; config and clients always flow in through the constructor. Exception: pure-logic/stateless modules (e.g. utility/constant modules with no external deps) may be `require`/`import`-ed directly rather than threaded through the composition root — there's nothing to inject.

### Stack
- DB: PostgreSQL replacing Mongo
- Frontend: React/TS replacing AngularJS (note that's *old* Angular)
- Language: TypeScript throughout
- Build system: We will replace webpack with something but that's TBD for now.
- Probably use Docker for local testing, including spinning up a local Postgres instance

### Aspirations

- integrations with ERBs, marketplaces, and shipping providers
- a platform on which users can share manifests and entities and perhaps even resell inventory to each other

## Commands

```sh
npm run db:dev        # start Postgres + Flyway migrations + Adminer via Docker Compose
npm run db:seed:dev   # seed the dev database
npm start              # dev server (tsx --watch, hot-reloads on source changes; re-run db:dev after adding a migration)
npm test                # unit tests
npm run test:watch
npm run test:cov
npm run test:int        # integration tests; spins up its own db_test/flyway_test containers on port 5433
npm run lint
```

## Architecture

- `src/server/` — Express app. `routes/` (HTTP handlers), `schemas/` (Zod, also source for the generated OpenAPI spec), `organizations/` & `users/` (queries + types, one dir per resource), `middleware/`, `db/` (raw-SQL client, no ORM), `openapi/` (spec generation).
- `db/migrations/` — Flyway SQL migrations, `V<n>__name.sql`, applied in order on `db:dev`.
- `docs/api.md` — hand-maintained API contract; keep in sync with route/schema changes.
- `src/server/tsconfig.json` is the config VSCode/tsc use by default (nearest `tsconfig.json` wins); `tsconfig.jest.json` only applies to ts-jest and ESLint's type-aware linting of test files. Compiler options needed for editor correctness (e.g. `types`) must live in the base config, not just the jest one.

## TypeScript version

- `typescript` is capped below latest — `ts-jest`/`typescript-eslint` peer deps gate the ceiling (check `npm view <pkg> peerDependencies` before bumping). TS 7.0's Go-native compiler has no stable programmatic API yet, so those tools can't load it; stay on the 6.x line until they add support.
- Since TS 6.0, `types` defaults to `[]` instead of auto-discovering everything in `node_modules/@types` — keep it explicit (e.g. `["node", "jest"]`) or globals like `describe`/`jest`/`process` silently stop resolving.

## Testing

- ESM-only npm packages (e.g. `ky`) can't be `require`d by ts-jest and will break any test that transitively imports them, even indirectly. Add a manual mock at root-level `__mocks__/<pkg>.ts` — Jest auto-applies it to node_modules packages with no per-file `jest.mock('<pkg>')` call needed.
- `@typescript-eslint/no-unbound-method` flags a bare reference to a mocked class method (e.g. `SomeClass.prototype.method as jest.Mock`). Destructure instead: `const { method: methodMock } = SomeClass.prototype as unknown as { method: jest.Mock };`

## Context

Ignore all files in `.tmp/` except ones explicitly referenced in this document — they're personal scratch notes, not part of the codebase.

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

