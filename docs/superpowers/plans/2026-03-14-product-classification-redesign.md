# Product Classification Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace onboarding store-type question and settings classification page with silent auto-classify + inline editing in the Product Performance table.

**Architecture:** Remove 2 UI surfaces (StoreTypeStep, product-classification settings page). Add Shopify tag priority layer to signalStackClassifier. Add Type column + inline dropdown + filter pills to ProductPnLSection/ProductPnLListRow. P&L calculator respects classification-based revenue/spend rules.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS 4, Supabase (PostgREST via `rest()`), Framer Motion, Lucide icons

---

## Chunk 1: Remove Dead UI + Onboarding Cleanup

### Task 1: Delete StoreTypeStep and remove from onboarding flow

**Files:**
- Delete: `src/app/dashboard/onboarding/StoreTypeStep.tsx`
- Modify: `src/app/dashboard/onboarding/page.tsx`

- [ ] **Step 1: Remove StoreTypeStep import and STEPS entry from onboarding page**

In `src/app/dashboard/onboarding/page.tsx`:
- Remove line 23: `import { StoreTypeStep } from './StoreTypeStep';`
- Remove the `ShoppingBag` import from line 18 (it's only used by the store-type step)
- Remove the store-type step object from the `STEPS` array (lines 43-48):
```typescript
// DELETE this entire object from the STEPS array:
{
  id: 'store-type',
  title: 'Store Structure',
  subtitle: 'Tell us how your store works so we can classify products',
  icon: ShoppingBag,
  skippable: false,
},
```
- Remove the StoreTypeStep rendering block (lines 697-699):
```typescript
// DELETE these lines:
{step.id === 'store-type' && (
  <StoreTypeStep storeId={storeId} onComplete={goNext} />
)}
```

The STEPS array should now be 4 items: shopify → meta → configure → pixel. Step numbering auto-adjusts since it's index-based.

- [ ] **Step 2: Delete StoreTypeStep.tsx**

Delete the file: `src/app/dashboard/onboarding/StoreTypeStep.tsx`

- [ ] **Step 3: Verify build compiles**

Run: `cd "C:/Users/mahes/Projects/One-Scale" && npx next build 2>&1 | head -30`
Expected: No import errors for StoreTypeStep or ShoppingBag

- [ ] **Step 4: Commit**

```bash
git add -u src/app/dashboard/onboarding/
git commit -m "feat: remove store-type step from onboarding flow

Classification now runs silently on store connect — no merchant input required."
```

---

### Task 2: Remove product-classification settings page and nav item

**Files:**
- Delete: `src/app/dashboard/settings/product-classification/page.tsx`
- Modify: `src/app/dashboard/settings/layout.tsx`

- [ ] **Step 1: Remove Product Classification nav entry from settings layout**

In `src/app/dashboard/settings/layout.tsx`, remove the `ShoppingBag` import from line 16 and remove the entire object from `settingsTabs` array (lines 50-55):
```typescript
// DELETE this entire object:
{
  label: 'Product Classification',
  href: '/dashboard/settings/product-classification',
  icon: ShoppingBag,
  description: 'Main vs upsell product classification',
},
```

- [ ] **Step 2: Delete product-classification page**

Delete: `src/app/dashboard/settings/product-classification/page.tsx`
Also delete the directory if empty: `src/app/dashboard/settings/product-classification/`

- [ ] **Step 3: Verify build compiles**

Run: `cd "C:/Users/mahes/Projects/One-Scale" && npx next build 2>&1 | head -30`
Expected: No import errors

- [ ] **Step 4: Commit**

```bash
git add -u src/app/dashboard/settings/
git rm src/app/dashboard/settings/product-classification/page.tsx
git commit -m "feat: remove product classification settings page

Classification now managed inline in the Product Performance table."
```

---

## Chunk 2: Shopify Tag Priority in Classifier

### Task 3: Add TAG_MAP and tag-first classification to signalStackClassifier.ts

**Files:**
- Modify: `src/lib/intelligence/signalStackClassifier.ts`

- [ ] **Step 1: Add TAG_MAP constant and tag check function**

Add at the top of `src/lib/intelligence/signalStackClassifier.ts`, after the existing imports (after line 15):

```typescript
// ── Shopify Tag Priority Map ────────────────────────────────
// Tags are checked BEFORE signal analysis. If any match → classify immediately.
// Shopify tags always win — confidence 100, overrides everything.

const TAG_MAP: Record<string, string> = {
  // OneScale-specific tags (highest priority)
  'onescale:main': 'main',
  'onescale:upsell': 'upsell',
  'onescale:exclude': 'exclude',
  'onescale:bundle': 'bundle',
  // Common third-party and merchant tags
  'upsell': 'upsell',
  'order-bump': 'upsell',
  'order_bump': 'upsell',
  'bump': 'upsell',
  'addon': 'upsell',
  'add-on': 'upsell',
  'cross-sell': 'upsell',
  'crosssell': 'upsell',
  'main-product': 'main',
  'hero-product': 'main',
  'hero': 'main',
  'exclude-pnl': 'exclude',
  'no-pnl': 'exclude',
};

// Pre-build Set for O(1) lookups
const TAG_KEYS = new Set(Object.keys(TAG_MAP));

/**
 * Check if any Shopify product tags match known classification tags.
 * Returns the classification if matched, null otherwise.
 * Case-insensitive matching.
 */
export function checkShopifyTags(tags: string): string | null {
  if (!tags) return null;
  const productTags = tags.toLowerCase().split(',').map(t => t.trim());
  for (const tag of productTags) {
    if (TAG_KEYS.has(tag)) {
      return TAG_MAP[tag];
    }
  }
  return null;
}

/** Confidence threshold below which products show as "needs review" */
export const REVIEW_CONFIDENCE_THRESHOLD = 65;
```

- [ ] **Step 2: Verify build compiles**

Run: `cd "C:/Users/mahes/Projects/One-Scale" && npx next build 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/lib/intelligence/signalStackClassifier.ts
git commit -m "feat: add Shopify tag priority map and checkShopifyTags function

Tags checked before signal analysis — onescale:main, onescale:upsell, etc.
Confidence threshold constant exported for reuse."
```

---

### Task 4: Integrate tag checking into classificationRouter.ts + add 'shopify_tag' method

**Files:**
- Modify: `src/lib/intelligence/classificationRouter.ts`
- Modify: `src/lib/intelligence/types.ts`

- [ ] **Step 1: Add 'shopify_tag' to SignalStackMethod type**

In `src/lib/intelligence/types.ts`, line 238, change:
```typescript
export type SignalStackMethod = 'signal_stack' | 'store_type_rule' | 'manual' | 'edge_case';
```
To:
```typescript
export type SignalStackMethod = 'signal_stack' | 'store_type_rule' | 'manual' | 'edge_case' | 'shopify_tag';
```

- [ ] **Step 2: Restructure classifyAllProducts for tag > manual > auto priority**

In `src/lib/intelligence/classificationRouter.ts`:

Add import at top (after line 15):
```typescript
import { checkShopifyTags } from './signalStackClassifier';
```

The key fix: tags must be checked on ALL products BEFORE the manual override filter. Replace `classifyAllProducts` function body (lines 36-98) with:

```typescript
export async function classifyAllProducts(storeId: string): Promise<ClassifyResult> {
  const enc = (v: string) => encodeURIComponent(v);

  // 1. Get or detect store intelligence
  let intel = await getStoreIntelligence(storeId);
  if (!intel || !('store_type' in intel)) {
    await detectStoreType(storeId);
    intel = await getStoreIntelligence(storeId);
  }

  const rawIntel = intel as Record<string, unknown> | null;
  const merchantConfirmed = rawIntel?.merchant_confirmed_type as StoreType | null;
  const detectedType = (rawIntel?.store_type as StoreType) || 'mixed';
  const storeType: StoreType = merchantConfirmed || detectedType;

  // 2. Load existing manual overrides
  const existingOverrides = await rest<StoredClassification[]>(
    `/product_classifications?store_id=eq.${enc(storeId)}&manual_override=eq.true&select=product_id,classification,manual_override,confidence`
  ).catch(() => [] as StoredClassification[]);

  const manualOverrideIds = new Set(existingOverrides.map(o => o.product_id));

  // 3. Get all order patterns to check tags on ALL products first
  const allPatterns = await analyzeOrderPatterns(storeId);

  // 4. Tag-first pass: classify tag-matched products (tags > manual > auto)
  const tagResults: SignalStackResult[] = [];
  const tagMatchedIds = new Set<string>();

  for (const p of allPatterns) {
    const tagClassification = checkShopifyTags(p.tags || '');
    if (tagClassification) {
      tagMatchedIds.add(p.product_id);
      tagResults.push({
        product_id: p.product_id,
        product_title: p.product_title,
        product_type: p.product_type,
        classification: tagClassification as SignalStackResult['classification'],
        confidence: 100,
        method: 'shopify_tag',
        signals: null,
        alone_pct: p.alone_pct,
        first_position_pct: p.first_position_pct,
        avg_position: p.avg_position,
        revenue_share: p.revenue_share,
        total_orders_analyzed: p.total_orders,
        needs_review: false,
      });
    }
  }

  // 5. Skip IDs = manual overrides that DON'T have a tag match (tags win over manual)
  const skipIds = new Set([...manualOverrideIds].filter(id => !tagMatchedIds.has(id)));

  // 6. Route remaining products by store type
  let storeTypeResults: SignalStackResult[];

  switch (storeType) {
    case 'single_product':
    case 'general':
      storeTypeResults = await markAllAsMain(storeId, storeType, skipIds, tagMatchedIds);
      break;
    case 'subscription':
      storeTypeResults = await classifyWithSubscriptionPriority(storeId, skipIds, tagMatchedIds);
      break;
    case 'funnel':
    case 'mixed':
    default:
      storeTypeResults = await runFullSignalStack(storeId, skipIds, tagMatchedIds);
      break;
  }

  // 7. Combine: tag results + store-type results
  const results = [...tagResults, ...applyEdgeCases(storeTypeResults)];

  // 8. Persist (tag-matched products override even manual entries)
  await persistClassifications(storeId, results, skipIds);

  // 9. Update timestamp
  await rest(
    `/store_intelligence?store_id=eq.${enc(storeId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        store_type_detected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    }
  ).catch(() => {});

  const needsReview = results.filter(r => r.needs_review).length;
  return { classified: results.length, needsReview, results };
}
```

- [ ] **Step 3: Update helper functions to accept tagMatchedIds**

Update `runFullSignalStack`, `markAllAsMain`, and `classifyWithSubscriptionPriority` to also skip tag-matched products (they're already handled). Add `tagMatchedIds: Set<string>` parameter and filter them out alongside `skipIds`:

```typescript
// In all three functions, change the filter line to:
const filtered = patterns.filter(p => !skipIds.has(p.product_id) && !tagMatchedIds.has(p.product_id));
```

For `markAllAsMain`, since it calls `analyzeOrderPatterns` internally, change it to accept pre-fetched patterns or keep internal fetch but filter both sets:

```typescript
async function markAllAsMain(
  storeId: string,
  reason: string,
  skipIds: Set<string>,
  tagMatchedIds: Set<string>,
): Promise<SignalStackResult[]> {
  const patterns = await analyzeOrderPatterns(storeId);
  return patterns
    .filter(p => !skipIds.has(p.product_id) && !tagMatchedIds.has(p.product_id))
    .map(p => ({
      product_id: p.product_id,
      product_title: p.product_title,
      product_type: p.product_type,
      classification: 'main' as const,
      confidence: 90,
      method: 'store_type_rule' as const,
      signals: null,
      alone_pct: p.alone_pct,
      first_position_pct: p.first_position_pct,
      avg_position: p.avg_position,
      revenue_share: p.revenue_share,
      total_orders_analyzed: p.total_orders,
      needs_review: false,
    }));
}
```

Apply same pattern to `runFullSignalStack` and `classifyWithSubscriptionPriority`.

- [ ] **Step 3: Verify build compiles**

Run: `cd "C:/Users/mahes/Projects/One-Scale" && npx next build 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/lib/intelligence/classificationRouter.ts src/lib/intelligence/signalStackClassifier.ts
git commit -m "feat: integrate Shopify tag priority into classification router

