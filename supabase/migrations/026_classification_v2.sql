-- Classification V2: store model, parent products, learning, health checks

-- Add store_model to store_config
ALTER TABLE store_config ADD COLUMN IF NOT EXISTS store_model text;
-- Values: free_plus_shipping, tripwire, standard, high_ticket, subscription,
--         bundle, digital, dropshipping, multi_product, hybrid

-- Add parent product + relationship columns to product_classifications
ALTER TABLE product_classifications ADD COLUMN IF NOT EXISTS relationship_type text;
-- Values: upsell_of, downsell_of, bundle_with, standalone

-- Classification learnings — every merchant correction saved
CREATE TABLE IF NOT EXISTS classification_learnings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id text NOT NULL,
  product_id text NOT NULL,
  correct_classification text NOT NULL,
  previous_classification text,
  signals_at_time jsonb,
  learned_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_classification_learnings_store
  ON classification_learnings (store_id, learned_at DESC);

-- Store signal weights — per-store weight tuning from corrections
CREATE TABLE IF NOT EXISTS store_signal_weights (
  store_id text NOT NULL,
  signal_name text NOT NULL,
  weight numeric DEFAULT 1.0,
  correct_count int DEFAULT 0,
  wrong_count int DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (store_id, signal_name)
);

-- Classification health — validation results
CREATE TABLE IF NOT EXISTS classification_health (
  store_id text PRIMARY KEY,
  checks_passed boolean DEFAULT true,
  warnings jsonb DEFAULT '[]'::jsonb,
  main_count int DEFAULT 0,
  upsell_count int DEFAULT 0,
  pending_count int DEFAULT 0,
  review_count int DEFAULT 0,
  store_model text,
  checked_at timestamptz DEFAULT now()
);
