-- 022_cogs_new_products_gaps.sql
-- COGS detection, new product handling, store type detection

-- ── Store type detection for COGS display ──
ALTER TABLE store_config
  ADD COLUMN IF NOT EXISTS is_digital_store boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cogs_applicable boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS first_order_date date;

-- ── COGS source tracking on pnl_product_costs ──
ALTER TABLE pnl_product_costs
  ADD COLUMN IF NOT EXISTS variant_id text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- ── New product tracking ──
ALTER TABLE product_classifications
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_count_at_classification integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_reason text;
