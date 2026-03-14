# Product Classification Redesign — Silent Auto-Classify + Inline Editing

**Date:** 2026-03-14
**Status:** Approved
**Scope:** Remove onboarding store-type step + settings classification page. Replace with silent auto-classify on store connect + inline Type column in Product Performance table.

---

## Part 1 — Remove Onboarding Step

**Delete:** `src/app/dashboard/onboarding/StoreTypeStep.tsx`

**Modify:** `src/app/dashboard/onboarding/page.tsx`
- Remove step 2 (Store Type Selection) from the 5-step flow → becomes 4-step flow
- Remove import of `StoreTypeStep`
- Renumber steps: Connect Shopify → Connect Meta → Configure → Install Pixel
- Keep all other steps intact

**Keep:** All intelligence backend files:
- `src/lib/intelligence/signalStackClassifier.ts`
- `src/lib/intelligence/classificationRouter.ts`
- `src/lib/intelligence/storeTypeDetector.ts`
- `src/lib/intelligence/orderPatternAnalyzer.ts`
- `src/lib/intelligence/types.ts`

---

## Part 2 — Silent Auto-Classify on Store Connect

**File:** `src/app/api/auth/shopify/callback/route.ts`

The existing callback already fires a POST to `/api/intelligence/init` (fire-and-forget) which runs `initializeStore` — this fetches products/orders first, then calls `classifyAllProducts`. **Keep this existing flow.** The `initializeStore` orchestrator handles data loading before classification, which is required since `classifyAllProducts` depends on order data from `shopify_orders_cache`.

No code changes needed here — the existing fire-and-forget POST to `/api/intelligence/init` already triggers classification silently.

**Behavior:**
- No loading screen, no modal, no notification
- If classification is still running when merchant opens dashboard, products show `classification = 'pending'` with a subtle spinner — not blocking

---

## Part 3 — Shopify Tags as Highest Priority

**File:** `src/lib/intelligence/signalStackClassifier.ts`

Add tag checking BEFORE signal analysis (at the top of `classifyProduct` or equivalent):

```typescript
const TAG_MAP: Record<string, string> = {
  // OneScale-specific tags
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
```

**Rules:**
- If any product tag matches → classify immediately, skip signal stack entirely
- Store as `classification_method = 'shopify_tag'`, `confidence = 100`
- **Priority order:** Shopify tags (confidence 100) > manual UI override > signal stack auto-detect
- Shopify tags always win — even over manual overrides (tags represent deliberate Shopify-side intent)
- All tag matching is **case-insensitive** (`.toLowerCase()` before lookup)
- Use a `Set` for O(1) lookups rather than iterating the record
- Document in tooltip on product table header

---

## Part 4 — Classification Column in Product Performance Table

**Files:** `src/components/pnl/ProductPnLSection.tsx` and `src/components/pnl/ProductPnLListRow.tsx` (the actual product table components)

Add a **Type** column as the last column before any Actions column.

**Badge states:**
| State | Dot | Color | Behavior |
|-------|-----|-------|----------|
| MAIN | ● green | `#059669` | Default, clickable |
| UPSELL | ● blue | `#2563eb` | Clickable |
| BUNDLE | ● purple | `#7c3aed` | Clickable |
| EXCLUDED | ○ gray | `#a1a1aa` | Row greyed out, product name strikethrough |
| PENDING | ⏳ spinner | `#a1a1aa` | Not clickable, "Need more data" |
| AUTO | ⚠ amber | `#d97706` | Amber bg, shown when `confidence < 65`. Badge text shows "AUTO ▾" (not the classification). The actual auto-detected classification is visible inside the dropdown when clicked. |

**Confidence threshold:** Define `REVIEW_CONFIDENCE_THRESHOLD = 65` as a named constant shared between badge rendering and filter logic.

**Data source:** Fetch classifications alongside product performance data from `/api/pnl/product-performance` (already joins `product_classifications` table).

---

## Part 5 — Inline Dropdown Override

Every classification badge is clickable. On click, show a small dropdown inline (not a modal):

