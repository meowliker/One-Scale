# Adaptive Product Classification System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-learning product classification system that automatically detects store type, analyzes order patterns, classifies products via a weighted signal stack, and provides merchant review UI — replacing the current hardcoded price-based classifier.

**Architecture:** Three-layer system: (1) Store intelligence layer detects store type and product flags, (2) Order pattern analyzer + signal stack classifier runs per-product classification, (3) Classification router directs each store through the correct path based on store type. Merchant overrides are permanent and highest priority. All state persisted in Supabase via `rest()` PostgREST pattern.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Zustand 5, Supabase (PostgREST via `rest()`), Recharts (N/A here), Framer Motion (onboarding animations)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/008_adaptive_classification.sql` | Schema: `store_intelligence` columns + `product_classifications` expansion |
| `src/lib/intelligence/storeTypeDetector.ts` | Detects store type from product catalog + order patterns |
| `src/lib/intelligence/orderPatternAnalyzer.ts` | Per-product order pattern analysis (alone_pct, position, co-purchases) |
| `src/lib/intelligence/productClassifier.ts` | Signal stack classifier — 8 weighted signals → classification |
| `src/lib/intelligence/classificationRouter.ts` | Routes stores through correct classification path based on store type |
| `src/lib/intelligence/types.ts` | Shared types for the intelligence system |
| `src/app/api/intelligence/classify/route.ts` | API: trigger classification for a store |
| `src/app/api/intelligence/store-type/route.ts` | API: get/set store type + merchant confirmation |
| `src/app/api/intelligence/classifications/route.ts` | API: get/update product classifications |
| `src/app/api/cron/classify-products/route.ts` | Weekly cron: re-classify all stores |
| `src/app/dashboard/onboarding/StoreTypeStep.tsx` | Onboarding step: "How does your store work?" |
| `src/app/dashboard/settings/product-classification/page.tsx` | Merchant review UI for classifications |
| `src/stores/classificationStore.ts` | Zustand store for classification state |

### Modified Files
| File | Change |
|------|--------|
| `src/types/productPnl.ts` | Expand `ProductCategory` to include `bundle`, `excluded`, `pending`, `unknown` |
| `src/lib/attribution/productClassifier.ts` | Replace internals to delegate to new `src/lib/intelligence/productClassifier.ts` |
| `src/app/api/pnl/product-performance/route.ts` | Use stored classifications instead of inline per-order logic |
| `src/services/productPnl.ts` | Use stored classifications instead of inline per-order logic |
| `src/components/pnl/ProductPnLSection.tsx` | Handle new categories (excluded, pending, unknown) in filter |
| `src/app/dashboard/onboarding/page.tsx` | Add store type step after Shopify connect |
| `src/app/api/lib/supabase-persistence.ts` | Add helper functions for intelligence tables |
| `vercel.json` | Add classify-products cron |
| `src/data/navigation.ts` | Add Product Classification to Settings nav |

---

## Chunk 1: Database Schema + Types

### Task 1: SQL Migration for Adaptive Classification

**Files:**
- Create: `supabase/migrations/008_adaptive_classification.sql`

- [ ] **Step 1: Write the migration**

This extends the existing `store_intelligence` table (from 007) with new columns and expands `product_classifications` (from 004):

```sql
-- 008_adaptive_classification.sql
-- Extends store_intelligence + product_classifications for adaptive classification

-- ── 1. Extend store_intelligence with store type detection ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'store_type') THEN
    ALTER TABLE store_intelligence ADD COLUMN store_type TEXT DEFAULT 'mixed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'store_type_confidence') THEN
    ALTER TABLE store_intelligence ADD COLUMN store_type_confidence INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'store_type_signals') THEN
    ALTER TABLE store_intelligence ADD COLUMN store_type_signals JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'has_upsell_app') THEN
    ALTER TABLE store_intelligence ADD COLUMN has_upsell_app BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'merchant_confirmed_type') THEN
    ALTER TABLE store_intelligence ADD COLUMN merchant_confirmed_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'avg_products_per_order') THEN
    ALTER TABLE store_intelligence ADD COLUMN avg_products_per_order REAL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'avg_order_value') THEN
    ALTER TABLE store_intelligence ADD COLUMN avg_order_value REAL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'total_active_products') THEN
    ALTER TABLE store_intelligence ADD COLUMN total_active_products INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_intelligence' AND column_name = 'store_type_detected_at') THEN
    ALTER TABLE store_intelligence ADD COLUMN store_type_detected_at TIMESTAMPTZ;
  END IF;
END $$;

-- ── 2. Extend product_classifications for signal stack ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'signals_used') THEN
    ALTER TABLE product_classifications ADD COLUMN signals_used JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'alone_pct') THEN
    ALTER TABLE product_classifications ADD COLUMN alone_pct REAL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'first_position_pct') THEN
    ALTER TABLE product_classifications ADD COLUMN first_position_pct REAL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'avg_position') THEN
    ALTER TABLE product_classifications ADD COLUMN avg_position REAL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'revenue_share') THEN
    ALTER TABLE product_classifications ADD COLUMN revenue_share REAL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'total_orders_analyzed') THEN
    ALTER TABLE product_classifications ADD COLUMN total_orders_analyzed INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'needs_review') THEN
    ALTER TABLE product_classifications ADD COLUMN needs_review BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'classification_method') THEN
    ALTER TABLE product_classifications ADD COLUMN classification_method TEXT DEFAULT 'signal_stack';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'product_type') THEN
    ALTER TABLE product_classifications ADD COLUMN product_type TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'manual_override_by') THEN
    ALTER TABLE product_classifications ADD COLUMN manual_override_by TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'manual_override_at') THEN
    ALTER TABLE product_classifications ADD COLUMN manual_override_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_classifications' AND column_name = 'last_analyzed') THEN
    ALTER TABLE product_classifications ADD COLUMN last_analyzed TIMESTAMPTZ;
  END IF;