Tags checked before signal stack — matching products classified immediately
with confidence 100 and method 'shopify_tag'."
```

---

## Chunk 3: Classification Type Column + Inline Dropdown

### Task 5: Add classification data to ProductPnLData type

**Files:**
- Modify: `src/types/productPnl.ts`

- [ ] **Step 1: Add classification fields to ProductPnLData interface**

In `src/types/productPnl.ts`, add these fields to the `ProductPnLData` interface (after line 29, after `category`):

```typescript
  // Classification intelligence data
  classificationConfidence?: number;     // 0-100
  classificationMethod?: string;         // 'signal_stack' | 'shopify_tag' | 'manual' | 'edge_case' | 'store_type_rule'
  classificationSignals?: Record<string, number> | null;  // signal breakdown
  needsReview?: boolean;
  manualOverride?: boolean;
  lastAnalyzed?: string;                 // ISO timestamp
```

- [ ] **Step 2: Commit**

```bash
git add src/types/productPnl.ts
git commit -m "feat: add classification intelligence fields to ProductPnLData type"
```

---

### Task 6: Create ClassificationBadge component

**Files:**
- Create: `src/components/pnl/ClassificationBadge.tsx`

- [ ] **Step 1: Create the ClassificationBadge component with dropdown**

Create `src/components/pnl/ClassificationBadge.tsx`:

```typescript
'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, Loader2, ExternalLink, ChevronDown, Zap, Tag, Check } from 'lucide-react';
import { REVIEW_CONFIDENCE_THRESHOLD } from '@/lib/intelligence/signalStackClassifier';
import type { ProductCategory } from '@/types/productPnl';

