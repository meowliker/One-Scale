-- 023_store_payouts.sql
-- Store payout summary fields for exact P&L (same as Apps Script)

CREATE TABLE IF NOT EXISTS store_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  payout_id text NOT NULL,
  payout_date date NOT NULL,
  status text NOT NULL,
  currency text DEFAULT 'USD',
  amount numeric DEFAULT 0,
  charges_gross numeric DEFAULT 0,
  charges_fee numeric DEFAULT 0,
  refunds_gross numeric DEFAULT 0,
  refunds_fee numeric DEFAULT 0,
  adjustments_gross numeric DEFAULT 0,
  adjustments_fee numeric DEFAULT 0,
  reserved_gross numeric DEFAULT 0,
  reserved_fee numeric DEFAULT 0,
  retried_gross numeric DEFAULT 0,
  retried_fee numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, payout_id)
);

CREATE INDEX IF NOT EXISTS idx_store_payouts_date ON store_payouts(store_id, payout_date DESC);