END $$;

-- ── 3. Indexes for new columns ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_product_classifications_needs_review
  ON product_classifications(store_id, needs_review) WHERE needs_review = TRUE;
CREATE INDEX IF NOT EXISTS idx_product_classifications_classification
  ON product_classifications(store_id, classification);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/008_adaptive_classification.sql
git commit -m "feat: add migration 008 for adaptive product classification schema"
```

---

### Task 2: Shared Intelligence Types

**Files:**
- Create: `src/lib/intelligence/types.ts`
- Modify: `src/types/productPnl.ts`

- [ ] **Step 1: Create intelligence types file**

```typescript
// src/lib/intelligence/types.ts

export type StoreType = 'single_product' | 'funnel' | 'general' | 'subscription' | 'mixed';

export type Classification = 'main' | 'upsell' | 'bundle' | 'excluded' | 'pending' | 'unknown';

export type ClassificationMethod = 'signal_stack' | 'store_type_rule' | 'manual' | 'edge_case';

export interface StoreIntelligence {
  store_id: string;
  store_type: StoreType;
  store_type_confidence: number;
  store_type_signals: Record<string, unknown>;
  has_upsell_app: boolean;
  has_digital_products: boolean;
  has_subscriptions: boolean;
  has_bundles: boolean;
  total_active_products: number;
  avg_products_per_order: number;
  avg_order_value: number;
  merchant_confirmed_type: StoreType | null;
  store_type_detected_at: string | null;
}

export interface ProductOrderPattern {
  product_id: string;
  store_id: string;
  product_title: string;
  product_type: string;
  tags: string;
  price: number;

  total_orders: number;
  alone_orders: number;
  alone_pct: number;

  first_position_orders: number;
  first_position_pct: number;
  avg_position: number;

  avg_units_per_order: number;
  revenue_share: number;

  co_purchased_products: Array<{
    product_id: string;
    product_title: string;
    co_purchase_count: number;
    co_purchase_pct: number;
  }>;

  added_programmatically_pct: number;
  requires_selling_plan: boolean;
}

export interface ClassificationSignals {
  alone_pct_score: number;
  position_score: number;
  revenue_score: number;
  tag_score: number;
  type_score: number;
  title_score: number;
  price_score: number;
  app_score: number;
  subscription_score: number;
  main_score: number;
  upsell_score: number;
  confidence: number;
}

export interface ClassificationResult {
  product_id: string;
  product_title: string;
  product_type: string;
  classification: Classification;
  confidence: number;
  classification_method: ClassificationMethod;
  signals_used: ClassificationSignals | Record<string, never>;
  alone_pct: number;
  first_position_pct: number;
  avg_position: number;
  revenue_share: number;
  total_orders_analyzed: number;
  needs_review: boolean;
  manual_override: boolean;
}

export interface StoredClassification {
  id: string;
  store_id: string;
  product_id: string;
  product_title: string;
  product_type: string;
  classification: string;
  confidence: number;
  classification_method: string;
  detection_method: string;
  signals_used: Record<string, unknown>;
  alone_pct: number;
  first_position_pct: number;
  avg_position: number;
  revenue_share: number;
  total_orders_analyzed: number;
  needs_review: boolean;
  manual_override: boolean;
  manual_override_by: string | null;
  manual_override_at: string | null;
  last_analyzed: string | null;
  updated_at: string;
}
```

- [ ] **Step 2: Expand ProductCategory in productPnl.ts**

In `src/types/productPnl.ts`, change line 68:
```typescript
// Before:
export type ProductCategory = 'main' | 'upsell' | 'downsell' | 'addon';

// After:
export type ProductCategory = 'main' | 'upsell' | 'downsell' | 'addon' | 'bundle' | 'excluded' | 'pending' | 'unknown';
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/intelligence/types.ts src/types/productPnl.ts
git commit -m "feat: add intelligence types and expand ProductCategory"
```

---

## Chunk 2: Store Type Detection + Order Pattern Analysis

### Task 3: Store Type Detector

**Files:**
- Create: `src/lib/intelligence/storeTypeDetector.ts`

- [ ] **Step 1: Create the store type detector**

This file exports `detectStoreType(storeId)` which:
1. Fetches active products from `shopify_orders_cache` (last 60 days) via `rest()`
2. Fetches product metadata from `product_intelligence` table
3. Computes store signals:
   - `uniqueProductCount`: distinct products with orders
   - `topProductRevenueShare`: highest single product's % of total revenue
   - `avgProductsPerOrder`: mean line items per order
   - `avgOrderValue`: mean order total
   - `hasSubscriptions`: any product with `requires_selling_plan`
   - `hasBundles`: any product with bundle/pack/kit/set keywords
   - `hasDigitalProducts`: any product with digital/download/ebook/course keywords
   - `hasUpsellApp`: any product that never appears as first line item AND never appears alone
4. Classifies store type:
   - `single_product`: ≤3 active products OR one product >85% revenue
   - `subscription`: any product has `requires_selling_plan = true`
   - `funnel`: at least one product `alone_pct < 5%` AND another `alone_pct > 50%`
   - `general`: average `alone_pct` across all products > 60%
   - `mixed`: everything else
5. Upserts result into `store_intelligence` table

Key implementation notes:
- Fetch orders from `shopify_orders_cache` with `store_id=eq.{storeId}&created_at=gte.{60daysAgo}`
- Parse `line_items` JSON from each order
- Use `rest()` for all DB operations (no @supabase/supabase-js)
- Store type detection uses ONLY this store's data — never cross-store

```typescript
// Pseudocode structure:
import { rest } from '@/app/api/lib/supabase-persistence';
import type { StoreType, StoreIntelligence } from './types';

