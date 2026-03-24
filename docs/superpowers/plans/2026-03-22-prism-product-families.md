# PRISM Product Families Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a product family system where every product rolls up to a main product, with persistent relationships, per-order attribution, and a full-scan verification endpoint.

**Architecture:** New `product_families` table tracks child→parent relationships detected from 29-day order scan. P&L rollup attributes orphan orders (upsell-only purchases) to the correct main product via `parent_product` fallback. Full-scan endpoint verifies everything for new stores.

**Tech Stack:** TypeScript, Supabase PostgREST, Next.js API routes

**Spec:** `docs/superpowers/specs/2026-03-22-prism-product-families-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/037_product_families.sql` | Create | New table + indexes |
| `src/lib/pnl/familyScanner.ts` | Create | 29-day order scan, relationship detection, co-occurrence scoring |
| `src/lib/pnl/productRollup.ts` | Create | Per-order rollup logic with orphan fallback |
| `src/app/api/prism/full-scan/route.ts` | Create | Full scan endpoint with detailed report |
| `src/lib/pnl/autoProductConfig.ts:81-130` | Modify | Add family scanner call to `runAutoSync` |
| `src/lib/pnl/appsScriptPort.ts:339-632` | Modify | Integrate orphan rollup into `buildProductPerformance` |
| `src/app/api/cron/daily-pnl-snapshot/route.ts:266-309` | Modify | Use rollup results in product breakdown |
| `src/lib/pnl/adUrlMatcher.ts` | Create | Match ad destination URLs to Shopify product handles |
| `src/app/api/cron/sync-meta-spend/route.ts:200-258` | Modify | Fetch ad URLs in same sync cycle (1 batch call per account, cached) |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/037_product_families.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 037: Product Families
-- Tracks parent-child product relationships for P&L rollup.
-- Children (upsells/downsells/bumps/addons) roll up to main products.

CREATE TABLE IF NOT EXISTS product_families (
  store_id          text NOT NULL,
  child_product_id  text NOT NULL,
  parent_product_id text NOT NULL,
  child_title       text,
  parent_title      text,
  relationship      text DEFAULT 'upsell',
  co_occurrence     numeric DEFAULT 0,
  detection_method  text DEFAULT 'order_cooccurrence',
  window_order_count integer DEFAULT 0,
  last_scanned_at   timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now(),
  PRIMARY KEY (store_id, child_product_id, parent_product_id)
);

-- Fast lookups: "give me all children of this parent"
CREATE INDEX IF NOT EXISTS idx_product_families_parent
  ON product_families(store_id, parent_product_id);

-- Stale cleanup: "find relationships not scanned recently"
CREATE INDEX IF NOT EXISTS idx_product_families_stale
  ON product_families(store_id, last_scanned_at);

-- Enable RLS-compatible store isolation
CREATE INDEX IF NOT EXISTS idx_product_families_store
  ON product_families(store_id);
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Paste the SQL into Supabase Dashboard → SQL Editor → Run.
Verify with: `SELECT count(*) FROM product_families;` → should return 0.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/037_product_families.sql
git commit -m "feat: add product_families table for PRISM family tracking"
```

---

### Task 2: Family Scanner

**Files:**
- Create: `src/lib/pnl/familyScanner.ts`

- [ ] **Step 1: Create the family scanner module**

The scanner analyzes ALL orders in a 29-day window, identifies which products appear together, and builds parent-child relationships.

```typescript
// src/lib/pnl/familyScanner.ts
import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

interface LineItem {
  product_id?: string | number;
  title?: string;
  price?: string;
  quantity?: number;
}

interface OrderRow {
  shopify_order_id: string;
  total_price: number;
  line_items: string | LineItem[];
  financial_status: string;
}

interface FamilyRelation {
  childId: string;
  childTitle: string;
  parentId: string;
  parentTitle: string;
  relationship: string;
}

interface ScanResult {
  familiesFound: number;
  childrenMapped: number;
  orphanProducts: number;
  totalOrdersScanned: number;
  families: Array<{
    mainProduct: string;
    mainTitle: string;
    children: Array<{ id: string; title: string; relationship: string; coOccurrence: number }>;
  }>;
}

/**
 * Scan all orders in a 29-day window and build product family relationships.
 * Every line item in every order gets accounted for — nothing lost.
 */
