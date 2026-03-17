# P&L Dashboard Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the P&L dashboard with Live Pulse row, Hourly Performance (3 views + comparison), Product category tabs (Main/Upsell/Downsell/Add-on), Refund breakdown, Chargebacks, AOV summary — while preserving all existing functionality.

**Architecture:** Additive-only approach. New components are composed into PnLDashboardClient alongside existing ones. No existing component is modified internally — only new imports/JSX added to the container. Product classification happens in the service layer. All new sections use Framer Motion for entrance animations and monochrome 2062 aesthetic.

**Tech Stack:** Next.js 16 + React 19 + Tailwind CSS 4 + Framer Motion 12 + Zustand 5

**Spec:** `docs/superpowers/specs/2026-03-13-pnl-enhancement-design.md`
**Mockup:** `public/pnl-mockup.html`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/pnl/LivePulseRow.tsx` | Compact live ticker + 4 today KPI cards in a single row |
| `src/components/pnl/HourlyPerformance.tsx` | 3-view toggle (Heatmap/Line/Bar) + peak hours + vs-last-week comparison |
| `src/components/pnl/RefundBreakdown.tsx` | Total / Full / Partial refund cards |
| `src/components/pnl/ChargebackSection.tsx` | Lost / Recovered chargeback cards |
| `src/components/pnl/AOVSummary.tsx` | Main AOV / With Upsells / AOV Lift / Take Rate |
| `src/components/pnl/SectionWrapper.tsx` | Reusable collapsible section container with label + animation |

### Modified Files
| File | Changes |
|------|---------|
| `src/types/pnl.ts` | Add `chargebackLoss`, `chargebackWon` to PnLEntry |
| `src/types/productPnL.ts` | Add `ProductCategory` type, `category` field to ProductPnLData |
| `src/services/productPnL.ts` | Add product classification logic (Main/Upsell/Downsell/Add-on) |
| `src/app/dashboard/pnl/page.tsx` | Add `getHourlyPnL` to parallel fetch, pass `hourlyPnL` prop |
| `src/components/pnl/PnLDashboardClient.tsx` | Import + compose all new sections, restructure layout |
| `src/components/pnl/ProductPnLSection.tsx` | Add category tabs (Main/Upsells/Downsells/Add-ons/All) |
| `src/components/pnl/PnLHourlyTrend.tsx` | Add Line/Bar view modes + comparison toggle |

### Untouched Files (MUST NOT MODIFY)
- `PnLSummaryCards.tsx`, `PnLWaterfallChart.tsx`, `PnLTrendChart.tsx`
- `PnLDayPartChart.tsx`, `MarginIndicator.tsx`, `COGSManager.tsx`
- `LiveProfitTicker.tsx`, `src/services/pnl.ts`

---

## Chunk 1: Types + Service Layer

### Task 1: Extend PnLEntry type

**Files:**
- Modify: `src/types/pnl.ts`

- [ ] **Step 1: Add chargeback fields to PnLEntry**

Add after `partialRefundAmount?` (around line 16):
```typescript
  chargebackLoss?: number;
  chargebackWon?: number;
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**
```bash
git add src/types/pnl.ts
git commit -m "feat(pnl): add chargeback fields to PnLEntry type"
```

### Task 2: Add ProductCategory to productPnL types

**Files:**
- Modify: `src/types/productPnL.ts`

- [ ] **Step 1: Add ProductCategory type and category field**

Add at end of file:
```typescript
export type ProductCategory = 'main' | 'upsell' | 'downsell' | 'addon';
```

