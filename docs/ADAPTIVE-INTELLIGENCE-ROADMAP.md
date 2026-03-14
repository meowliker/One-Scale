# OneScale Adaptive Intelligence — Full Roadmap

## Vision
Make OneScale work like Triple Whale: fully adaptive, zero hardcoded values, learns each store's structure on connect. Any Shopify merchant connects and gets accurate P&L immediately.

## V4.4 Apps Script — Calculation Logic Reference
The Apps Script at `C:\Users\mahes` (shared in conversation) is the SOURCE OF TRUTH for calculation logic:
- Revenue = line_items price × quantity, skip voided/refunded orders
- Partial refunds = subtract refund amounts from order total
- Fees = real transaction fees from Shopify balance/transactions API, distributed proportionally
- Product matching = keyword sets (ALL must match), upsell matching, fuzzy word overlap
- Campaign→product = keyword matching with confidence scores (100/80/60/40/35/20)
- $0 price = MAIN product (ad-driven), price > $0 = upsell
- NEVER hardcode fee rates, timezone, currency, store names

## Current OneScale State (from exploration)
- **DB pattern**: `rest()` from `src/app/api/lib/supabase-persistence.ts` — raw PostgREST, no @supabase/supabase-js
- **P&L sync**: `src/app/api/pnl/sync/route.ts` — reads daily_pnl_snapshots table
- **P&L snapshot fields**: date, revenue, cogs, ad_spend, shipping_cost, transaction_fees, refunds, net_profit, margin, order_count, full/partial refund counts/amounts, chargeback_loss/won
- **Existing API routes**: 85+ routes covering auth, meta, shopify, pnl, pixel, tracking, cron, ai
- **P&L components**: 15+ components in `src/components/pnl/`
- **Migrations**: 002-006 covering pixel, attribution, store config, chargebacks, shipping
- **Timezone**: Uses store's ad account timezone, falls back to America/New_York

## Build Order (dependency-driven)

### Layer 8 → BUILD FIRST: Universal P&L Calculator
**Why first**: Everything feeds into P&L. Must be the single source of truth.
**File**: `src/lib/pnl/universalCalculator.ts`
**What it does**:
- Single `calculateProductPnL(storeId, productId, dateRange)` function
- Revenue from line items (not order total)
- COGS from `pnl_product_costs` table, fallback $0 + warning
- Ad spend from campaign mappings, proportional as last resort
- Fees from real Shopify transactions, per-gateway rates
- Shipping from real per-order data
- Refunds by creation date, not order date
- Chargebacks: lost deducted, won shown separately
- Returns warnings array for incomplete data
- Used by ALL P&L views — no separate calculation anywhere

**New Supabase tables needed**:
- `product_intelligence` — classification, order patterns
- `campaign_mappings` — campaign→product with confidence
- `fee_structures` — per-store per-gateway detected rates
- `store_intelligence` — store config, health score
- `currency_config` — multi-currency handling
- `cogs_suggestions` — auto-suggested COGS with reasoning

### Layer 3 → Fee Intelligence
**File**: `src/lib/intelligence/feeIntelligence.ts`
- Read last 30 transactions from Shopify balance API
- Calculate actual effective fee rate per gateway
- Store in `fee_structures` table per store
- Re-detect monthly or on demand
- Never use flat 3% — always real rates

### Layer 2 → Product Intelligence
**File**: `src/lib/intelligence/productIntelligence.ts`
- On connect: analyze all products + 60 days of orders
- Classify: main/upsell/downsell/bundle/subscription/gift/unknown
- Classification rules (priority order): manual override → subscription detection → tag detection → gift card → alone% → first% → price rules → order position → default MAIN
- Digital detection from product_type/tags
- Bundle detection from title keywords + variant count
- Re-run weekly
- Manual merchant overrides always win

### Layer 1 → Store Intelligence (Connect Flow)
**File**: `src/lib/intelligence/storeIntelligence.ts`
- `initializeStore(storeId)` orchestrator
- Fetches: shop config, all products, 60 days orders, Meta accounts, campaigns
- Triggers: product classification, campaign mapping, fee detection
- Queues 30-day backfill
- Calculates health score
- All stored in Supabase, zero hardcoded

### Layer 4 → Campaign Intelligence
**File**: `src/lib/intelligence/campaignIntelligence.ts`
- Detect campaign naming patterns per store
- Match campaigns to products with confidence scores
- Priority: manual → single-product store → exact match → keyword → AI → unattributed
- Re-run on new campaigns, product changes, weekly for low-confidence
- Unattributed spend shown separately, never distributed silently

### Layer 5 → COGS Intelligence
**File**: `src/lib/intelligence/cogsIntelligence.ts`
- Check existing COGS in pnl_product_costs
- Digital product → suggest $0
- Physical product → show warning banner
- Never fallback to 30% silently
- Show "X products showing $0 COGS" warning in P&L

### Layer 6 → Currency Intelligence
**File**: `src/lib/intelligence/currencyIntelligence.ts`
- Detect store currency from Shopify
- Detect Meta account currencies per account
- Detect Shopify Markets if enabled
- Apply exchange rate at transaction date, not today
- Store original + converted amounts separately

### Layer 7 → Onboarding Health Score
**File**: `src/app/dashboard/onboarding/`
- Persistent banner until 100%
- Items: Shopify connected (+20), Meta connected (+20), pixel (+15), CAPI (+10), products classified (+10), COGS configured (+10), campaigns mapped (+10), survey (+5)
- Action items with links to fix each issue

## Global Rules
1. Zero hardcoded values anywhere in codebase
2. Every store is different — system must learn
3. Manual merchant overrides = highest priority, permanent
4. Show warnings for incomplete data — never silent fallbacks
5. One store's config never affects another
6. Single P&L calculator used everywhere
7. All data in Supabase via `rest()` pattern
8. Don't break existing dashboard functionality

## Key Existing Files to Modify
- `src/app/api/pnl/sync/route.ts` — use universalCalculator
- `src/app/api/pnl/product-breakdown/route.ts` — use universalCalculator
- `src/app/api/pnl/product-performance/route.ts` — use universalCalculator
- `src/app/api/cron/daily-pnl-snapshot/route.ts` — use universalCalculator
- `src/components/pnl/PnLDashboardClient.tsx` — show warnings
- `src/app/dashboard/settings/pnl/page.tsx` — COGS configuration

## Migration SQL Needed
New migration `007_adaptive_intelligence.sql` with all new tables.
