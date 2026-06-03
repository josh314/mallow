-- V8: inventory_ledger
-- Append-only ledger of every inventory quantity change.
-- Partitioned by month for archival manageability.
-- Entries are immutable; reversals are recorded as compensating entries (negative quantity).
-- Partition key (created_at) is included in the primary key, as required by Postgres
-- for partitioned tables. Do not write to this table directly; use record_inventory_entry().

CREATE TABLE inventory_ledger (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid(),
  inventory_item_id  UUID        NOT NULL REFERENCES inventory_items (id),
  quantity           INTEGER     NOT NULL,
  user_id            UUID        NOT NULL REFERENCES users (id),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Monthly partitions for the remainder of 2026.
-- Add new partitions before each month begins (or automate via pg_partman).
CREATE TABLE inventory_ledger_2026_06 PARTITION OF inventory_ledger
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE inventory_ledger_2026_07 PARTITION OF inventory_ledger
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE inventory_ledger_2026_08 PARTITION OF inventory_ledger
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE inventory_ledger_2026_09 PARTITION OF inventory_ledger
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE inventory_ledger_2026_10 PARTITION OF inventory_ledger
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE inventory_ledger_2026_11 PARTITION OF inventory_ledger
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE inventory_ledger_2026_12 PARTITION OF inventory_ledger
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Default partition catches entries outside defined ranges.
-- Useful during development and as a safety net; should be empty in production.
CREATE TABLE inventory_ledger_default PARTITION OF inventory_ledger DEFAULT;

CREATE INDEX inventory_ledger_inventory_item_id_idx ON inventory_ledger (inventory_item_id, created_at);
