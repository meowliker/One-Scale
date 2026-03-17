-- 011_adaptive_pipeline.sql
-- Creates tables for adaptive P&L pipeline + onboarding + platform learning

-- ══════════════════════════════════════════════════════════════
-- 1. fee_intelligence — learned fee rates per store
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fee_intelligence (
  store_id text PRIMARY KEY,
  learned_rates jsonb DEFAULT '[]',
  last_api_success timestamptz,
  fee_variance numeric DEFAULT 0,
  multi_gateway boolean DEFAULT false,
  computed_at timestamptz DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════
-- 2. platform_settings — global tunable platform parameters
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════
-- 3. classification_corrections — merchant corrections for learning
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS classification_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  product_id text NOT NULL,
  from_classification text NOT NULL,
  to_classification text NOT NULL,
  signals_at_correction text,
  corrected_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corrections_store ON classification_corrections(store_id);
CREATE INDEX IF NOT EXISTS idx_corrections_date ON classification_corrections(corrected_at DESC);

-- ══════════════════════════════════════════════════════════════
-- 4. onboarding_progress — store onboarding state tracking
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS onboarding_progress (
  store_id text PRIMARY KEY,
  first_order_date date,
  total_orders int DEFAULT 0,
  estimated_minutes int DEFAULT 0,
  stages jsonb DEFAULT '{}',
  stage_progress jsonb DEFAULT '{}',
  cursors jsonb DEFAULT '{}',
  stage_errors jsonb DEFAULT '{}',
  overall_status text DEFAULT 'in_progress',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  last_activity_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_status ON onboarding_progress(overall_status);
CREATE INDEX IF NOT EXISTS idx_onboarding_activity ON onboarding_progress(last_activity_at);

-- ══════════════════════════════════════════════════════════════
-- 5. Add source column to pnl_product_costs for Shopify cost tracking
-- ══════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pnl_product_costs' AND column_name = 'source') THEN
    ALTER TABLE pnl_product_costs ADD COLUMN source text DEFAULT 'user_configured';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pnl_product_costs' AND column_name = 'product_title') THEN
    ALTER TABLE pnl_product_costs ADD COLUMN product_title text;
  END IF;
END $$;
