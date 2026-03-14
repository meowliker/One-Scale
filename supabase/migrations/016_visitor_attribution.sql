-- Migration 016: Visitor-level attribution system
-- Adds product tracking to pixel events and creates visitor session attribution table

-- ── 1. Add product fields to pixel_events ──────────────────────────────────────
ALTER TABLE pixel_events ADD COLUMN IF NOT EXISTS product_id text;
ALTER TABLE pixel_events ADD COLUMN IF NOT EXISTS product_title text;
ALTER TABLE pixel_events ADD COLUMN IF NOT EXISTS variant_id text;

CREATE INDEX IF NOT EXISTS idx_pixel_events_product
  ON pixel_events(store_id, product_id) WHERE product_id IS NOT NULL;

-- ── 2. visitor_attribution — per-session visitor journey tracking ────────────
CREATE TABLE IF NOT EXISTS visitor_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  visitor_id text NOT NULL,
  session_id text NOT NULL,
  fbclid text,
  gclid text,
  ttclid text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  first_product_viewed_id text,
  first_product_viewed_title text,
  last_product_viewed_id text,
  products_viewed jsonb DEFAULT '[]',
  product_added_to_cart_id text,
  landing_page_url text,
  session_started_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  order_id text,
  order_total numeric,
  attributed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, visitor_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_va_store_visitor
  ON visitor_attribution(store_id, visitor_id);
CREATE INDEX IF NOT EXISTS idx_va_store_fbclid
  ON visitor_attribution(store_id, fbclid) WHERE fbclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_va_store_campaign
  ON visitor_attribution(store_id, utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_va_store_order
  ON visitor_attribution(store_id, order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_va_store_session_time
  ON visitor_attribution(store_id, session_started_at);
