# Creative Launch Center — Design Document

**Date:** 2026-03-26
**Status:** Approved for phased implementation
**Author:** Gaurav + Claude

---

## Problem Statement

Media buyers need to launch 30-50+ creatives into Facebook campaigns efficiently. The current flow is 1-creative-at-a-time with a 4-step wizard — too slow for bulk testing. Competitors like Sovran, Madgicx, and Revealbot offer bulk launch but lack the visual grouping control media buyers want.

## Goal

Replace the current launch wizard with a **Creative Launch Center** that lets media buyers:
1. Select creatives visually with previews
2. Group them into batches (ad sets) flexibly
3. Launch all batches into a campaign in one click
4. Handle 50+ creatives without friction

---

## Research Summary

### Competitor Analysis

| Tool | Approach | Strength | Weakness |
|------|----------|----------|----------|
| **Sovran** | Auto-batch + bulk render | 100+ variations in clicks, direct Meta push | Video-only, no manual grouping |
| **Madgicx** | Creative Clusters matrix + Ad Launcher | Creative x Copy grid, launch into existing ad sets | Can't create new ad sets from launcher |
| **Foreplay** | Swipe file + Brief builder | Great for research/briefing | No direct launch to Meta |
| **Revealbot** | Rules-based bulk launch | Multi-platform, auto-optimization | Less visual, more automation-focused |
| **Marpipe** | Multivariate testing | Systematic variable testing | Complex setup |

### Key Insight
No tool combines **visual selection + flexible grouping + one-click bulk launch**. This is our differentiator.

---

## 6 Approaches Evaluated

### Approach 1: Auto-Batch Engine
- Select all → pick batch size → pick campaign → launch
- 3 clicks for 30 creatives
- **Pro:** Fastest. **Con:** No visual preview, no custom grouping

### Approach 2: Visual Grid + Batch Builder
- Thumbnail grid with click-to-select
- Select 3 → "Group as Batch" → repeat
- **Pro:** Full control. **Con:** More clicks for large volumes

### Approach 3: Creative Clusters Matrix
- Grid: creatives (Y) x copy variations (X)
- Each cell = one ad combo, color-coded by past performance
- **Pro:** Systematic testing. **Con:** Complex, only works with <20 creatives

### Approach 4: Drag & Drop Kanban
- Kanban lanes: Ready → Ad Set 1 → Ad Set 2 → ...
- Drag creatives between lanes
- **Pro:** Most intuitive. **Con:** Doesn't scale past 30-40 creatives

### Approach 5: Chat-Based Launch
- Natural language: "test 30 creatives, 3 per set, in Kids Life CBO"
- AI suggests grouping, user confirms
- **Pro:** Fastest for experts, scales to any volume. **Con:** Harder to build

### Approach 6: Hybrid Command Center (RECOMMENDED)
- Combines all approaches into one screen with mode switching
- Quick mode (auto-batch), Manual mode (grid select), Chat mode (AI)
- **Pro:** Covers all use cases. **Con:** Most complex to build

---

## Recommended Design: Hybrid Command Center

### Screen Layout

```
+------------------------------------------------------------------+
|  Creative Launch Center              [Chat Mode] [Grid Mode]      |
+------------------------------------------------------------------+
|                                                                    |
|  CREATIVE GRID (scrollable, filterable)                           |
|  +------+ +------+ +------+ +------+ +------+ +------+           |
|  | [✓]  | | [✓]  | | [✓]  | |      | |      | |      |          |
|  | thumb | | thumb | | thumb | | thumb | | thumb | | thumb |      |
|  | img   | | vid   | | img   | | vid   | | img   | | vid   |     |
|  | 10546 | | 10350 | | 10546 | | 9655  | | 9008  | | 10350 |     |
|  +------+ +------+ +------+ +------+ +------+ +------+           |
|                                                                    |
|  Filters: [All Formats ▼] [All Angles ▼] [Search...]             |
|  30 creatives | 12 selected | [Select All] [Clear]               |
|                                                                    |
+------------------------------------------------------------------+
|  QUICK ACTIONS                                                     |
|  [Auto-Batch: 3/set] [Auto-Batch: 5/set] [Group by Format]      |
|  [Group by Folder] [Custom Group Selected]                        |
+------------------------------------------------------------------+
|                                                                    |
|  BATCHES (10 ad sets)                                             |
|                                                                    |
|  Ad Set 1: img-10546, vid-10350, img-10546  [preview] [×] [drag] |
|  Ad Set 2: vid-9655, img-9008, vid-10350    [preview] [×] [drag] |
|  Ad Set 3: ...                               [preview] [×] [drag] |
|  ...                                                               |
|                                                                    |
+------------------------------------------------------------------+
|  LAUNCH CONFIG (collapsible)                                       |
|                                                                    |
|  Campaign: [CBO | Kids Life | Test ▼] or [+ New Campaign]        |
|  Structure: CBO detected — budget at campaign level               |
|  Duration: [3] days                                                |
|  Ad Copy: [Use from Copy Library ▼] or [Same for all]            |
|                                                                    |
|  [Preview All Batches]  [Launch 10 Ad Sets → 30 Ads]             |
+------------------------------------------------------------------+
```

