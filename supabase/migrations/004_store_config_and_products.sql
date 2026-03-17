-- Store config, product classifications, campaign mappings, exchange rates, store errors
-- Run this in Supabase SQL editor after 003_attribution_system.sql
--
-- Tables created:
--   store_config, product_classifications, campaign_product_mappings,
--   exchange_rates, store_errors


-- ── 1. store_config — auto-detected store settings ─────────────────────────
CREATE TABLE IF NOT EXISTS store_config (
  store_id text PRIMARY KEY,
  shopify_domain text,
  iana_timezone text NOT NULL DEFAULT 'America/New_York',
  shopify_plan text,
  reporting_currency text NOT NULL DEFAULT 'USD',
  meta_ad_account_ids jsonb DEFAULT '[]',
  meta_currencies jsonb DEFAULT '{}',
  onboarding_complete boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_config_domain
  ON store_config(shopify_domain);


-- ── 2. product_classifications — main vs. upsell product tagging ───────────
CREATE TABLE IF NOT EXISTS product_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  product_id text NOT NULL,
  product_title text,
  classification text NOT NULL DEFAULT 'main',
  detection_method text NOT NULL DEFAULT 'price_based',
  manual_override boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_classifications_store
  ON product_classifications(store_id);


-- ── 3. campaign_product_mappings — link campaigns to products ──────────────
CREATE TABLE IF NOT EXISTS campaign_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  product_id text,
  confidence numeric(5,2) DEFAULT 0,
  method text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_product_mappings_store
  ON campaign_product_mappings(store_id);


-- ── 4. exchange_rates — daily currency conversion rates ────────────────────
CREATE TABLE IF NOT EXISTS exchange_rates (
  base_currency text NOT NULL,
  target_currency text NOT NULL,
  rate numeric(12,6) NOT NULL,
  date text NOT NULL,
  PRIMARY KEY (base_currency, target_currency, date)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_date
  ON exchange_rates(date DESC);


-- ── 5. store_errors — operational error log per store ──────────────────────
CREATE TABLE IF NOT EXISTS store_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  error_type text NOT NULL,
  message text NOT NULL,
  action_required text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_errors_store
  ON store_errors(store_id, created_at DESC);
