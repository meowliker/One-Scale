-- Keep Meta data strictly scoped to currently active ad accounts per store.
-- Removes stale data for removed/disabled accounts from snapshots + warehouse tables.

CREATE OR REPLACE FUNCTION prune_store_meta_data_to_active_accounts(
  p_store_id TEXT,
  p_active_account_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  snapshot_table TEXT;
  normalized_active_ids TEXT[];
  canonical_active_ids TEXT[];
  current_scope TEXT;
  deleted_campaign_scope_rows INTEGER := 0;
  deleted_adset_scope_rows INTEGER := 0;
  deleted_ads_scope_rows INTEGER := 0;
  deleted_setup_scope_rows INTEGER := 0;
  deleted_campaign_entities INTEGER := 0;
  deleted_adset_entities INTEGER := 0;
  deleted_ad_entities INTEGER := 0;
  deleted_daily_metrics INTEGER := 0;
  deleted_meta_spend_rows INTEGER := 0;
BEGIN
  IF p_store_id IS NULL OR btrim(p_store_id) = '' THEN
    RAISE EXCEPTION 'store_id is required';
  END IF;

  normalized_active_ids := COALESCE(
    ARRAY(
      SELECT DISTINCT regexp_replace(lower(btrim(x)), '^act_', '')
      FROM unnest(COALESCE(p_active_account_ids, ARRAY[]::TEXT[])) AS x
      WHERE btrim(x) <> ''
      ORDER BY 1
    ),
    ARRAY[]::TEXT[]
  );

  canonical_active_ids := COALESCE(
    ARRAY(
      SELECT DISTINCT ('act_' || regexp_replace(lower(btrim(x)), '^act_', ''))
      FROM unnest(COALESCE(p_active_account_ids, ARRAY[]::TEXT[])) AS x
      WHERE btrim(x) <> ''
      ORDER BY 1
    ),
    ARRAY[]::TEXT[]
  );

  snapshot_table := ensure_meta_snapshot_store_table(p_store_id);

  -- Always clear setup snapshots so they are rebuilt from currently linked accounts.
  EXECUTE format(
    'DELETE FROM %I
     WHERE store_id = $1
       AND endpoint IN (''accounts'',''pages'',''pixels'',''instagram'')',
    snapshot_table
  )
  USING p_store_id;
  GET DIAGNOSTICS deleted_setup_scope_rows = ROW_COUNT;

  IF COALESCE(array_length(normalized_active_ids, 1), 0) = 0 THEN
    -- No active accounts: wipe Meta snapshot scopes + warehouse/spend rows for this store.
    EXECUTE format(
      'DELETE FROM %I
       WHERE store_id = $1
         AND endpoint IN (''campaigns'',''adsets'',''ads'')',
      snapshot_table
    )
    USING p_store_id;
    GET DIAGNOSTICS deleted_campaign_scope_rows = ROW_COUNT;

    DELETE FROM meta_campaign_entities WHERE store_id = p_store_id;
    GET DIAGNOSTICS deleted_campaign_entities = ROW_COUNT;

    DELETE FROM meta_adset_entities WHERE store_id = p_store_id;
    GET DIAGNOSTICS deleted_adset_entities = ROW_COUNT;

    DELETE FROM meta_ad_entities WHERE store_id = p_store_id;
    GET DIAGNOSTICS deleted_ad_entities = ROW_COUNT;

    DELETE FROM meta_entity_daily_metrics WHERE store_id = p_store_id;
    GET DIAGNOSTICS deleted_daily_metrics = ROW_COUNT;

    DELETE FROM meta_spend_cache WHERE store_id = p_store_id;
    GET DIAGNOSTICS deleted_meta_spend_rows = ROW_COUNT;

    RETURN jsonb_build_object(
      'store_id', p_store_id,
      'active_accounts', 0,
      'deleted_campaign_scope_rows', deleted_campaign_scope_rows,
      'deleted_adset_scope_rows', 0,
      'deleted_ads_scope_rows', 0,
      'deleted_setup_scope_rows', deleted_setup_scope_rows,
      'deleted_campaign_entities', deleted_campaign_entities,
      'deleted_adset_entities', deleted_adset_entities,
      'deleted_ad_entities', deleted_ad_entities,
      'deleted_daily_metrics', deleted_daily_metrics,
      'deleted_meta_spend_rows', deleted_meta_spend_rows
    );
  END IF;

  current_scope := 'accounts:' || array_to_string(canonical_active_ids, ',');

  -- Keep only campaign snapshots for current active account scope.
  EXECUTE format(
    'DELETE FROM %I
     WHERE store_id = $1
       AND endpoint = ''campaigns''
       AND scope_id <> $2',
    snapshot_table
  )
  USING p_store_id, current_scope;
  GET DIAGNOSTICS deleted_campaign_scope_rows = ROW_COUNT;

  -- Remove adset snapshots whose campaign scope is no longer in current campaign set.
  EXECUTE format(
    $SQL$
    WITH allowed_campaigns AS (
      SELECT DISTINCT NULLIF(elem->>'id', '') AS campaign_id
      FROM %I t
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(t.payload_json::jsonb) = 'array' THEN t.payload_json::jsonb
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE t.store_id = $1
        AND t.endpoint = 'campaigns'
        AND t.scope_id = $2
        AND t.variant_key = 'latest'
    )
    DELETE FROM %I d
    WHERE d.store_id = $1
      AND d.endpoint = 'adsets'
      AND NOT EXISTS (
        SELECT 1 FROM allowed_campaigns c WHERE c.campaign_id = d.scope_id
      )
    $SQL$,
    snapshot_table,
    snapshot_table
  )
  USING p_store_id, current_scope;
  GET DIAGNOSTICS deleted_adset_scope_rows = ROW_COUNT;

  -- Remove ads snapshots whose adset scope is no longer present.
  EXECUTE format(
    $SQL$
    WITH allowed_adsets AS (
      SELECT DISTINCT NULLIF(elem->>'id', '') AS adset_id
      FROM %I t
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(t.payload_json::jsonb) = 'array' THEN t.payload_json::jsonb
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE t.store_id = $1
        AND t.endpoint = 'adsets'
        AND t.variant_key = 'latest'
    )
    DELETE FROM %I d
    WHERE d.store_id = $1
      AND d.endpoint = 'ads'
      AND NOT EXISTS (
        SELECT 1 FROM allowed_adsets a WHERE a.adset_id = d.scope_id
      )
    $SQL$,
    snapshot_table,
    snapshot_table
  )
  USING p_store_id;
  GET DIAGNOSTICS deleted_ads_scope_rows = ROW_COUNT;

  -- Prune warehouse + daily metrics + spend cache to currently active accounts.
  DELETE FROM meta_campaign_entities
  WHERE store_id = p_store_id
    AND regexp_replace(COALESCE(ad_account_id, ''), '^act_', '') <> ALL(normalized_active_ids);
  GET DIAGNOSTICS deleted_campaign_entities = ROW_COUNT;

  DELETE FROM meta_adset_entities
  WHERE store_id = p_store_id
    AND regexp_replace(COALESCE(ad_account_id, ''), '^act_', '') <> ALL(normalized_active_ids);
  GET DIAGNOSTICS deleted_adset_entities = ROW_COUNT;

  DELETE FROM meta_ad_entities
  WHERE store_id = p_store_id
    AND regexp_replace(COALESCE(ad_account_id, ''), '^act_', '') <> ALL(normalized_active_ids);
  GET DIAGNOSTICS deleted_ad_entities = ROW_COUNT;

  DELETE FROM meta_entity_daily_metrics
  WHERE store_id = p_store_id
    AND regexp_replace(COALESCE(ad_account_id, ''), '^act_', '') <> ALL(normalized_active_ids);
  GET DIAGNOSTICS deleted_daily_metrics = ROW_COUNT;

  DELETE FROM meta_spend_cache
  WHERE store_id = p_store_id
    AND regexp_replace(COALESCE(ad_account_id, ''), '^act_', '') <> ALL(normalized_active_ids);
  GET DIAGNOSTICS deleted_meta_spend_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'active_accounts', COALESCE(array_length(normalized_active_ids, 1), 0),
    'scope', current_scope,
    'deleted_campaign_scope_rows', deleted_campaign_scope_rows,
    'deleted_adset_scope_rows', deleted_adset_scope_rows,
    'deleted_ads_scope_rows', deleted_ads_scope_rows,
    'deleted_setup_scope_rows', deleted_setup_scope_rows,
    'deleted_campaign_entities', deleted_campaign_entities,
    'deleted_adset_entities', deleted_adset_entities,
    'deleted_ad_entities', deleted_ad_entities,
    'deleted_daily_metrics', deleted_daily_metrics,
    'deleted_meta_spend_rows', deleted_meta_spend_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION prune_store_meta_data_to_active_accounts(TEXT, TEXT[]) TO service_role;
