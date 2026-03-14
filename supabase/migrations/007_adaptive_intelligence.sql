-- 007_adaptive_intelligence.sql
-- Adaptive Intelligence System: auto-learning store structure, zero hardcoded values
-- Builds on existing tables from 004 (product_classifications, campaign_product_mappings, store_config, exchange_rates)

-- ============================================================
-- Product Intelligence — extended product analysis
-- ============================================================
CREATE TABLE IF NOT EXISTS product_intelligence (
  id             BIGSERIAL PRIMARY KEY,
  store_id       TEXT NOT NULL,
  product_id     TEXT NOT NULL,
  product_title  TEXT NOT NULL DEFAULT '',
  product_type   TEXT DEFAULT '',           -- from Shopify product_type field
  vendor         TEXT DEFAULT '',
  tags           TEXT DEFAULT '',           -- comma-separated Shopify tags

  -- Detection flags
  is_digital          BOOLEAN DEFAULT FALSE,
  is_subscription     BOOLEAN DEFAULT FALSE,
  is_bundle           BOOLEAN DEFAULT FALSE,
  is_gift_card        BOOLEAN DEFAULT FALSE,
  requires_shipping   BOOLEAN DEFAULT TRUE,

  -- Classification (enhanced)
  classification      TEXT NOT NULL DEFAULT 'unknown',  -- main/upsell/downsell/bundle/subscription/gift/unknown
  classification_confidence REAL DEFAULT 0,
  detection_method    TEXT DEFAULT 'auto',               -- auto/manual/price/frequency/subscription/tag

  -- Order pattern analysis
  alone_percentage    REAL DEFAULT 0,    -- % of orders where this is the ONLY product
  first_percentage    REAL DEFAULT 0,    -- % of orders where this is the FIRST line item
  average_price       REAL DEFAULT 0,
  total_units_sold    INTEGER DEFAULT 0,
  total_revenue       REAL DEFAULT 0,
  order_count         INTEGER DEFAULT 0,

  -- Bundle detection
  variant_count       INTEGER DEFAULT 1,
  bundle_keywords     BOOLEAN DEFAULT FALSE,  -- title contains bundle/pack/set/kit

  -- Upsell pairing (which main product is this typically bought with)
  paired_product_id   TEXT,
  paired_frequency    REAL DEFAULT 0,    -- % of orders with this product that also have paired_product_id

  -- Manual override (always wins)
  manual_override     BOOLEAN DEFAULT FALSE,
  manual_classification TEXT,

  -- Timestamps
  last_analyzed_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT product_intelligence_store_product_key UNIQUE (store_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_intelligence_store ON product_intelligence(store_id);
CREATE INDEX IF NOT EXISTS idx_product_intelligence_classification ON product_intelligence(store_id, classification);

-- ============================================================
-- Fee Structures — auto-detected fee rates per gateway
-- Separate from pnl_payment_fees (user-configured)
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_structures (
  id              BIGSERIAL PRIMARY KEY,
  store_id        TEXT NOT NULL,
  gateway_name    TEXT NOT NULL,          -- e.g., 'shopify_payments', 'paypal', 'stripe'

  -- Detected rates from actual transaction analysis
  effective_rate  REAL NOT NULL DEFAULT 0,    -- actual % rate detected (e.g., 0.029 = 2.9%)
  fixed_fee       REAL NOT NULL DEFAULT 0,    -- fixed per-transaction fee (e.g., 0.30)
  currency        TEXT DEFAULT 'USD',

  -- Analysis metadata
  sample_size     INTEGER DEFAULT 0,          -- number of transactions analyzed
  min_rate        REAL DEFAULT 0,
  max_rate        REAL DEFAULT 0,
  std_deviation   REAL DEFAULT 0,

  -- Status
  detection_method TEXT DEFAULT 'transaction_analysis',  -- transaction_analysis / balance_api / manual
  is_active        BOOLEAN DEFAULT TRUE,
  last_detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fee_structures_store_gateway_key UNIQUE (store_id, gateway_name)
);

CREATE INDEX IF NOT EXISTS idx_fee_structures_store ON fee_structures(store_id);

-- ============================================================
-- Store Intelligence — health score, init status
-- ============================================================
CREATE TABLE IF NOT EXISTS store_intelligence (
  id              BIGSERIAL PRIMARY KEY,
  store_id        TEXT NOT NULL UNIQUE,

  -- Health score (0-100)
  health_score         INTEGER DEFAULT 0,
  health_breakdown     JSONB DEFAULT '{}',   -- { shopify: 20, meta: 20, pixel: 15, ... }

  -- Initialization status
  init_status          TEXT DEFAULT 'pending',  -- pending/running/complete/failed
  init_started_at      TIMESTAMPTZ,
  init_completed_at    TIMESTAMPTZ,
  init_error           TEXT,

  -- Detection timestamps
  products_analyzed_at      TIMESTAMPTZ,
  fees_detected_at          TIMESTAMPTZ,
  campaigns_mapped_at       TIMESTAMPTZ,
  currency_detected_at      TIMESTAMPTZ,
  cogs_suggested_at         TIMESTAMPTZ,

  -- Store characteristics (auto-detected)
  product_count        INTEGER DEFAULT 0,
  main_product_count   INTEGER DEFAULT 0,
  has_subscriptions    BOOLEAN DEFAULT FALSE,
  has_bundles          BOOLEAN DEFAULT FALSE,
  has_digital_products BOOLEAN DEFAULT FALSE,
  is_single_product    BOOLEAN DEFAULT FALSE,
  primary_category     TEXT DEFAULT '',        -- detected dominant product category

  -- Shopify details
  shopify_plan         TEXT DEFAULT '',
  shop_currency        TEXT DEFAULT 'USD',
  shop_timezone        TEXT DEFAULT 'America/New_York',

  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_intelligence_status ON store_intelligence(init_status);

-- ============================================================
-- COGS Suggestions — auto-suggested COGS with reasoning
-- ============================================================
CREATE TABLE IF NOT EXISTS cogs_suggestions (
  id              BIGSERIAL PRIMARY KEY,
  store_id        TEXT NOT NULL,
  product_id      TEXT NOT NULL,
  product_title   TEXT DEFAULT '',

  -- Suggested values
  suggested_cost      REAL DEFAULT 0,
  suggested_type      TEXT DEFAULT 'fixed',   -- fixed/percentage
  confidence          REAL DEFAULT 0,         -- 0-1

  -- Reasoning
  reason              TEXT NOT NULL DEFAULT 'unknown',  -- digital_product/category_average/margin_estimate/zero_cost
  reasoning_detail    TEXT DEFAULT '',

  -- Status
  status              TEXT DEFAULT 'pending',  -- pending/accepted/rejected/ignored
  accepted_at         TIMESTAMPTZ,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT cogs_suggestions_store_product_key UNIQUE (store_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cogs_suggestions_store ON cogs_suggestions(store_id);
CREATE INDEX IF NOT EXISTS idx_cogs_suggestions_status ON cogs_suggestions(store_id, status);

-- ============================================================
-- Currency Config — detected currencies per store
-- ============================================================
CREATE TABLE IF NOT EXISTS currency_config (
  id              BIGSERIAL PRIMARY KEY,
  store_id        TEXT NOT NULL UNIQUE,

  -- Detected currencies
  shop_currency       TEXT NOT NULL DEFAULT 'USD',
  presentment_currencies TEXT DEFAULT '',    -- comma-separated if multi-currency enabled
  meta_currencies     JSONB DEFAULT '{}',   -- { "act_123": "USD", "act_456": "EUR" }

  -- Multi-currency features
  has_markets          BOOLEAN DEFAULT FALSE,  -- Shopify Markets enabled
  auto_convert         BOOLEAN DEFAULT TRUE,   -- auto-convert at transaction date rate

  -- Settings
  display_currency     TEXT DEFAULT '',         -- '' = use shop_currency
  rate_source          TEXT DEFAULT 'shopify',  -- shopify/ecb/manual

  detected_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_currency_config_store ON currency_config(store_id);

-- ============================================================
-- Enhance existing tables with new columns
-- ============================================================

-- Add confidence + extra fields to product_classifications if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'confidence') THEN
    ALTER TABLE product_classifications ADD COLUMN confidence REAL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'product_title') THEN
    ALTER TABLE product_classifications ADD COLUMN product_title TEXT DEFAULT '';
  END IF;
END $$;

-- Add campaign_name + product_name to campaign_product_mappings if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_product_mappings' AND column_name = 'campaign_name') THEN
    ALTER TABLE campaign_product_mappings ADD COLUMN campaign_name TEXT DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_product_mappings' AND column_name = 'product_name') THEN
    ALTER TABLE campaign_product_mappings ADD COLUMN product_name TEXT DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_product_mappings' AND column_name = 'last_updated_at') THEN
    ALTER TABLE campaign_product_mappings ADD COLUMN last_updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Add detected fields to store_config if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_config' AND column_name = 'health_score') THEN
    ALTER TABLE store_config ADD COLUMN health_score INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_config' AND column_name = 'intelligence_version') THEN
    ALTER TABLE store_config ADD COLUMN intelligence_version INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add warnings_json to daily_pnl_snapshots for storing data quality warnings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_pnl_snapshots' AND column_name = 'warnings') THEN
    ALTER TABLE daily_pnl_snapshots ADD COLUMN warnings JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_pnl_snapshots' AND column_name = 'product_breakdown') THEN
    ALTER TABLE daily_pnl_snapshots ADD COLUMN product_breakdown JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_pnl_snapshots' AND column_name = 'fee_method') THEN
    ALTER TABLE daily_pnl_snapshots ADD COLUMN fee_method TEXT DEFAULT 'estimated';
  END IF;
END $$;

-- ============================================================
-- RLS Policies (store-level isolation)
-- ============================================================
ALTER TABLE product_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE cogs_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_config ENABLE ROW LEVEL SECURITY;

-- Service role has full access (our API runs as service role)
CREATE POLICY "service_role_all_product_intelligence" ON product_intelligence
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_fee_structures" ON fee_structures
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_store_intelligence" ON store_intelligence
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_cogs_suggestions" ON cogs_suggestions
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all_currency_config" ON currency_config
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
