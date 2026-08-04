# Mallow

## Project Intent
Multi-tenant rewrite of `Lot Commander Jr` (LCJ) to be productized as a SaaS for liquidation businesses. Note that `Lot Commander Jr` has been extracted from `Lot Commander`, an internal app used in production by a single business. The extracted code encapsulates the functionality that we intend to generalize and productize in `Mallow`. Along the way, we will improve bad design decisions and remove business-specific logic that doesn't make sense in a multi-tenant context. 

Source of truth for prior design: `../lot-commander-jr/`.

## Notes on developer team

- this project is projected to be done entirely by a solo developer.
- scope best practices and ambitiousness to this constraint, 
- push back on my assumptions and ideas where appropriate, but also be pragmatic about what can be achieved in a reasonable timeframe by one person.

## Work In Progress
Track partially-built features here so state isn't lost between sessions. Remove/update entries as they're completed.

- **Product identity split**: `inventory_items.product_id` FKs to `products` (V6), which is still a stub — no columns beyond id/timestamps. The actual enriched product data (vendor lookups + tenant overrides) lives in a separate, FK-disconnected system: `src/server/product-data/` keys products by `(idType, identifier)` (upc/ean/gtin/asin/fnsku), cascading through `ProductDataSource`s (e.g. `upc_item_db_cache`) and merging in `tenant_product_data` overrides — join-by-value, no FK to `products` at all. These two models don't connect yet; resolve when `products` gets fleshed out.
- **Auth**: session-based login/logout is implemented (`routes/auth.ts`, `middleware/require-auth.ts`, argon2 hashing, role/tenant checks in `organizations.ts`) and is in the OpenAPI spec. Missing: signup/registration route (users are currently only created via the admin `POST /organizations/:id/users` endpoint), password reset, login rate-limiting, CSRF protection.
- **IaC / ECS deploy**: not started — no Terraform/CDK/task-definition files in the repo yet. When we get to it: task definitions should be checked-in IaC (not console-edited) so they're the source of truth for which env vars exist and which are secret-backed, per the envvar/ECS `secrets` decision above. Also need to decide how the underlying secret values are stored/managed in SSM — likely one parameter per secret to match the `secrets` field, but consider whether a JSON blob (parsed by the IaC tooling into individual task-def `secrets` entries, not fetched by the app) is easier to manage/rotate than many discrete parameters.
- **Session secret rotation**: `getConfig()` (`src/server/config/index.ts`) reads a single `SESSION_SECRET` string and `server.ts` passes it straight to `express-session` — no rotation support. `express-session`'s `secret` option accepts an array (first signs new cookies, all are accepted for verification), same mechanism LCJ used via its comma-delimited SSM `session-secrets` parameter. Worth adopting when IaC/secret storage is designed above, so rotating the secret doesn't invalidate every active session.

## Mallow: Active Decisions
- multi-tenant architecture with tenant-specific datasets and users. Some shared resources (e.g. product data) may be global, but the core entities are partitioned by tenant.
- Schema so far (`db/migrations/`): organizations/users, warehouses → warehouse_sections → inventory_locations → inventory_items, an inventory_ledger/inventory_current_state/inventory_snapshots layer for stock tracking, and a separate identifier-keyed product-data system (`upc_item_db_cache`, `tenant_product_data`) — see Work In Progress below for how it relates to `products`. The lot/pallet/manifest container hierarchy described in the Prototype Architectural Reference below hasn't been built yet — this warehouse/location/ledger layer came first.
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
- `postgres` returns `NUMERIC` columns as strings, not numbers — cast in the column list (`price::float8 AS price`) to get a JS number back.
- For raw-SQL partial updates (PATCH), build each `SET` column as `col = ${ patch.col !== undefined ? patch.col : db.sql\`col\` }` — falls back to the column's current value when a field wasn't supplied, avoiding COALESCE or a dynamic-object builder.
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

`.env` is gitignored, so a fresh git worktree won't have it — copy it from the main checkout before running `db:dev`/`test:int` there.

## Architecture

- `src/server/` — Express app. `routes/` (HTTP handlers), `schemas/` (Zod, also source for the generated OpenAPI spec), `organizations/` & `users/` (queries + types, one dir per resource), `middleware/`, `db/` (raw-SQL client, no ORM), `openapi/` (spec generation).
- `db/migrations/` — Flyway SQL migrations, `V<n>__name.sql`, applied in order on `db:dev`.
- `docs/api.md` — hand-maintained API contract; keep in sync with route/schema changes.
- `src/server/tsconfig.json` is the config VSCode/tsc use by default (nearest `tsconfig.json` wins); `tsconfig.jest.json` only applies to ts-jest and ESLint's type-aware linting of test files. Compiler options needed for editor correctness (e.g. `types`) must live in the base config, not just the jest one.

## TypeScript version

- `typescript` is capped below latest — `ts-jest`/`typescript-eslint` peer deps gate the ceiling (check `npm view <pkg> peerDependencies` before bumping). TS 7.0's Go-native compiler has no stable programmatic API yet, so those tools can't load it; stay on the 6.x line until they add support.
- Since TS 6.0, `types` defaults to `[]` instead of auto-discovering everything in `node_modules/@types` — keep it explicit (e.g. `["node", "jest"]`) or globals like `describe`/`jest`/`process` silently stop resolving.
- Zod v4's `z.record()` requires two args — `z.record(keySchema, valueSchema)` — v3's single-arg `z.record(valueSchema)` no longer works.

## Testing

- ESM-only npm packages (e.g. `ky`) can't be `require`d by ts-jest and will break any test that transitively imports them, even indirectly. Add a manual mock at root-level `__mocks__/<pkg>.ts` — Jest auto-applies it to node_modules packages with no per-file `jest.mock('<pkg>')` call needed.
- `@typescript-eslint/no-unbound-method` flags a bare reference to a mocked class method (e.g. `SomeClass.prototype.method as jest.Mock`). Destructure instead: `const { method: methodMock } = SomeClass.prototype as unknown as { method: jest.Mock };`

## Subagent-Driven Development

- When using subagent-driven-development with a worktree, spot-check after each task that the base branch (e.g. `dev`) hasn't gained unexpected commits (`git log <base> -3`) — an implementer subagent doesn't reliably honor a "work from `<worktree path>`" instruction.

## Context

Ignore all files in `.tmp/` except ones explicitly referenced in this document — they're personal scratch notes, not part of the codebase.

## Prototype Architectural Reference

All LCJ-derived reference material — the first-hand physical-workflow narrative (receiving → processing → listing → fulfillment), the entity/lifecycle/API-pattern index, and known corrections to earlier summaries (e.g. Package/Bundle) — now lives in `docs/lot-commander-legacy-workflows.md`. It describes LCJ as it was; it is not authoritative for what Mallow should do — where Mallow diverges, the "Active Decisions" section above takes precedence.

Past summaries of LCJ prototype behavior in this doc (and in `docs/lot-commander-legacy-workflows.md`) have contained factual errors not supported by the actual code — verify against `../lot-commander-jr/server/models/` before repeating or extending a prototype claim, don't just trust the existing summary.

