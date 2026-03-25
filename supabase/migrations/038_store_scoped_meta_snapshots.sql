-- Create per-store physical snapshot tables for Ads Manager snapshot cache.
-- This keeps each store's snapshot data in a dedicated table while preserving
-- existing API semantics through the helper layer.

CREATE OR REPLACE FUNCTION ensure_meta_snapshot_store_table(p_store_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  normalized_store TEXT;
  table_suffix TEXT;
  table_name TEXT;
  idx_lookup TEXT;
  idx_variant TEXT;
BEGIN
  IF p_store_id IS NULL OR btrim(p_store_id) = '' THEN
    RAISE EXCEPTION 'store_id is required';
  END IF;

  normalized_store := regexp_replace(lower(p_store_id), '[^a-z0-9]+', '_', 'g');
  normalized_store := regexp_replace(normalized_store, '^_+|_+$', '', 'g');
  IF normalized_store = '' THEN
    normalized_store := 'store';
  END IF;

  table_suffix := substr(md5(p_store_id), 1, 8);
  table_name := format('meta_snapshots_store_%s_%s', left(normalized_store, 24), table_suffix);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I (
      id BIGSERIAL PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL CHECK (endpoint IN (''creatives'', ''adsets'', ''ads'', ''campaigns'', ''insights'', ''pages'', ''pixels'', ''instagram'', ''accounts'')),
      scope_id TEXT NOT NULL DEFAULT '''',
      variant_key TEXT NOT NULL DEFAULT '''',
      row_count INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (store_id, endpoint, scope_id, variant_key),
      CHECK (store_id = %L)
    )',
    table_name,
    p_store_id
  );

  idx_lookup := format('idx_meta_snap_ep_scope_%s', table_suffix);
  idx_variant := format('idx_meta_snap_variant_%s', table_suffix);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I(endpoint, scope_id, updated_at DESC)',
    idx_lookup,
    table_name
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I(variant_key, endpoint, updated_at DESC)',
    idx_variant,
    table_name
  );

  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO service_role', table_name);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO service_role', table_name || '_id_seq');

  RETURN table_name;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_meta_snapshot_store_table(TEXT) TO service_role;

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