Add `category` field to `ProductPnLData` interface (after `campaignName`):
```typescript
  category: ProductCategory;
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**
```bash
git add src/types/productPnL.ts
git commit -m "feat(pnl): add ProductCategory type and category field"
```

### Task 3: Add product classification to productPnL service

**Files:**
- Modify: `src/services/productPnL.ts`

- [ ] **Step 1: Add classification function**

Add before the `realGetProductPnLUncached` function:
```typescript
function classifyLineItem(
  lineItem: { price: string; quantity: number; title: string },
  maxPriceInOrder: number,
): ProductCategory {
  const price = parseFloat(lineItem.price || '0');
  if (price === 0) return 'addon';
  if (price >= maxPriceInOrder) return 'main';
  if (price >= maxPriceInOrder * 0.5) return 'upsell';
  return 'downsell';
}
```

- [ ] **Step 2: Apply classification during line-item aggregation**

Inside `realGetProductPnLUncached`, after grouping line items by productId, classify each:
- For each order, find `maxPrice` = highest line item price
- Assign category to each line item using `classifyLineItem()`
- Store the most frequent category per productId as the product's category

- [ ] **Step 3: Set category on each ProductPnLData**

In the final aggregation, set `category` field. Default to `'main'` if ambiguous.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**
```bash
git add src/services/productPnL.ts src/types/productPnL.ts
git commit -m "feat(pnl): classify products as main/upsell/downsell/addon"
```

---

## Chunk 2: Shared + Simple Components

### Task 4: Create SectionWrapper component

**Files:**
- Create: `src/components/pnl/SectionWrapper.tsx`

- [ ] **Step 1: Write SectionWrapper**

Reusable section container with:
- Label (uppercase tracking), optional "NEW"/"ENHANCED" tag
- Framer Motion `motion.div` with fadeInUp animation (opacity 0→1, y 12→0, duration 0.4s)
- Optional right-side toolbar slot (children)
- Consistent padding and border-bottom

Props: `label`, `tag?`, `toolbar?`, `children`

- [ ] **Step 2: Verify it renders**

Import in PnLDashboardClient temporarily, verify no errors.

- [ ] **Step 3: Commit**
```bash
git add src/components/pnl/SectionWrapper.tsx
git commit -m "feat(pnl): add SectionWrapper with animation"
```

### Task 5: Create LivePulseRow component

**Files:**
- Create: `src/components/pnl/LivePulseRow.tsx`

- [ ] **Step 1: Write LivePulseRow**

Props: `todayEntry: PnLEntry, summaryNetProfit: number`

Layout (single row grid: 1.4fr 1fr 1fr 1fr 1fr):
- **Col 1**: Reuse existing `LiveProfitTicker` internally (import it), wrap in compact gradient card (emerald→green for positive, red gradient for negative). Show pulsing dot + "Live · Today" label + net profit number + "Net Profit" sublabel
- **Col 2-5**: Mini KPI cards — Revenue (green), Ad Spend (red), Margin (green/red conditional), Orders (neutral)

Each mini KPI card: subtle glass border, uppercase micro-label, large tabular number, optional sub-text

Animations:
- Framer Motion `staggerChildren` (0.05s) for cards appearing
- Number counters animate on mount via CSS `@keyframes countUp`

Font: Use `font-variant-numeric: tabular-nums` on all numbers, `tracking-tight` on large values

- [ ] **Step 2: Verify standalone render**

- [ ] **Step 3: Commit**
```bash
git add src/components/pnl/LivePulseRow.tsx
git commit -m "feat(pnl): add LivePulseRow compact ticker + KPIs"
```

### Task 6: Create RefundBreakdown component

**Files:**
- Create: `src/components/pnl/RefundBreakdown.tsx`

- [ ] **Step 1: Write RefundBreakdown**

Props: `entry: PnLEntry`

Layout (3-column grid):
- **Total Refunds**: `entry.refunds`, count = `(fullRefundCount || 0) + (partialRefundCount || 0)`, show `% of revenue`
- **Full Refunds**: `entry.fullRefundAmount || 0`, count = `entry.fullRefundCount || 0`
- **Partial Refunds**: `entry.partialRefundAmount || 0`, count = `entry.partialRefundCount || 0`

Each card: monochrome surface, red for total, dimmer for zero values
Framer Motion fade-in with stagger

- [ ] **Step 2: Commit**
```bash
git add src/components/pnl/RefundBreakdown.tsx
git commit -m "feat(pnl): add RefundBreakdown with full/partial split"
```

### Task 7: Create ChargebackSection component

**Files:**
- Create: `src/components/pnl/ChargebackSection.tsx`

- [ ] **Step 1: Write ChargebackSection**

Props: `chargebackLoss: number, chargebackWon: number`

Layout (2-column grid):
- **Lost**: amount, description ("Disputed & lost" or "No lost chargebacks")
- **Recovered**: amount, description ("Disputed & won" or "No recoveries")

Colors: red for non-zero lost, green for non-zero recovered, dimmed for $0
Info text when both zero: "Chargebacks are tracked automatically via Shopify webhooks."

- [ ] **Step 2: Commit**
```bash
git add src/components/pnl/ChargebackSection.tsx
git commit -m "feat(pnl): add ChargebackSection lost/recovered"
```

### Task 8: Create AOVSummary component

**Files:**
- Create: `src/components/pnl/AOVSummary.tsx`

- [ ] **Step 1: Write AOVSummary**

Props: `products: ProductPnLData[]`

Calculates from products array:
- `mainProducts` = products.filter(p => p.category === 'main')
- `mainAOV` = mainProducts.reduce(rev) / mainProducts.reduce(units)
- `allAOV` = total revenue / total units (includes upsells etc.)
- `aovLift` = ((allAOV - mainAOV) / mainAOV) * 100
- `takeRate` = orders with upsells / total orders (approximate: count products with category !== 'main')

Layout (4-column grid):
- Main AOV, With Upsells AOV, AOV Lift %, Upsell Take Rate

- [ ] **Step 2: Commit**
```bash
git add src/components/pnl/AOVSummary.tsx
git commit -m "feat(pnl): add AOVSummary with lift calculation"
```

---

## Chunk 3: Hourly Performance Enhancement

### Task 9: Enhance PnLHourlyTrend with Line/Bar views + comparison

**Files:**
- Modify: `src/components/pnl/PnLHourlyTrend.tsx`

- [ ] **Step 1: Add view mode state**

Add state: `viewMode: 'heatmap' | 'line' | 'bar'` (default 'heatmap')
Add state: `showComparison: boolean` (default false)

- [ ] **Step 2: Add toolbar with view toggle buttons + comparison toggle**

Three pill buttons for Heatmap/Line/Bar, styled as monochrome pills (active = bg-white/7%, inactive = text dim)
"vs Last Week" button with border, toggles comparison overlay

- [ ] **Step 3: Add Line Chart view**

When `viewMode === 'line'`:
- Hand-built SVG (no chart library — project rule)
- X-axis: 24 hours (0-23), Y-axis: revenue
- Aggregate hourlyPnL by hour (average across all days)
- Line path with gradient fill below
- If `showComparison`: overlay a dashed line for previous 7 days vs current 7 days
- Dots at each hour, hover shows tooltip

- [ ] **Step 4: Add Bar Chart view**

When `viewMode === 'bar'`:
- Hand-built SVG bars
- X-axis: 24 hours, Y-axis: revenue
- Green bars for profit hours, red for loss hours
- If `showComparison`: side-by-side bars (current vs previous week)

- [ ] **Step 5: Split hourly data for comparison**

Helper function to split `hourlyPnL` into:
- `currentWeek`: last 7 days
- `previousWeek`: 7 days before that
Both aggregated by hour (0-23)

- [ ] **Step 6: Verify all 3 views render without errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 7: Commit**
```bash
git add src/components/pnl/PnLHourlyTrend.tsx
git commit -m "feat(pnl): add line/bar views + comparison to HourlyTrend"
```

---

## Chunk 4: Product Performance Enhancement

### Task 10: Add category tabs to ProductPnLSection

**Files:**
- Modify: `src/components/pnl/ProductPnLSection.tsx`

- [ ] **Step 1: Add category filter state**

Add state: `categoryFilter: ProductCategory | 'all'` (default 'all')

- [ ] **Step 2: Add category tab bar**

Above existing filter row, add pill buttons: Main Products / Upsells / Downsells / Add-ons / All
Active tab is highlighted, others dimmed

- [ ] **Step 3: Filter products by category**

In the `filteredAndSorted` useMemo, add category filter:
```typescript
if (categoryFilter !== 'all') {
  filtered = filtered.filter((p) => p.category === categoryFilter);
}
```

- [ ] **Step 4: Show product type badge in table/card**

In `ProductPnLCard` and `ProductPnLListRow`, show "Physical" or "Digital" badge.
For digital products, show "—" instead of COGS value.

- [ ] **Step 5: Verify render**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**
```bash
git add src/components/pnl/ProductPnLSection.tsx src/components/pnl/ProductPnLCard.tsx src/components/pnl/ProductPnLListRow.tsx
git commit -m "feat(pnl): add category tabs + digital COGS handling to ProductPnLSection"
```

---

## Chunk 5: Integration — Wire Everything Together

### Task 11: Update page.tsx to fetch hourlyPnL

**Files:**
- Modify: `src/app/dashboard/pnl/page.tsx`

- [ ] **Step 1: Import getHourlyPnL**

Add to imports: `import { getHourlyPnL } from '@/services/pnl';`
Add to type imports: `import type { HourlyPnLEntry } from '@/types/pnl';`

- [ ] **Step 2: Add hourlyPnL state**

Add: `const [hourlyPnL, setHourlyPnL] = useState<HourlyPnLEntry[]>([]);`

- [ ] **Step 3: Fetch hourlyPnL in background parallel fetch**

In the background fetch section (alongside getDailyPnL and getProductPnL), add:
```typescript
getHourlyPnL().then(setHourlyPnL).catch(() => {});
```

- [ ] **Step 4: Pass hourlyPnL to PnLDashboardClient**

Add prop: `hourlyPnL={hourlyPnL}`

- [ ] **Step 5: Update cache to include hourlyPnL**

Add `hourlyPnL` to cache read/write if present.

- [ ] **Step 6: Commit**
```bash
git add src/app/dashboard/pnl/page.tsx
git commit -m "feat(pnl): fetch hourlyPnL in parallel and pass to dashboard"
```

### Task 12: Compose everything in PnLDashboardClient

**Files:**
- Modify: `src/components/pnl/PnLDashboardClient.tsx`

- [ ] **Step 1: Update interface to accept hourlyPnL**

```typescript
interface PnLDashboardClientProps {
  summary: PnLSummary;
  dailyPnL: PnLEntry[];
  products: ProductCOGS[];
  productPnL?: ProductPnLData[];
  productType?: 'physical' | 'digital';
  hourlyPnL?: HourlyPnLEntry[];
}
```

- [ ] **Step 2: Import all new components**

```typescript
import { LivePulseRow } from '@/components/pnl/LivePulseRow';
import { PnLHourlyTrend } from '@/components/pnl/PnLHourlyTrend';
import { RefundBreakdown } from '@/components/pnl/RefundBreakdown';
import { ChargebackSection } from '@/components/pnl/ChargebackSection';
import { AOVSummary } from '@/components/pnl/AOVSummary';
import { SectionWrapper } from '@/components/pnl/SectionWrapper';
```

- [ ] **Step 3: Restructure JSX — ADD new sections, keep existing**

Final layout order in return JSX:
```
S1: <LivePulseRow todayEntry={todayEntry} summaryNetProfit={summary.today.netProfit} />

