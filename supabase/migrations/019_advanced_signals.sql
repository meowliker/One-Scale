-- 019_advanced_signals.sql
-- PRISM Advanced Classification Signals + Network Intelligence

-- ── Track original vs updated line items for post-purchase detection ──
ALTER TABLE shopify_orders_cache
  ADD COLUMN IF NOT EXISTS original_line_item_ids text,
  ADD COLUMN IF NOT EXISTS added_line_item_ids text,
  ADD COLUMN IF NOT EXISTS line_items_changed_at timestamptz;

-- ── LLM classification cache on product_classifications ──
ALTER TABLE product_classifications
  ADD COLUMN IF NOT EXISTS llm_classification text,
  ADD COLUMN IF NOT EXISTS llm_confidence integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS llm_reasoning text,
  ADD COLUMN IF NOT EXISTS llm_classified_at timestamptz;

-- ── Advanced signal columns on product_classifications ──
ALTER TABLE product_classifications
  ADD COLUMN IF NOT EXISTS is_post_purchase_upsell boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS upsell_app_detected text,
  ADD COLUMN IF NOT EXISTS sku_pattern_signal text,
  ADD COLUMN IF NOT EXISTS price_aov_ratio numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repeat_purchase_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_customer_rate numeric DEFAULT 0;

-- ── Network Product Archetypes (cross-store learning) ──
CREATE TABLE IF NOT EXISTS network_product_archetypes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archetype_name text NOT NULL,
  predicted_classification text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0,

  -- Price patterns
  price_range_min numeric,
  price_range_max numeric,
  price_aov_ratio_min numeric,
  price_aov_ratio_max numeric,

  -- Title keyword patterns (learned from data, not hardcoded)
  title_keywords_positive text[] DEFAULT '{}',
  title_keywords_negative text[] DEFAULT '{}',

  -- Product characteristics
  is_digital boolean,
  typical_image_count_min integer,
  typical_image_count_max integer,
  has_variants boolean,
  typical_variant_count integer,

  -- Training metrics
  training_store_count integer DEFAULT 0,
  training_product_count integer DEFAULT 0,
  validation_accuracy numeric DEFAULT 0,

  last_trained_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npa_classification
  ON network_product_archetypes(predicted_classification);
CREATE INDEX IF NOT EXISTS idx_npa_accuracy
  ON network_product_archetypes(validation_accuracy DESC);

-- ── Post-purchase upsell tracking ──
CREATE TABLE IF NOT EXISTS post_purchase_upsell_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  order_id text NOT NULL,
  product_id text NOT NULL,
  product_title text,
  detected_at timestamptz DEFAULT now(),
  order_created_at timestamptz,
  line_item_added_at timestamptz,
  hours_after_purchase numeric,
  UNIQUE(store_id, order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_ppue_store_product
  ON post_purchase_upsell_events(store_id, product_id);
