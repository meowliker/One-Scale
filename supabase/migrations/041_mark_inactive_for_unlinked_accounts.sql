-- Keep data for inactive/removed ad accounts, but mark entities as inactive.
-- This replaces destructive pruning behavior.

ALTER TABLE meta_campaign_entities
  ADD COLUMN IF NOT EXISTS ad_account_is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE meta_adset_entities
  ADD COLUMN IF NOT EXISTS ad_account_is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE meta_ad_entities
  ADD COLUMN IF NOT EXISTS ad_account_is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_meta_campaign_entities_store_account_active
  ON meta_campaign_entities(store_id, ad_account_is_active);

CREATE INDEX IF NOT EXISTS idx_meta_adset_entities_store_account_active
  ON meta_adset_entities(store_id, ad_account_is_active);

CREATE INDEX IF NOT EXISTS idx_meta_ad_entities_store_account_active
  ON meta_ad_entities(store_id, ad_account_is_active);

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
  updated_campaign_snapshot_rows INTEGER := 0;
  updated_adset_snapshot_rows INTEGER := 0;
  updated_ads_snapshot_rows INTEGER := 0;
  deleted_setup_scope_rows INTEGER := 0;
  updated_campaign_entities INTEGER := 0;
  updated_adset_entities INTEGER := 0;
  updated_ad_entities INTEGER := 0;
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

  -- Mark snapshot payload rows from inactive ad accounts as ACCOUNT_INACTIVE.
  IF COALESCE(array_length(normalized_active_ids, 1), 0) = 0 THEN
    EXECUTE format(
      $SQL$
      UPDATE %I t
      SET payload_json = COALESCE((
            SELECT jsonb_agg(
              CASE
                WHEN jsonb_typeof(elem) = 'object'
                  THEN jsonb_set(elem, '{status}', '"ACCOUNT_INACTIVE"'::jsonb, true)
                ELSE elem
              END
            )
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(t.payload_json::jsonb) = 'array' THEN t.payload_json::jsonb
                ELSE '[]'::jsonb
              END
            ) AS elem
          ), '[]'::jsonb)::text,
          updated_at = now()
      WHERE t.store_id = $1
        AND t.endpoint = $2
      $SQL$,
      snapshot_table
    )
    USING p_store_id, 'campaigns';
    GET DIAGNOSTICS updated_campaign_snapshot_rows = ROW_COUNT;

    EXECUTE format(
      $SQL$
      UPDATE %I t
      SET payload_json = COALESCE((
            SELECT jsonb_agg(
              CASE
                WHEN jsonb_typeof(elem) = 'object'
                  THEN jsonb_set(elem, '{status}', '"ACCOUNT_INACTIVE"'::jsonb, true)
                ELSE elem
              END
            )
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(t.payload_json::jsonb) = 'array' THEN t.payload_json::jsonb
                ELSE '[]'::jsonb
              END
            ) AS elem
          ), '[]'::jsonb)::text,
          updated_at = now()
      WHERE t.store_id = $1
        AND t.endpoint = $2
      $SQL$,
      snapshot_table
    )
    USING p_store_id, 'adsets';
    GET DIAGNOSTICS updated_adset_snapshot_rows = ROW_COUNT;

    EXECUTE format(
      $SQL$
      UPDATE %I t
      SET payload_json = COALESCE((
            SELECT jsonb_agg(
              CASE
                WHEN jsonb_typeof(elem) = 'object'
                  THEN jsonb_set(elem, '{status}', '"ACCOUNT_INACTIVE"'::jsonb, true)
                ELSE elem
              END
            )
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(t.payload_json::jsonb) = 'array' THEN t.payload_json::jsonb
                ELSE '[]'::jsonb
              END
            ) AS elem
          ), '[]'::jsonb)::text,
          updated_at = now()
      WHERE t.store_id = $1
        AND t.endpoint = $2
      $SQL$,
      snapshot_table
    )
    USING p_store_id, 'ads';
    GET DIAGNOSTICS updated_ads_snapshot_rows = ROW_COUNT;
  ELSE
    EXECUTE format(
      $SQL$
      UPDATE %I t
      SET payload_json = COALESCE((
            SELECT jsonb_agg(
              CASE
                WHEN jsonb_typeof(elem) = 'object'
                  AND COALESCE(NULLIF(elem->>'ad_account_id', ''), '') <> ''
                  AND regexp_replace(lower(elem->>'ad_account_id'), '^act_', '') <> ALL($2)
                  THEN jsonb_set(elem, '{status}', '"ACCOUNT_INACTIVE"'::jsonb, true)
                ELSE elem
              END
            )
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(t.payload_json::jsonb) = 'array' THEN t.payload_json::jsonb
                ELSE '[]'::jsonb
              END
            ) AS elem
          ), '[]'::jsonb)::text,
          updated_at = now()
      WHERE t.store_id = $1
        AND t.endpoint = $3
      $SQL$,
      snapshot_table
    )
    USING p_store_id, normalized_active_ids, 'campaigns';
    GET DIAGNOSTICS updated_campaign_snapshot_rows = ROW_COUNT;

    EXECUTE format(
      $SQL$
      UPDATE %I t
      SET payload_json = COALESCE((
            SELECT jsonb_agg(
              CASE
                WHEN jsonb_typeof(elem) = 'object'
                  AND COALESCE(NULLIF(elem->>'ad_account_id', ''), '') <> ''
                  AND regexp_replace(lower(elem->>'ad_account_id'), '^act_', '') <> ALL($2)
                  THEN jsonb_set(elem, '{status}', '"ACCOUNT_INACTIVE"'::jsonb, true)
                ELSE elem
              END
            )
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(t.payload_json::jsonb) = 'array' THEN t.payload_json::jsonb
                ELSE '[]'::jsonb
              END
            ) AS elem
          ), '[]'::jsonb)::text,
          updated_at = now()
      WHERE t.store_id = $1
        AND t.endpoint = $3
      $SQL$,
      snapshot_table
    )
    USING p_store_id, normalized_active_ids, 'adsets';
    GET DIAGNOSTICS updated_adset_snapshot_rows = ROW_COUNT;

    EXECUTE format(
      $SQL$
      UPDATE %I t
      SET payload_json = COALESCE((
            SELECT jsonb_agg(
              CASE
                WHEN jsonb_typeof(elem) = 'object'
                  AND COALESCE(NULLIF(elem->>'ad_account_id', ''), '') <> ''
                  AND regexp_replace(lower(elem->>'ad_account_id'), '^act_', '') <> ALL($2)
                  THEN jsonb_set(elem, '{status}', '"ACCOUNT_INACTIVE"'::jsonb, true)
                ELSE elem
              END
            )
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(t.payload_json::jsonb) = 'array' THEN t.payload_json::jsonb
                ELSE '[]'::jsonb
              END
            ) AS elem
          ), '[]'::jsonb)::text,
          updated_at = now()
      WHERE t.store_id = $1
        AND t.endpoint = $3
      $SQL$,
      snapshot_table
    )
    USING p_store_id, normalized_active_ids, 'ads';
    GET DIAGNOSTICS updated_ads_snapshot_rows = ROW_COUNT;
  END IF;

  -- Mark entity tables inactive by account, keep rows.
  UPDATE meta_campaign_entities
  SET ad_account_is_active = (
        COALESCE(NULLIF(regexp_replace(lower(COALESCE(ad_account_id, '')), '^act_', ''), ''), '') = ANY(normalized_active_ids)
      ),
      status = CASE
        WHEN COALESCE(NULLIF(regexp_replace(lower(COALESCE(ad_account_id, '')), '^act_', ''), ''), '') = ANY(normalized_active_ids)
          THEN COALESCE(NULLIF(raw_json->>'status', ''), status)
        ELSE 'ACCOUNT_INACTIVE'
      END,
      updated_at = now()
  WHERE store_id = p_store_id;
  GET DIAGNOSTICS updated_campaign_entities = ROW_COUNT;

  UPDATE meta_adset_entities
  SET ad_account_is_active = (
        COALESCE(NULLIF(regexp_replace(lower(COALESCE(ad_account_id, '')), '^act_', ''), ''), '') = ANY(normalized_active_ids)
      ),
      status = CASE
        WHEN COALESCE(NULLIF(regexp_replace(lower(COALESCE(ad_account_id, '')), '^act_', ''), ''), '') = ANY(normalized_active_ids)
          THEN COALESCE(NULLIF(raw_json->>'status', ''), status)
        ELSE 'ACCOUNT_INACTIVE'
      END,
      updated_at = now()
  WHERE store_id = p_store_id;
  GET DIAGNOSTICS updated_adset_entities = ROW_COUNT;

  UPDATE meta_ad_entities
  SET ad_account_is_active = (
        COALESCE(NULLIF(regexp_replace(lower(COALESCE(ad_account_id, '')), '^act_', ''), ''), '') = ANY(normalized_active_ids)
      ),
      status = CASE
        WHEN COALESCE(NULLIF(regexp_replace(lower(COALESCE(ad_account_id, '')), '^act_', ''), ''), '') = ANY(normalized_active_ids)
          THEN COALESCE(NULLIF(raw_json->>'status', ''), status)
        ELSE 'ACCOUNT_INACTIVE'
      END,
      updated_at = now()
  WHERE store_id = p_store_id;
  GET DIAGNOSTICS updated_ad_entities = ROW_COUNT;

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'active_accounts', COALESCE(array_length(normalized_active_ids, 1), 0),
    'updated_campaign_snapshot_rows', updated_campaign_snapshot_rows,
    'updated_adset_snapshot_rows', updated_adset_snapshot_rows,
    'updated_ads_snapshot_rows', updated_ads_snapshot_rows,
    'deleted_setup_scope_rows', deleted_setup_scope_rows,
    'updated_campaign_entities', updated_campaign_entities,
    'updated_adset_entities', updated_adset_entities,
    'updated_ad_entities', updated_ad_entities
  );
