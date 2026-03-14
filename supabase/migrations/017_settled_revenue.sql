-- Migration 017: Add settled revenue columns to daily_pnl_snapshots
ALTER TABLE daily_pnl_snapshots ADD COLUMN IF NOT EXISTS gross_revenue numeric(12,2) DEFAULT 0;
ALTER TABLE daily_pnl_snapshots ADD COLUMN IF NOT EXISTS settled_revenue numeric(12,2) DEFAULT 0;
ALTER TABLE daily_pnl_snapshots ADD COLUMN IF NOT EXISTS revenue_source text DEFAULT 'orders_api';
