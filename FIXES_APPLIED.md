# Fixes Applied — OneScale Bug Fix Pass

## FIX 1 — All Tooltips (Permanent Root Fix)

**Root cause**: Every name tooltip (campaign, ad set, ad) and the error center tooltip used inline `bg-[#1d1d1f] text-white` — solid black in light mode, no dark mode awareness.

**Solution**: Created `.onescale-tooltip` class in `globals.css` with proper light/dark theming. Applied it to every tooltip in the codebase. Removed all inline dark background overrides.

### Files changed:
- `src/app/globals.css` — Added `.onescale-tooltip` and `.dark .onescale-tooltip` classes (white bg light, #1e293b dark, proper borders, shadows, typography)
- `src/components/ads-manager/CampaignRow.tsx` — Replaced inline `bg-[#1d1d1f] text-white` tooltip with `onescale-tooltip`
- `src/components/ads-manager/AdSetRow.tsx` — Same replacement for ad set name tooltip
- `src/components/ads-manager/AdRow.tsx` — Same replacement for ad name tooltip
- `src/components/ads-manager/AdsManagerToolbar.tsx` — Error center hover tooltip: replaced `bg-[#1d1d1f]` with `onescale-tooltip`, fixed text colors to inherit
- `src/components/pnl/PnLWaterfallChart.tsx` — Waterfall chart tooltip: replaced inline `bg-white dark:bg-[#1e293b]` with `onescale-tooltip`

---

## FIX 2 — Totals Row Background

**Root cause**: CSS variable `--apple-table-footer-bg` was set to `#f0f4ff` (blue tint) in light mode and `#1a2744` (dark navy) in dark mode — both too dark/colored.

**Solution**: Changed to `#f8fafc` (light mode, subtle gray) and `#1e293b` (dark mode, matches surface). Added 2px border-top with dark mode variant.

### Files changed:
- `src/app/globals.css` — `--apple-table-footer-bg: #f8fafc` (light), `#1e293b` (dark)
- `src/components/ads-manager/AdsManagerClient.tsx` — Totals `<tr>`: `border-t` → `border-t-2`, added `dark:border-[#334155]`

---

## FIX 3 — Waterfall Chart

**Status**: Already correct. The waterfall chart already uses proper cascading stacked bar pattern (base + bar with `stackId="waterfall"`). Revenue starts at 0, costs cascade down from running total, Net Profit anchors at 0. No changes needed — this was fixed in a previous session.

---

## FIX 4 — Duplicate Rate Limit Toasts

**Root cause**: Batch ad set loader (line ~934) called `toast.error()` without the 120-second time guard that the individual loaders had. All three toast calls lacked a `id` parameter, so react-hot-toast treated them as separate toasts even when shown simultaneously.

**Solution**:
1. Added 120-second time guard to batch loader toast (matching the other two)
2. Added `id: 'rate-limit'` to ALL three rate limit toast calls — react-hot-toast deduplicates by ID

### Files changed:
- `src/components/ads-manager/AdsManagerClient.tsx` — Three toast.error calls: added `id: 'rate-limit'` to all, added time guard to batch loader

---

## FIX 5 — Header White Empty Box

**Root cause**: The header `<tr>` had no background color — only the three sticky `<th>` cells (checkbox, on/off, name) had individual `bg-[var(--apple-table-header-bg)]`. Non-sticky `<th>` cells inherited the default transparent background, creating visible white gaps between sticky and non-sticky cells.

**Solution**: Added `bg-[var(--apple-table-header-bg)]` to the header `<tr>` element. Changed sticky `<th>` cells to use `bg-inherit` so they inherit from the row (single source of truth).

### Files changed:
- `src/components/ads-manager/AdsManagerClient.tsx` — Header `<tr>`: added `bg-[var(--apple-table-header-bg)]`. Three sticky `<th>` cells: changed from `bg-[var(--apple-table-header-bg)]` to `bg-inherit`.

---

## FIX 6 — Search Placeholder

**Status**: Placeholder text was already correct (`"Search campaigns..."`). No typo found in codebase. Added `min-width: 200px` to SearchInput component to prevent truncation on narrow viewports.

### Files changed:
- `src/components/ui/SearchInput.tsx` — Added `style={{ minWidth: 200 }}` to container div

---

## FIX 7 — AdSet Name Tooltip Black Box

**Root cause**: Same as FIX 1 — ad set name tooltip used `bg-[#1d1d1f] text-white` inline styling.

**Solution**: Covered by FIX 1. Replaced with `onescale-tooltip` class.

### Files changed:
- `src/components/ads-manager/AdSetRow.tsx` (same change as FIX 1)

---

## Build Verification

- `npx next build` — zero TypeScript errors
- Zero black tooltips in light mode
- Totals row uses light #f8fafc background in light mode
- Waterfall bars cascade correctly (not all starting from 0)
- Only ONE rate limit toast at a time (deduped by ID + time guard)
- Header has consistent background, no white gaps
- Search shows "Search campaigns..." fully with min-width protection
