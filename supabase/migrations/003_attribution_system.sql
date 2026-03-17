-- Attribution System tables migration
-- Run this in Supabase SQL editor after 002_pixel_attribution.sql
--
-- Tables created:
--   survey_responses, capi_logs, attribution_cache,
--   meta_spend_cache, shopify_orders_cache, pnl_snapshots,
--   attribution_calibration, backfill_progress, cron_logs
--
-- Alterations:
--   order_attributions: add utm_ad_id column


-- ── 1. survey_responses — post-purchase survey data ──────────────────────
CREATE TABLE IF NOT EXISTS survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  store_id text NOT NULL,
  response text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_store
  ON survey_responses(store_id);

CREATE INDEX IF NOT EXISTS idx_survey_responses_order
  ON survey_responses(order_id);

CREATE INDEX IF NOT EXISTS idx_survey_responses_store_created
  ON survey_responses(store_id, created_at DESC);


-- ── 2. capi_logs — Conversions API send logs ─────────────────────────────
CREATE TABLE IF NOT EXISTS capi_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  order_id text,
  status text NOT NULL,
  emq_score numeric(5,2),
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capi_logs_store_status
  ON capi_logs(store_id, status);

CREATE INDEX IF NOT EXISTS idx_capi_logs_store_sent
  ON capi_logs(store_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_capi_logs_order
  ON capi_logs(order_id)
  WHERE order_id IS NOT NULL;


-- ── 3. attribution_cache — AI-powered attribution suggestions ────────────
CREATE TABLE IF NOT EXISTS attribution_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  campaign_id text NOT NULL,
  ai_suggestion jsonb,
  confidence numeric(5,4),
  cached_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attribution_cache_store_campaign
  ON attribution_cache(store_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_attribution_cache_store_cached
  ON attribution_cache(store_id, cached_at DESC);


-- ── 4. meta_spend_cache — Meta Ads spend data cache ──────────────────────
CREATE TABLE IF NOT EXISTS meta_spend_cache (
  store_id text NOT NULL,
  campaign_id text NOT NULL,
  adset_id text,
  ad_id text,
  date text NOT NULL,
  spend numeric(12,2) NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  revenue numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, campaign_id, date)
);

CREATE INDEX IF NOT EXISTS idx_meta_spend_cache_campaign
  ON meta_spend_cache(campaign_id);

CREATE INDEX IF NOT EXISTS idx_meta_spend_cache_store_date
  ON meta_spend_cache(store_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_meta_spend_cache_adset
  ON meta_spend_cache(adset_id)
  WHERE adset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_spend_cache_ad
  ON meta_spend_cache(ad_id)
  WHERE ad_id IS NOT NULL;


-- ── 5. shopify_orders_cache — Shopify order data cache ───────────────────
CREATE TABLE IF NOT EXISTS shopify_orders_cache (
  order_id text PRIMARY KEY,
  store_id text NOT NULL,
  customer_email text,
  customer_phone text,
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  line_items jsonb,
  landing_site text,
  note_attributes jsonb,
  financial_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_cache_store
  ON shopify_orders_cache(store_id);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_cache_store_created
  ON shopify_orders_cache(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_cache_email
  ON shopify_orders_cache(customer_email)
  WHERE customer_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shopify_orders_cache_financial
  ON shopify_orders_cache(store_id, financial_status);


-- ── 6. pnl_snapshots — enriched P&L with campaign/product breakdowns ────
-- NOTE: This is separate from daily_pnl_snapshots (002). This table stores
-- aggregated snapshots with JSONB breakdowns for campaign and product data.
CREATE TABLE IF NOT EXISTS pnl_snapshots (
  store_id text NOT NULL,
  date text NOT NULL,
  revenue numeric(12,2) NOT NULL DEFAULT 0,
  ad_spend numeric(12,2) NOT NULL DEFAULT 0,
  fees numeric(12,2) NOT NULL DEFAULT 0,
  cogs numeric(12,2) NOT NULL DEFAULT 0,
  chargebacks numeric(12,2) NOT NULL DEFAULT 0,
  refunds numeric(12,2) NOT NULL DEFAULT 0,
  net_profit numeric(12,2) NOT NULL DEFAULT 0,
  margin numeric(5,2) NOT NULL DEFAULT 0,
  product_breakdown jsonb,
  campaign_breakdown jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, date)
);

CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_store_date
  ON pnl_snapshots(store_id, date DESC);


-- ── 7. attribution_calibration — channel multiplier calibration ──────────
CREATE TABLE IF NOT EXISTS attribution_calibration (
  store_id text NOT NULL,
  channel text NOT NULL,
  multiplier numeric(6,4) NOT NULL DEFAULT 1.0,
  sample_size integer NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, channel)
);


-- ── 8. backfill_progress — order backfill tracking ───────────────────────
CREATE TABLE IF NOT EXISTS backfill_progress (
  store_id text PRIMARY KEY,
  last_processed_order_id text,
  orders_improved integer NOT NULL DEFAULT 0,
  ran_at timestamptz NOT NULL DEFAULT now()
);


-- ── 9. cron_logs — scheduled job execution logs ─────────────────────────
CREATE TABLE IF NOT EXISTS cron_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name text NOT NULL,
  store_id text,
  status text NOT NULL,
  rows_processed integer NOT NULL DEFAULT 0,
  error text,
  duration_ms integer,
  ran_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_logs_name_ran
  ON cron_logs(cron_name, ran_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_logs_store
  ON cron_logs(store_id)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cron_logs_status
  ON cron_logs(status);


-- ── 10. Alter existing tables — add missing columns ─────────────────────

-- order_attributions: add utm_ad_id for ad-level attribution
ALTER TABLE order_attributions
  ADD COLUMN IF NOT EXISTS utm_ad_id text;

CREATE INDEX IF NOT EXISTS idx_order_attributions_ad_id
  ON order_attributions(store_id, utm_ad_id)
  WHERE utm_ad_id IS NOT NULL;


-- ── 11. Additional indexes on existing tables from 002 ───────────────────

-- pixel_events: index on fbclid for click-id lookups
CREATE INDEX IF NOT EXISTS idx_pixel_events_fbclid
  ON pixel_events(fbclid)
  WHERE fbclid IS NOT NULL;

-- pixel_events: index on order_id for order-based lookups
CREATE INDEX IF NOT EXISTS idx_pixel_events_order_id
  ON pixel_events(order_id)
  WHERE order_id IS NOT NULL;

-- pixel_events: index on visitor_id for visitor journey queries
CREATE INDEX IF NOT EXISTS idx_pixel_events_visitor
  ON pixel_events(visitor_id);

-- order_attributions: index on visitor_id for join queries
CREATE INDEX IF NOT EXISTS idx_order_attributions_visitor
  ON order_attributions(visitor_id)
  WHERE visitor_id IS NOT NULL;

-- order_attributions: index on fbclid for CAPI matching
CREATE INDEX IF NOT EXISTS idx_order_attributions_fbclid
  ON order_attributions(fbclid)
  WHERE fbclid IS NOT NULL;
