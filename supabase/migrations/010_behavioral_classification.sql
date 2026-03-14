-- 010_behavioral_classification.sql
-- Self-contained migration: creates product_classifications (if missing from 004),
-- adds all columns from 007/008, then creates behavioral classification tables.
-- Safe to run multiple times (all IF NOT EXISTS / IF NOT EXISTS guards).

-- ══════════════════════════════════════════════════════════════════════════
-- 1. product_classifications — base table (from 004)
-- ══════════════════════════════════════════════════════════════════════════
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

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Columns added by 007 (confidence, product_title)
-- ══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'confidence') THEN
    ALTER TABLE product_classifications ADD COLUMN confidence REAL DEFAULT 0;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Columns added by 008 (signal stack classification)
-- ══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'signals_used') THEN
    ALTER TABLE product_classifications ADD COLUMN signals_used JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'alone_pct') THEN
    ALTER TABLE product_classifications ADD COLUMN alone_pct REAL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'first_position_pct') THEN
    ALTER TABLE product_classifications ADD COLUMN first_position_pct REAL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'avg_position') THEN
    ALTER TABLE product_classifications ADD COLUMN avg_position REAL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'revenue_share') THEN
    ALTER TABLE product_classifications ADD COLUMN revenue_share REAL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'total_orders_analyzed') THEN
    ALTER TABLE product_classifications ADD COLUMN total_orders_analyzed INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'needs_review') THEN
    ALTER TABLE product_classifications ADD COLUMN needs_review BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'classification_method') THEN
    ALTER TABLE product_classifications ADD COLUMN classification_method TEXT DEFAULT 'signal_stack';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'product_type') THEN
    ALTER TABLE product_classifications ADD COLUMN product_type TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'manual_override_by') THEN
    ALTER TABLE product_classifications ADD COLUMN manual_override_by TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'manual_override_at') THEN
    ALTER TABLE product_classifications ADD COLUMN manual_override_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'last_analyzed') THEN
    ALTER TABLE product_classifications ADD COLUMN last_analyzed TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_classifications_needs_review
  ON product_classifications(store_id, needs_review) WHERE needs_review = TRUE;
CREATE INDEX IF NOT EXISTS idx_product_classifications_classification
  ON product_classifications(store_id, classification);

-- ══════════════════════════════════════════════════════════════════════════
-- 4. Behavioral fields on product_classifications (new in 010)
-- ══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'behavioral_signals') THEN
    ALTER TABLE product_classifications ADD COLUMN behavioral_signals JSONB DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'parent_product') THEN
    ALTER TABLE product_classifications ADD COLUMN parent_product TEXT;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. store_behavior_profiles — store-level behavior profile (recomputed weekly)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS store_behavior_profiles (
  store_id text PRIMARY KEY,
  avg_items_per_order numeric DEFAULT 1,
  single_item_order_rate numeric DEFAULT 1,
  multi_item_order_rate numeric DEFAULT 0,
  funnel_signal_strength numeric DEFAULT 0,
  median_alone_rate numeric DEFAULT 1,
  p25_alone_rate numeric DEFAULT 0,
  p75_alone_rate numeric DEFAULT 1,
  median_revenue_share numeric DEFAULT 0,
  top_product_revenue_share numeric DEFAULT 1,
  inferred_structure text DEFAULT 'catalog',
  computed_at timestamptz DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════
-- 6. product_behaviors — raw behavioral signals per product
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS product_behaviors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  product_id text NOT NULL,
  product_title text,
  total_orders int DEFAULT 0,
  alone_orders int DEFAULT 0,
  alone_rate numeric DEFAULT 0,
  first_position_orders int DEFAULT 0,
  first_rate numeric DEFAULT 0,
  avg_position numeric DEFAULT 1,
  total_revenue numeric DEFAULT 0,
  revenue_share numeric DEFAULT 0,
  avg_order_value_with numeric DEFAULT 0,
  avg_order_value_without numeric DEFAULT 0,
  co_occurrence_rate numeric DEFAULT 0,
  value_lift numeric DEFAULT 0,
  top_companions jsonb DEFAULT '[]',
  first_seen date,
  last_seen date,
  active_days int DEFAULT 0,
  computed_at timestamptz DEFAULT now(),
  UNIQUE(store_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_behaviors_store ON product_behaviors(store_id);
CREATE INDEX IF NOT EXISTS idx_product_behaviors_alone ON product_behaviors(store_id, alone_rate DESC);