### Three Modes

#### 1. Quick Mode (Default)
1. All creatives pre-selected
2. Click "Auto-Batch: 3/set"
3. Select campaign from dropdown
4. Click "Launch"
5. **Total: 3 clicks, <10 seconds**

#### 2. Manual Mode
1. Click creatives to select a group
2. Click "Custom Group Selected" → creates a batch
3. Repeat until all grouped
4. Drag between batches to adjust
5. Select campaign, launch
6. **Total: ~30 seconds for 30 creatives**

#### 3. Chat Mode (Phase 4)
1. Type: "Launch all 30 creatives, 3 per set, in Kids Life CBO, $20/set/day, 3 days"
2. AI shows the plan with batch preview
3. Click "Looks good, launch"
4. **Total: 2 interactions**

### Auto-Batch Grouping Strategies

| Strategy | How it works |
|----------|-------------|
| **Sequential** | First 3, next 3, next 3... (default) |
| **By Format** | Videos together, images together, carousels together |
| **By Folder/Angle** | Group creatives from same ClickUp folder or tagged with same angle |
| **Smart Mix** | AI mixes formats per batch (1 video + 1 image + 1 carousel per set) |
| **Random Shuffle** | Randomize before batching (for unbiased testing) |

### Creative Preview

Each creative in the grid shows:
- Thumbnail (image or video first frame)
- Format icon (image/video/carousel)
- Creative name/ID
- Past test result badge (if tested before): Win/Lose/Untested
- Hover: larger preview with creative details
- Click: full-screen preview modal

### Batch Preview

Each batch row shows:
- Thumbnails of creatives in that batch
- Batch name (auto-generated or custom)
- Drag handle to reorder or move creatives between batches
- [×] to remove batch (creatives go back to grid)
- [Preview] to see how the ad set will look

### Campaign Config (Collapsed by default)

For **existing CBO campaign:**
- Campaign name shown as read-only
- Budget shown as read-only (set at campaign level)
- Bid strategy shown as read-only
- Duration: editable
- Ad copy: select from copy library or use default

For **existing ABO campaign:**
- Budget per ad set: editable (default from profile)
- Bid strategy: editable
- Duration: editable

For **new campaign:**
- Campaign name: auto-generated with pattern
- Structure: CBO or ABO toggle
- Budget: at campaign (CBO) or per ad set (ABO) level
- Bid strategy: Lowest Cost / Cost Cap / Bid Cap / ROAS Goal
- Objective: Purchase (default)

### Ad Naming Convention

Auto-generated with pattern:
```
Campaign: {Structure} | {ProductName} | {Date}
Ad Set:   Batch {N} | {CreativeFormats} | {Date}
Ad:       {CreativeName} | {AdSetName}
```

Example:
```
Campaign: CBO | Kids Life Skills | 26 Mar
Ad Set:   Batch 1 | 2img+1vid | 26 Mar
Ad:       10546-1 | Batch 1
Ad:       10350-1 | Batch 1
Ad:       9655-1  | Batch 1
```

---

## Data Model Changes

### New fields on LaunchConfig

