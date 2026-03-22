-- ═══════════════════════════════════════════════════════════════
-- Migration 040: Production cron URLs
--
-- Run this AFTER setting up onescale.app domain in Vercel.
-- Points all pg_cron jobs to the stable production domain.
-- After this, merges to main auto-deploy — zero manual steps.
--
-- IF NOT using onescale.app, replace the URL below with your
-- Vercel production URL before running.
-- ═══════════════════════════════════════════════════════════════

-- Remove all existing cron jobs
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN (
    'sync-orders-dispatch', 'sync-bt', 'meta-spend-sync',
    'daily-pnl-dispatch', 'sync-orders',
    'daily-pnl-mindart', 'daily-pnl-nirwanna', 'daily-pnl-naiva',
    'daily-pnl-orgbetter', 'daily-pnl-nirwanna2', 'daily-pnl'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- CHANGE THIS URL to your production domain
-- ═══════════════════════════════════════════════════════════════
-- Option 1: Custom domain
--   'https://onescale.app'
-- Option 2: Vercel production URL
--   'https://one-scale.vercel.app'
-- Option 3: Branch preview (current)
--   'https://one-scale-git-dev-mahesh-meow-likers-projects.vercel.app'

-- 1. Order sync dispatcher (every 30 min) — auto-discovers all stores
SELECT cron.schedule(
  'sync-orders-dispatch',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://onescale.app/api/cron/sync-orders-dispatch',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 2. Balance transactions sync (every 2 hours)
SELECT cron.schedule(
  'sync-bt',
  '30 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://onescale.app/api/cron/sync-balance-transactions',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 3. Meta spend sync (every hour)
SELECT cron.schedule(
  'meta-spend-sync',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://onescale.app/api/cron/sync-meta-spend',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 4. Daily P&L dispatcher (07:30 UTC) — auto-discovers all stores
SELECT cron.schedule(
  'daily-pnl-dispatch',
  '30 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://onescale.app/api/cron/daily-pnl-dispatch',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Verify
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
