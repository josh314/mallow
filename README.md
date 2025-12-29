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