**Options:**
- ● MAIN (with ✓ if current)
- ● UPSELL
- ◎ BUNDLE
- ○ EXCLUDE
- ─── divider ───
- ⚡ Why auto-detected (expandable)
- 🏷 Set tag in Shopify (opens `https://{shop}.myshopify.com/admin/products/{product_id}` in new tab)

**On selection:**
1. Optimistic UI — immediately update badge
2. PATCH `/api/intelligence/classifications` with `{ productId, classification, userEmail }` (server sets `manual_override = true` automatically)
3. Server sets `manual_override = true`, `manual_override_by = userEmail`, `manual_override_at = now`
4. Never overwrite during re-classification runs

**"Why auto-detected" expands to show:**
- Signal breakdown (alone%, first position%, revenue share, etc.)
- Each signal labeled as "✓ MAIN signal" or "✓ UPSELL signal"
- Confidence %, method, last analyzed timestamp

---

## Part 6 — Filtering by Classification

Add filter pills above the product table:

| Filter | Shows |
|--------|-------|
| All | Everything |
| Main Only | Shows MAIN + BUNDLE + PENDING + UNKNOWN (hides UPSELL and EXCLUDED) — **default view** |
| Upsells | Only UPSELL products with revenue contribution |
| Needs Review | Only `confidence < REVIEW_CONFIDENCE_THRESHOLD` or `classification = 'unknown'` |

Default view is **Main Only** — upsell and excluded products hidden unless merchant switches filter.

**Note:** This replaces the existing "Main Only" / "All Products" toggle in `ProductPnLSection.tsx`. Remove the old toggle and replace with the new filter pills.

---

## Part 7 — P&L Behavior Per Classification

**Files:** `src/lib/pnl/universalCalculator.ts`, `src/app/api/pnl/product-performance/route.ts`

| Classification | P&L Revenue | Ad Spend | Product Table |
|---------------|-------------|----------|---------------|
| MAIN | Included | Attributed | Shown |
| UPSELL | "Upsell Revenue" line | NOT attributed | Hidden unless filter=Upsells |
| BUNDLE | Bundle total | Attributed | Shown |
| EXCLUDED | Removed entirely | None | Greyed out row |
| PENDING | Included + warning | Based on fallback | Shown with ⏳ |
| UNKNOWN | Treated as MAIN + ⚠ | Attributed | Shown with ⚠ badge |

---

## Part 8 — Remove Dead Code

**Delete:**
- `src/app/dashboard/settings/product-classification/page.tsx`
- `src/app/dashboard/onboarding/StoreTypeStep.tsx`

**Modify:**
- `src/app/dashboard/settings/layout.tsx` — remove "Product Classification" nav item

**Keep:** All backend intelligence files intact.

**Note:** The "Re-classify" button from the old settings page is not replaced. Classification runs automatically on store connect and via the existing weekly cron. No manual trigger needed.

---

## Notes from Spec Review

- **Shop domain for "Set tag in Shopify" link:** Source the `shop` domain from `store_config` table (already available in store context). URL format: `https://{shop}.myshopify.com/admin/products/{product_id}`
- **UPSELL badge color:** Deliberately changed from amber (old settings page) to blue (`#2563eb`) for better visual distinction from the AUTO/warning amber state
- **"Upsell Revenue" P&L line:** This uses the existing `upsellRevenue` total already calculated in `universalCalculator.ts` — no new component needed, just ensure the P&L summary cards surface it

---

## Technical Constraints

- Stack: Next.js 16, TypeScript, Tailwind CSS 4, Supabase
- DB pattern: `rest()` from `supabase-persistence.ts` — raw PostgREST, zero `@supabase/supabase-js`
- Classification runs silently — zero blocking UI
- Priority: Shopify tags (confidence 100) > manual UI override > signal stack auto-detect
- Manual UI override is permanent — never overwritten during re-classification (except by Shopify tags)
- One store never affects another
- Optimistic UI on all classification changes
- Do not break existing dashboard functionality
