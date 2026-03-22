-- ═══════════════════════════════════════════════════════════════
-- Migration 038: Per-store daily P&L cron
--
-- Problem: Single daily-pnl cron processes ALL stores sequentially,
-- timing out on Vercel's 60s hobby plan limit. Stores processed
-- later in the list never get their snapshots computed.
--
-- Fix: Separate cron job per store, staggered by 2 minutes.
-- Each store gets its own invocation within the 60s limit.
-- ═══════════════════════════════════════════════════════════════

-- Remove old all-stores daily-pnl job
DO $$
BEGIN
  PERFORM cron.unschedule('daily-pnl');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Per-store daily P&L snapshot jobs (07:30-07:40 UTC, 2min apart)
-- Store order: Minding Art, Nirwanna, others

SELECT cron.schedule(
  'daily-pnl-mindart',
  '30 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-git-dev-mahesh-meow-likers-projects.vercel.app/api/cron/daily-pnl-snapshot?store_id=store-b8eea935d87e',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'daily-pnl-nirwanna',
  '32 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-git-dev-mahesh-meow-likers-projects.vercel.app/api/cron/daily-pnl-snapshot?store_id=store-5ab34cd6ca2c',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'daily-pnl-naiva',
  '34 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-git-dev-mahesh-meow-likers-projects.vercel.app/api/cron/daily-pnl-snapshot?store_id=store-b1d6fbbb0af4',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'daily-pnl-orgbetter',
  '36 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-git-dev-mahesh-meow-likers-projects.vercel.app/api/cron/daily-pnl-snapshot?store_id=store-e4c8ec94a8d6',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'daily-pnl-nirwanna2',
  '38 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://one-scale-git-dev-mahesh-meow-likers-projects.vercel.app/api/cron/daily-pnl-snapshot?store_id=store-b3739094fce8',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Verify
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
