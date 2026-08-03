-- V12: upc_item_db_cache
-- Cache-aside store for UPCItemDB lookups, keyed by the barcode queried.
-- This is third-party vendor data, not an owned domain entity, so it isn't
-- tenant-scoped and doesn't need soft deletes -- rows are just overwritten
-- on refresh.

CREATE TABLE upc_item_db_cache (
  upc         TEXT        PRIMARY KEY,
  item        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER upc_item_db_cache_set_updated_at
  BEFORE UPDATE ON upc_item_db_cache
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
