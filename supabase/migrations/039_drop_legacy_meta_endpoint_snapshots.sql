-- Remove legacy shared snapshot table.
-- Copies remaining rows into per-store tables, then drops meta_endpoint_snapshots.

DO $$
DECLARE
  legacy_exists BOOLEAN;
  row_store RECORD;
  target_table TEXT;
BEGIN
  SELECT to_regclass('public.meta_endpoint_snapshots') IS NOT NULL INTO legacy_exists;

  IF NOT legacy_exists THEN
    RETURN;
  END IF;

  FOR row_store IN
    SELECT DISTINCT store_id
    FROM meta_endpoint_snapshots
  LOOP
    target_table := ensure_meta_snapshot_store_table(row_store.store_id);
    EXECUTE format(
      'INSERT INTO %I (store_id, endpoint, scope_id, variant_key, row_count, payload_json, updated_at)
       SELECT store_id, endpoint, scope_id, variant_key, row_count, payload_json, updated_at
       FROM meta_endpoint_snapshots
       WHERE store_id = %L
       ON CONFLICT (store_id, endpoint, scope_id, variant_key)
       DO UPDATE SET
         row_count = EXCLUDED.row_count,
         payload_json = EXCLUDED.payload_json,
         updated_at = EXCLUDED.updated_at',
      target_table,
      row_store.store_id
    );
  END LOOP;
END;
$$;

DROP TABLE IF EXISTS meta_endpoint_snapshots CASCADE;
