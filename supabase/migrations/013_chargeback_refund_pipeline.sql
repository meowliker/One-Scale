-- 013_chargeback_refund_pipeline.sql
-- Creates tables for Shopify balance transactions, chargebacks, and refunds.
-- Source of truth: Shopify Payments balance/transactions API.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. shopify_balance_transactions — all Shopify Payments balance transactions
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shopify_balance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  transaction_id text NOT NULL,
  type text NOT NULL,        -- charge, refund, dispute, adjustment, credit, reserved_funds
  amount numeric NOT NULL DEFAULT 0,
  fee numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'USD',
  source_order_id text,
  source_type text,
  processed_at timestamptz NOT NULL,
  payout_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_sbt_store_type_date
  ON shopify_balance_transactions(store_id, type, processed_at);
CREATE INDEX IF NOT EXISTS idx_sbt_store_date
  ON shopify_balance_transactions(store_id, processed_at);
CREATE INDEX IF NOT EXISTS idx_sbt_store_order
  ON shopify_balance_transactions(store_id, source_order_id);

-- ══════════════════════════════════════════════════════════════════════════
-- 2. shopify_chargebacks — disputes with full metadata
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shopify_chargebacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  dispute_id text,
  order_id text,
  order_name text,
  amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',   -- lost, won, pending
  reason_code text,
  network_reason_code text,
  initiated_at timestamptz,
  finalized_at timestamptz,
  evidence_due_by timestamptz,
  evidence_sent_on timestamptz,
  net_amount numeric,
  last_synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_chargebacks_store_status
  ON shopify_chargebacks(store_id, status);
CREATE INDEX IF NOT EXISTS idx_chargebacks_store_initiated
  ON shopify_chargebacks(store_id, initiated_at);
CREATE INDEX IF NOT EXISTS idx_chargebacks_store_finalized
  ON shopify_chargebacks(store_id, finalized_at);

-- ══════════════════════════════════════════════════════════════════════════
-- 3. shopify_refunds — clean refund table for querying
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shopify_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  transaction_id text NOT NULL,
  order_id text,
  amount numeric NOT NULL DEFAULT 0,
  fee numeric DEFAULT 0,
  currency text DEFAULT 'USD',
  processed_at timestamptz NOT NULL,
  refund_type text DEFAULT 'standard',   -- standard, partial
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_refunds_store_date
  ON shopify_refunds(store_id, processed_at);
CREATE INDEX IF NOT EXISTS idx_refunds_store_order
  ON shopify_refunds(store_id, order_id);