interface ClassificationBadgeProps {
  productId: string;
  storeId: string;
  classification: ProductCategory;
  confidence?: number;
  method?: string;
  signals?: Record<string, number> | null;
  needsReview?: boolean;
  manualOverride?: boolean;
  lastAnalyzed?: string;
  shopifyUrl?: string | null;
  onClassificationChange?: (productId: string, newClassification: ProductCategory) => void;
}

const BADGE_CONFIG: Record<string, { color: string; dotClass: string; label: string }> = {
  main:     { color: 'text-emerald-600', dotClass: 'bg-emerald-500', label: 'MAIN' },
  upsell:   { color: 'text-blue-600', dotClass: 'bg-blue-500', label: 'UPSELL' },
  bundle:   { color: 'text-violet-600', dotClass: 'bg-violet-500', label: 'BUNDLE' },
  excluded: { color: 'text-zinc-400', dotClass: 'bg-zinc-300 border border-zinc-400', label: 'EXCLUDED' },
  pending:  { color: 'text-zinc-400', dotClass: '', label: 'PENDING' },
  unknown:  { color: 'text-amber-600', dotClass: 'bg-amber-500', label: 'AUTO' },
};

const DROPDOWN_OPTIONS: { key: ProductCategory; label: string; dotClass: string }[] = [
  { key: 'main', label: 'MAIN', dotClass: 'bg-emerald-500' },
  { key: 'upsell', label: 'UPSELL', dotClass: 'bg-blue-500' },
  { key: 'bundle', label: 'BUNDLE', dotClass: 'bg-violet-500' },
  { key: 'excluded', label: 'EXCLUDE', dotClass: 'bg-zinc-300 border border-zinc-400' },
];

