-- 020_novel_signals_audit.sql
-- PRISM Novel Signal Sources + Audit Infrastructure

-- ── Novel signal scores on product_signal_scores ──
ALTER TABLE product_signal_scores
  ADD COLUMN IF NOT EXISTS score_line_item_properties numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_creation_timestamp numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_time_to_purchase numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_variant_options numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_facebook_catalog numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_checkout_extension numeric DEFAULT 0;

-- ── Novel signal columns on product_classifications ──
ALTER TABLE product_classifications
  ADD COLUMN IF NOT EXISTS line_item_upsell_stamp boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS variant_option_signal text,
  ADD COLUMN IF NOT EXISTS creation_age_percentile numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS median_time_to_purchase_seconds numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS in_facebook_catalog boolean;

-- ── Missing attribution window columns on meta_spend_cache ──
ALTER TABLE meta_spend_cache
  ADD COLUMN IF NOT EXISTS purchases_7d_click integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_value_7d_click numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchases_1d_view integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_value_1d_view numeric(12,2) DEFAULT 0;
