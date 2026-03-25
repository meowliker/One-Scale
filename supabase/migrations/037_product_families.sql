-- ═══════════════════════════════════════════════════════════════
-- Migration 037: Product Families
--
-- Tracks parent-child product relationships for P&L rollup.
-- Children (upsells/downsells/bumps/addons) roll up to main products.
-- Scanned from 29-day order window, refreshed every cron cycle.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_families (
  store_id           text NOT NULL,
  child_product_id   text NOT NULL,
  parent_product_id  text NOT NULL,
  child_title        text,
  parent_title       text,
  relationship       text DEFAULT 'upsell',        -- upsell | downsell | popup | bump | addon
  co_occurrence      numeric DEFAULT 0,             -- % of child orders containing this parent (0-100)
  detection_method   text DEFAULT 'order_cooccurrence', -- order_cooccurrence | keyword_match | price_heuristic | manual_override
  window_order_count integer DEFAULT 0,             -- orders in current 29-day window for this relationship
  last_scanned_at    timestamptz DEFAULT now(),
  created_at         timestamptz DEFAULT now(),
  PRIMARY KEY (store_id, child_product_id, parent_product_id)
);

-- Fast lookups: "give me all children of this parent"
CREATE INDEX IF NOT EXISTS idx_product_families_parent
  ON product_families(store_id, parent_product_id);

-- Stale cleanup: "find relationships not scanned recently"
CREATE INDEX IF NOT EXISTS idx_product_families_stale
  ON product_families(store_id, last_scanned_at);

-- Store isolation
CREATE INDEX IF NOT EXISTS idx_product_families_store
  ON product_families(store_id);

-- ═══════════════════════════════════════════════════════════════
-- Ad URL attribution: store destination URL from ad creative
-- Added to existing meta_spend_cache (zero extra API calls —
-- just adds website_url field to existing insights fetch)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE meta_spend_cache ADD COLUMN IF NOT EXISTS destination_url text;