const SIGNAL_LABELS: Record<string, string> = {
  alone_pct_score: 'Alone in orders',
  position_score: 'First item position',
  revenue_score: 'Revenue share',
  tag_score: 'Shopify tags',
  type_score: 'Product type',
  title_score: 'Title keywords',
  price_score: 'Price analysis',
  app_score: 'App detection',
  subscription_score: 'Subscription',
};

export function ClassificationBadge({
  productId,
  storeId,
  classification,
  confidence = 0,
  method,
  signals,
  needsReview,
  manualOverride,
  lastAnalyzed,
  shopifyUrl,
  onClassificationChange,
}: ClassificationBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowWhy(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Determine badge display
  const isPending = classification === 'pending';
  const isLowConfidence = !isPending && !manualOverride && confidence < REVIEW_CONFIDENCE_THRESHOLD && confidence > 0;
  const effectiveClassification = classification === 'downsell' || classification === 'addon' ? 'upsell' : classification;
  const config = BADGE_CONFIG[effectiveClassification] || BADGE_CONFIG.unknown;

  // Pending badge — not clickable
  if (isPending) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-zinc-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        PENDING
      </span>
    );
  }

  // Low confidence → show AUTO badge
  const showAsAuto = isLowConfidence || effectiveClassification === 'unknown';

  async function handleSelect(newClassification: ProductCategory) {
    setIsOpen(false);
    setShowWhy(false);

    // Optimistic update
    onClassificationChange?.(productId, newClassification);

    // Persist to API
    await fetch(`/api/intelligence/classifications?storeId=${encodeURIComponent(storeId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, classification: newClassification }),
    }).catch(err => console.error('[Classification] Update failed:', err));
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Badge button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer',
          showAsAuto
            ? 'text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100'
            : `${config.color} hover:opacity-80`,
        )}
      >
        {showAsAuto ? (
          <>
            <AlertTriangle className="h-3 w-3" />
            AUTO
            <ChevronDown className="h-2.5 w-2.5" />
          </>
        ) : (
          <>
            <span className={cn('h-[6px] w-[6px] rounded-full flex-shrink-0', config.dotClass)} />
            {config.label}
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1.5 w-56 bg-surface-elevated border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Classification options */}
          {DROPDOWN_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => handleSelect(opt.key)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs transition-colors hover:bg-surface-hover',
                effectiveClassification === opt.key && 'font-semibold',
              )}
            >
              <span className={cn('h-[6px] w-[6px] rounded-full flex-shrink-0', opt.dotClass)} />
              <span className="flex-1 text-left text-text-primary">{opt.label}</span>
              {effectiveClassification === opt.key && (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              )}
            </button>
          ))}

          <div className="border-t border-border" />

          {/* Why auto-detected */}
          <button
            onClick={() => setShowWhy(!showWhy)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <Zap className="h-3 w-3" />
            <span>Why auto-detected</span>
          </button>

          {showWhy && signals && (
            <div className="px-3.5 pb-3 space-y-1.5">
              {Object.entries(signals).map(([key, score]) => {
                if (key === 'main_score' || key === 'upsell_score' || key === 'confidence') return null;
                if (score === 0) return null;
                const isMainSignal = score > 0;
                return (
                  <div key={key} className="flex items-center justify-between text-[10px]">
                    <span className="text-text-secondary">{SIGNAL_LABELS[key] || key}</span>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[9px] font-medium',
                      isMainSignal ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600',
                    )}>
                      {isMainSignal ? 'MAIN' : 'UPSELL'}
                    </span>
                  </div>
                );
              })}
              <div className="flex gap-3 pt-1.5 mt-1.5 border-t border-border text-[10px] text-text-muted">
                <span>Confidence: <strong className={confidence >= REVIEW_CONFIDENCE_THRESHOLD ? 'text-emerald-500' : 'text-amber-500'}>{confidence}%</strong></span>
                <span>Method: <strong>{method}</strong></span>
              </div>
              {lastAnalyzed && (
                <div className="text-[10px] text-text-muted">
                  Last analyzed: {new Date(lastAnalyzed).toLocaleString()}
                </div>
              )}
            </div>
          )}

          {/* Set tag in Shopify */}
          {shopifyUrl && (
            <a
              href={shopifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors border-t border-border"
            >
              <Tag className="h-3 w-3" />
              <span>Set tag in Shopify</span>
              <ExternalLink className="h-2.5 w-2.5 ml-auto" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd "C:/Users/mahes/Projects/One-Scale" && npx next build 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/components/pnl/ClassificationBadge.tsx
git commit -m "feat: add ClassificationBadge component with inline dropdown override

Supports all badge states: MAIN, UPSELL, BUNDLE, EXCLUDED, PENDING, AUTO.
Includes why-auto-detected expandable, Shopify link, optimistic updates."
```

---

### Task 7: Add filter pills and Type column to ProductPnLSection

**Files:**
- Modify: `src/components/pnl/ProductPnLSection.tsx`

- [ ] **Step 1: Replace Main Only / All Products toggle with classification filter pills**

In `src/components/pnl/ProductPnLSection.tsx`:

Add imports at top:
```typescript
import { REVIEW_CONFIDENCE_THRESHOLD } from '@/lib/intelligence/signalStackClassifier';
import { useStoreStore } from '@/stores/storeStore';
```

Also add `ProductCategory` to the existing type import on line 4:
```typescript
import type { ProductPnLData, ProductSortKey, ProductViewMode, ProductCategory } from '@/types/productPnl';
```

Replace the `FilterMode` type and the `showAllProducts` state (lines 25, 51) with a new classification filter:

```typescript
type ClassificationFilter = 'all' | 'main' | 'upsells' | 'needs-review';
```

Replace `const [showAllProducts, setShowAllProducts] = useState(false);` with:
```typescript
const [classFilter, setClassFilter] = useState<ClassificationFilter>('main');
const activeStoreId = useStoreStore((s) => s.activeStoreId) || 'default';
```

Update the `filteredAndSorted` useMemo to replace the `showAllProducts` logic (lines 62-65):

Replace:
```typescript
    // Filter by Main Only vs All Products
    let filtered = products;
    if (!showAllProducts) {
      filtered = filtered.filter((p) => (p.category || 'main').toLowerCase() === 'main');
    }
```

With:
```typescript
    // Filter by classification
    let filtered = products;
    switch (classFilter) {
      case 'main':
        filtered = filtered.filter((p) => {
          const cat = (p.category || 'main').toLowerCase();
          return cat === 'main' || cat === 'bundle' || cat === 'pending' || cat === 'unknown';
        });
        break;
      case 'upsells':
        filtered = filtered.filter((p) => (p.category || 'main').toLowerCase() === 'upsell');
        break;
      case 'needs-review':
        filtered = filtered.filter((p) =>
          (p.classificationConfidence != null && p.classificationConfidence < REVIEW_CONFIDENCE_THRESHOLD) ||
          (p.category || 'main').toLowerCase() === 'unknown'
        );
        break;
      // 'all' — no filter
    }
```

Update the `useMemo` deps: replace `showAllProducts` with `classFilter`.

- [ ] **Step 2: Replace the toggle UI with filter pills**

Replace the entire "Product toggle" block (lines 114-140):

```typescript
{/* Classification filter pills */}
<div className="flex items-center gap-2 mb-3">
  {([
    { key: 'all' as const, label: 'All', style: 'bg-zinc-900 text-white', inactiveStyle: 'text-text-secondary hover:text-text-primary' },
    { key: 'main' as const, label: 'Main Only', style: 'bg-emerald-50 text-emerald-600 border border-emerald-200', inactiveStyle: 'text-text-secondary hover:text-text-primary' },
    { key: 'upsells' as const, label: 'Upsells', style: 'bg-blue-50 text-blue-600 border border-blue-200', inactiveStyle: 'text-text-secondary hover:text-text-primary' },
    { key: 'needs-review' as const, label: 'Needs Review', style: 'bg-amber-50 text-amber-600 border border-amber-200', inactiveStyle: 'text-text-secondary hover:text-text-primary' },
  ]).map(pill => (
    <button
      key={pill.key}
      onClick={() => setClassFilter(pill.key)}
      className={cn(
        'px-3.5 py-1.5 rounded-full text-[11px] font-medium transition-all',
        classFilter === pill.key ? pill.style : pill.inactiveStyle,
      )}
    >
      {pill.label}
    </button>
  ))}
  <span className="ml-auto text-[10px] text-text-muted flex items-center gap-1">
    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
    Tag in Shopify: <code className="bg-surface px-1 rounded text-[9px]">onescale:main</code> or <code className="bg-surface px-1 rounded text-[9px]">onescale:upsell</code>
  </span>
</div>
```

- [ ] **Step 3: Add Type column header to list view**

In the `listHeaders` array (lines 27-43), add a Type header before the last empty-label Actions column:

```typescript
  { label: 'Type', align: 'center' as const },
```

Insert it before `{ label: '', align: 'center' as const }`.

- [ ] **Step 4: Add classification change handler**

Add a callback for optimistic classification updates. After the state declarations, add:

```typescript
const [localClassifications, setLocalClassifications] = useState<Record<string, ProductCategory>>({});

function handleClassificationChange(productId: string, newClassification: ProductCategory) {
  setLocalClassifications(prev => ({ ...prev, [productId]: newClassification }));
}
```

Update the product mapping to use local overrides. In the `filteredAndSorted` useMemo, after the sort, apply local overrides:

Add to the useMemo deps: `localClassifications`

Before the `return sorted;` line, add:
```typescript
    // Apply optimistic classification updates
    return sorted.map(p => {
      const override = localClassifications[p.productId];
      if (override) {
        return { ...p, category: override };
      }
      return p;
    });
```

- [ ] **Step 5: Pass storeId and handler to ProductPnLListRow and ProductPnLCard**

Update the `ProductPnLListRow` rendering to pass classification props:
```typescript
<ProductPnLListRow
  key={product.productId}
  product={product}
  isDigital={isDigital}
  storeId={activeStoreId}
  onClassificationChange={handleClassificationChange}
/>
```

Do the same for `ProductPnLCard`.

- [ ] **Step 6: Update the Clear filters button**

Replace the existing clear filters onClick (line 296-299):
```typescript
onClick={() => {
  setSearch('');
  setFilterMode('all');
  setClassFilter('all');
}}
```

- [ ] **Step 7: Verify build compiles**

Run: `cd "C:/Users/mahes/Projects/One-Scale" && npx next build 2>&1 | head -30`

- [ ] **Step 8: Commit**

```bash
git add src/components/pnl/ProductPnLSection.tsx
git commit -m "feat: add classification filter pills and Type column to product table

Replaces old Main Only / All Products toggle with classification-aware
filter pills: All, Main Only, Upsells, Needs Review."
```

---

### Task 8: Add Type column to ProductPnLListRow

**Files:**
- Modify: `src/components/pnl/ProductPnLListRow.tsx`

- [ ] **Step 1: Add ClassificationBadge to list row**

In `src/components/pnl/ProductPnLListRow.tsx`:

Add imports:
```typescript
import { ClassificationBadge } from '@/components/pnl/ClassificationBadge';
import type { ProductCategory } from '@/types/productPnl';
```

Update the interface to accept new props:
```typescript
interface ProductPnLListRowProps {
  product: ProductPnLData;
  isDigital?: boolean;
  storeId?: string;
  onClassificationChange?: (productId: string, newClassification: ProductCategory) => void;
}
```

Update the function signature:
```typescript
export function ProductPnLListRow({ product, isDigital = false, storeId = 'default', onClassificationChange }: ProductPnLListRowProps) {
```

Add excluded row styling — update the `<tr>` className:
```typescript
<tr className={cn(
  'border-b border-border hover:bg-surface-hover transition-colors',
  product.category === 'excluded' && 'opacity-50',
)}>
```

Add the product name strikethrough for excluded products — update the product name span:
```typescript
<span className={cn(
  'truncate text-sm font-medium text-text-primary',
  product.category === 'excluded' && 'line-through text-text-muted',
)}>
```

Add the Type column cell BEFORE the last `<td>` (the link/actions column, line 156-166):

```typescript
      {/* Type */}
      <td className="px-2 py-3 text-center">
        <ClassificationBadge
          productId={product.productId}
          storeId={storeId}
          classification={product.category}
          confidence={product.classificationConfidence}
          method={product.classificationMethod}
          signals={product.classificationSignals}
          needsReview={product.needsReview}
          manualOverride={product.manualOverride}
          lastAnalyzed={product.lastAnalyzed}
          shopifyUrl={product.shopifyUrl}
          onClassificationChange={onClassificationChange}
        />
      </td>
```

- [ ] **Step 2: Verify build compiles**

Run: `cd "C:/Users/mahes/Projects/One-Scale" && npx next build 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/components/pnl/ProductPnLListRow.tsx
git commit -m "feat: add Type classification badge to product list row

Shows clickable badge with inline dropdown for classification changes.
Excluded rows get opacity-50 and strikethrough product name."
```

---

### Task 9: Add Type badge to ProductPnLCard (card view)

**Files:**
- Modify: `src/components/pnl/ProductPnLCard.tsx`

- [ ] **Step 1: Add imports and update interface**

Add to imports:
```typescript
import { ClassificationBadge } from '@/components/pnl/ClassificationBadge';
import type { ProductCategory } from '@/types/productPnl';
```

Update interface (replace lines 7-10):
```typescript
interface ProductPnLCardProps {
  product: ProductPnLData;
  isDigital?: boolean;
  storeId?: string;
  onClassificationChange?: (productId: string, newClassification: ProductCategory) => void;
}
```

Update function signature:
```typescript
export function ProductPnLCard({ product, isDigital = false, storeId = 'default', onClassificationChange }: ProductPnLCardProps) {
```

- [ ] **Step 2: Add excluded styling and badge**

Add `opacity-50` to card wrapper for excluded products (line 17):
```typescript
<div className={cn(
  'rounded-lg border border-border bg-surface p-4 hover:bg-surface-hover transition-colors',
  product.category === 'excluded' && 'opacity-50',
)}>
```

Replace the Shopify external link (lines 47-56) with the ClassificationBadge:
```typescript
        <ClassificationBadge
          productId={product.productId}
          storeId={storeId}
          classification={product.category}
          confidence={product.classificationConfidence}
          method={product.classificationMethod}
          signals={product.classificationSignals}
          needsReview={product.needsReview}
          manualOverride={product.manualOverride}
          lastAnalyzed={product.lastAnalyzed}
          shopifyUrl={product.shopifyUrl}
          onClassificationChange={onClassificationChange}
        />
```

- [ ] **Step 3: Verify build and commit**

```bash
git add src/components/pnl/ProductPnLCard.tsx
git commit -m "feat: add Type classification badge to product card view"
```

---

## Chunk 4: API + P&L Behavior

### Task 10: Enrich product-performance API with classification data

**Files:**
- Modify: `src/app/api/pnl/product-performance/route.ts`

- [ ] **Step 1: Expand the classification query select**

In `src/app/api/pnl/product-performance/route.ts`, line 100-102, change the `storedClassifications` fetch to include all classification fields:

```typescript
rest<Array<{ product_id: string; classification: string; manual_override: boolean; confidence: number; classification_method: string; signals_used: Record<string, number> | null; needs_review: boolean; last_analyzed: string | null }>>(
  `/product_classifications?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,classification,manual_override,confidence,classification_method,signals_used,needs_review,last_analyzed`
).catch(() => [] as Array<{ product_id: string; classification: string; manual_override: boolean; confidence: number; classification_method: string; signals_used: Record<string, number> | null; needs_review: boolean; last_analyzed: string | null }>),
```

- [ ] **Step 2: Update classificationMap to store full data**

Replace the simple `classificationMap` (lines 106-109) with a richer lookup:

```typescript
const classificationMap = new Map<string, {
  classification: string;
  confidence: number;
  method: string;
  signals: Record<string, number> | null;
  needsReview: boolean;
  manualOverride: boolean;
  lastAnalyzed: string | null;
}>();
for (const sc of storedClassifications) {
  classificationMap.set(sc.product_id, {
    classification: sc.classification,
    confidence: sc.confidence || 0,
    method: sc.classification_method || '',
    signals: sc.signals_used || null,
    needsReview: sc.needs_review || false,
    manualOverride: sc.manual_override || false,
    lastAnalyzed: sc.last_analyzed || null,
  });
}
```

- [ ] **Step 3: Update the stored classification lookup in the product loop**

Replace line 319 `const storedClass = classificationMap.get(productId);` with:
```typescript
const storedClassData = classificationMap.get(productId);
const storedClass = storedClassData?.classification;
```

- [ ] **Step 4: Add classification fields to the product response**

In the `products.push({...})` block (lines 352-386), add after `category: mostCommonCategory,`:

```typescript
        classificationConfidence: storedClassData?.confidence,
        classificationMethod: storedClassData?.method,
        classificationSignals: storedClassData?.signals,
        needsReview: storedClassData?.needsReview,
        manualOverride: storedClassData?.manualOverride,
        lastAnalyzed: storedClassData?.lastAnalyzed,
```

- [ ] **Step 5: Don't skip excluded products — show them greyed out**

Remove line 343: `if (mostCommonCategory === 'excluded') continue;`

Excluded products should still appear in the response so the UI can render them greyed out. The frontend filter handles hiding them from the default "Main Only" view.

- [ ] **Step 6: Verify build and commit**

```bash
git add src/app/api/pnl/product-performance/route.ts
git commit -m "feat: enrich product-performance API with classification intelligence data

Adds confidence, method, signals, needsReview, manualOverride, lastAnalyzed.
Excluded products now returned (shown greyed out instead of hidden)."
```

---

### Task 11: Update P&L calculator to respect classification rules

**Files:**
- Modify: `src/lib/pnl/universalCalculator.ts`

- [ ] **Step 1: Read universalCalculator.ts and find the product aggregation loop**

Read `src/lib/pnl/universalCalculator.ts`. Look for where `ProductPnL` objects are built and where `mainRevenue` / `upsellRevenue` totals are computed. The `PnLResult` type already has `mainRevenue` and `upsellRevenue` fields (defined in types.ts lines 225-226).

- [ ] **Step 2: Apply classification-based rules in the product loop**

In the section where per-product P&L is computed and totals are aggregated, add classification-aware logic. Find where `products` array is built and totals are summed:

```typescript
// For each product in the loop:
const classification = product.classification; // from product_classifications

// EXCLUDED → skip entirely (don't add to any totals)
if (classification === 'excluded') continue;

// UPSELL → add revenue to upsellRevenue, do NOT attribute ad spend
if (classification === 'upsell' || classification === 'downsell' || classification === 'addon') {
  upsellRevenue += product.revenue;
  // Set adSpend to 0 for upsells — the main product drove the purchase
  product.adSpend = 0;
} else {
  // MAIN, BUNDLE, PENDING, UNKNOWN → add to mainRevenue, attribute ad spend normally
  mainRevenue += product.revenue;
}
```

If the calculator already splits `mainRevenue` and `upsellRevenue`, ensure the classification field drives the split rather than the existing heuristic. If not, add this logic.

- [ ] **Step 3: Verify build and commit**

```bash
git add src/lib/pnl/universalCalculator.ts
git commit -m "feat: P&L calculator respects classification rules

MAIN/BUNDLE: full P&L + ad spend. UPSELL: separate revenue, no ad spend.
EXCLUDED: removed from all calculations. PENDING/UNKNOWN: treated as MAIN."
```

---

## Chunk 5: Final Cleanup + Verification

### Task 12: Clean up design preview file

**Files:**
- Delete: `design-preview.html` (root of project)

- [ ] **Step 1: Delete the design preview HTML**

```bash
rm "C:/Users/mahes/Projects/One-Scale/design-preview.html"
```

- [ ] **Step 2: Full build verification**

Run: `cd "C:/Users/mahes/Projects/One-Scale" && npx next build`
Expected: Clean build with no errors

- [ ] **Step 3: Final commit**

```bash
git add -u
git commit -m "chore: remove design preview file, clean up unused imports"
```
