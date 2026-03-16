-- Migration 030: Add individual cost columns to daily_pnl_snapshots
-- Each BT cost type gets its own column — no hidden adjustments

ALTER TABLE daily_pnl_snapshots ADD COLUMN IF NOT EXISTS chargeback_fees numeric(12,2) DEFAULT 0;
ALTER TABLE daily_pnl_snapshots ADD COLUMN IF NOT EXISTS debits numeric(12,2) DEFAULT 0;
ALTER TABLE daily_pnl_snapshots ADD COLUMN IF NOT EXISTS credits numeric(12,2) DEFAULT 0;
ALTER TABLE daily_pnl_snapshots ADD COLUMN IF NOT EXISTS reserve_hold numeric(12,2) DEFAULT 0;

-- Drop the combined adjustments column if it exists (replaced by individual columns above)
-- ALTER TABLE daily_pnl_snapshots DROP COLUMN IF EXISTS adjustments;