export async function scanProductFamilies(storeId: string): Promise<ScanResult> {
  // 1. Load main products from product_config
  const mainProducts = await rest<Array<{ product_id: string; product_name: string }>>(
    `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id,product_name`
  ).catch(() => []);
  const mainIds = new Set(mainProducts.map(p => p.product_id));
  const mainNameMap = new Map(mainProducts.map(p => [p.product_id, p.product_name]));

  // 2. Load ALL orders from last 29 days (paginated)
  const since = new Date();
  since.setDate(since.getDate() - 29);
  const sinceISO = since.toISOString();

  const allOrders: OrderRow[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  let hasMore = true;

  while (hasMore) {
    const page = await rest<OrderRow[]>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(sinceISO)}&select=shopify_order_id,total_price,line_items,financial_status&order=created_at.asc&limit=${PAGE_SIZE}&offset=${offset}`
    ).catch(() => []);
    allOrders.push(...page);
    hasMore = page.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  // Filter to paid orders
  const paidOrders = allOrders.filter(o =>
    o.financial_status !== 'refunded' && o.financial_status !== 'voided'
  );

  // 3. Scan every order — build co-occurrence counts
  // Key: "childId::parentId" → { count, childTitle, parentTitle, relationship }
  const coMap = new Map<string, { count: number; childTitle: string; parentTitle: string; relationship: string }>();
  // Track total orders per child product
  const childOrderCount = new Map<string, number>();
  // Track all seen products
  const allProducts = new Map<string, string>(); // id → title

  for (const order of paidOrders) {
    let items: LineItem[];
    try {
      items = typeof order.line_items === 'string'
        ? JSON.parse(order.line_items)
        : order.line_items || [];
    } catch { continue; }

    // Separate main vs non-main items in this order
    const mainItemsInOrder: Array<{ id: string; title: string; price: number }> = [];
    const childItemsInOrder: Array<{ id: string; title: string; price: number }> = [];

    for (const item of items) {
      const pid = item.product_id ? String(item.product_id) : '';
      if (!pid || pid === 'null' || pid === '0') continue;
      const title = item.title || '';
      const price = parseFloat(item.price ?? '0');
      allProducts.set(pid, title);

      if (mainIds.has(pid)) {
        mainItemsInOrder.push({ id: pid, title, price });
      } else {
        childItemsInOrder.push({ id: pid, title, price });
      }
    }

    // No children in this order → skip
    if (childItemsInOrder.length === 0) continue;

    // Track child order counts
    for (const child of childItemsInOrder) {
      childOrderCount.set(child.id, (childOrderCount.get(child.id) || 0) + 1);
    }

    // No main in this order → orphan, skip co-occurrence (handled later via keyword matching)
    if (mainItemsInOrder.length === 0) continue;

    // Pick the main product to assign children to
    // Multi-main: use highest priced main
    const primaryMain = mainItemsInOrder.sort((a, b) => b.price - a.price)[0];

    // Link each child to the main
    for (const child of childItemsInOrder) {
      const key = `${child.id}::${primaryMain.id}`;
      const existing = coMap.get(key);
      const relationship = classifyRelationship(child.title, child.price, primaryMain.price);

      if (existing) {
        existing.count++;
      } else {
        coMap.set(key, {
          count: 1,
          childTitle: child.title,
          parentTitle: primaryMain.title,
          relationship,
        });
      }
    }
  }

  // 4. Compute co-occurrence percentages
  const relations: FamilyRelation[] = [];
  const coOccurrenceScores = new Map<string, number>(); // "childId::parentId" → score

  for (const [key, data] of coMap.entries()) {
    const [childId, parentId] = key.split('::');
    const totalChildOrders = childOrderCount.get(childId) || 1;
    const score = Math.round((data.count / totalChildOrders) * 10000) / 100; // 2 decimal places

    coOccurrenceScores.set(key, score);
    relations.push({
      childId,
      childTitle: data.childTitle,
      parentId,
      parentTitle: data.parentTitle,
      relationship: data.relationship,
    });
  }

  // 5. Handle orphan products — keyword/title similarity matching
  const orphanProducts = new Set<string>();
  for (const [pid, title] of allProducts.entries()) {
    if (mainIds.has(pid)) continue;
    const hasParent = [...coMap.keys()].some(k => k.startsWith(`${pid}::`));
    if (!hasParent) {
      // Try keyword match against main product names
      const bestMain = findBestMainByKeyword(pid, title, mainProducts);
      if (bestMain) {
        const key = `${pid}::${bestMain.product_id}`;
        coMap.set(key, {
          count: 0,
          childTitle: title,
          parentTitle: bestMain.product_name,
          relationship: 'addon',
        });
        coOccurrenceScores.set(key, 0);
        relations.push({
          childId: pid,
          childTitle: title,
          parentId: bestMain.product_id,
          parentTitle: bestMain.product_name,
          relationship: 'addon',
        });
      } else {
        orphanProducts.add(pid);
      }
    }
  }

  // 6. Write to product_families table (upsert)
  for (const [key, data] of coMap.entries()) {
    const [childId, parentId] = key.split('::');
    const score = coOccurrenceScores.get(key) || 0;

    await rest('/product_families?on_conflict=store_id,child_product_id,parent_product_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        store_id: storeId,
        child_product_id: childId,
        parent_product_id: parentId,
        child_title: data.childTitle,
        parent_title: data.parentTitle,
        relationship: data.relationship,
        co_occurrence: score,
        detection_method: data.count > 0 ? 'order_cooccurrence' : 'keyword_match',
        window_order_count: data.count,
        last_scanned_at: new Date().toISOString(),
      }),
    }).catch(() => null);
  }

  // 7. Update parent_product on product_classifications for each child
  // Pick highest co-occurrence parent per child
  const bestParentPerChild = new Map<string, { parentId: string; score: number }>();
  for (const [key, score] of coOccurrenceScores.entries()) {
    const [childId, parentId] = key.split('::');
    const current = bestParentPerChild.get(childId);
    if (!current || score > current.score) {
      bestParentPerChild.set(childId, { parentId, score });
    }
  }

  for (const [childId, { parentId }] of bestParentPerChild.entries()) {
    await rest(
      `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(childId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ parent_product: parentId }),
      }
    ).catch(() => null);
  }

  // 8. Clean up stale relationships (not seen in this scan, older than 90 days with <5 orders)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  await rest(
    `/product_families?store_id=eq.${enc(storeId)}&last_scanned_at=lt.${enc(ninetyDaysAgo.toISOString())}&window_order_count=lt.5`,
    { method: 'DELETE' }
  ).catch(() => null);

  // 9. Build result summary
  const familyMap = new Map<string, Array<{ id: string; title: string; relationship: string; coOccurrence: number }>>();
  for (const [key, data] of coMap.entries()) {
    const [childId, parentId] = key.split('::');
    const score = coOccurrenceScores.get(key) || 0;
    if (!familyMap.has(parentId)) familyMap.set(parentId, []);
    familyMap.get(parentId)!.push({
      id: childId,
      title: data.childTitle,
      relationship: data.relationship,
      coOccurrence: score,
    });
  }

  const families = [...familyMap.entries()].map(([parentId, children]) => ({
    mainProduct: parentId,
    mainTitle: mainNameMap.get(parentId) || parentId,
    children: children.sort((a, b) => b.coOccurrence - a.coOccurrence),
  }));

  return {
    familiesFound: families.length,
    childrenMapped: coMap.size,
    orphanProducts: orphanProducts.size,
    totalOrdersScanned: paidOrders.length,
    families,
  };
}

