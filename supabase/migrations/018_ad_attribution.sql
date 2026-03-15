-- 018_ad_attribution.sql
-- PRISM Ad Attribution & Multi-Signal Classification

-- Campaign Product Attributions: stores detected campaign→product links
CREATE TABLE IF NOT EXISTS campaign_product_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  product_id text NOT NULL,
  product_title text,
  confidence numeric(5,2) NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'proportional',
  sessions_tracked integer DEFAULT 0,
  conversions_tracked integer DEFAULT 0,
  correlation_score numeric(5,4) DEFAULT 0,
  creative_url text,
  last_computed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_cpa_store ON campaign_product_attributions(store_id);
CREATE INDEX IF NOT EXISTS idx_cpa_product ON campaign_product_attributions(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_cpa_method ON campaign_product_attributions(store_id, method);

-- Product Signal Scores: per-product breakdown of ALL classification signals
CREATE TABLE IF NOT EXISTS product_signal_scores (
  store_id text NOT NULL,
  product_id text NOT NULL,
  score_own_campaigns numeric DEFAULT 0,
  score_ad_landing numeric DEFAULT 0,
  score_direct_spend_share numeric DEFAULT 0,
  score_alone_rate numeric DEFAULT 0,
  score_position numeric DEFAULT 0,
  score_revenue_share numeric DEFAULT 0,
  score_title_keywords numeric DEFAULT 0,
  score_product_type_tags numeric DEFAULT 0,
  score_price_relative numeric DEFAULT 0,
  score_description_keywords numeric DEFAULT 0,
  score_product_handle numeric DEFAULT 0,
  score_compare_at_price numeric DEFAULT 0,
  score_session_entry numeric DEFAULT 0,
  score_traffic_source numeric DEFAULT 0,
  score_add_to_cart_source numeric DEFAULT 0,
  score_first_order_appearance numeric DEFAULT 0,
  score_refund_rate numeric DEFAULT 0,
  total_score numeric DEFAULT 0,
  signal_count integer DEFAULT 0,
  classification text,
  confidence integer DEFAULT 0,
  primary_signal text,
  computed_at timestamptz DEFAULT now(),
  PRIMARY KEY (store_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_pss_classification ON product_signal_scores(store_id, classification);

-- Extend product_classifications with ad signal columns
ALTER TABLE product_classifications
  ADD COLUMN IF NOT EXISTS product_handle text,
  ADD COLUMN IF NOT EXISTS has_own_campaigns boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ad_landing_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_signal_confidence numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_signal_method text;