S2: <SectionWrapper label="Period View" toolbar={<DateRangePicker />}>
      <PnLSummaryCards entry={activeEntry} isDigital={isDigital} />
      <grid: PnLWaterfallChart + MarginIndicator>  {/* existing */}
    </SectionWrapper>

S3: <SectionWrapper label="Trends">
      <PnLTrendChart dailyPnL={dailyPnL} dateRange={dateRange} />  {/* existing */}
      <PnLDayPartChart dailyPnL={dailyPnL} />  {/* existing, all 4 views */}
    </SectionWrapper>

S4: <SectionWrapper label="Hourly Performance" tag="NEW">
      <PnLHourlyTrend hourlyPnL={hourlyPnL} />  {/* enhanced with 3 views */}
    </SectionWrapper>

S5: <SectionWrapper label="Product Performance" tag="ENHANCED">
      <ProductPnLSection products={productPnL} />  {/* with category tabs */}
      <AOVSummary products={productPnL} />
    </SectionWrapper>

S6: <SectionWrapper label="Refunds">
      <RefundBreakdown entry={activeEntry} />
    </SectionWrapper>

S7: <SectionWrapper label="Chargebacks" tag="NEW">
      <ChargebackSection chargebackLoss={activeEntry.chargebackLoss || 0} chargebackWon={activeEntry.chargebackWon || 0} />
    </SectionWrapper>

