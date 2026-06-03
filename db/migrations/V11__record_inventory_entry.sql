-- V11: record_inventory_entry
-- The sole write path for inventory changes. Call this instead of writing to
-- inventory_ledger or inventory_current_state directly.
--
-- Creates the inventory_item for the given product+location if it doesn't exist,
-- appends a ledger entry, and updates current state atomically.
--
-- Returns the id of the new ledger entry.

CREATE FUNCTION record_inventory_entry(
  p_product_id   UUID,
  p_location_id  UUID,
  p_quantity     INTEGER,
  p_user_id      UUID,
  p_notes        TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  v_item_id   UUID;
  v_entry_id  UUID;
BEGIN
  -- Find or create the inventory_item for this product+location pair.
  INSERT INTO inventory_items (product_id, location_id)
  VALUES (p_product_id, p_location_id)
  ON CONFLICT (product_id, location_id) DO NOTHING;

  SELECT id INTO v_item_id
  FROM inventory_items
  WHERE product_id  = p_product_id
    AND location_id = p_location_id
    AND deleted_at IS NULL;

  -- Append the ledger entry.
  INSERT INTO inventory_ledger (inventory_item_id, quantity, user_id, notes)
  VALUES (v_item_id, p_quantity, p_user_id, p_notes)
  RETURNING id INTO v_entry_id;

  -- Upsert current state, accumulating the delta.
  INSERT INTO inventory_current_state (inventory_item_id, quantity)
  VALUES (v_item_id, p_quantity)
  ON CONFLICT (inventory_item_id) DO UPDATE
    SET quantity   = inventory_current_state.quantity + EXCLUDED.quantity,
        updated_at = now();

  RETURN v_entry_id;
END;
$$;
