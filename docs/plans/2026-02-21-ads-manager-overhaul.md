# Ads Manager Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 9 issues in One-Scale's ads manager: attribution cap, column presets, ROAS thresholds, pixel highlighting, auto-sync, totals row, sticky name column, and full app light theme.

**Architecture:** 4 parallel independent streams. Each stream owns non-overlapping files. A final integration/build check follows all streams.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Zustand (persist), PostgREST/Supabase

---

## ⚡ PARALLEL EXECUTION — All 4 streams run simultaneously

---

## Stream A: Global Light Theme

> **Files owned:** `src/stores/themeStore.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/dashboard/ads-manager/page.tsx`

### Task A1: Change default theme to light

**Files:**
- Modify: `src/stores/themeStore.ts`
- Modify: `src/app/layout.tsx`

**Step 1: Update themeStore default**

In `src/stores/themeStore.ts`, change `theme: 'dark'` → `theme: 'light'`:

```typescript
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'light',   // ← was 'dark'
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'theme-preference' }
  )
);
```

**Step 2: Update HTML initial class**

In `src/app/layout.tsx`, change `className="dark"` → `className="light"`:

```tsx
<html lang="en" className="light" suppressHydrationWarning>
```

**Step 3: Verify build**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors

**Step 4: Commit**

```bash
git add src/stores/themeStore.ts src/app/layout.tsx
git commit -m "feat: default theme to light"
```

---

### Task A2: Make :root default to light CSS vars

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Swap :root and .dark**

In `globals.css`, the current structure is:
```css
:root, .dark { /* dark vars */ }
.light { /* light vars */ }
```

Change it to:
```css
:root, .light { /* light vars */ }
.dark { /* dark vars */ }
```

Specifically, change the first block from:
```css
/* ===== Dark Theme (default) ===== */
:root, .dark {
  --color-background: #0f1117;
  ...
}
```
to:
```css
/* ===== Light Theme (default) ===== */
:root, .light {
  --color-background: #f5f5f7;
  --color-foreground: #1d1d1f;
  --color-surface: #ffffff;
  --color-surface-elevated: #ffffff;
  --color-surface-hover: #f5f5f7;
  --color-surface-active: #e8e8ed;
  --color-border: rgba(0, 0, 0, 0.06);
  --color-border-light: rgba(0, 0, 0, 0.04);
  --color-border-focus: #0071e3;
  --color-primary: #0071e3;
  --color-primary-light: #0077ED;
  --color-primary-dark: #0064c6;
  --color-primary-glow: rgba(0, 113, 227, 0.08);
  --color-primary-ring: rgba(0, 113, 227, 0.15);
  --color-text-primary: #1d1d1f;
  --color-text-secondary: #86868b;
  --color-text-muted: #86868b;
  --color-text-dimmed: #aeaeb2;
  --color-success: #34c759;
  --color-success-light: #30d158;
  --color-warning: #ff9500;
  --color-warning-light: #ffb340;
  --color-danger: #ff3b30;
  --color-danger-light: #ff6961;
  --color-info: #0071e3;
  --color-info-light: #5ac8fa;
}

/* ===== Dark Theme (opt-in) ===== */
.dark {
  --color-background: #0f1117;
  --color-foreground: #f1f5f9;
  --color-surface: #161823;
  --color-surface-elevated: #1e2030;
  --color-surface-hover: #262a3e;
  --color-surface-active: #2e3350;
  --color-border: #232740;
  --color-border-light: #2d3250;
  --color-border-focus: #7c5cfc;
  --color-primary: #7c5cfc;
  --color-primary-light: #a78bfa;
  --color-primary-dark: #5b3fd4;
  --color-primary-glow: rgba(124, 92, 252, 0.15);
  --color-primary-ring: rgba(124, 92, 252, 0.3);
  --color-text-primary: #f1f5f9;
  --color-text-secondary: #94a3b8;
  --color-text-muted: #64748b;
  --color-text-dimmed: #475569;
}
```