S8: <SectionWrapper label="Settings">
      <Tabs ... />  {/* existing COGS Manager / Breakdown tabs */}
      {bottomTab === 'cogs' && <COGSManager ... />}
      {bottomTab === 'breakdown' && <breakdown JSX>}
    </SectionWrapper>
```

IMPORTANT: Keep `computeEntryFromDaily()` function unchanged. Keep all existing state (datePreset, customRange, bottomTab). Keep all existing useEffect/useMemo hooks.

- [ ] **Step 4: Remove the old standalone LiveProfitTicker call**

Replace the direct `<LiveProfitTicker>` call with `<LivePulseRow>` (which uses LiveProfitTicker internally).

- [ ] **Step 5: Update computeEntryFromDaily to include chargeback fields**

In the reduce accumulator, add:
```typescript
chargebackLoss: acc.chargebackLoss + (d.chargebackLoss || 0),
chargebackWon: acc.chargebackWon + (d.chargebackWon || 0),
```

- [ ] **Step 6: Build and verify**

Run: `npx tsc --noEmit 2>&1 | head -30`
Run: `npx next build 2>&1 | tail -20` (or just verify dev server loads)

- [ ] **Step 7: Commit**
```bash
git add src/components/pnl/PnLDashboardClient.tsx
git commit -m "feat(pnl): compose all new sections into dashboard layout"
```

---

## Chunk 6: Polish — Animations + Typography

### Task 13: Add entrance animations to all sections

**Files:**
- All new components

- [ ] **Step 1: Ensure all new components use Framer Motion**

Each component should wrap its root in:
```typescript
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
>
```

Cards within sections use `staggerChildren: 0.06` for cascading entrance.

- [ ] **Step 2: Add number animation to KPI values**

Use CSS for smooth number transitions:
```css
.tabular-animate {
  font-variant-numeric: tabular-nums;
  transition: all 0.3s ease-out;
}
```

Or use the existing `AnimatedCounter` component where appropriate.

- [ ] **Step 3: Add hover effects to interactive cards**

Cards: `hover:border-white/10 transition-all duration-200`
Tabs/pills: `hover:bg-white/5 transition-colors duration-150`
Table rows: `hover:bg-white/[0.02] transition-colors`

- [ ] **Step 4: Verify smooth animations in browser**

Open `http://localhost:3000/dashboard/pnl`, scroll through all sections, verify:
- Sections fade in as page loads
- Cards stagger in
- Hover effects work
- No layout shift or jank

- [ ] **Step 5: Commit**
```bash
git add -A src/components/pnl/
git commit -m "feat(pnl): add entrance animations + hover effects"
```

### Task 14: Final verification and cleanup

- [ ] **Step 1: Full build check**

Run: `npx next build 2>&1 | tail -30`
Fix any type errors or build warnings.

- [ ] **Step 2: Visual verification**

Open dashboard, verify ALL sections:
1. Live Pulse — compact row, animated ticker, 4 KPIs
2. Period View — date picker (no Today), summary cards, waterfall, margin
3. Trends — trend chart, daily breakdown with 4 view toggles
4. Hourly — heatmap default, can switch to line/bar, peak hours shown
5. Products — category tabs work, digital shows "—" for COGS, AOV cards
6. Refunds — total/full/partial with correct numbers
7. Chargebacks — shows $0 state correctly
8. Settings — COGS Manager + Breakdown tabs work

- [ ] **Step 3: Remove mockup file**

```bash
rm public/pnl-mockup.html
```

- [ ] **Step 4: Final commit**
```bash
git add -A
git commit -m "feat(pnl): complete P&L dashboard enhancement — all 8 sections"
```
