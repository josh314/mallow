-- V10: inventory_snapshots
-- Point-in-time quantity snapshots per inventory_item.
-- Used to bound historical reconstruction after old ledger partitions are archived.
-- Snapshots should be taken at partition boundaries (monthly) before archival.

CREATE TABLE inventory_snapshots (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id  UUID        NOT NULL REFERENCES inventory_items (id),
  quantity           INTEGER     NOT NULL,
  snapshot_at        TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX inventory_snapshots_item_snapshot_at_idx
  ON inventory_snapshots (inventory_item_id, snapshot_at DESC);
