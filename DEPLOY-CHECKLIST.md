# OneScale Deploy Checklist — March 16, 2026

## Current State (as of March 15, evening)

**Branch:** `dev/mahesh` — 266 files changed, 64,132 insertions vs `main`
**Build status:** PASSES cleanly (no errors, no warnings)
**Scope:** Full PRISM pipeline, P&L system, intelligence engine, attribution pixel, cron infrastructure

---

## Fixes Applied Tonight (local, not pushed)

1. **Middleware 401 fix** — added `/api/sync/` and `/api/tracking/cron-backfill` to `PUBLIC_API_PREFIXES`
   - Root cause of "Background Data Sync" workflow 401 failures
   - These routes handle their own CRON_SECRET auth internally

2. **Auth bypass fix** — `sync/cron` and `sync/pnl-cache` routes had conditional auth (`if (CRON_SECRET)`)
   - Changed to require auth always; returns 500 if CRON_SECRET not configured

3. **PRISM Ad Attribution System** (NEW — 1,124 lines of new code)
   - `src/lib/prism/adAttribution.ts` — 4-method campaign→product detection engine
   - `src/lib/prism/signalScorer.ts` — 15+ signal product classification scorer
   - `src/app/api/cron/compute-ad-attribution/route.ts` — cron endpoint
   - `src/app/api/admin/ad-attribution-report/route.ts` — diagnostic report
   - `supabase/migrations/018_ad_attribution.sql` — new tables + columns
   - Modified: signalStackClassifier (2 new ad signals), classificationRouter (ad signal integration), metaSpendAttributor (PRISM priority), types (AdSignals interface)

4. **PRISM Advanced Classification Signals** (NEW — 1,439 lines of new code)
   - `src/lib/intelligence/postPurchaseDetector.ts` — Tier 1: detect products added to orders post-checkout (100% confidence)
   - `src/lib/intelligence/llmClassifier.ts` — Tier 2: Claude API product classification (~$0.001/product)
   - `src/lib/intelligence/advancedSignals.ts` — Tier 1-3: SKU pattern detection, upsell app metafields, price/AOV ratio, repeat purchase rate, new/returning customer rate
   - `src/lib/intelligence/networkIntelligence.ts` — Cross-store archetype training + inference
   - `src/app/api/cron/train-network-archetypes/route.ts` — weekly network training cron
   - `src/app/api/admin/classification-report/route.ts` — comprehensive classification report
   - `supabase/migrations/019_advanced_signals.sql` — columns + tables for all new signals
   - Modified: classificationRouter.ts (Tier 1 cascade before behavioral analysis)

---

## Deployment Steps (Tomorrow)

### Step 1: Push to main
```bash
git checkout main
git merge dev/mahesh
git push origin main
```
This triggers Vercel deployment.

### Step 2: Verify Vercel deployment succeeds
- Check Vercel dashboard for build completion
- Confirm no build errors in Vercel logs
- Test app loads at onescale.app

### Step 3: Run database migrations
Migrations 002-017 need to be applied. Run via the admin endpoint:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://onescale.app/api/admin/apply-migration"
```
Or apply directly in Supabase SQL editor in order: 002 through 017.

### Step 4: Trigger PRISM Full Backfill
GitHub > Actions > "PRISM Full Backfill" > Run workflow
- Leave store_id empty (processes all stores)
- Leave job_type as "all"
- This runs independently of Vercel (directly against Supabase)
- Timeout: 6 hours, runs every 6 hours automatically after first trigger

### Step 5: Verify Background Data Sync
After deployment, the "Background Data Sync" workflow (runs every 10 min) should stop failing.
Check: GitHub > Actions > "Background Data Sync" — next run should succeed.

### Step 6: Run diagnostics
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://onescale.app/api/admin/diagnostics"
```
Check the JSON output — each store should show which checks pass/fail.

### Step 7: Verify Vercel crons
Three crons configured in vercel.json:
- `/api/cron/daily-pnl-snapshot` — 6 AM UTC daily
- `/api/cron/sync-balance-transactions` — 5 AM UTC daily
- `/api/cron/sync-store-configs` — 1 AM UTC daily

---

## What's Deploying (Summary)

### New Infrastructure
- **PRISM pipeline** — GitHub Actions backfill (orders, balance txns, classifications)
- **Diagnostics endpoint** — 6-check health monitor at `/api/admin/diagnostics` and `/api/prism/admin/diagnostics`
- **13 cron routes** — daily P&L snapshots, sync orders/meta/balance txns, classifications, exchange rates, attribution, CAPI batching
- **Onboarding orchestrator** — 11-stage resumable pipeline for new store setup
- **17 database migrations** — pixel attribution, intelligence, chargebacks, store config, behavioral classification

### New Features
- **P&L dashboard** — trend charts, waterfall, daily bars, hourly heatmap, product breakdown
- **Intelligence engine** — adaptive product classification (behavioral, signal-stack, relative)
- **Attribution pixel** — first-party tracking pixel with visitor/order attribution
- **Chargeback/refund pipeline** — dispute tracking from Shopify Payments balance transactions
- **Currency normalization** — FX conversion using date-specific exchange rates
- **Financial profiler** — learns store baselines for anomaly detection
- **Product performance** — COGS table, product-level P&L breakdown

### Admin Endpoints (all require CRON_SECRET)
| Endpoint | Purpose |
|----------|---------|
| `/api/admin/diagnostics` | Full pipeline health check |
| `/api/admin/backfill-all-stores` | Trigger onboarding for all stores |
| `/api/admin/backfill-balance-txns` | 730-day balance transaction backfill |
| `/api/admin/recompute-pnl` | Recalculate P&L snapshots |
| `/api/admin/force-classify-all` | Re-run product classification |
| `/api/admin/fix-existing-stores` | Backfill tables for pre-existing stores |
| `/api/admin/fast-track` | Quick backfill for single store |
| `/api/admin/onboard-store` | Manual onboarding trigger |
| `/api/admin/onboarding-status` | Check onboarding progress |
| `/api/admin/check-shopify-orders` | Verify order data integrity |

---

## GitHub Secrets (Already Configured)
- `SUPABASE_URL` — set 2026-03-14
- `SUPABASE_SERVICE_KEY` — set 2026-03-14
- `APP_URL` — set 2026-03-14
- `CRON_SECRET` — set 2026-03-04
- `APP_BASE_URL` — set 2026-03-04
- `VERCEL_URL` — set 2026-03-12

---

## Post-Deploy Monitoring

1. **First 30 min:** Watch Background Data Sync workflow — should pass
2. **First 6 hours:** PRISM backfill completes for all stores
3. **Next morning:** Check diagnostics endpoint — all 6 checks should pass per store
4. **First 24 hours:** Verify daily-pnl-snapshot cron fires and populates snapshots
5. **Ongoing:** Check `/api/admin/diagnostics` weekly for pipeline health

---

## Rollback Plan
If deployment breaks the live app:
```bash
git checkout main
git revert HEAD
git push origin main
```
This reverts the merge and triggers a clean Vercel deployment.

---

## Known Limitations (Not Blockers)
- Encrypted Shopify tokens: backfill script skips stores with `enc:` tokens (calls app API fallback instead)
- Anomaly detection thresholds are static (2σ/3σ), not learned per-store yet
- Exchange rate fallback uses latest available rate silently if live API fails
- Product classification operates at product level, not variant level
- Console logging in PRISM modules is verbose (not sensitive, but chatty)
