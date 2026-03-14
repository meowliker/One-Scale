-- Behavioral product classification engine tables

-- Store behavior profile (recomputed weekly)
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

-- Raw behavioral signals per product (recomputed on each classification run)
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

-- Add behavioral fields to existing product_classifications table
ALTER TABLE product_classifications ADD COLUMN IF NOT EXISTS behavioral_signals jsonb DEFAULT '[]';
ALTER TABLE product_classifications ADD COLUMN IF NOT EXISTS parent_product text;
