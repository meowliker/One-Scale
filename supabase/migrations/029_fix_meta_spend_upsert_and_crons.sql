-- ═══════════════════════════════════════════════════════════════
-- Migration 029: Fix meta_spend_cache upsert + update cron URLs
--
-- Problem: meta_spend_cache has NO unique constraint, so
-- Prefer: resolution=merge-duplicates does nothing — stale data
-- never gets updated on re-sync.
--
-- Fix: Add unique constraint on (store_id, ad_account_id, ad_id, date)
-- so upserts actually UPDATE existing rows with fresh spend data.
-- ═══════════════════════════════════════════════════════════════

-- 1. Add ad_account_id column if missing (older tables might not have it)
ALTER TABLE meta_spend_cache ADD COLUMN IF NOT EXISTS ad_account_id text;

-- 2. Add updated_at column if missing
ALTER TABLE meta_spend_cache ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

-- 3. Remove any duplicate rows before adding unique constraint
-- Keep the row with highest spend (most complete data)
DELETE FROM meta_spend_cache a
USING meta_spend_cache b
WHERE a.ctid < b.ctid
  AND a.store_id = b.store_id
  AND COALESCE(a.ad_account_id, '') = COALESCE(b.ad_account_id, '')
  AND COALESCE(a.ad_id, '') = COALESCE(b.ad_id, '')
  AND a.date = b.date;

-- 4. Add the UNIQUE constraint so upserts work (IF NOT EXISTS)
DO $$
BEGIN
  ALTER TABLE meta_spend_cache
    ADD CONSTRAINT meta_spend_cache_upsert_key
    UNIQUE (store_id, ad_account_id, ad_id, date);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- 5. Auto-update updated_at on upsert
CREATE OR REPLACE FUNCTION update_meta_spend_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meta_spend_cache_updated ON meta_spend_cache;
CREATE TRIGGER meta_spend_cache_updated
  BEFORE INSERT OR UPDATE ON meta_spend_cache
  FOR EACH ROW EXECUTE FUNCTION update_meta_spend_timestamp();

-- ═══════════════════════════════════════════════════════════════
-- 6. Update pg_cron jobs with correct URLs and schedule
--    Runs AFTER store midnight (Costa Rica UTC-6 → 06:00 UTC)
--    with proper spacing between jobs
-- ═══════════════════════════════════════════════════════════════

-- Remove old cron jobs
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN (
    'timezone-pnl-sync', 'meta-spend-sync', 'product-classification',
    'exchange-rates-sync', 'store-config-sync', 'cleanup-old-data',
    'sync-orders', 'sync-bt', 'daily-pnl'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- NOTE: Replace YOUR_APP_URL below with your actual deployment URL
-- e.g., https://onescale.app or https://your-project.vercel.app

-- 6a. Sync Shopify orders (every hour — keeps order cache fresh)
SELECT cron.schedule(
  'sync-orders',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://onescale.app/api/cron/sync-shopify-orders',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 6b. Sync balance transactions (every 2 hours — captures settlements)
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

-- 6c. Meta spend sync (every 6 hours — captures retroactive attribution)
SELECT cron.schedule(
  'meta-spend-sync',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://onescale.app/api/cron/sync-meta-spend',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 6d. Daily P&L snapshot (07:30 UTC = 1:30 AM Costa Rica — after day closes)
SELECT cron.schedule(
  'daily-pnl',
  '30 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://onescale.app/api/cron/daily-pnl-snapshot',
    headers := '{"Authorization": "Bearer sync-secret-20260304-onescale", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Verify
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
