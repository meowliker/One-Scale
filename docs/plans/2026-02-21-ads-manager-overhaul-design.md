# Ads Manager Overhaul — Design Doc
**Date:** 2026-02-21
**Status:** Approved
**Implementation:** 4 parallel agents

---

## Summary

Nine targeted fixes across the ads manager and global UI: attribution data accuracy, column preset UX, ROAS thresholds for digital products, pixel column highlighting, auto-sync, totals row readability, sticky/resizable name column, and full app light theme.

---

## Agent 1 — Global Light Theme

**File:** `src/app/globals.css`, sidebar + layout components

**Change:**
Swap `:root` default from dark → light Apple HIG palette. Currently `.light` is opt-in; after this change `:root` and `.light` share the light palette while `.dark` is opt-in.

```
:root, .light {
  --color-background: #f5f5f7;
  --color-foreground: #1d1d1f;
  --color-surface: #ffffff;
  --color-primary: #0071e3;
  /* ... all light vars ... */
}
.dark {
  /* current dark vars */
}
```

Also fix sidebar/nav components to use CSS variable colors (no hardcoded dark hex values).
Remove `className="light"` wrapper from ads-manager page.tsx since `:root` is now light.

---

## Agent 2 — Attribution Fixes

### 2a. 849/1000 Cap Fix
**File:** `src/app/api/lib/supabase-tracking.ts` → `getPersistentTrackingAttributionCoverage()`

**Root cause:** PostgREST default row limit = 1000. Query has no `&limit=` param.
**Fix:** Add `&limit=10000` to the `tracking_events` query URL in that function.

### 2b. Auto-sync on Store Add/Switch
**File:** `src/components/ads-manager/AdsManagerClient.tsx`

Add `useEffect` watching `activeStoreId` change → call `fetchAttributionCoverage()` automatically.
No manual sync button interaction needed.

---

## Agent 3 — Table UX

### 3a. Sticky Name Column
**Files:** `CampaignRow.tsx`, `AdSetRow.tsx`, `AdRow.tsx`, `AdsManagerClient.tsx` (header)

Add `sticky left-[96px] z-20 bg-white` to name `<td>` cells and matching header `<th>`.
The offset `96px` accounts for checkbox (40px) + toggle (56px) fixed columns.

### 3b. Resizable Name Column
**File:** `AdsManagerClient.tsx` header section

Add `useState<number>(280)` for name column width.
Render a `cursor-col-resize` drag handle div on the right edge of the name header `<th>`.
On `mousedown` → track drag delta → update width state → apply as `style={{ width: nameColWidth }}` inline.

### 3c. Hover Tooltip for Full Name
**Files:** `CampaignRow.tsx`, `AdSetRow.tsx`, `AdRow.tsx`

Wrap campaign name in a `group/name` div. On `hover`, show an absolutely positioned tooltip card with the full name, `transition-opacity duration-150 ease-out`, `z-50`.

### 3d. Total Campaign Row Highlight
**File:** `AdsManagerClient.tsx` — `<tfoot>` row

Change `<tr>` classes to: `bg-[#f0f4ff] border-t-2 border-[#0071e3]/20`.
First cell: bold "Total" label in `#1d1d1f`. All metric cells: `font-semibold`.

### 3e. Column Presets Row
**File:** `AdsManagerToolbar.tsx`

Add `<ColumnPresetSelector />` as a second row below the toolbar filters, directly visible — no need to open the Columns panel to switch presets.

---

## Agent 4 — Metrics & Visual Polish

### 4a. ROAS Thresholds (Digital Products)
**File:** `src/components/ads-manager/MetricCell.tsx` → `getMetricColorClass()`

New thresholds for `roas` and `appPixelRoas`:
- `value === 0` → `text-[#aeaeb2]` (gray)
- `value < 1.0` → `text-[#ff3b30]` (red — bad)
- `1.0 ≤ value < 1.3` → `text-[#ff9500]` (orange — ok)
- `1.3 ≤ value < 1.6` → `text-[#34c759]` (green — good)
- `value ≥ 1.6` → `text-[#34c759] font-bold` (bright green bold — very good)

Same logic for `getRoasDotColor()`.

### 4b. Pixel Column Highlighting
**File:** `src/components/ads-manager/MetricCell.tsx`

Pixel metric keys: `appPixelRoas`, `appPixelPurchases`, `appPixelRevenue`, `appPixelCpa`
Add `bg-[#f0f7ff]` background tint to pixel cells + a `px` indicator prefix in the cell value to group them visually.

### 4c. Text Readability
Audit and fix any remaining hardcoded dark color classes in ads manager components that break readability in light mode.

---

## Testing Plan

1. Build check: `npm run build` — no TypeScript errors
2. Attribution badge shows correct total (not capped at 1000)
3. ROAS colors correct for values 0, 0.8, 1.0, 1.15, 1.35, 1.7
4. Pixel columns show blue tint
5. Name column is sticky on horizontal scroll
6. Column presets visible as pill row in toolbar
7. Total row clearly distinct from campaign rows
8. Full app renders in light theme — no dark artifacts

---

## Files Touched

| Agent | Files |
|-------|-------|
| 1 | `globals.css`, sidebar component, layout |
| 2 | `supabase-tracking.ts`, `AdsManagerClient.tsx` |
| 3 | `CampaignRow.tsx`, `AdSetRow.tsx`, `AdRow.tsx`, `AdsManagerClient.tsx`, `AdsManagerToolbar.tsx` |
| 4 | `MetricCell.tsx`, ads manager component audit |
