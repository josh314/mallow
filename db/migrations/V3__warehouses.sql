-- V3: warehouses

CREATE TABLE warehouses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations (id),
  name             TEXT        NOT NULL,
  address_line1    TEXT        NOT NULL,
  address_line2    TEXT,
  city             TEXT        NOT NULL,
  state            TEXT        NOT NULL,
  postal_code      TEXT        NOT NULL,
  country          TEXT        NOT NULL DEFAULT 'US',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX warehouses_organization_id_idx ON warehouses (organization_id);

CREATE TRIGGER warehouses_set_updated_at
  BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
