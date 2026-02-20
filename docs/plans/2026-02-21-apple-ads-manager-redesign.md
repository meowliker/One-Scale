# Apple-Inspired Ads Manager Redesign

## Problem
1. Horizontal scroll broken — `.gradient-border-animated` has `overflow: hidden`
2. Columns too wide — generous padding and decorative elements waste space
3. Only metric columns are resizable — fixed columns are not
4. Current "futuristic" theme adds visual noise without improving usability

## Design Direction
Apple HIG-inspired: clean, precise, maximum data density, zero decoration.

## Color Palette
- Background: `#f5f5f7`
- Surface: `#ffffff`
- Text Primary: `#1d1d1f`
- Text Secondary: `#86868b`
- Text Tertiary: `#aeaeb2`
- Accent/Blue: `#0071e3`
- Green: `#34c759`
- Red: `#ff3b30`
- Orange: `#ff9500`
- Border: `rgba(0,0,0,0.06)`

## Changes by File

### globals.css
- Replace `.light` theme vars with Apple palette
- Remove: `.glass-futuristic`, `.futuristic-table`, `.gradient-border-animated`, `.badge-active-futuristic`, `.badge-paused-futuristic`
- Add: `.apple-table` (clean, compact), `.apple-status-active`, `.apple-status-paused`, `.apple-toolbar`
- Scrollbar: thin, gray, Apple-style

### page.tsx (ads-manager)
- Keep `<div className="light">` wrapper
- Update heading to Apple typography

### AdsManagerToolbar.tsx
- Replace glassmorphism with flat white card + subtle shadow
- Apple-style segmented control for status filter
- Compact spacing throughout

### AdsManagerClient.tsx
- Remove `.gradient-border-animated` and `.futuristic-scroll`
- Use plain `overflow-x-auto` container with white bg + subtle shadow
- Replace `.futuristic-table` with `.apple-table`
- Compact header: `px-3 py-2`, `text-[10px]`
- Compact all body cell references: `px-3 py-2`
- Sticky left columns (checkbox, toggle, name) via CSS sticky

### CampaignRow.tsx
- Remove framer-motion `<motion.tr>` — use plain `<tr>`
- Compact padding: `px-3 py-2`
- Clean status pills: solid bg, no gradients
- Simple hover: `bg-[#f5f5f7]`

### AdSetRow.tsx
- Same as CampaignRow: remove motion, compact padding, clean styles

### AdRow.tsx
- Same pattern: remove motion, compact padding

### MetricCell.tsx
- Smaller text: `text-[12px]`
- Tighter padding: `px-3 py-2`

### DraggableColumnHeader.tsx
- Keep resize functionality
- Compact: `px-3 py-2`, `text-[10px]`

### PerformanceSparkline.tsx
- Smaller chart: 100x28 (from 120x36)
- Compact padding

### BulkActionBar.tsx
- Flat white card + shadow, no glassmorphism

### LatestActionsCell.tsx
- Compact padding
