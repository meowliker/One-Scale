-- shopify_chargebacks table for storing dispute data from Shopify
-- Used by: webhook handler (orders/chargebacks), sync-shopify-orders cron (GraphQL disputes),
--          daily-pnl-snapshot cron, /api/pnl/chargebacks route

CREATE TABLE IF NOT EXISTS shopify_chargebacks (
  id bigserial PRIMARY KEY,
  store_id text NOT NULL,
  order_id text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  reason text,
  status text NOT NULL DEFAULT 'pending',      -- normalized: lost, won, pending
  shopify_status text,                          -- raw Shopify status: needs_response, under_review, charge_refunded, accepted, won, lost
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_chargebacks_store_date
  ON shopify_chargebacks(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_chargebacks_status
  ON shopify_chargebacks(status);
