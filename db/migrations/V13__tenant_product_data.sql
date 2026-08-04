-- db/migrations/V13__tenant_product_data.sql
-- Tenant-owned product data overrides/additions. Merged over the global
-- source cascade at read time (see ProductDataService.getProductData) --
-- never referenced by FK from anywhere, matching the no-FK/join-by-value
-- pattern used across the product-data sources.

CREATE TABLE tenant_product_data (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations (id),
  id_type          TEXT        NOT NULL,
  identifier       TEXT        NOT NULL,
  name             TEXT,
  description      TEXT,
  brand            TEXT,
  price            NUMERIC,
  images           JSONB,
  custom_fields    JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,

  CONSTRAINT tenant_product_data_org_identifier_key
    UNIQUE (organization_id, id_type, identifier)
);

CREATE INDEX tenant_product_data_organization_id_idx ON tenant_product_data (organization_id);

CREATE TRIGGER tenant_product_data_set_updated_at
  BEFORE UPDATE ON tenant_product_data
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
