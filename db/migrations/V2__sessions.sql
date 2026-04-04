-- V2: session store for connect-pg-simple
-- https://github.com/voxpelli/node-connect-pg-simple/blob/main/table.sql

CREATE TABLE "session" (
  "sid"    VARCHAR   NOT NULL COLLATE "default",
  "sess"   JSON      NOT NULL,
  "expire" TIMESTAMP( 6 ) NOT NULL,

  CONSTRAINT "session_pkey" PRIMARY KEY ( "sid" ) NOT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX "IDX_session_expire" ON "session" ( "expire" );
