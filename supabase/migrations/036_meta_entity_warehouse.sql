-- Meta Entity Warehouse (latest-only)
-- 3 normalized tables + one ad-level flattened view for direct querying.

CREATE TABLE IF NOT EXISTS meta_campaign_entities (
  id BIGSERIAL PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,

  ad_account_id TEXT,
  ad_account_name TEXT,
  business_manager_id TEXT,
  business_manager_name TEXT,
  facebook_page_id TEXT,
  facebook_page_name TEXT,
  instagram_id TEXT,
  instagram_username TEXT,
  pixel_id TEXT,
  pixel_name TEXT,

  objective TEXT,
  status TEXT,
  daily_budget NUMERIC(12,2),
  lifetime_budget NUMERIC(12,2),
  bid_strategy TEXT,
  start_date TEXT,
  end_date TEXT,
  meta_updated_time TEXT,

  policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  source_window_start DATE,
  source_window_end DATE,
  source_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (store_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS meta_adset_entities (
  id BIGSERIAL PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  adset_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  adset_name TEXT NOT NULL,

  ad_account_id TEXT,
  ad_account_name TEXT,
  business_manager_id TEXT,
  business_manager_name TEXT,
  facebook_page_id TEXT,
  facebook_page_name TEXT,
  instagram_id TEXT,
  instagram_username TEXT,
  pixel_id TEXT,
  pixel_name TEXT,

  status TEXT,
  daily_budget NUMERIC(12,2),
  bid_amount NUMERIC(12,2),
  start_date TEXT,
  end_date TEXT,
  meta_updated_time TEXT,

  targeting_age_min INTEGER,
  targeting_age_max INTEGER,
  targeting_genders JSONB NOT NULL DEFAULT '[]'::jsonb,
  targeting_locations JSONB NOT NULL DEFAULT '[]'::jsonb,
  targeting_interests JSONB NOT NULL DEFAULT '[]'::jsonb,
  targeting_custom_audiences JSONB NOT NULL DEFAULT '[]'::jsonb,
  targeting_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  source_window_start DATE,
  source_window_end DATE,
  source_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (store_id, adset_id)
);

CREATE TABLE IF NOT EXISTS meta_ad_entities (
  id BIGSERIAL PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  ad_id TEXT NOT NULL,
  adset_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  ad_name TEXT NOT NULL,

  ad_account_id TEXT,
  ad_account_name TEXT,
  business_manager_id TEXT,
  business_manager_name TEXT,
  facebook_page_id TEXT,
  facebook_page_name TEXT,
  instagram_id TEXT,
  instagram_username TEXT,
  pixel_id TEXT,
  pixel_name TEXT,

  status TEXT,

  creative_id TEXT,
  creative_type TEXT,
  primary_text TEXT,
  headline TEXT,
  cta_type TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  video_id TEXT,
  destination_url TEXT,
  url_tags TEXT,

  policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  source_window_start DATE,
  source_window_end DATE,
  source_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (store_id, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_campaign_entities_store_status
  ON meta_campaign_entities(store_id, status);
CREATE INDEX IF NOT EXISTS idx_meta_campaign_entities_store_account
  ON meta_campaign_entities(store_id, ad_account_id);

CREATE INDEX IF NOT EXISTS idx_meta_adset_entities_store_campaign
  ON meta_adset_entities(store_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_adset_entities_store_status
  ON meta_adset_entities(store_id, status);
CREATE INDEX IF NOT EXISTS idx_meta_adset_entities_store_account
  ON meta_adset_entities(store_id, ad_account_id);

CREATE INDEX IF NOT EXISTS idx_meta_ad_entities_store_adset
  ON meta_ad_entities(store_id, adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_entities_store_campaign
  ON meta_ad_entities(store_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_entities_store_status
  ON meta_ad_entities(store_id, status);
CREATE INDEX IF NOT EXISTS idx_meta_ad_entities_store_account
  ON meta_ad_entities(store_id, ad_account_id);

CREATE OR REPLACE VIEW meta_entities_flat_v AS
SELECT
  a.store_id,

  -- IDs
  c.campaign_id,
  s.adset_id,
  a.ad_id,

  -- Names
  c.campaign_name,
  s.adset_name,
  a.ad_name,

  -- Status
  c.status AS campaign_status,
  s.status AS adset_status,
  a.status AS ad_status,

  -- Best-effort merged account/setup fields
  COALESCE(a.ad_account_id, s.ad_account_id, c.ad_account_id) AS ad_account_id,
  COALESCE(a.ad_account_name, s.ad_account_name, c.ad_account_name) AS ad_account_name,
  COALESCE(a.business_manager_id, s.business_manager_id, c.business_manager_id) AS business_manager_id,
  COALESCE(a.business_manager_name, s.business_manager_name, c.business_manager_name) AS business_manager_name,
  COALESCE(a.facebook_page_id, s.facebook_page_id, c.facebook_page_id) AS facebook_page_id,
  COALESCE(a.facebook_page_name, s.facebook_page_name, c.facebook_page_name) AS facebook_page_name,
  COALESCE(a.instagram_id, s.instagram_id, c.instagram_id) AS instagram_id,
  COALESCE(a.instagram_username, s.instagram_username, c.instagram_username) AS instagram_username,
  COALESCE(a.pixel_id, s.pixel_id, c.pixel_id) AS pixel_id,
  COALESCE(a.pixel_name, s.pixel_name, c.pixel_name) AS pixel_name,

  -- Campaign fields
  c.objective,
  c.daily_budget AS campaign_daily_budget,
  c.lifetime_budget AS campaign_lifetime_budget,
  c.bid_strategy,
  c.start_date AS campaign_start_date,
  c.end_date AS campaign_end_date,

  -- Ad set fields
  s.daily_budget AS adset_daily_budget,
  s.bid_amount AS adset_bid_amount,
  s.start_date AS adset_start_date,
  s.end_date AS adset_end_date,
  s.targeting_json,

  -- Ad creative fields
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

  -- JSON blobs for flexible downstream querying
  c.metrics_json AS campaign_metrics_json,
  s.metrics_json AS adset_metrics_json,
  a.metrics_json AS ad_metrics_json,
  c.policy_json AS campaign_policy_json,
  s.policy_json AS adset_policy_json,
  a.policy_json AS ad_policy_json,
  a.raw_json AS ad_raw_json,

  -- Window + freshness
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