/** Classify the relationship type based on price and title */
function classifyRelationship(childTitle: string, childPrice: number, mainPrice: number): string {
  const lower = childTitle.toLowerCase();
  if (lower.includes('lifetime') || lower.includes('upgrade') || lower.includes('access')) return 'bump';
  if (lower.includes('mystery box') || lower.includes('bundle')) return 'upsell';
  if (childPrice === 0) return 'addon';
  if (childPrice > mainPrice) return 'upsell';
  return 'downsell';
}

/** Find the best main product match by keyword overlap in title */
function findBestMainByKeyword(
  _childId: string,
  childTitle: string,
  mainProducts: Array<{ product_id: string; product_name: string }>
): { product_id: string; product_name: string } | null {
  const childWords = new Set(childTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  let bestMatch: { product_id: string; product_name: string } | null = null;
  let bestScore = 0;

  for (const main of mainProducts) {
    const mainWords = new Set(main.product_name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
    let overlap = 0;
    for (const w of childWords) {
      if (mainWords.has(w)) overlap++;
    }
    const score = mainWords.size > 0 ? overlap / mainWords.size : 0;
    if (score > bestScore && score >= 0.3) { // At least 30% word overlap
      bestScore = score;
      bestMatch = main;
    }
  }

  return bestMatch;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/lib/pnl/familyScanner.ts 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/lib/pnl/familyScanner.ts
git commit -m "feat: add PRISM family scanner — 29-day order scan with co-occurrence detection"
```

---

### Task 3: Product Rollup Module

**Files:**
- Create: `src/lib/pnl/productRollup.ts`

- [ ] **Step 1: Create the rollup module**

This module takes orders and produces per-main-product metrics with all children rolled up.

```typescript
// src/lib/pnl/productRollup.ts
import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

interface LineItem {
  product_id?: string | number;
  title?: string;
  price?: string;
  quantity?: number;
}

interface OrderRow {
  shopify_order_id: string;
  total_price: number;
  subtotal_price: number;
  line_items: string | LineItem[];
  financial_status: string;
}

export interface RolledUpProduct {
  productId: string;
  productTitle: string;
  classification: 'main';
  revenue: number;
  orders: number;
  fees: number;
  unitsSold: number;
  children: Array<{
    productId: string;
    productTitle: string;
    relationship: string;
    unitsSold: number;
    lineRevenue: number; // for reporting only, not added to main revenue
  }>;
}

/**
 * Roll up all order metrics to main products.
 * - Orders with a main product: total_price → that main
 * - Orphan orders (no main): total_price → primary parent via product_families
 * - Unmatched: tracked as 'unassigned'
 */
export async function rollUpOrders(
  storeId: string,
  orders: OrderRow[],
  mainProductIds: Set<string>,
  orderFeeMap: Map<string, number>,
): Promise<{ products: Map<string, RolledUpProduct>; unassignedRevenue: number; unassignedOrders: number }> {

  // Load parent_product fallback from product_classifications
  const parentRows = await rest<Array<{ product_id: string; parent_product: string }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&parent_product=not.is.null&select=product_id,parent_product`
  ).catch(() => []);
  const parentMap = new Map(parentRows.map(r => [r.product_id, r.parent_product]));

  // Also load from product_families (highest co_occurrence per child)
  const familyRows = await rest<Array<{ child_product_id: string; parent_product_id: string; co_occurrence: number }>>(
    `/product_families?store_id=eq.${enc(storeId)}&select=child_product_id,parent_product_id,co_occurrence&order=co_occurrence.desc`
  ).catch(() => []);

  // Build best-parent map from families (first entry per child = highest co_occurrence due to sort)
  const familyParentMap = new Map<string, string>();
  for (const row of familyRows) {
    if (!familyParentMap.has(row.child_product_id)) {
      familyParentMap.set(row.child_product_id, row.parent_product_id);
    }
  }

  const products = new Map<string, RolledUpProduct>();
  let unassignedRevenue = 0;
  let unassignedOrders = 0;

  // Initialize all main products
  for (const pid of mainProductIds) {
    products.set(pid, {
      productId: pid,
      productTitle: '',
      classification: 'main',
      revenue: 0,
      orders: 0,
      fees: 0,
      unitsSold: 0,
      children: [],
    });
  }

  for (const order of orders) {
    if (order.financial_status === 'refunded' || order.financial_status === 'voided') continue;

    let items: LineItem[];
    try {
      items = typeof order.line_items === 'string'
        ? JSON.parse(order.line_items)
        : order.line_items || [];
    } catch { continue; }

    const orderRevenue = Number(order.total_price) || 0;
    const orderId = String(order.shopify_order_id);
    const orderFee = orderFeeMap.get(orderId) ?? 0;

    // Find main product in this order
    let mainInOrder: { id: string; title: string; price: number } | null = null;
    const childItems: Array<{ id: string; title: string; price: number; qty: number }> = [];

    for (const item of items) {
      const pid = item.product_id ? String(item.product_id) : '';
      if (!pid || pid === 'null' || pid === '0') continue;
      const title = item.title || '';
      const price = parseFloat(item.price ?? '0');
      const qty = item.quantity ?? 1;

      if (mainProductIds.has(pid)) {
        if (!mainInOrder || price > mainInOrder.price) {
          mainInOrder = { id: pid, title, price };
        }
      } else {
        childItems.push({ id: pid, title, price, qty });
      }
    }

    let targetMainId: string | null = null;

    if (mainInOrder) {
      // Order has a main product — attribute to it
      targetMainId = mainInOrder.id;
    } else {
      // Orphan order — find parent via families or classifications
      for (const child of childItems) {
        const parent = familyParentMap.get(child.id) || parentMap.get(child.id);
        if (parent && mainProductIds.has(parent)) {
          targetMainId = parent;
          break;
        }
      }
    }

    if (targetMainId) {
      const prod = products.get(targetMainId);
      if (prod) {
        prod.revenue += orderRevenue;
        prod.orders++;
        prod.fees += orderFee;
        if (mainInOrder) {
          prod.productTitle = mainInOrder.title;
          prod.unitsSold += items.filter(i => String(i.product_id) === targetMainId).reduce((s, i) => s + (i.quantity ?? 1), 0);
        }
        // Track children
        for (const child of childItems) {
          const existing = prod.children.find(c => c.productId === child.id);
          if (existing) {
            existing.unitsSold += child.qty;
            existing.lineRevenue += child.price * child.qty;
          } else {
            const rel = familyRows.find(f => f.child_product_id === child.id && f.parent_product_id === targetMainId);
            prod.children.push({
              productId: child.id,
              productTitle: child.title,
              relationship: 'upsell', // default, enriched from product_families
              unitsSold: child.qty,
              lineRevenue: child.price * child.qty,
            });
          }
        }
      }
    } else {
      // Truly unassigned
      unassignedRevenue += orderRevenue;
      unassignedOrders++;
    }
  }

  return { products, unassignedRevenue, unassignedOrders };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/lib/pnl/productRollup.ts 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/lib/pnl/productRollup.ts
git commit -m "feat: add product rollup — per-order attribution with orphan fallback"
```

---

### Task 4: Integrate Scanner into AutoSync Pipeline

**Files:**
- Modify: `src/lib/pnl/autoProductConfig.ts:81-130`

- [ ] **Step 1: Add family scanner import and call**

At top of file, add import:
```typescript
import { scanProductFamilies } from './familyScanner';
```

Inside `runAutoSync()` (after `runPrismIntelligence` call around line 125), add:
```typescript
// Scan orders to build/refresh product family relationships
let familiesScanned = 0;
try {
  const familyResult = await scanProductFamilies(storeId);
  familiesScanned = familyResult.familiesFound;
  if (familiesScanned > 0) {
    console.log(`[autoSync] Family scan ${storeId}: ${familyResult.familiesFound} families, ${familyResult.childrenMapped} children, ${familyResult.orphanProducts} orphans from ${familyResult.totalOrdersScanned} orders`);
  }
} catch (err) {
  console.warn(`[autoSync] Family scan failed for ${storeId}:`, err instanceof Error ? err.message : err);
}
```

Add `familiesScanned` to the return object.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit src/lib/pnl/autoProductConfig.ts 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/lib/pnl/autoProductConfig.ts
git commit -m "feat: integrate family scanner into autoSync pipeline"
```

---

### Task 5: Integrate Rollup into Product P&L Computation

**Files:**
- Modify: `src/lib/pnl/appsScriptPort.ts:339-632`

- [ ] **Step 1: Add rollup import**

At top of file:
```typescript
import { rollUpOrders, RolledUpProduct } from './productRollup';
```

- [ ] **Step 2: Add rollup call in buildProductPerformance**

After the existing `matchOrderToProduct` loop (around line 440), add a new rollup pass that uses `product_families` for orphan attribution. The rollup results should be merged with the existing product results — orphan orders that were previously unattributed now get assigned to their parent main product.

Key change: In the final results assembly (around line 600-632), for any product classified as 'upsell' that has a `parent_product_id`, its revenue should NOT be shown separately — it's already included in the main product's `total_price` attribution. But for orphan orders (where `matchOrderToProduct` returned null), use the rollup to assign them to the correct main.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit src/lib/pnl/appsScriptPort.ts 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/lib/pnl/appsScriptPort.ts
git commit -m "feat: integrate product rollup into P&L — orphan orders now attributed to main"
```

---

### Task 6: Full Scan Endpoint

**Files:**
- Create: `src/app/api/prism/full-scan/route.ts`

- [ ] **Step 1: Create the full scan API route**

```typescript
// src/app/api/prism/full-scan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled, rest } from '@/app/api/lib/supabase-persistence';
import { scanProductFamilies } from '@/lib/pnl/familyScanner';
import { runAutoSync } from '@/lib/pnl/autoProductConfig';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  if (!storeId) {
    return NextResponse.json({ error: 'store_id required' }, { status: 400 });
  }

  const start = Date.now();
  const report: Record<string, unknown> = { storeId, startedAt: new Date().toISOString() };

  try {
    // Step 1: Auto-detect products + classify
    console.log(`[full-scan] Step 1: AutoSync for ${storeId}`);
    const syncResult = await runAutoSync(storeId);
    report.autoSync = syncResult;

    // Step 2: Scan families (this is the main event)
    console.log(`[full-scan] Step 2: Family scan for ${storeId}`);
    const familyResult = await scanProductFamilies(storeId);
    report.families = familyResult;

    // Step 3: Load ad account mappings
    const adMappings = await rest<Array<{ ad_account_id: string; product_id: string }>>(
      `/meta_ad_account_mappings?store_id=eq.${enc(storeId)}&select=ad_account_id,product_id`
    ).catch(() => []);
    report.adAccountMappings = adMappings.length;

    // Step 4: Load product_config (main products)
    const mainProducts = await rest<Array<{ product_id: string; product_name: string }>>(
      `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id,product_name`
    ).catch(() => []);
    report.mainProducts = mainProducts.map(p => ({ id: p.product_id, name: p.product_name }));

    // Step 5: Load all family relationships
    const families = await rest<Array<{
      child_product_id: string; child_title: string;
      parent_product_id: string; parent_title: string;
      relationship: string; co_occurrence: number; window_order_count: number;
    }>>(
      `/product_families?store_id=eq.${enc(storeId)}&select=*&order=parent_product_id,co_occurrence.desc`
    ).catch(() => []);

    // Group by parent
    const familyTree: Record<string, { parent: string; children: Array<Record<string, unknown>> }> = {};
    for (const f of families) {
      if (!familyTree[f.parent_product_id]) {
        familyTree[f.parent_product_id] = { parent: f.parent_title || f.parent_product_id, children: [] };
      }
      familyTree[f.parent_product_id].children.push({
        id: f.child_product_id,
        title: f.child_title,
        relationship: f.relationship,
        coOccurrence: f.co_occurrence,
        ordersInWindow: f.window_order_count,
      });
    }
    report.familyTree = familyTree;

    const elapsed = Date.now() - start;
    report.durationMs = elapsed;
    report.completedAt = new Date().toISOString();
    report.status = 'success';

    return NextResponse.json(report);
  } catch (err) {
    const elapsed = Date.now() - start;
    report.durationMs = elapsed;
    report.status = 'error';
    report.error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(report, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit src/app/api/prism/full-scan/route.ts 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/prism/full-scan/route.ts
git commit -m "feat: add /api/prism/full-scan endpoint for store verification"
```

---

### Task 7: URL-Based Ad Spend Attribution

**Files:**
- Create: `src/lib/pnl/adUrlMatcher.ts`
- Modify: `src/app/api/cron/sync-meta-spend/route.ts:200-258`
- Modify: `supabase/migrations/037_product_families.sql` (add destination_url column)

The approach: during the EXISTING meta spend sync (which already fetches ad-level insights), add `ad_creative{effective_object_story_spec{link_data{link}}}` to the fields parameter. This is NOT an extra API call — it's additional fields on the same call. Then match URLs to Shopify product handles.

- [ ] **Step 1: Add destination_url columns to migration**

Add to `037_product_families.sql`:
```sql
-- Ad URL attribution: store destination URL from ad creative
ALTER TABLE meta_spend_cache ADD COLUMN IF NOT EXISTS destination_url text;
```

- [ ] **Step 2: Create URL matcher module**

```typescript
// src/lib/pnl/adUrlMatcher.ts

/**
 * Extract Shopify product handle from a URL.
 * e.g. "https://mindingart.com/products/kids-life-skills" → "kids-life-skills"
 * e.g. "https://mindingart.com/products/kids-life-skills?variant=123" → "kids-life-skills"
 */
export function extractProductHandle(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/products\/([^/?#]+)/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    // Try regex fallback for malformed URLs
    const match = url.match(/\/products\/([^/?#]+)/);
    return match ? match[1].toLowerCase() : null;
  }
}

/**
 * Match a product handle to a product_id using order line items.
 * Shopify product handles are in the URL but not stored in orders.
 * We match by comparing the handle (slug) to product titles.
 * e.g. handle "kids-life-skills" matches title "Kids Life Skills (FREE TODAY)"
 */
export function matchHandleToProduct(
  handle: string,
  products: Array<{ product_id: string; product_name: string }>
): string | null {
  if (!handle) return null;
  const handleWords = new Set(handle.split('-').filter(w => w.length > 2));

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const p of products) {
    const titleWords = new Set(
      p.product_name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2)
    );

    let overlap = 0;
    for (const w of handleWords) {
      if (titleWords.has(w)) overlap++;
    }

    const score = handleWords.size > 0 ? overlap / handleWords.size : 0;
    if (score > bestScore && score >= 0.5) { // 50%+ word match
      bestScore = score;
      bestMatch = p.product_id;
    }
  }

  return bestMatch;
}

/**
 * Build a map of ad_id → product_id from destination URLs.
 * Used as a secondary attribution method when campaign name doesn't match.
 */
export function buildUrlAttributionMap(
  spendRows: Array<{ ad_id: string; destination_url?: string | null }>,
  products: Array<{ product_id: string; product_name: string }>
): Map<string, string> {
  const map = new Map<string, string>();

  for (const row of spendRows) {
    if (!row.destination_url) continue;
    const handle = extractProductHandle(row.destination_url);
    if (!handle) continue;
    const productId = matchHandleToProduct(handle, products);
    if (productId) {
      map.set(row.ad_id, productId);
    }
  }

  return map;
}
```

- [ ] **Step 3: Modify sync-meta-spend to capture destination URLs**

In `src/app/api/cron/sync-meta-spend/route.ts`, modify the insights fetch (around line 214-221) to also request the ad's `website_url` field. Add `website_url` to the fields parameter:

Change:
```typescript
fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values',
```
To:
```typescript
fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values,website_url',
```

Then in `mapRowToUpsert` (line 75-97), add:
```typescript
destination_url: row.website_url || null,
```

This adds ZERO extra API calls — just an extra field on the existing request.

- [ ] **Step 4: Integrate URL matcher into ad spend attribution (appsScriptPort.ts)**

In the `distributeAdSpend` section of `buildProductPerformance`, after campaign name keyword matching fails, try URL matching as fallback before proportional split:

```typescript
// After keyword match fails, try URL match
const urlMap = buildUrlAttributionMap(unmatchedAds, mainProducts);
for (const [adId, productId] of urlMap) {
  // attribute this ad's spend to the matched product
}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`

- [ ] **Step 6: Commit**

```bash
git add src/lib/pnl/adUrlMatcher.ts src/app/api/cron/sync-meta-spend/route.ts
git commit -m "feat: add URL-based ad spend attribution — matches ad destination URLs to products"
```

---

### Task 8: Run Full Scan on Minding Art & Verify

- [ ] **Step 1: Run the migration SQL in Supabase** (if not done in Task 1)

- [ ] **Step 2: Deploy to Vercel preview** (push to dev/mahesh when ready)

- [ ] **Step 3: Trigger full scan for Minding Art**

```bash
curl -s "https://{PREVIEW_URL}/api/prism/full-scan?store_id=store-b8eea935d87e" \
  -X POST \
  -H "Authorization: Bearer sync-secret-20260304-onescale" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  const r=JSON.parse(d);
  console.log('Status:', r.status);
  console.log('Duration:', r.durationMs, 'ms');
  console.log('Orders scanned:', r.families?.totalOrdersScanned);
  console.log('Families:', r.families?.familiesFound);
  console.log('Children mapped:', r.families?.childrenMapped);
  console.log('Orphans:', r.families?.orphanProducts);
  console.log('');
  if (r.familyTree) {
    for (const [pid, fam] of Object.entries(r.familyTree)) {
      console.log('MAIN:', fam.parent);
      for (const c of fam.children) {
        console.log('  └─', c.relationship, ':', c.title, '('+c.coOccurrence+'% co-occurrence,', c.ordersInWindow, 'orders)');
      }
    }
  }
});"
```

- [ ] **Step 4: Verify no products lost**

Check that every product in orders appears either as a main product or in a family relationship:
```bash
# Compare unique products in orders vs. (main products + family children)
```

- [ ] **Step 5: Trigger P&L recompute and verify corrected numbers**

```bash
curl -s "https://{PREVIEW_URL}/api/cron/daily-pnl-snapshot" \
  -H "Authorization: Bearer sync-secret-20260304-onescale"
```
