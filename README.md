# Mallow

Mallow is the next generation inventory management system for liquidation.

# Development environment

A Docker compose file is included to run:
- a local postgres instance for development
- an administration UI
- a database migration tool

The compose file expects environment variables to be set so it can configure the database:
- `POSTGRES_DB`: The name of the database to create.
- `POSTGRES_USER`: The database user.
- `POSTGRES_PASSWORD`: The password for the database user.
You can set them in a local `.env` file for convenience.

Sign into the admin UI at `http://localhost:8080` with username and password set by the above environment variables. You can also change the port by setting the `ADMINER_PORT` environment variable. When logging in, set the system to `PostgreSQL` and connect to `db` as the server (the name of the postgres service in the compose file).

Migrations are handled by `Flyway`. The migration files are located in `db/migrations`. The compose file mounts them in the container's `/flyway/sql` directory and runs them on startup.

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