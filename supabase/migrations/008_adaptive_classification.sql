-- 008_adaptive_classification.sql
-- Extends store_intelligence + product_classifications for adaptive product classification
-- Run after 007_adaptive_intelligence.sql

-- ── 1. Extend store_intelligence with store type detection ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'store_type') THEN
    ALTER TABLE store_intelligence ADD COLUMN store_type TEXT DEFAULT 'mixed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'store_type_confidence') THEN
    ALTER TABLE store_intelligence ADD COLUMN store_type_confidence INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'store_type_signals') THEN
    ALTER TABLE store_intelligence ADD COLUMN store_type_signals JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'has_upsell_app') THEN
    ALTER TABLE store_intelligence ADD COLUMN has_upsell_app BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'merchant_confirmed_type') THEN
    ALTER TABLE store_intelligence ADD COLUMN merchant_confirmed_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'avg_products_per_order') THEN
    ALTER TABLE store_intelligence ADD COLUMN avg_products_per_order REAL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'avg_order_value') THEN
    ALTER TABLE store_intelligence ADD COLUMN avg_order_value REAL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'total_active_products') THEN
    ALTER TABLE store_intelligence ADD COLUMN total_active_products INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'store_type_detected_at') THEN
    ALTER TABLE store_intelligence ADD COLUMN store_type_detected_at TIMESTAMPTZ;
  END IF;
END $$;

-- ── 2. Extend product_classifications for signal stack ──────────────────────
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

-- ── 3. Indexes for new columns ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_product_classifications_needs_review
  ON product_classifications(store_id, needs_review) WHERE needs_review = TRUE;
CREATE INDEX IF NOT EXISTS idx_product_classifications_classification
  ON product_classifications(store_id, classification);
