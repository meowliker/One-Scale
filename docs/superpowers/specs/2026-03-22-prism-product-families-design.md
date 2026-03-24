# PRISM Product Families — Design Spec

**Date:** 2026-03-22
**Status:** Approved
**Store:** Minding Art (initial), all stores

## Problem

PRISM currently stores only main products in `product_config`. Upsells, downsells, popups, and bumps are detected at computation time but relationships are never persisted. This causes:

1. Revenue from child products (upsells/downsells) not rolling up to their main product
2. Orders where customers buy only an upsell get "lost" — no main product to attribute to
3. Ad spend from generic campaign names (no product keyword) can't be attributed
4. Product families change over time but relationships are never refreshed

## Design

### Core Principle

Every product ever sold belongs to a **product family** headed by a main product. All metrics (revenue, orders, fees, ad spend) roll up to the main product. Nothing gets lost.

### Revenue Semantics (Critical)

The current system attributes `order.total_price` entirely to the matched main product. This already includes child product revenue. The rollup does NOT double-count.

**How it works:**
- **Order with main + children:** `total_price` → main product (current behavior, unchanged)
- **Order with ONLY children (orphan):** `total_price` → main product via `parent_product` fallback (NEW)
- Revenue is NEVER split at line-item level — `total_price` is the atomic unit
- This preserves penny-exact P&L accuracy

### 1. Product Families Table

```sql
CREATE TABLE product_families (
  store_id          text NOT NULL,
  child_product_id  text NOT NULL,
  parent_product_id text NOT NULL,
  relationship      text DEFAULT 'upsell',  -- 'upsell' | 'downsell' | 'popup' | 'bump' | 'addon'
  co_occurrence     numeric DEFAULT 0,      -- % of child orders containing this parent (0-100)
  detection_method  text DEFAULT 'order_pattern', -- 'order_cooccurrence' | 'keyword_match' | 'price_heuristic' | 'manual_override'
  window_order_count integer DEFAULT 0,     -- orders in current 30-day window for this relationship
  last_scanned_at   timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now(),
  PRIMARY KEY (store_id, child_product_id, parent_product_id)
);

-- Indexes for P&L lookups and stale cleanup
CREATE INDEX idx_product_families_parent ON product_families(store_id, parent_product_id);
CREATE INDEX idx_product_families_stale ON product_families(store_id, last_scanned_at);
```

A child can have multiple parents. Per-order logic picks the correct one at computation time. Fallback uses highest `co_occurrence` score.

**Existing column reuse:** `product_classifications.parent_product` (already exists from migration 010) will be used as the fast fallback lookup (highest co-occurrence parent). No new column needed — avoids collision with existing code in `classificationV2.ts`.

### 2. Family Scanner (29-Day Rolling Window)

Runs inside `runAutoSync` pipeline on every P&L cron cycle.

**Why 29 days, not 30:** The pg_cron cleanup job deletes `shopify_orders_cache` rows older than 30 days at 04:00 UTC. The P&L cron runs at 07:30 UTC. Using 29 days avoids the race condition at the boundary.

**Input:** ALL orders from `shopify_orders_cache` for last 29 days. Fetched with pagination (1000 per page) to handle high-volume stores.

**Process for each order:**

1. Extract every line item: product_id, title, price, quantity
2. Identify main product(s) in order (from `product_config`)
3. Every other product → record as child of that main:
   - Price = $0 → `addon` (free bonus)
   - Price > main price → `upsell`
   - Price < main price, price > $0 → `downsell` or `bump`
   - Title contains "lifetime", "upgrade", "access" → `bump`
   - Title contains "mystery box", "bundle" → `upsell`
4. **Multi-main orders:** non-main items assigned to the higher-priced main product. Revenue counted ONCE (no duplication). Co-occurrence increments for both parents.
5. **Zero-main orders:** products recorded, matched via keyword/title similarity to known mains. If no match, flagged as `unassigned`.

**After order scan:**

1. Keyword reinforcement: boost co_occurrence where child title shares words with parent title
2. Compute co_occurrence %: `orders_with_parent / total_child_orders * 100`
3. Update `product_classifications.parent_product`: highest co_occurrence parent wins
4. Mark stale relationships (`last_scanned_at` not updated) as inactive — keep for 90 days minimum if `window_order_count > 5` historically, delete otherwise

### 3. P&L Rollup Logic

**Per-order assignment (primary):**
- Find main product in order (from `product_config`)
- Order's `total_price` → attributed to that main (current behavior, unchanged)
- Fees for this order → attributed to that main
- Child products tracked for family reporting but don't add revenue

