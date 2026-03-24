-- Daily metrics fact table for Meta entity warehouse (range-friendly).
-- Keeps one row per entity per day to support fast per-day and custom date-range queries.

CREATE TABLE IF NOT EXISTS meta_entity_daily_metrics (
  id BIGSERIAL PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  entity_level TEXT NOT NULL CHECK (entity_level IN ('campaign', 'adset', 'ad')),
  entity_id TEXT NOT NULL,

  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT,
  ad_account_id TEXT,

  metric_date DATE NOT NULL,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  source_window_start DATE,
  source_window_end DATE,
  source_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (store_id, entity_level, entity_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_meta_daily_metrics_store_date
  ON meta_entity_daily_metrics(store_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_meta_daily_metrics_store_level
  ON meta_entity_daily_metrics(store_id, entity_level, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_meta_daily_metrics_store_campaign
  ON meta_entity_daily_metrics(store_id, campaign_id, metric_date DESC)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_daily_metrics_store_adset
  ON meta_entity_daily_metrics(store_id, adset_id, metric_date DESC)
  WHERE adset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_daily_metrics_store_ad
  ON meta_entity_daily_metrics(store_id, ad_id, metric_date DESC)
  WHERE ad_id IS NOT NULL;

