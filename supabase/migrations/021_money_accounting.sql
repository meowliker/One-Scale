-- 021_money_accounting.sql
-- Zero money unaccounted — every cent tracked

-- ── PRISM Alerts table ──
CREATE TABLE IF NOT EXISTS prism_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  message text NOT NULL,
  details jsonb,
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_prism_alerts_store
  ON prism_alerts(store_id, resolved, severity);
CREATE INDEX IF NOT EXISTS idx_prism_alerts_unresolved
  ON prism_alerts(resolved, created_at DESC) WHERE resolved = false;

-- ── Extended P&L columns on daily_pnl_snapshots ──
ALTER TABLE daily_pnl_snapshots
  ADD COLUMN IF NOT EXISTS chargeback_won numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_funds numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketplace_tax numeric DEFAULT 0;
