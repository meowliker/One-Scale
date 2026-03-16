-- ═══════════════════════════════════════════════════════════════
-- Migration 027: Move all crons to Supabase pg_cron
-- Run this in Supabase SQL Editor (requires pg_cron + pg_net extensions)
--
-- Values are hardcoded inline. To change URL or secret, unschedule
-- and re-create the affected cron jobs.
-- ═══════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Remove any existing cron jobs first ──────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN (
    'timezone-pnl-sync', 'meta-spend-sync', 'product-classification',
    'exchange-rates-sync', 'cleanup-old-data', 'health-check',
    'store-config-sync'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 1. TIMEZONE P&L SYNC (every hour)
--    Syncs each store's P&L when their day ends (midnight in store TZ)
-- ═══════════════════════════════════════════════════════════════
SELECT cron.schedule(
  'timezone-pnl-sync',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-nine.vercel.app/api/cron/timezone-sync',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ═══════════════════════════════════════════════════════════════
-- 2. META SPEND SYNC (every 6 hours)
-- ═══════════════════════════════════════════════════════════════
SELECT cron.schedule(
  'meta-spend-sync',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-nine.vercel.app/api/cron/sync-meta-spend',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ═══════════════════════════════════════════════════════════════
-- 3. PRODUCT CLASSIFICATION (daily 3am UTC)
-- ═══════════════════════════════════════════════════════════════
SELECT cron.schedule(
  'product-classification',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-nine.vercel.app/api/cron/classify-products',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ═══════════════════════════════════════════════════════════════
-- 4. EXCHANGE RATES (daily 1am UTC)
-- ═══════════════════════════════════════════════════════════════
SELECT cron.schedule(
  'exchange-rates-sync',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-nine.vercel.app/api/cron/refresh-exchange-rates',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ═══════════════════════════════════════════════════════════════
-- 5. STORE CONFIG SYNC (daily 2am UTC)
-- ═══════════════════════════════════════════════════════════════
SELECT cron.schedule(
  'store-config-sync',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-nine.vercel.app/api/cron/sync-store-configs',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ═══════════════════════════════════════════════════════════════
-- 6. CLEANUP OLD DATA (daily 4am UTC) — 30 day retention
-- ═══════════════════════════════════════════════════════════════
SELECT cron.schedule(
  'cleanup-old-data',
  '0 4 * * *',
  $$
  DELETE FROM shopify_balance_transactions
  WHERE processed_at < NOW() - INTERVAL '30 days';

  DELETE FROM shopify_orders_cache
  WHERE created_at < NOW() - INTERVAL '30 days';

  DELETE FROM daily_pnl_snapshots
  WHERE date::date < CURRENT_DATE - 30;

  DELETE FROM product_pnl_cache
  WHERE computed_at < NOW() - INTERVAL '30 days';

  DELETE FROM meta_spend_cache
  WHERE date::date < CURRENT_DATE - 30;

  DELETE FROM tracking_events
  WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);

-- ═══════════════════════════════════════════════════════════════
-- Verify all crons are active
-- ═══════════════════════════════════════════════════════════════
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