```typescript
interface LaunchConfig {
  // Existing fields...

  // NEW: Batch grouping
  batches: CreativeBatch[];
  batchStrategy: 'sequential' | 'by_format' | 'by_folder' | 'smart_mix' | 'shuffle' | 'manual';
  creativesPerBatch: number; // default 3
}

interface CreativeBatch {
  id: string;
  name: string;
  creativeIds: string[];
  // Optional per-batch overrides (for ABO)
  dailyBudget?: number;
  bidAmount?: number;
}
```

### Changes to launch/execute endpoint

Currently creates 1 adset per creative. Change to:
- For each `batch` in `batches`:
  - Create 1 ad set (named after batch)
  - For each `creativeId` in `batch.creativeIds`:
    - Create 1 ad inside that ad set
- Result: N ad sets with M ads each (instead of N×M ad sets with 1 ad each)

---

## Implementation Phases

### Phase 1: Auto-Batch + Visual Grid (MVP)
**Time: 2-3 days**

Files to create/modify:
- `src/components/creative-hub/launch/CreativeLaunchCenter.tsx` — New main component
- `src/components/creative-hub/launch/CreativeGrid.tsx` — Thumbnail grid with selection
- `src/components/creative-hub/launch/BatchList.tsx` — Batch grouping display
- `src/components/creative-hub/launch/LaunchConfig.tsx` — Campaign/budget config
- `src/stores/creativeHubStore.ts` — Add batch state and actions
- `src/types/creativeHub.ts` — Add CreativeBatch type
- `src/app/api/creative-hub/launch/execute/route.ts` — Support batch execution

Features:
- [x] Creative thumbnail grid with checkboxes
- [x] Auto-batch: sequential grouping (3, 4, 5 per set)
- [x] Batch list showing grouped creatives
- [x] Campaign selector (existing or new)
- [x] One-click "Launch All Batches"
- [x] Batch execution (1 ad set per batch, N ads per set)

### Phase 2: Drag & Drop + Smart Grouping
**Time: 1-2 days**

Files to modify:
- `src/components/creative-hub/launch/CreativeGrid.tsx` — Add drag source
- `src/components/creative-hub/launch/BatchList.tsx` — Add drop targets
- Uses existing `dnd-kit` library

Features:
- [ ] Drag creatives from grid to batch lanes
- [ ] Drag between batches to rearrange
- [ ] Group by format / folder / angle
- [ ] Smart mix (AI-suggested grouping)

### Phase 3: Creative × Copy Matrix
**Time: 3-4 days**

Files to create:
- `src/components/creative-hub/launch/CreativeMatrix.tsx` — Matrix grid component
- Integration with Copy Library data

Features:
- [ ] Creative (rows) × Copy (columns) matrix
- [ ] Color-coded past performance
- [ ] Click cells to create combos
- [ ] Launch selected combos as batches

### Phase 4: Chat-Based Launch
**Time: 2-3 days**

Files to create:
- `src/components/creative-hub/launch/LaunchChat.tsx` — Chat interface
- `src/app/api/creative-hub/launch/ai-plan/route.ts` — AI planning endpoint

Features:
- [ ] Natural language input
- [ ] AI generates launch plan
- [ ] Visual confirmation of plan
- [ ] One-click execute

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to launch 30 creatives | ~15 min (1 at a time) | <30 seconds (auto-batch) |
| Clicks to launch 30 creatives | ~120 clicks | 3-5 clicks |
| Maximum creatives per launch | ~5 (practical limit) | 100+ |
| Creative grouping options | None (1:1 mapping) | 5 strategies |

---

## Technical Dependencies

- `dnd-kit` — already in package.json for drag & drop (Phase 2)
- `framer-motion` — already in project for animations
- Meta Ads API — existing integration for campaign/adset/ad creation
- Zustand store — existing creativeHubStore
- Copy Library — existing for ad copy selection

## Open Questions

1. Should batch-level budget overrides be supported for ABO? (Per-batch different budgets)
2. Should we support launching same creatives into multiple campaigns simultaneously?
3. Should auto-batch preserve creative order from ClickUp or randomize?
4. For Creative Matrix (Phase 3): should we auto-detect which combos are already running?
