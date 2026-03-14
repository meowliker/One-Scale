-- Store config (full table) + config change history
-- Creates store_config from scratch with all fields, plus audit trail

-- ── 1. store_config — all Shopify shop settings ─────────────────────────────

CREATE TABLE IF NOT EXISTS store_config (
  store_id text PRIMARY KEY,

  -- Identity
  shopify_store_name text,
  shopify_store_id text,
  shopify_domain text,
  myshopify_domain text,

  -- Currency
  currency text NOT NULL DEFAULT 'USD',
  reporting_currency text NOT NULL DEFAULT 'USD',
  money_format text,
  money_with_currency_format text,
  currency_format text,
  enabled_presentment_currencies text[] DEFAULT ARRAY['USD'],

  -- Timezone
  iana_timezone text NOT NULL DEFAULT 'America/New_York',
  timezone_offset text,

  -- Locale
  country_code text,
  country_name text,
  province_code text,
  primary_locale text DEFAULT 'en',

  -- Plan
  shopify_plan text,
  shopify_plan_display text,

  -- Tax
  taxes_included boolean DEFAULT false,
  tax_shipping boolean DEFAULT false,

  -- Store metadata
  weight_unit text DEFAULT 'kg',
  store_created_at timestamptz,
  meta_ad_account_ids jsonb DEFAULT '[]',
  meta_currencies jsonb DEFAULT '{}',
  onboarding_complete boolean DEFAULT false,

  -- Sync tracking
  config_synced_at timestamptz DEFAULT now(),
  config_version int DEFAULT 1,

  -- Change history tracking
  previous_currency text,
  previous_timezone text,
  currency_changed_at timestamptz,
  timezone_changed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_config_domain
  ON store_config(shopify_domain);

-- ── 2. Config change history — full audit trail ─────────────────────────────

CREATE TABLE IF NOT EXISTS store_config_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  changed_at timestamptz DEFAULT now(),
  changed_fields jsonb NOT NULL,
  previous_values jsonb NOT NULL,
  new_values jsonb NOT NULL,
  source text DEFAULT 'webhook'
);

CREATE INDEX IF NOT EXISTS idx_store_config_history_store
  ON store_config_history(store_id, changed_at DESC);
