-- V7: inventory_items
-- Represents a specific product stored in a specific location.
-- Rows are created on-demand by record_inventory_entry() if they don't exist.

CREATE TABLE inventory_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID        NOT NULL REFERENCES products (id),
  location_id  UUID        NOT NULL REFERENCES inventory_locations (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,

  CONSTRAINT inventory_items_product_location_key UNIQUE (product_id, location_id)
);

CREATE INDEX inventory_items_product_id_idx  ON inventory_items (product_id);
CREATE INDEX inventory_items_location_id_idx ON inventory_items (location_id);

CREATE TRIGGER inventory_items_set_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
