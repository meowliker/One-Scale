-- ═══════════════════════════════════════════════════════════════
-- Migration 039: Dynamic cron dispatchers — no hardcoded store IDs
--
-- Replaces per-store cron jobs with smart dispatchers that
-- auto-discover all stores. New stores get picked up automatically.
-- Also handles first-time 30-day backfill for new stores.
-- ═══════════════════════════════════════════════════════════════

-- Remove ALL old per-store and hardcoded cron jobs
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN (
    'sync-orders', 'sync-bt', 'meta-spend-sync', 'daily-pnl',
    'daily-pnl-mindart', 'daily-pnl-nirwanna', 'daily-pnl-naiva',
    'daily-pnl-orgbetter', 'daily-pnl-nirwanna2',
    'timezone-pnl-sync', 'product-classification',
    'exchange-rates-sync', 'store-config-sync', 'cleanup-old-data',
    'health-check'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Smart dispatchers — auto-discover stores, no hardcoded IDs
-- ═══════════════════════════════════════════════════════════════

-- 1. Order sync dispatcher (every 30 min)
-- Auto-discovers all stores, dispatches per-store sync
-- New stores get 30-day backfill automatically
SELECT cron.schedule(
  'sync-orders-dispatch',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-git-dev-mahesh-meow-likers-projects.vercel.app/api/cron/sync-orders-dispatch',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 2. Balance transactions sync (every 2 hours)
-- This already handles all stores internally
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

-- 3. Meta spend sync (every 6 hours)
-- This already handles all stores internally
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

-- 4. Daily P&L dispatcher (07:30 UTC = 1:30 AM Costa Rica)
-- Auto-discovers all stores, dispatches per-store P&L computation
-- New stores get 30-day backfill automatically
SELECT cron.schedule(
  'daily-pnl-dispatch',
  '30 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-git-dev-mahesh-meow-likers-projects.vercel.app/api/cron/daily-pnl-dispatch',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Verify all crons
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
