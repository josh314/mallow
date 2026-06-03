-- V4: warehouse_sections

CREATE TABLE warehouse_sections (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id  UUID        NOT NULL REFERENCES warehouses (id),
  name          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX warehouse_sections_warehouse_id_idx ON warehouse_sections (warehouse_id);

CREATE TRIGGER warehouse_sections_set_updated_at
  BEFORE UPDATE ON warehouse_sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