**Orphan orders (no main in order — customer bought only upsells):**
- Look up each product's `parent_product` from `product_classifications`
- Order's `total_price` → attributed to that parent main
- If no parent found → flag as `unassigned`, still visible in dashboard but tracked separately

**What each main product shows:**
- Revenue = orders containing this main + orphan orders attributed via parent_product
- Orders = count of all orders attributed to this main (direct + orphan)
- Fees = fees from all attributed orders
- Ad Spend = from mapped ad accounts + URL-matched ads
- Net Profit = Revenue - Fees - Ad Spend
- Children listed as expandable sub-rows (family breakdown)

### 4. Ad Spend Attribution (with URL matching, NO extra API calls)

Attribution chain (priority order):

1. **Direct mapping** — ad_account → product_id (existing)
2. **Ad URL matching** — destination URL from ad insights → Shopify product handle (NEW, zero extra API calls)
3. **Campaign name keywords** — name → product keywords (existing)
4. **Proportional fallback** — split by order count (existing)

**Safe implementation — no extra Meta API calls:**
- Add `website_url` to the EXISTING insights fields parameter (same API call, one extra field)
- Store in `destination_url` column on `meta_spend_cache`
- Match URL path `/products/kids-life-skills` → product handle → product_id
- Catches campaigns like "scaling 1" or "Anurag Pataila 7" that link to specific product pages

### 5. Continuous Freshness

- Scanner runs every P&L cron cycle (daily 07:30 UTC)
- 29-day rolling window — stale relationships auto-drop (90-day grace for >5 orders)
- New products detected on next scan
- Products that stop selling naturally fall off
- `last_scanned_at` on each family row for audit

### 6. Full Scan Command

API endpoint: `POST /api/prism/full-scan?store_id={id}`

Runs the complete pipeline for a store as if it were new:
1. Auto-detect main products from orders (`autoDetectProductConfig`)
2. Scan all orders (29 days) → build product families
3. Map ad accounts → products (direct + URL + keyword)
4. Compute product P&L with full rollup
5. Return detailed report:
   - Product families found (main → children tree)
   - Products mapped vs unassigned
   - Ad spend attribution breakdown (direct / URL / keyword / proportional)
   - Orphan orders count and attribution
   - Per-product: revenue, orders, fees, ad spend, net profit

Used for verification and onboarding new stores.

## Data Flow

```
Orders (29 days)
    │
    ├─ Family Scanner
    │   ├─ Identify main products (product_config)
    │   ├─ For each order: link children → main
    │   ├─ Compute co_occurrence scores
    │   └─ Write product_families + parent_product
    │
    ├─ P&L Computation
    │   ├─ Per-order: total_price → main in same order
    │   ├─ Orphans: total_price → parent_product fallback
    │   └─ Unassigned: flagged, tracked separately
    │
    └─ Ad Spend Attribution
        ├─ Direct mapping (ad_account → product)
        ├─ Campaign name keywords
        └─ Proportional fallback
```

## Migration

- New table: `product_families` (with indexes)
- Reuse existing: `product_classifications.parent_product` (no new column)

## Files to Create/Modify

- `supabase/migrations/037_product_families.sql` — new table + meta_spend_cache columns
- `src/lib/pnl/familyScanner.ts` — 29-day order scan, relationship detection, co-occurrence scoring
- `src/lib/pnl/productRollup.ts` — per-order rollup logic with orphan fallback
- `src/app/api/prism/full-scan/route.ts` — full scan endpoint with detailed report
- `src/app/api/cron/daily-pnl-snapshot/route.ts` — integrate scanner + rollup into pipeline
- `src/lib/pnl/autoProductConfig.ts` — call family scanner in runAutoSync
- `src/lib/pnl/appsScriptPort.ts` — modify buildProductPerformance for orphan rollup

## Edge Cases

- **Seasonal products:** Relationships kept 90 days if >5 historical orders, prevents premature deletion
- **New products:** Detected on next scan cycle, immediately linked to parent if order pattern matches
- **Product changes:** 29-day window naturally adapts — old relationships fade, new ones emerge
- **High-volume stores (30K+ orders):** Paginated fetch (1000/page), scanner is O(orders × line_items × products)
- **Multi-main orders:** Revenue to higher-priced main, co-occurrence tracked for both
- **Zero-main orders:** Matched via keyword similarity, else flagged as unassigned
