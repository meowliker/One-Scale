-- Migration 030: Add adjustments column to daily_pnl_snapshots
-- Tracks BT adjustments/debits/credits that affect P&L

ALTER TABLE daily_pnl_snapshots ADD COLUMN IF NOT EXISTS adjustments numeric(12,2) DEFAULT 0;