const DIGITAL_KEYWORDS = ['digital', 'download', 'ebook', 'course', 'pdf', 'template', 'printable', 'software', 'instant-download'];
const BUNDLE_KEYWORDS = ['bundle', 'pack', 'kit', 'set', 'combo', 'duo', 'trio'];
const UPSELL_APP_KEYWORDS = ['reconvert', 'zipify', 'carthook', 'aftersell', 'honeycomb'];

export async function detectStoreType(storeId: string): Promise<StoreIntelligence> {
  // 1. Fetch last 60 days of orders
  // 2. Parse line_items, compute per-product stats
  // 3. Detect flags (digital, subscription, bundle, upsell_app)
  // 4. Classify store type based on signals
  // 5. Upsert into store_intelligence
  // Return the intelligence record
}

export async function getStoreIntelligence(storeId: string): Promise<StoreIntelligence | null> {
  // Fetch from store_intelligence table
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/intelligence/storeTypeDetector.ts
git commit -m "feat: add store type detector with auto-detection signals"
```

---

### Task 4: Order Pattern Analyzer

**Files:**
- Create: `src/lib/intelligence/orderPatternAnalyzer.ts`

- [ ] **Step 1: Create the order pattern analyzer**

This file exports `analyzeOrderPatterns(storeId)` which:
1. Fetches last 60 days of orders from `shopify_orders_cache`
2. For each product, computes:
   - `total_orders`: number of orders containing this product
   - `alone_orders`: orders where this is the ONLY product
   - `alone_pct`: alone_orders / total_orders * 100
   - `first_position_orders`: orders where this is `line_items[0]`
   - `first_position_pct`: first_position_orders / total_orders * 100
   - `avg_position`: mean line item position (0-based)
   - `avg_units_per_order`: mean quantity across all orders
   - `revenue_share`: product revenue / total store revenue * 100
   - `co_purchased_products`: array of products frequently bought together, with counts
   - `added_programmatically_pct`: % of orders where product is never first AND never alone (proxy for upsell app injection)
3. Only returns patterns for products with ≥10 orders; flags rest as pending

```typescript
import { rest } from '@/app/api/lib/supabase-persistence';
import type { ProductOrderPattern } from './types';

interface OrderRow {
  shopify_order_id: string;
  line_items: string;
  total_price: number;
  created_at: string;
}

export async function analyzeOrderPatterns(storeId: string): Promise<ProductOrderPattern[]> {
  // 1. Fetch orders (last 60 days)
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0];
  const orders = await rest<OrderRow[]>(
    `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}&created_at=gte.${sixtyDaysAgo}T00:00:00&order_status=neq.cancelled&financial_status=neq.refunded&select=shopify_order_id,line_items,total_price,created_at`
  );

  // 2. Build per-product stats
  //    - Track: order count, alone count, first-position count, position sum,
  //      units sum, revenue sum, co-purchase map
  // 3. Compute derived metrics
  // 4. Filter: only products with ≥10 orders get full patterns
  // Return array of ProductOrderPattern
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/intelligence/orderPatternAnalyzer.ts
git commit -m "feat: add order pattern analyzer for product classification signals"
```

---

## Chunk 3: Signal Stack Classifier + Classification Router

### Task 5: Signal Stack Product Classifier

**Files:**
- Create: `src/lib/intelligence/productClassifier.ts`

- [ ] **Step 1: Create the signal stack classifier**

8 signals combined into a weighted score:

| Signal | Weight | Description |
|--------|--------|-------------|
| 1. Order patterns | 40pts max | alone_pct, first_position_pct |
| 2. Revenue share | 20pts max | product's % of store revenue |
| 3. Shopify tags | 40pts | upsell/addon/bump tags vs main/hero tags |
| 4. Product type | — | Gift Card → EXCLUDE, digital → +10 MAIN |
| 5. Title keywords | 20pts | bump/addon/warranty/tip → -20 |
| 6. Price relative | 15pts | < 0.3x median AND rarely alone → -15 |
| 7. Upsell app | 35pts | added_programmatically_pct > 70% → -35 |
| 8. Subscription | 50pts | requires_selling_plan → +50 MAIN |

```typescript
import type { ProductOrderPattern, ClassificationSignals, ClassificationResult, Classification } from './types';

const UPSELL_TAG_KEYWORDS = ['upsell', 'addon', 'add-on', 'bump', 'order-bump', 'downsell'];
const MAIN_TAG_KEYWORDS = ['main', 'hero', 'flagship', 'primary', 'core'];
const UPSELL_TITLE_KEYWORDS = ['bump', 'addon', 'add-on', 'warranty', 'tip', 'rush', 'gift-wrap', 'gift wrap', 'expedited', 'express shipping', 'insurance', 'protection plan'];

export function computeSignals(
  pattern: ProductOrderPattern,
  medianPrice: number,
): ClassificationSignals {
  // Signal 1: Order patterns
  let alone_pct_score = 0;
  if (pattern.alone_pct > 50) alone_pct_score = 35;
  else if (pattern.alone_pct > 30) alone_pct_score = 20;
  else if (pattern.alone_pct < 5) alone_pct_score = -30;

  let position_score = 0;
  if (pattern.first_position_pct > 65) position_score = 25;
  else if (pattern.avg_position > 2.5) position_score = -25;

  // Signal 2: Revenue share
  let revenue_score = 0;
  if (pattern.revenue_share > 30) revenue_score = 20;
  else if (pattern.revenue_share < 5) revenue_score = -10;

  // Signal 3: Shopify tags
  const tagsLower = pattern.tags.toLowerCase();
  let tag_score = 0;
  if (UPSELL_TAG_KEYWORDS.some(k => tagsLower.includes(k))) tag_score = -40;
  else if (MAIN_TAG_KEYWORDS.some(k => tagsLower.includes(k))) tag_score = 40;

  // Signal 4: Product type
  let type_score = 0;
  const typeLower = pattern.product_type.toLowerCase();
  if (typeLower === 'gift card' || typeLower === 'gift_card') type_score = -999; // EXCLUDE
  if (DIGITAL_KEYWORDS.some(k => typeLower.includes(k) || tagsLower.includes(k))) type_score = 10;

  // Signal 5: Title keywords
  const titleLower = pattern.product_title.toLowerCase();
  let title_score = 0;
  if (UPSELL_TITLE_KEYWORDS.some(k => titleLower.includes(k))) title_score = -20;

  // Signal 6: Price relative to median
  let price_score = 0;
  if (medianPrice > 0 && pattern.price < medianPrice * 0.3 && pattern.alone_pct < 15) {
    price_score = -15;
  }

  // Signal 7: Upsell app detection
  let app_score = 0;
  if (pattern.added_programmatically_pct > 70) app_score = -35;

  // Signal 8: Subscription
  let subscription_score = 0;
  if (pattern.requires_selling_plan) subscription_score = 50;

  // Aggregate
  const main_score = Math.max(0,
    alone_pct_score + position_score + revenue_score + tag_score +
    type_score + title_score + price_score + app_score + subscription_score
  );
  const upsell_score = Math.max(0,
    -alone_pct_score - position_score - revenue_score - tag_score -
    type_score - title_score - price_score - app_score - subscription_score
  );
  const confidence = Math.min(100, Math.abs(main_score - upsell_score));

  return {
    alone_pct_score, position_score, revenue_score, tag_score,
    type_score, title_score, price_score, app_score, subscription_score,
    main_score, upsell_score, confidence,
  };
}

export function classify(
  pattern: ProductOrderPattern,
  signals: ClassificationSignals,
): ClassificationResult {
  // EXCLUSIONS first
  if (signals.type_score <= -999) {
    return makeResult(pattern, 'excluded', 100, 'edge_case', signals, false);
  }
  if (pattern.alone_pct < 2 && pattern.price === 0) {
    return makeResult(pattern, 'excluded', 95, 'edge_case', signals, false);
  }
  if (pattern.total_orders < 10) {
    return makeResult(pattern, 'pending', 0, 'edge_case', signals, false);
  }

  // HIGH CONFIDENCE
  if (signals.main_score > 60 && signals.main_score > signals.upsell_score + 20) {
    return makeResult(pattern, 'main', signals.confidence, 'signal_stack', signals, false);
  }
  if (signals.upsell_score > 60 && signals.upsell_score > signals.main_score + 20) {
    return makeResult(pattern, 'upsell', signals.confidence, 'signal_stack', signals, false);
  }

  // LOW CONFIDENCE — flag for review
  const bestGuess: Classification = signals.main_score >= signals.upsell_score ? 'main' : 'upsell';
  return makeResult(pattern, 'unknown', signals.confidence, 'signal_stack', signals, true);
}
```

Constants `DIGITAL_KEYWORDS` should be imported from `storeTypeDetector.ts` (export them there).

- [ ] **Step 2: Commit**

```bash
git add src/lib/intelligence/productClassifier.ts
git commit -m "feat: add signal stack product classifier with 8 weighted signals"
```

---

### Task 6: Classification Router

**Files:**
- Create: `src/lib/intelligence/classificationRouter.ts`

- [ ] **Step 1: Create the classification router**

Routes each store through the correct classification path:

```typescript
import { rest } from '@/app/api/lib/supabase-persistence';
import { detectStoreType, getStoreIntelligence } from './storeTypeDetector';
import { analyzeOrderPatterns } from './orderPatternAnalyzer';
import { computeSignals, classify } from './productClassifier';
import type { StoreType, ClassificationResult, Classification, ProductOrderPattern } from './types';

export async function classifyAllProducts(storeId: string): Promise<{
  classified: number;
  needsReview: number;
  results: ClassificationResult[];
}> {
  // 1. Get or detect store intelligence
  let intel = await getStoreIntelligence(storeId);
  if (!intel) {
    intel = await detectStoreType(storeId);
  }
  const storeType: StoreType = (intel.merchant_confirmed_type || intel.store_type) as StoreType;

  // 2. Load existing manual overrides (never overwrite)
  const existingOverrides = await rest<StoredClassification[]>(
    `/product_classifications?store_id=eq.${encodeURIComponent(storeId)}&manual_override=eq.true&select=*`
  );
  const manualOverrideIds = new Set(existingOverrides.map(o => o.product_id));

  // 3. Route by store type
  let results: ClassificationResult[];
  switch (storeType) {
    case 'single_product':
    case 'general':
      results = await markAllAsMain(storeId, storeType, manualOverrideIds);
      break;
    case 'subscription':
      results = await classifyWithSubscriptionPriority(storeId, manualOverrideIds);
      break;
    case 'funnel':
    case 'mixed':
    default:
      results = await runFullSignalStack(storeId, manualOverrideIds);
      break;
  }

  // 4. Handle edge cases for ALL store types
  results = applyEdgeCases(results);

  // 5. Persist to product_classifications table (skip manual overrides)
  await persistClassifications(storeId, results, manualOverrideIds);

  const needsReview = results.filter(r => r.needs_review).length;
  return { classified: results.length, needsReview, results };
}

async function markAllAsMain(storeId: string, reason: string, skipIds: Set<string>): Promise<ClassificationResult[]> {
  // Fetch all products from orders, mark all as MAIN with store_type_rule method
}

async function classifyWithSubscriptionPriority(storeId: string, skipIds: Set<string>): Promise<ClassificationResult[]> {
  // Mark subscription products as MAIN
  // Run signal stack on non-subscription products
}

async function runFullSignalStack(storeId: string, skipIds: Set<string>): Promise<ClassificationResult[]> {
  // 1. Run analyzeOrderPatterns(storeId)
  // 2. Compute median price
  // 3. For each pattern, computeSignals() then classify()
}

function applyEdgeCases(results: ClassificationResult[]): ClassificationResult[] {
  // Gift cards → EXCLUDE
  // $0 + alone_pct < 2% → EXCLUDE (free gift)
  // $0 + alone_pct > 30% → keep as MAIN (free main product, e.g., lead magnet)
  // <10 orders → PENDING
}

async function persistClassifications(
  storeId: string,
  results: ClassificationResult[],
  skipIds: Set<string>,
): Promise<void> {
  // Upsert into product_classifications via rest()
  // Skip any product_id in skipIds (manual overrides)
  // Use POST with Prefer: resolution=merge-duplicates
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/intelligence/classificationRouter.ts
git commit -m "feat: add classification router with store-type-specific paths"
```

---

## Chunk 4: API Routes

### Task 7: Supabase Persistence Helpers

**Files:**
- Modify: `src/app/api/lib/supabase-persistence.ts`

- [ ] **Step 1: Add intelligence helper functions**

Add to the end of the file:

```typescript
// ── Intelligence helpers ────────────────────────────────────────────────────

export async function getStoreIntelligenceRow(storeId: string) {
  const rows = await rest<Array<Record<string, unknown>>>(
    `/store_intelligence?store_id=eq.${encodeURIComponent(storeId)}&select=*`
  );
  return rows[0] || null;
}

export async function upsertStoreIntelligence(storeId: string, data: Record<string, unknown>) {
  await rest('/store_intelligence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ store_id: storeId, ...data, updated_at: new Date().toISOString() }),
  });
}

export async function getProductClassifications(storeId: string) {
  return rest<Array<Record<string, unknown>>>(
    `/product_classifications?store_id=eq.${encodeURIComponent(storeId)}&select=*&order=classification.asc,revenue_share.desc`
  );
}

export async function upsertProductClassification(
  storeId: string,
  productId: string,
  data: Record<string, unknown>,
) {
  await rest('/product_classifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      store_id: storeId,
      product_id: productId,
      ...data,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function batchUpsertProductClassifications(
  rows: Array<Record<string, unknown>>,
) {
  if (rows.length === 0) return;
  await rest('/product_classifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/lib/supabase-persistence.ts
git commit -m "feat: add intelligence persistence helpers to supabase-persistence"
```

---

### Task 8: Classification API Route

**Files:**
- Create: `src/app/api/intelligence/classify/route.ts`

- [ ] **Step 1: Create the classify API route**

```typescript
// POST /api/intelligence/classify?storeId=xxx
// Triggers full classification for a store
import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { classifyAllProducts } from '@/lib/intelligence/classificationRouter';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const result = await classifyAllProducts(storeId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/intelligence/classify/route.ts
git commit -m "feat: add POST /api/intelligence/classify API route"
```

---

### Task 9: Store Type API Route

**Files:**
- Create: `src/app/api/intelligence/store-type/route.ts`

- [ ] **Step 1: Create the store type API route**

```typescript
// GET /api/intelligence/store-type?storeId=xxx  → returns store intelligence
// POST /api/intelligence/store-type?storeId=xxx → sets merchant_confirmed_type
import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { detectStoreType, getStoreIntelligence } from '@/lib/intelligence/storeTypeDetector';
import { upsertStoreIntelligence } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  let intel = await getStoreIntelligence(storeId);
  if (!intel) {
    intel = await detectStoreType(storeId);
  }
  return NextResponse.json({ ok: true, data: intel });
}

export async function POST(request: NextRequest) {
  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const body = await request.json();
  const { merchantConfirmedType } = body as { merchantConfirmedType: string };

  if (!['single_product', 'funnel', 'general', 'subscription', 'mixed'].includes(merchantConfirmedType)) {
    return NextResponse.json({ error: 'Invalid store type' }, { status: 400 });
  }

  await upsertStoreIntelligence(storeId, {
    merchant_confirmed_type: merchantConfirmedType,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/intelligence/store-type/route.ts
git commit -m "feat: add GET/POST /api/intelligence/store-type API route"
```

---

### Task 10: Classifications API Route

**Files:**
- Create: `src/app/api/intelligence/classifications/route.ts`

- [ ] **Step 1: Create the classifications API route**

```typescript
// GET /api/intelligence/classifications?storeId=xxx  → list all classifications
// PATCH /api/intelligence/classifications?storeId=xxx → update single product classification (manual override)
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled, getProductClassifications } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const rows = await getProductClassifications(storeId);
  return NextResponse.json({ ok: true, data: rows });
}

export async function PATCH(request: NextRequest) {
  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const body = await request.json();
  const { productId, classification, userEmail } = body as {
    productId: string;
    classification: string;
    userEmail?: string;
  };

  if (!productId || !classification) {
    return NextResponse.json({ error: 'productId and classification required' }, { status: 400 });
  }

  // Manual override — permanent
  await rest(`/product_classifications?store_id=eq.${encodeURIComponent(storeId)}&product_id=eq.${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      classification,
      manual_override: true,
      manual_override_by: userEmail || null,
      manual_override_at: new Date().toISOString(),
      needs_review: false,
      classification_method: 'manual',
      updated_at: new Date().toISOString(),
    }),
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/intelligence/classifications/route.ts
git commit -m "feat: add GET/PATCH /api/intelligence/classifications API route"
```

---

## Chunk 5: Onboarding Store Type Step

### Task 11: Store Type Onboarding Step Component

**Files:**
- Create: `src/app/dashboard/onboarding/StoreTypeStep.tsx`

- [ ] **Step 1: Create the store type question component**

Shows 4 options (A-D) with icons and examples. On selection, POSTs to `/api/intelligence/store-type` and triggers classification if A or D.

```typescript
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, LayoutGrid, RefreshCw, HelpCircle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StoreTypeStepProps {
  storeId: string;
  onComplete: () => void;
}

const OPTIONS = [
  {
    key: 'funnel',
    icon: ShoppingBag,
    title: 'Hero product with upsells',
    description: 'I have a main hero product with order bumps or upsells',
    example: 'e.g., $47 journal + $9 bookmark addon',
  },
  {
    key: 'general',
    icon: LayoutGrid,
    title: 'Independent products',
    description: 'All my products are independent — no funnel',
    example: 'e.g., clothing store, general store, dropshipping',
  },
  {
    key: 'subscription',
    icon: RefreshCw,
    title: 'Subscriptions or memberships',
    description: 'I sell subscriptions or memberships',
    example: 'e.g., monthly box, recurring digital access',
  },
  {
    key: 'mixed',
    icon: HelpCircle,
    title: 'Not sure — analyze automatically',
    description: "We'll review with you after analyzing your orders",
    example: '',
  },
] as const;

export function StoreTypeStep({ storeId, onComplete }: StoreTypeStepProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (!selected) return;
    setSaving(true);

    // Save merchant answer
    await fetch(`/api/intelligence/store-type?storeId=${encodeURIComponent(storeId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantConfirmedType: selected }),
    });

    // Trigger classification in background
    fetch(`/api/intelligence/classify?storeId=${encodeURIComponent(storeId)}`, {
      method: 'POST',
    });

    onComplete();
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-text-primary">How does your store work?</h2>
        <p className="mt-1 text-sm text-text-muted">This helps us classify your products accurately</p>
      </div>

      <div className="grid gap-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button key={opt.key} onClick={() => setSelected(opt.key)}
              className={cn(
                'flex items-start gap-4 rounded-lg border p-4 text-left transition-all',
                selected === opt.key
                  ? 'border-brand bg-brand/5 ring-1 ring-brand'
                  : 'border-border bg-surface hover:bg-surface-hover'
              )}>
              <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                selected === opt.key ? 'bg-brand/15 text-brand' : 'bg-surface-elevated text-text-muted'
              )}>
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{opt.title}</p>
                <p className="mt-0.5 text-xs text-text-muted">{opt.description}</p>
                {opt.example && (
                  <p className="mt-1 text-[10px] text-text-muted italic">{opt.example}</p>
                )}
              </div>
              {selected === opt.key && (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              )}
            </button>
          );
        })}
      </div>

      <button onClick={handleConfirm} disabled={!selected || saving}
        className={cn(
          'w-full rounded-lg py-2.5 text-sm font-medium transition-colors',
          selected ? 'bg-brand text-white hover:bg-brand/90' : 'bg-surface-elevated text-text-muted cursor-not-allowed'
        )}>
        {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Continue'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add store type step to onboarding flow**

In `src/app/dashboard/onboarding/page.tsx`, add a new step after `shopify`:

```typescript
// Add to STEPS array after the 'shopify' step:
{
  id: 'store-type',
  title: 'Store Structure',
  subtitle: 'Tell us how your store works so we can classify products',
  icon: Settings, // or a suitable icon
  skippable: false,
}
```

And in the step rendering section, add the StoreTypeStep component when `currentStep.id === 'store-type'`.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/onboarding/StoreTypeStep.tsx src/app/dashboard/onboarding/page.tsx
git commit -m "feat: add store type question to onboarding wizard"
```

---

## Chunk 6: Merchant Review UI

### Task 12: Product Classification Settings Page

**Files:**
- Create: `src/app/dashboard/settings/product-classification/page.tsx`

- [ ] **Step 1: Create the review page**

This page shows:
1. Summary: X products classified, X need input
2. Auto-classified products (high confidence) with classification badges
3. Needs review products with MAIN/UPSELL/EXCLUDE buttons
4. Excluded products
5. "Show why" expandable for signal breakdown

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStoreStore } from '@/stores/storeStore';
import { cn } from '@/lib/utils';
import { Check, AlertTriangle, XCircle, ChevronDown, ChevronUp, RefreshCw, Loader2, Package } from 'lucide-react';
import toast from 'react-hot-toast';

interface ClassificationRow {
  product_id: string;
  product_title: string;
  product_type: string;
  classification: string;
  confidence: number;
  classification_method: string;
  signals_used: Record<string, number>;
  alone_pct: number;
  first_position_pct: number;
  revenue_share: number;
  total_orders_analyzed: number;
  needs_review: boolean;
  manual_override: boolean;
}

export default function ProductClassificationPage() {
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const [classifications, setClassifications] = useState<ClassificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reclassifying, setReclassifying] = useState(false);

  const fetchClassifications = useCallback(async () => {
    if (!activeStoreId) return;
    setLoading(true);
    const res = await fetch(`/api/intelligence/classifications?storeId=${encodeURIComponent(activeStoreId)}`);
    if (res.ok) {
      const json = await res.json();
      setClassifications(json.data || []);
    }
    setLoading(false);
  }, [activeStoreId]);

  useEffect(() => { fetchClassifications(); }, [fetchClassifications]);

  async function handleReclassify() {
    setReclassifying(true);
    const res = await fetch(`/api/intelligence/classify?storeId=${encodeURIComponent(activeStoreId)}`, { method: 'POST' });
    if (res.ok) {
      toast.success('Classification complete');
      await fetchClassifications();
    } else {
      toast.error('Classification failed');
    }
    setReclassifying(false);
  }

  async function handleManualClassify(productId: string, classification: string) {
    await fetch(`/api/intelligence/classifications?storeId=${encodeURIComponent(activeStoreId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, classification }),
    });
    toast.success('Classification updated');
    await fetchClassifications();
  }

  // Group classifications
  const autoClassified = classifications.filter(c => !c.needs_review && c.classification !== 'excluded' && c.classification !== 'pending');
  const needsReview = classifications.filter(c => c.needs_review);
  const excluded = classifications.filter(c => c.classification === 'excluded');
  const pending = classifications.filter(c => c.classification === 'pending');

  // Render sections:
  // 1. Header with re-classify button
  // 2. Summary stats bar
  // 3. AUTO-CLASSIFIED section with green checkmarks
  // 4. NEEDS REVIEW section with MAIN/UPSELL/EXCLUDE buttons per product
  // 5. EXCLUDED section
  // 6. PENDING section (insufficient data)
  // Each row has expandable "Show why" with signal scores

  return (/* Full JSX — each product row with thumbnail, name, classification badge,
    confidence %, solo %, revenue share, and action buttons for needs_review rows */);
}
```

The full JSX follows the existing settings page patterns (client component, fetch on mount, `useStoreStore` for active store). Each product row includes:
- Product title + type
- Classification badge (color-coded: green=main, orange=upsell, gray=excluded, yellow=pending)
- Confidence percentage
- `alone_pct` and `revenue_share` as small stats
- For `needs_review` rows: [MAIN] [UPSELL] [EXCLUDE] buttons
- Expandable signal breakdown (collapsible panel showing all 8 signal scores)

- [ ] **Step 2: Add to settings navigation**

In `src/data/navigation.ts`, add to the Settings section:
```typescript
{
  name: 'Product Classification',
  href: '/dashboard/settings/product-classification',
  icon: /* appropriate icon */,
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/settings/product-classification/page.tsx src/data/navigation.ts
git commit -m "feat: add merchant review UI for product classifications"
```

---

## Chunk 7: P&L Integration + Cron Job

### Task 13: Integrate Classifications into Product Performance API

**Files:**
- Modify: `src/app/api/pnl/product-performance/route.ts`

- [ ] **Step 1: Replace inline classification with stored classifications**

In the product-performance route, instead of computing `multiItemCategoryCounts` and `mostCommonCategory` inline, fetch stored classifications and use them:

```typescript
// At the top of the try block, add to the Promise.all:
const storedClassifications = await rest<Array<{product_id: string; classification: string; manual_override: boolean}>>(
  `/product_classifications?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,classification,manual_override`
).catch(() => []);

// Build lookup
const classificationMap = new Map<string, string>();
for (const sc of storedClassifications) {
  classificationMap.set(sc.product_id, sc.classification);
}
```

Then in the product output loop, replace the `mostCommonCategory` computation with:

```typescript
// Use stored classification if available, otherwise fall back to multi-item order heuristic
const storedClass = classificationMap.get(productId);
const mostCommonCategory = storedClass || (/* existing multi-item fallback logic */);
```

Also filter out `excluded` products from the response entirely, and add a `needsReview` flag to products with `classification === 'unknown'` or `classification === 'pending'`.

- [ ] **Step 2: Do the same in productPnl.ts service**

In `src/services/productPnl.ts`, import and use stored classifications as the primary source, with the existing logic as fallback.

- [ ] **Step 3: Update ProductPnLSection filter logic**

In `src/components/pnl/ProductPnLSection.tsx`, update the "Main Only" filter to also exclude `excluded` products, and add a warning icon for `pending`/`unknown` products:

```typescript
// In the Main Only filter:
if (!showAllProducts) {
  filtered = filtered.filter((p) => {
    const cat = (p.category || 'main').toLowerCase();
    return cat === 'main';  // already works, but now 'excluded' products won't even be in the data
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/pnl/product-performance/route.ts src/services/productPnl.ts src/components/pnl/ProductPnLSection.tsx
git commit -m "feat: integrate stored classifications into product P&L pipeline"
```

---

### Task 14: Weekly Classification Cron Job

**Files:**
- Create: `src/app/api/cron/classify-products/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create the cron route**

Follow the exact pattern from existing crons (daily-pnl-snapshot):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import { classifyAllProducts } from '@/lib/intelligence/classificationRouter';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CRON_NAME = 'classify-products';

async function logCron(
  storeId: string,
  status: string,
  rowsProcessed: number,
  error: string | null,
  durationMs: number,
) {
  try {
    await rest('/cron_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cron_name: CRON_NAME,
        store_id: storeId,
        status,
        rows_processed: rowsProcessed,
        error,
        duration_ms: durationMs,
        created_at: new Date().toISOString(),
      }),
    });
  } catch { /* don't let logging failures break the cron */ }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const stores = await listPersistentStores();
  const results: Array<{ storeId: string; status: string; classified?: number; needsReview?: number; error?: string }> = [];

  for (const store of stores) {
    const start = Date.now();
    try {
      // Check if re-classification is needed
      // Stores < 90 days: weekly. Established stores: monthly.
      const intel = await rest<Array<{ store_type_detected_at: string; created_at: string }>>(
        `/store_intelligence?store_id=eq.${encodeURIComponent(store.id)}&select=store_type_detected_at,created_at`
      ).catch(() => []);

      const row = intel[0];
      if (row?.store_type_detected_at) {
        const lastRun = new Date(row.store_type_detected_at).getTime();
        const storeAge = Date.now() - new Date(row.created_at).getTime();
        const isYoung = storeAge < 90 * 86400000;
        const interval = isYoung ? 7 * 86400000 : 30 * 86400000;
        if (Date.now() - lastRun < interval) {
          results.push({ storeId: store.id, status: 'skipped' });
          continue;
        }
      }

      const result = await classifyAllProducts(store.id);
      await logCron(store.id, 'completed', result.classified, null, Date.now() - start);
      results.push({
        storeId: store.id,
        status: 'completed',
        classified: result.classified,
        needsReview: result.needsReview,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await logCron(store.id, 'failed', 0, msg, Date.now() - start);
      results.push({ storeId: store.id, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}
```

- [ ] **Step 2: Add cron to vercel.json**

Add to the `crons` array:
```json
{ "path": "/api/cron/classify-products", "schedule": "0 5 * * 0" }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/classify-products/route.ts vercel.json
git commit -m "feat: add weekly product classification cron job"
```

---

### Task 15: Wire Existing Product Classifier to New System

**Files:**
- Modify: `src/lib/attribution/productClassifier.ts`

- [ ] **Step 1: Update existing productClassifier.ts to delegate**

The existing `productClassifier.ts` is used by `productPnl.ts` service. Update it to first check stored classifications from the intelligence system, falling back to the old logic only when no stored classification exists:

```typescript
// Add at the top:
import type { Classification } from '@/lib/intelligence/types';

// Update ClassificationResult to support new classification values:
export type ProductClassification = 'main' | 'upsell' | 'downsell' | 'addon' | 'bundle' | 'excluded' | 'pending' | 'unknown';
```

The `classifyProducts()` function signature stays the same for backward compatibility, but the types expand. The existing callers in `productPnl.ts` already use `buildClassificationMap()` which maps to `ProductCategory` — this mapping needs to handle the new values (bundle→addon, excluded→filter out, pending→main fallback, unknown→main fallback).

- [ ] **Step 2: Commit**

```bash
git add src/lib/attribution/productClassifier.ts
git commit -m "feat: update productClassifier types for new classification system"
```

---

## Summary of Execution Order

1. **Task 1**: SQL migration (schema foundation)
2. **Task 2**: Types (shared across all modules)
3. **Task 3**: Store type detector (core intelligence)
4. **Task 4**: Order pattern analyzer (signal data)
5. **Task 5**: Signal stack classifier (classification engine)
6. **Task 6**: Classification router (orchestration)
7. **Task 7**: Supabase persistence helpers (DB layer)
8. **Task 8-10**: API routes (expose to frontend)
9. **Task 11**: Onboarding step (merchant input)
10. **Task 12**: Settings page (merchant review)
11. **Task 13**: P&L integration (use classifications)
12. **Task 14**: Cron job (automated re-runs)
13. **Task 15**: Wire old classifier (backward compat)

**Dependencies:**
- Tasks 1-2 must run first (schema + types)
- Tasks 3-6 can be developed in order (each builds on prior)
- Task 7 must precede Tasks 8-10 (persistence layer needed by API routes)
- Tasks 8-10 must precede Tasks 11-12 (UI calls API)
- Task 13 can run after Task 7
- Task 14 depends on Task 6
- Task 15 depends on Task 2