Also remove the separate `.light { ... }` block (it's now `:root, .light`), and keep `.dark { ... }` block intact.

**Step 2: Remove redundant light wrapper in ads-manager page**

In `src/app/dashboard/ads-manager/page.tsx`, change:
```tsx
return (
  <div className="light">
```
to:
```tsx
return (
  <div>
```

**Step 3: Build check**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npm run build 2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add src/app/globals.css src/app/dashboard/ads-manager/page.tsx
git commit -m "feat: light theme as default for entire app"
```

---

## Stream B: Attribution Fixes

> **Files owned:** `src/app/api/lib/supabase-tracking.ts`, `src/components/ads-manager/AdsManagerClient.tsx` (attribution section only)

### Task B1: Fix 849/1000 PostgREST cap

**Files:**
- Modify: `src/app/api/lib/supabase-tracking.ts` — `getPersistentTrackingAttributionCoverage()` around line 820

**Background:** PostgREST returns max 1000 rows by default when no `limit` is specified. The query at line ~820 in `getPersistentTrackingAttributionCoverage()` has no limit, so stores with >1000 purchases in 7 days silently get capped.

**Step 1: Find the exact line**

```bash
grep -n "event_name=eq.Purchase.*occurred_at=gte.*occurred_at=lte" "/Users/gauravpataila/Documents/claude code/One-Scale/src/app/api/lib/supabase-tracking.ts"
```

**Step 2: Add limit to the URL**

Find the URL string inside `getPersistentTrackingAttributionCoverage()` (the one with `select=campaign_id,adset_id,ad_id,order_id,event_id,source,occurred_at`).

Change it from:
```typescript
`/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&event_name=eq.Purchase&occurred_at=gte.${encodeURIComponent(sinceIso)}&occurred_at=lte.${encodeURIComponent(untilIso)}&select=campaign_id,adset_id,ad_id,order_id,event_id,source,occurred_at`
```

To (add `&limit=10000` at the end):
```typescript
`/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&event_name=eq.Purchase&occurred_at=gte.${encodeURIComponent(sinceIso)}&occurred_at=lte.${encodeURIComponent(untilIso)}&select=campaign_id,adset_id,ad_id,order_id,event_id,source,occurred_at&limit=10000`
```

**Step 3: Build check**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/app/api/lib/supabase-tracking.ts
git commit -m "fix: raise PostgREST purchase limit to 10k for attribution coverage"
```

---

### Task B2: Auto-sync attribution on store change

**Files:**
- Modify: `src/components/ads-manager/AdsManagerClient.tsx` — attribution coverage section (~line 363)

**Background:** `fetchAttributionCoverage()` is currently called once on mount. It should also fire when `activeStoreId` changes so new connections sync automatically.

**Step 1: Find the attribution coverage useEffect**

```bash
grep -n "fetchAttributionCoverage\|attributionCoverage\|activeStoreId" "/Users/gauravpataila/Documents/claude code/One-Scale/src/components/ads-manager/AdsManagerClient.tsx" | head -20
```

**Step 2: Add activeStoreId to coverage dependency**

Find the `useEffect` that calls `fetchAttributionCoverage()`. It likely looks like:

```typescript
useEffect(() => {
  fetchAttributionCoverage();
}, []); // or some other deps
```

Change it to include `activeStoreId`:

```typescript
useEffect(() => {
  if (activeStoreId) {
    fetchAttributionCoverage();
  }
}, [activeStoreId, fetchAttributionCoverage]);
```

Make sure `activeStoreId` is already pulled from `useStoreStore` in this component (it is — search for `useStoreStore`).

**Step 3: Build check**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/components/ads-manager/AdsManagerClient.tsx
git commit -m "feat: auto-sync attribution coverage on store change"
```

---

## Stream C: Table UX

> **Files owned:** `src/components/ads-manager/CampaignRow.tsx`, `src/components/ads-manager/AdSetRow.tsx`, `src/components/ads-manager/AdRow.tsx`, `src/components/ads-manager/AdsManagerToolbar.tsx`, `src/components/ads-manager/AdsManagerClient.tsx` (totals row + name col width state only)

### Task C1: Sticky name column

**Background:** The name column should stay pinned to the left as the user scrolls right. The table has: checkbox col (~40px) + toggle col (~56px) = 96px before the name column starts.

**Files:**
- Modify: `src/components/ads-manager/CampaignRow.tsx`
- Modify: `src/components/ads-manager/AdSetRow.tsx`
- Modify: `src/components/ads-manager/AdRow.tsx`
- Modify: `src/components/ads-manager/AdsManagerClient.tsx` (header `<th>` for name)

**Step 1: Add sticky to CampaignRow name td**

In `CampaignRow.tsx`, find the `<td>` for name (the one containing `campaign.name`). Add sticky classes:

```tsx
<td className="whitespace-nowrap px-3 py-2 sticky left-[96px] z-10 bg-white group-hover:bg-[#f5f5f7] transition-colors duration-150 border-r border-[rgba(0,0,0,0.04)]">
```

Note: `bg-white` keeps it opaque when scrolling; `group-hover:bg-[#f5f5f7]` matches the row hover. The `<tr>` already has `group` class.

**Step 2: Add sticky to AdSetRow name td**

In `AdSetRow.tsx`, find the name `<td>`. Apply same classes:

```tsx
<td className="whitespace-nowrap px-3 py-2 sticky left-[96px] z-10 bg-white group-hover:bg-[#f5f5f7] transition-colors duration-150 border-r border-[rgba(0,0,0,0.04)]">
```

**Step 3: Add sticky to AdRow name td**

Same in `AdRow.tsx`.

**Step 4: Add sticky to header th**

In `AdsManagerClient.tsx`, find the `<th>` for the name column (the one with "Name" header text). Add:

```tsx
<th className="... sticky left-[96px] z-20 bg-[#f5f5f7] border-r border-[rgba(0,0,0,0.06)]">
```

Use `z-20` (higher than `z-10` body cells) so the header stays above body cells on scroll.

**Step 5: Build check**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npx tsc --noEmit 2>&1 | head -20
```

**Step 6: Commit**

```bash
git add src/components/ads-manager/CampaignRow.tsx src/components/ads-manager/AdSetRow.tsx src/components/ads-manager/AdRow.tsx src/components/ads-manager/AdsManagerClient.tsx
git commit -m "feat: sticky name column in ads manager table"
```

---

### Task C2: Resizable name column

**Files:**
- Modify: `src/components/ads-manager/AdsManagerClient.tsx`

**Background:** We add a `nameColWidth` state and a drag handle `<div>` in the header's name `<th>`. Mouse events track drag delta to resize.

**Step 1: Add width state near top of AdsManagerClient**

Find existing `useState` declarations near the top of the component function. Add:

```typescript
const [nameColWidth, setNameColWidth] = useState(280);
const nameResizeRef = useRef<{ startX: number; startW: number } | null>(null);
```

**Step 2: Add resize handlers**

Add these handler functions inside the component (before the return):

```typescript
const handleNameResizeStart = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  nameResizeRef.current = { startX: e.clientX, startW: nameColWidth };

  function onMove(ev: MouseEvent) {
    if (!nameResizeRef.current) return;
    const delta = ev.clientX - nameResizeRef.current.startX;
    setNameColWidth(Math.max(160, Math.min(500, nameResizeRef.current.startW + delta)));
  }
  function onUp() {
    nameResizeRef.current = null;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}, [nameColWidth]);
```

**Step 3: Add inline style + drag handle to name <th>**

In the name `<th>`, add `style={{ width: nameColWidth, minWidth: nameColWidth }}` and the resize handle:

```tsx
<th
  style={{ width: nameColWidth, minWidth: nameColWidth }}
  className="... sticky left-[96px] z-20 bg-[#f5f5f7] border-r border-[rgba(0,0,0,0.06)] relative select-none"
>
  Name
  <div
    onMouseDown={handleNameResizeStart}
    className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-[#0071e3]/20 transition-colors"
  />
</th>
```

**Step 4: Pass width to sticky name td cells**

In `CampaignRow.tsx`, `AdSetRow.tsx`, `AdRow.tsx` — add a `nameColWidth?: number` prop and apply `style={{ width: nameColWidth, minWidth: nameColWidth }}` to the sticky name `<td>`. The parent passes the prop from `AdsManagerClient`.

Add to each row's Props interface:
```typescript
nameColWidth?: number;
```
Add to each row's name `<td>`:
```tsx
style={nameColWidth ? { width: nameColWidth, minWidth: nameColWidth } : undefined}
```

**Step 5: Build check**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npx tsc --noEmit 2>&1 | head -20
```

**Step 6: Commit**

```bash
git add src/components/ads-manager/AdsManagerClient.tsx src/components/ads-manager/CampaignRow.tsx src/components/ads-manager/AdSetRow.tsx src/components/ads-manager/AdRow.tsx
git commit -m "feat: resizable name column with drag handle"
```

---

### Task C3: Hover tooltip for full campaign name

**Background:** When the name is truncated, hovering should show the full name in a smooth tooltip.

**Files:**
- Modify: `src/components/ads-manager/CampaignRow.tsx`
- Modify: `src/components/ads-manager/AdSetRow.tsx`
- Modify: `src/components/ads-manager/AdRow.tsx`

**Step 1: Update CampaignRow name button**

Find the `<button>` that renders `campaign.name`. Wrap it in a `relative group/tooltip` div and add a tooltip span:

```tsx
<div className="relative group/tooltip">
  <button
    onClick={onToggleExpand}
    className="text-[13px] font-medium text-[#1d1d1f] hover:text-[#0071e3] transition-colors duration-150 text-left truncate max-w-[220px] block"
  >
    {campaign.name}
  </button>
  {/* Full name tooltip */}
  <div className="absolute left-0 top-full mt-1 z-50 pointer-events-none
    opacity-0 group-hover/tooltip:opacity-100
    translate-y-1 group-hover/tooltip:translate-y-0
    transition-all duration-150 ease-out">
    <div className="rounded-lg bg-[#1d1d1f] px-3 py-1.5 text-xs text-white shadow-lg whitespace-nowrap max-w-xs">
      {campaign.name}
    </div>
  </div>
</div>
```

**Step 2: Apply same pattern to AdSetRow and AdRow**

Same tooltip wrapper around adset name and ad name buttons.

**Step 3: Build check**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/components/ads-manager/CampaignRow.tsx src/components/ads-manager/AdSetRow.tsx src/components/ads-manager/AdRow.tsx
git commit -m "feat: hover tooltip for full campaign/adset/ad name"
```

---

### Task C4: Total campaign row highlight

**Background:** The `<tfoot>` row in AdsManagerClient currently blends in with regular rows. It needs a clearly distinct visual treatment.

**Files:**
- Modify: `src/components/ads-manager/AdsManagerClient.tsx` — tfoot section

**Step 1: Find the tfoot row**

```bash
grep -n "tfoot\|totals\|activeCampaigns\|total camp" "/Users/gauravpataila/Documents/claude code/One-Scale/src/components/ads-manager/AdsManagerClient.tsx" | head -20
```

**Step 2: Update tfoot row classes**

Find the `<tr>` inside `<tfoot>`. Change its className to:

```tsx
<tr className="border-t-2 border-[#0071e3]/20 bg-[#f0f4ff]">
```

**Step 3: Update first cell ("Total" label)**

Find the first `<td>` in the tfoot row that shows campaign counts. Change its text to be bold and clearly labeled:

```tsx
<td colSpan={3} className="whitespace-nowrap px-3 py-2.5 text-[12px] font-bold text-[#1d1d1f]">
  Total — {totals.activeCampaigns} active
</td>
```

**Step 4: Make metric cells bold in tfoot**

For `MetricCell` in the tfoot, we need a way to pass a "bold" prop. Add an optional `isTotals?: boolean` prop to `MetricCell`:

In `MetricCell.tsx`:
```typescript
export interface MetricCellProps {
  metricKey: MetricKey;
  value: number;
  isTotals?: boolean;
}

export function MetricCell({ metricKey, value, isTotals }: MetricCellProps) {
  ...
  return (
    <td className={cn(
      "whitespace-nowrap px-3 py-2 text-right text-[12px] tabular-nums",
      isTotals && "font-semibold bg-[#f0f4ff]",
      colorClass || "text-[#1d1d1f]"
    )}>
```

In `AdsManagerClient.tsx`, pass `isTotals` to tfoot MetricCells:
```tsx
{columnOrder.map((key) => (
  <MetricCell
    key={`totals-${key}`}
    metricKey={key}
    value={getMetricValue(totals.metrics, key)}
    isTotals
  />
))}
```

**Step 5: Build check**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npx tsc --noEmit 2>&1 | head -20
```

**Step 6: Commit**

```bash
git add src/components/ads-manager/AdsManagerClient.tsx src/components/ads-manager/MetricCell.tsx
git commit -m "feat: highlight total campaign row in table footer"
```

---

### Task C5: Column presets visible in toolbar

**Background:** `ColumnPresetSelector` exists but is never rendered. Add it as a visible pill row under the toolbar.

**Files:**
- Modify: `src/components/ads-manager/AdsManagerToolbar.tsx`

**Step 1: Import ColumnPresetSelector**

Add to imports in `AdsManagerToolbar.tsx`:
```typescript
import { ColumnPresetSelector } from '@/components/columns/ColumnPresetSelector';
```

**Step 2: Add preset row below main toolbar row**

Inside the main `<div className="space-y-3">`, after the main toolbar `<div>` and before the sync status row, add:

```tsx
{/* Column Preset Pills */}
<div className="flex items-center gap-2 px-1">
  <span className="text-[11px] text-[#86868b] font-medium shrink-0">Presets:</span>
  <ColumnPresetSelector />
</div>
```

**Step 3: Build check**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/components/ads-manager/AdsManagerToolbar.tsx
git commit -m "feat: show column presets as visible pill row in toolbar"
```

---

## Stream D: Metrics & Visual Polish

> **Files owned:** `src/components/ads-manager/MetricCell.tsx`

### Task D1: ROAS thresholds for digital products

**Background:** Change thresholds from `<1/1-1.4/1.4-1.6/>1.6` to `<1/1-1.3/1.3-1.6/>1.6`.

**Files:**
- Modify: `src/components/ads-manager/MetricCell.tsx`

**Step 1: Update getMetricColorClass**

Find `getMetricColorClass()`. Change the `roas`/`appPixelRoas` cases:

```typescript
case 'roas':
case 'appPixelRoas': {
  if (value === 0) return 'text-[#aeaeb2]';
  if (value < 1.0) return 'text-[#ff3b30]';          // red — bad
  if (value < 1.3) return 'text-[#ff9500]';          // orange — ok (was 1.4)
  if (value < 1.6) return 'text-[#34c759]';          // green — good
  return 'text-[#34c759] font-bold';                  // bold green — very good
}
```

**Step 2: Update getRoasDotColor**

```typescript
function getRoasDotColor(value: number): string {
  if (value === 0) return 'bg-[#aeaeb2]';
  if (value < 1.0) return 'bg-[#ff3b30]';
  if (value < 1.3) return 'bg-[#ff9500]';
  if (value < 1.6) return 'bg-[#34c759]';
  return 'bg-[#34c759]';
}
```

**Step 3: Build check**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/components/ads-manager/MetricCell.tsx
git commit -m "feat: update ROAS thresholds for digital products (1.3 ok, 1.6 good)"
```

---

### Task D2: Highlight pixel columns

**Background:** Pixel metric keys (`appPixelResults`, `appPixelPurchases`, `appPixelPurchaseValue`, `appPixelRoas`, `appPixelCpa`) should get a subtle blue-tinted background to visually group them.

**Files:**
- Modify: `src/components/ads-manager/MetricCell.tsx`

**Step 1: Add pixel detection helper**

Add above `MetricCell`:

```typescript
const PIXEL_METRIC_KEYS: Set<MetricKey> = new Set([
  'appPixelResults',
  'appPixelPurchases',
  'appPixelPurchaseValue',
  'appPixelRoas',
  'appPixelCpa',
]);
```

**Step 2: Apply pixel background in MetricCell**

In the `MetricCell` `return`, update the `<td>` className:

```tsx
<td className={cn(
  "whitespace-nowrap px-3 py-2 text-right text-[12px] tabular-nums",
  PIXEL_METRIC_KEYS.has(metricKey) && "bg-[#f0f7ff]",
  isTotals && "font-semibold bg-[#f0f4ff]",
  colorClass || "text-[#1d1d1f]"
)}>
```

**Step 3: Add pixel dot indicator for pixel ROAS**

For `appPixelRoas`, add a small `px` indicator prefix to signal it's pixel data:

```tsx
{(metricKey === 'roas' || metricKey === 'appPixelRoas') && (
  <>
    {metricKey === 'appPixelRoas' && (
      <span className="mr-0.5 text-[9px] font-bold text-[#0071e3] opacity-60">px</span>
    )}
    <span
      className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", getRoasDotColor(value))}
      aria-hidden="true"
    />
  </>
)}
```

**Step 4: Build check**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Commit**

```bash
git add src/components/ads-manager/MetricCell.tsx
git commit -m "feat: highlight pixel columns with blue tint and px indicator"
```

---

## Final Integration

### Task E1: Full build + verification

**Step 1: Run full build**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npm run build 2>&1
```
Expected: `✓ Compiled successfully` with no TypeScript errors.

**Step 2: Fix any remaining hardcoded dark colors in error-center badges**

In `AdsManagerToolbar.tsx`, find the error badge spans:
```tsx
<span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300">
```
Update to light-mode readable colors:
```tsx
<span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
  {errorCounts.critical} critical
</span>
<span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
  {errorCounts.recent12h} in 12h
</span>
<span className="rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[10px] font-semibold text-[#86868b]">
  {errorCounts.total} total
</span>
```

**Step 3: Final commit**

```bash
git add -p  # review and stage only light-mode fixes
git commit -m "fix: light-mode readable colors for error badges"
```

**Step 4: Final build**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && npm run build 2>&1 | tail -5
```

**Step 5: Push**

```bash
cd "/Users/gauravpataila/Documents/claude code/One-Scale" && git push
```

---

## Checklist

- [ ] Light theme default (`themeStore.ts` + `layout.tsx` + `globals.css`)
- [ ] Ads-manager page no longer has redundant `<div className="light">`
- [ ] Attribution shows correct total (not capped at 1000)
- [ ] Attribution auto-syncs when store switches
- [ ] ROAS thresholds: <1 red, 1-1.3 orange, 1.3-1.6 green, ≥1.6 bold green
- [ ] Pixel metric cells have blue `bg-[#f0f7ff]` tint + `px` indicator on Pixel ROAS
- [ ] Name column is sticky on horizontal scroll
- [ ] Name column is resizable via drag handle
- [ ] Campaign name shows hover tooltip with full text
- [ ] Totals row is `bg-[#f0f4ff]` with `border-t-2 border-[#0071e3]/20` — clearly distinct
- [ ] Column preset pills visible in toolbar (no need to open Columns panel)
- [ ] Error badge colors readable in light mode
- [ ] Full build passes with 0 TypeScript errors
