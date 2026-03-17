-- Ensure all tables needed by the fix-existing-stores pipeline exist

-- ── 1. daily_pnl_snapshots (never had a CREATE TABLE migration) ─────────────
CREATE TABLE IF NOT EXISTS daily_pnl_snapshots (
  id bigserial PRIMARY KEY,
  store_id text NOT NULL,
  date text NOT NULL,
  revenue numeric(12,2) DEFAULT 0,
  order_count int DEFAULT 0,
  cogs numeric(12,2) DEFAULT 0,
  ad_spend numeric(12,2) DEFAULT 0,
  shipping_cost numeric(12,2) DEFAULT 0,
  transaction_fees numeric(12,2) DEFAULT 0,
  refunds numeric(12,2) DEFAULT 0,
  full_refund_count int DEFAULT 0,
  partial_refund_count int DEFAULT 0,
  full_refund_amount numeric(12,2) DEFAULT 0,
  partial_refund_amount numeric(12,2) DEFAULT 0,
  chargeback_loss numeric(12,2) DEFAULT 0,
  chargeback_won numeric(12,2) DEFAULT 0,
  net_profit numeric(12,2) DEFAULT 0,
  margin numeric(8,2) DEFAULT 0,
  attribution_rate numeric(5,2) DEFAULT 0,
  warnings text,
  product_breakdown text,
  fee_method text,
  synced_at timestamptz DEFAULT now(),
  shopify_synced boolean DEFAULT false,
  meta_synced boolean DEFAULT false,
  currency text DEFAULT 'USD',
  config_version int DEFAULT 1,
  invalidated_at timestamptz,
  invalidated_reason text,
  UNIQUE(store_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_pnl_snapshots_store_date
  ON daily_pnl_snapshots(store_id, date);

-- ── 2. shopify_balance_transactions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_balance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  transaction_id text NOT NULL,
  type text NOT NULL,
  amount numeric DEFAULT 0,
  fee numeric DEFAULT 0,
  net numeric DEFAULT 0,
  currency text DEFAULT 'USD',
  source_order_id text,
  source_type text,
  processed_at timestamptz,
  payout_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_balance_txn_store_type_date
  ON shopify_balance_transactions(store_id, type, processed_at);

-- ── 3. shopify_refunds ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  transaction_id text NOT NULL,
  order_id text,
  amount numeric DEFAULT 0,
  fee numeric DEFAULT 0,
  currency text DEFAULT 'USD',
  processed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_refunds_store_date
  ON shopify_refunds(store_id, processed_at);

-- ── 4. onboarding_progress — create from scratch if missing ─────────────────
CREATE TABLE IF NOT EXISTS onboarding_progress (
  store_id text PRIMARY KEY,
  overall_status text DEFAULT 'pending',
  first_order_date text,
  total_orders int DEFAULT 0,
  estimated_minutes int DEFAULT 0,
  stages jsonb DEFAULT '{}',
  stage_progress jsonb DEFAULT '{}',
  stage_errors jsonb DEFAULT '{}',
  cursors jsonb DEFAULT '{}',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  last_activity_at timestamptz DEFAULT now()
);
