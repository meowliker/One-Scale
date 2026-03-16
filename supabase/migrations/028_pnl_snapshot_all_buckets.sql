-- Migration 028: Add all BT bucket columns to daily_pnl_snapshots
-- Run in Supabase SQL Editor

ALTER TABLE daily_pnl_snapshots
  ADD COLUMN IF NOT EXISTS adjustment numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_funds numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketplace_tax numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_protection numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_income numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_expense numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capital_repayment numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_revenue numeric DEFAULT 0;