END;
$$;

GRANT EXECUTE ON FUNCTION prune_store_meta_data_to_active_accounts(TEXT, TEXT[]) TO service_role;

-- Recreate view because CREATE OR REPLACE cannot reorder existing columns.
DROP VIEW IF EXISTS meta_entities_flat_v;

CREATE VIEW meta_entities_flat_v AS
SELECT
  a.store_id,
  c.campaign_id,
  s.adset_id,
  a.ad_id,
  c.campaign_name,
  s.adset_name,
  a.ad_name,
  c.status AS campaign_status,
  s.status AS adset_status,
  a.status AS ad_status,
  COALESCE(a.ad_account_id, s.ad_account_id, c.ad_account_id) AS ad_account_id,
  COALESCE(a.ad_account_name, s.ad_account_name, c.ad_account_name) AS ad_account_name,
  COALESCE(a.ad_account_is_active, s.ad_account_is_active, c.ad_account_is_active, TRUE) AS ad_account_is_active,
  COALESCE(a.business_manager_id, s.business_manager_id, c.business_manager_id) AS business_manager_id,
  COALESCE(a.business_manager_name, s.business_manager_name, c.business_manager_name) AS business_manager_name,
  COALESCE(a.facebook_page_id, s.facebook_page_id, c.facebook_page_id) AS facebook_page_id,
  COALESCE(a.facebook_page_name, s.facebook_page_name, c.facebook_page_name) AS facebook_page_name,
  COALESCE(a.instagram_id, s.instagram_id, c.instagram_id) AS instagram_id,
  COALESCE(a.instagram_username, s.instagram_username, c.instagram_username) AS instagram_username,
  COALESCE(a.pixel_id, s.pixel_id, c.pixel_id) AS pixel_id,
  COALESCE(a.pixel_name, s.pixel_name, c.pixel_name) AS pixel_name,
  c.objective,
  c.daily_budget AS campaign_daily_budget,
  c.lifetime_budget AS campaign_lifetime_budget,
  c.bid_strategy,
  c.start_date AS campaign_start_date,
  c.end_date AS campaign_end_date,
  s.daily_budget AS adset_daily_budget,
  s.bid_amount AS adset_bid_amount,
  s.start_date AS adset_start_date,
  s.end_date AS adset_end_date,
  s.targeting_json,
  a.creative_id,
  a.creative_type,
  a.primary_text,
  a.headline,
  a.cta_type,
  a.media_url,
  a.thumbnail_url,
  a.video_id,
  a.destination_url,
  a.url_tags,
  c.metrics_json AS campaign_metrics_json,
  s.metrics_json AS adset_metrics_json,
  a.metrics_json AS ad_metrics_json,
  c.policy_json AS campaign_policy_json,
  s.policy_json AS adset_policy_json,
  a.policy_json AS ad_policy_json,
  a.raw_json AS ad_raw_json,
  a.source_window_start,
  a.source_window_end,
  a.source_synced_at,
  a.updated_at
FROM meta_ad_entities a
JOIN meta_adset_entities s
  ON s.store_id = a.store_id
 AND s.adset_id = a.adset_id
JOIN meta_campaign_entities c
  ON c.store_id = a.store_id
 AND c.campaign_id = a.campaign_id;
