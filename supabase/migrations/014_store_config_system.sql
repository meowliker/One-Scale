-- Store config extensions + config change history
-- Extends existing store_config table with full Shopify shop fields
-- Creates store_config_history for audit trail

-- ── 1. Extend store_config with new columns ─────────────────────────────────

ALTER TABLE store_config ADD COLUMN IF NOT EXISTS shopify_store_name text;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS shopify_store_id text;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS myshopify_domain text;

-- Currency detail
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS money_format text;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS money_with_currency_format text;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS currency_format text;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS enabled_presentment_currencies text[] DEFAULT ARRAY['USD'];

-- Timezone detail
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS timezone_offset text;

-- Locale
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS country_name text;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS province_code text;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS primary_locale text DEFAULT 'en';

-- Plan detail
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS shopify_plan_display text;

-- Tax
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS taxes_included boolean DEFAULT false;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS tax_shipping boolean DEFAULT false;

-- Store metadata
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS weight_unit text DEFAULT 'kg';
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS store_created_at timestamptz;

-- Sync tracking
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS config_synced_at timestamptz DEFAULT now();
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS config_version int DEFAULT 1;

-- Change history tracking
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS previous_currency text;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS previous_timezone text;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS currency_changed_at timestamptz;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS timezone_changed_at timestamptz;
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill currency from reporting_currency for existing rows
UPDATE store_config SET currency = reporting_currency WHERE currency = 'USD' AND reporting_currency != 'USD';

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
