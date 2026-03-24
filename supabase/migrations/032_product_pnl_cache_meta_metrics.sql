-- Add Meta ad metrics + classification to product_pnl_cache for instant frontend loading

ALTER TABLE product_pnl_cache
  ADD COLUMN IF NOT EXISTS classification text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS impressions integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchases integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_image text;

-- Index for fast frontend reads: all products for a store on a date
CREATE INDEX IF NOT EXISTS idx_product_pnl_cache_store_date
  ON product_pnl_cache (store_id, date, classification);
