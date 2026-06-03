-- V9: inventory_current_state
-- Maintained by record_inventory_entry(). Do not write directly.
-- One row per inventory_item; quantity reflects the running total of all ledger entries.

CREATE TABLE inventory_current_state (
  inventory_item_id  UUID        PRIMARY KEY REFERENCES inventory_items (id),
  quantity           INTEGER     NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
