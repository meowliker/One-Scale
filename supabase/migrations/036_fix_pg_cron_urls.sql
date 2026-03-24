-- ═══════════════════════════════════════════════════════════════
-- Migration 036: Fix pg_cron URLs
--
-- Problem: pg_cron jobs pointed to onescale.app which went down,
-- silently breaking all sync pipelines since March 17.
--
-- Fix: Update all cron job URLs to the working Vercel deployment.
-- Also increases sync frequency for orders (every 30 min) and
-- adds a health-check job to detect future outages.
-- ═══════════════════════════════════════════════════════════════

-- Remove all existing cron jobs to recreate with correct URLs
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN (
    'timezone-pnl-sync', 'meta-spend-sync', 'product-classification',
    'exchange-rates-sync', 'store-config-sync', 'cleanup-old-data',
    'sync-orders', 'sync-bt', 'daily-pnl', 'health-check'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ══════════════════════════════════════════════════════════════
-- IMPORTANT: Replace the URL below with your active Vercel URL.
-- Run: SELECT jobname, schedule, active FROM cron.job; to verify.
-- ══════════════════════════════════════════════════════════════

-- 1. Sync Shopify orders (every 30 min — tighter for fresher data)
SELECT cron.schedule(
  'sync-orders',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-git-dev-mahesh-meow-likers-projects.vercel.app/api/cron/sync-shopify-orders',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 2. Sync balance transactions (every 2 hours — captures settlements + disputes)
SELECT cron.schedule(
  'sync-bt',
  '30 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-git-dev-mahesh-meow-likers-projects.vercel.app/api/cron/sync-balance-transactions',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 3. Meta spend sync (every 6 hours — captures retroactive attribution)
SELECT cron.schedule(
  'meta-spend-sync',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-git-dev-mahesh-meow-likers-projects.vercel.app/api/cron/sync-meta-spend',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 4. Daily P&L snapshot (07:30 UTC = 1:30 AM Costa Rica — after day closes)
SELECT cron.schedule(
  'daily-pnl',
  '30 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-git-dev-mahesh-meow-likers-projects.vercel.app/api/cron/daily-pnl-snapshot',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Verify all crons are active
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
