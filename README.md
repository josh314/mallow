# Mallow

Mallow is the next generation inventory management system for liquidation.

# Development environment

A Docker compose file is included to run:
- a local postgres instance for development
- an administration UI
- a database migration tool

The compose file expects environment variables to be set so it can configure the database (see [Environment variables](#environment-variables) below) — set them in a local `.env` file for convenience.

Sign into the admin UI at `http://localhost:18080` (or whatever port you've set via `ADMINER_PORT`) with username and password set by the above environment variables. When logging in, set the system to `PostgreSQL` and connect to `db` as the server (the name of the postgres service in the compose file).

Migrations are handled by `Flyway`. The migration files are located in `db/migrations`. The compose file mounts them in the container's `/flyway/sql` directory and runs them on startup.

## Environment variables

Copy `.env.sample` to `.env` and fill it in. All variables are required unless noted.

| Variable | Description |
| --- | --- |
| `PORT` | Port the app server listens on (default `8080`). |
| `NODE_ENV` | `development`, `test`, or `production`. |
| `DEBUG` | `debug`-package namespace filter for server logs (e.g. `mallow`). |
| `SESSION_SECRET` | Secret used to sign session cookies. |
| `POSTGRES_HOST` | Postgres host the app connects to (`localhost` for local dev). |
| `POSTGRES_PORT` | Postgres port (default `5432`). |
| `POSTGRES_DB` | Database name; also used by `compose.yaml` to initialize the container. |
| `POSTGRES_USER` | Database user; also used by `compose.yaml`. |
| `POSTGRES_PASSWORD` | Database password; also used by `compose.yaml`. |
| `UPCITEMDB_USER_KEY` | API key for the [UPCItemDB](https://www.upcitemdb.com/) product-data lookup integration. |
| `ADMINER_PORT` | Host port for the Adminer UI (default `18080`). Optional. |

`npm run test:int` also reads `.env` (for the `POSTGRES_*` values) but runs against its own database on port 5433, via `POSTGRES_TEST_DB`/`POSTGRES_TEST_USER`/`POSTGRES_TEST_PASSWORD` overrides (falling back to `POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD` with a `_test` suffix on the DB name) — see `compose.yaml`.

## Development

### Launch the dev database

```sh
npm run db:dev
```

This starts the Postgres instance, runs Flyway migrations, and brings up the Adminer UI — all via Docker Compose. The database is ready when the `flyway` service exits cleanly.

To seed the dev database with sample data:

```sh
npm run db:seed:dev
```

### Launch the dev server

```sh
npm start
```

The server starts with `tsx --watch`, so it **hot-reloads on TypeScript source changes** automatically. There is no hot-reload for schema/migration changes — add a new migration file and re-run `npm run db:dev` (Flyway will pick up and apply any new migrations).

### Run tests

Unit tests (no database required):

```sh
npm test              # run once
npm run test:watch    # watch mode
npm run test:cov      # with coverage
```

Integration tests (spin up a test database automatically):

```sh
npm run test:int
```

The integration test suite manages its own Docker services (`db_test` + `flyway_test` on port 5433) via Jest global setup/teardown — no manual setup needed.

### Lint

```sh
npm run lint
```

### API documentation

`docs/api.md` is the hand-maintained API contract (routes, request/response shapes, auth, envelope conventions). For a machine-readable version, see [Export the OpenAPI spec](#export-the-openapi-spec) below.

### Export the OpenAPI spec

The spec is generated at runtime from the Zod route schemas (`src/server/openapi/`) — there's no static file checked into the repo. With the dev server running (`npm start`), fetch it with:

```sh
curl http://localhost:8080/openapi.json > openapi.json
```

Adjust the port if you've overridden `PORT` in your `.env`.