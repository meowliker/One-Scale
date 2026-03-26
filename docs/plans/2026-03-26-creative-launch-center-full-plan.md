# Creative Launch Center — Full Implementation Plan (All 6 Approaches)

**Date:** 2026-03-26
**Status:** Ready for approval
**Research:** Sovran, Madgicx, Marpipe, Revealbot, AdManage, Triple Whale, Motion, AdCreative.ai

---

## Key Insight from Research

**The industry standard in 2025-2026 is 1 ad per ad set (ABO)** for fair testing. Meta's algorithm starves creatives when multiple are in one ad set. BUT media buyers also need batch CBO testing for scaling.

**Our differentiator:** No tool combines visual selection + flexible grouping + one-click bulk launch + creative × copy matrix. OneScale will be the first.

---

## Architecture: Tab-Based Mode Switching

```
+------------------------------------------------------------------+
|  Creative Launch Center                                           |
|  [Quick Launch] [Grid Builder] [Matrix] [Kanban] [Chat] [Import] |
+------------------------------------------------------------------+
```

Each tab is an independent approach. User picks their preferred workflow. All tabs share the same backend execution engine.

---

## APPROACH 1: Quick Launch (Auto-Batch)

**Use case:** "I have 30 creatives, test them NOW"
**Clicks to launch:** 3

### Frontend

**New file:** `src/components/creative-hub/launch-center/QuickLaunchTab.tsx`

```
+------------------------------------------------------------------+
|  Quick Launch                                    [Launch All →]   |
|                                                                    |
|  Product: [Kids Life Skills ▼]                                    |
|  Creatives: 30 ready | [Select All] [By Format] [Clear]          |
|                                                                    |
|  Testing Structure:                                                |
|  ○ 1 ad per ad set (ABO) — Fair test, each gets equal budget     |
|  ● 3 ads per ad set (CBO) — Batch test, Meta picks winners       |
|  ○ 5 ads per ad set (CBO) — Larger batches                       |
|  ○ Custom: [__] ads per ad set                                    |
|                                                                    |
|  Campaign: [Existing ▼] [CBO | Kids Life Test ▼]                 |
|            [+ New Campaign]                                        |
|                                                                    |
|  Budget: $20/ad set/day  Duration: 3 days                         |
|  Ad Copy: [From Copy Library ▼] or [Default from profile]        |
|                                                                    |
|  Preview: 10 ad sets × 3 ads = 30 total ads                      |
|  Estimated daily spend: $200/day for 3 days = $600 total          |
|                                                                    |
|  [Launch 30 Creatives → 10 Ad Sets]                              |
+------------------------------------------------------------------+
```

### Backend needed
- **Existing:** `/api/creative-hub/launch/execute` — needs batch mode
- **Change:** Loop over batches instead of individual creatives

### What to build
| Item | Status | Work needed |
|------|--------|-------------|
| Quick Launch UI | ❌ New | ~200 lines |
| Batch size selector | ❌ New | Radio buttons |
| Auto-batch logic in store | ❌ New | `autoBatch(size)` action |
| Execute batch mode | ❌ Modify | Change 1:1 loop to batch loop |
| Cost estimator | ❌ New | Simple math display |

---

## APPROACH 2: Visual Grid + Batch Builder

**Use case:** "I want to pick which creatives go together"
**Clicks to launch:** ~10-15

### Frontend

**New files:**
- `src/components/creative-hub/launch-center/GridBuilderTab.tsx`
- `src/components/creative-hub/launch-center/CreativeGrid.tsx`
- `src/components/creative-hub/launch-center/BatchList.tsx`

```
+------------------------------------------------------------------+
|  Grid Builder                                                     |
|                                                                    |
|  CREATIVES (30 ready)  [All Formats ▼] [Search...] [Select All]  |
|  +------+ +------+ +------+ +------+ +------+ +------+           |
|  | [✓]  | | [✓]  | | [✓]  | |      | |      | |      |          |
|  | 🖼️   | | 🎬   | | 🖼️   | | 🎬   | | 🖼️   | | 🎬   |      |
|  |10546 | |10350 | |10546 | | 9655 | | 9008 | |10350 |          |
|  |img   | |vid   | |img   | |vid   | |img   | |vid   |          |
|  +------+ +------+ +------+ +------+ +------+ +------+           |
|                                                                    |
|  3 selected → [Create Batch] [Auto-Batch All: 3/set]             |
|                                                                    |
|  ── BATCHES ──────────────────────────────────────────            |
|  Ad Set 1: [🖼️ 10546] [🎬 10350] [🖼️ 10546]  [×]               |
|  Ad Set 2: [🎬 9655]  [🖼️ 9008]  [🎬 10350]  [×]               |
|  Ad Set 3: (select 3 more to add...)                              |
|                                                                    |
|  Campaign: [Select ▼]  Budget: $20/set  Duration: 3 days         |
|  [Launch 2 Ad Sets → 6 Ads]                                      |
+------------------------------------------------------------------+
```

### Backend needed
- Same execute endpoint with batch mode
- Creative thumbnails from inbox data (already available)

### What to build
| Item | Status | Work needed |
|------|--------|-------------|
| CreativeGrid component | ❌ New | ~300 lines, thumbnail grid with checkboxes |
| BatchList component | ❌ New | ~200 lines, batch rows with creative pills |
| "Create Batch" action | ❌ New | Store action |
| Hover preview modal | ❌ New | Full-screen creative preview |
| Filter by format | ❌ New | Dropdown filter |
| Search by name | ❌ New | Text input filter |

---

## APPROACH 3: Creative × Copy Matrix (Madgicx-style)

**Use case:** "Which creative + copy combos haven't been tested?"
**Clicks to launch:** 2-5

### Frontend

**New file:** `src/components/creative-hub/launch-center/MatrixTab.tsx`

```
+------------------------------------------------------------------+
|  Creative × Copy Matrix         Metric: [ROAS ▼]                 |
|                                                                    |
|              | Copy A      | Copy B      | Copy C      | + Add   |
|              | "Unlock..." | "FREE..."   | "PSA..."    |         |
|  +-----------+-------------+-------------+-------------+         |
|  | 🖼️ 10546  | ██ 2.8x    | ░░ untested | ░░ untested |         |
|  | 🎬 10350  | ██ 3.1x    | ██ 1.9x    | ░░ untested |         |
|  | 🖼️ 9008   | ░░ untested | ░░ untested | ░░ untested |         |
|  | 🎬 9655   | ░░ untested | ██ 4.2x    | ░░ untested |         |
|  +-----------+-------------+-------------+-------------+         |
|                                                                    |
|  Legend: ██ dark green = >3x ROAS | ██ green = >2x               |
|          ░░ gray = untested | 🟥 red = <1x                       |
|                                                                    |
|  3 untested combos selected → [Launch Selected Combos]           |
|  Campaign: [Select ▼]  Budget: $20/combo  Duration: 3 days       |
+------------------------------------------------------------------+
```

### Backend needed
- **New:** `/api/creative-hub/matrix/data` — fetches creative × copy performance data
  - Cross-reference: for each creative ID + each copy text → find matching test items
  - Return performance metrics per combo
- **New:** `/api/creative-hub/matrix/launch` — launches selected combos
  - Each combo = 1 ad (specific creative + specific copy)
  - 1 ad per ad set for fair testing

### What to build
| Item | Status | Work needed |
|------|--------|-------------|
| Matrix grid component | ❌ New | ~400 lines, color-coded grid |
| Performance data API | ❌ New | Cross-reference tests × copies |
| Copy column from Copy Library | Partially exists | Fetch from copy_library table |
| Color coding logic | ❌ New | 4 levels based on selected metric |
| Cell click → launch | ❌ New | Select untested cells, launch |
| Metric selector dropdown | ❌ New | ROAS, CPA, CTR, etc. |

---

## APPROACH 4: Drag & Drop Kanban

**Use case:** "I want visual control over exactly which creative goes where"
**Clicks to launch:** ~20-30 (more for precision control)

### Frontend

**New file:** `src/components/creative-hub/launch-center/KanbanTab.tsx`

Uses existing `dnd-kit` library (already in package.json).

```
+------------------------------------------------------------------+
|  Kanban Builder                                                   |
|                                                                    |
|  READY (30)     | AD SET 1 (3)   | AD SET 2 (3)   | [+ Add Set] |
|  ┌─────┐        | ┌─────┐        | ┌─────┐        |             |
|  │ 🖼️  │ ──────>| │ 🖼️  │        | │ 🎬  │        |             |
|  │10546│        | │10546│        | │10350│        |             |
|  └─────┘        | │ 🎬  │        | │ 🖼️  │        |             |
|  ┌─────┐        | │10350│        | │ 9008│        |             |
|  │ 🎬  │        | │ 🖼️  │        | │ 🎬  │        |             |
|  │10350│        | │ 9655│        | │ 9655│        |             |
|  └─────┘        | └─────┘        | └─────┘        |             |
|  ┌─────┐        |                |                |             |
|  │ 🖼️  │        |                |                |             |
|  │ 9008│        |                |                |             |
|  └─────┘        |                |                |             |
|  ...27 more     |                |                |             |
|                                                                    |
|  Campaign: [Select ▼]  Budget: $20/set  Duration: 3 days         |
|  [Launch 2 Ad Sets → 6 Ads]                                      |
+------------------------------------------------------------------+
```

### Backend needed
- Same execute endpoint with batch mode

### What to build
| Item | Status | Work needed |
|------|--------|-------------|
| Kanban container with dnd-kit | ❌ New | ~500 lines |
| DragOverlay for creative cards | ❌ New | Visual feedback while dragging |
| Droppable lane component | ❌ New | Each lane = 1 ad set |
| "Add Lane" button | ❌ New | Creates new ad set lane |
| Lane header (name, count) | ❌ New | Editable ad set name |
| Auto-populate lanes | ❌ New | "Auto-fill 3/lane" button |

---

## APPROACH 5: Chat-Based Launch (AI)

**Use case:** "Just tell AI what to do"
**Clicks to launch:** 2 (type + confirm)

### Frontend

**New file:** `src/components/creative-hub/launch-center/ChatLaunchTab.tsx`

```
+------------------------------------------------------------------+
|  Chat Launch                                                      |
|                                                                    |
|  ┌─────────────────────────────────────────────────┐              |
|  │ You: test all 30 kids life skills creatives,    │              |
|  │      3 per ad set, $20/set, 3 days, use        │              |
|  │      winning copy from copy library             │              |
|  └─────────────────────────────────────────────────┘              |
|                                                                    |
|  ┌─────────────────────────────────────────────────┐              |
|  │ AI: Here's the launch plan:                     │              |
|  │                                                  │              |
|  │ Campaign: CBO | Kids Life Skills | 26 Mar        │              |
|  │ Structure: 10 ad sets × 3 ads each              │              |
|  │ Budget: $20/ad set/day ($200/day total)          │              |
|  │ Duration: 3 days ($600 total)                    │              |
|  │ Copy: Using top 3 from Copy Library              │              |
|  │                                                  │              |
|  │ Ad Sets:                                         │              |
|  │  1: 10546-1, 10350-1, 10546-3                   │              |
|  │  2: 9655-1, 9008-1, 10350-3                     │              |
|  │  ...8 more                                       │              |
|  │                                                  │              |
|  │ [Edit Plan] [Launch Now]                         │              |
|  └─────────────────────────────────────────────────┘              |
|                                                                    |
|  Type your launch instructions...                    [Send]       |
+------------------------------------------------------------------+
```

### Backend needed
- **New:** `/api/creative-hub/launch/ai-plan` — AI generates launch plan from natural language
  - Uses Claude API to parse user intent
  - Returns structured `LaunchConfig` + `batches`
- **Existing:** Execute endpoint for actual launch

### What to build
| Item | Status | Work needed |
|------|--------|-------------|
| Chat UI component | ❌ New | ~300 lines, message list + input |
| AI plan endpoint | ❌ New | ~150 lines, Claude API call |
| Plan preview component | ❌ New | Structured plan display |
| "Edit Plan" → switches to Grid tab | ❌ New | Cross-tab communication |
| Message history in store | ❌ New | Store state for chat messages |

---

## APPROACH 6: CSV/Spreadsheet Import

**Use case:** "I planned my tests in a spreadsheet, just execute it"
**Clicks to launch:** 2 (upload + launch)

### Frontend

**New file:** `src/components/creative-hub/launch-center/ImportTab.tsx`

```
+------------------------------------------------------------------+
|  Import Launch Plan                                               |
|                                                                    |
|  [📁 Drop CSV/Excel here or click to upload]                     |
|                                                                    |
|  Expected columns:                                                |
|  creative_name | ad_set | headline | primary_text | budget        |
|                                                                    |
|  [Download Template]                                              |
|                                                                    |
|  ── PREVIEW ──────────────────────────────────                    |
|  Row 1: 10546-1 → Ad Set 1 | "Unlock..." | "FREE..." | $20     |
|  Row 2: 10350-1 → Ad Set 1 | "Unlock..." | "FREE..." | $20     |
|  Row 3: 10546-3 → Ad Set 1 | "Unlock..." | "FREE..." | $20     |
|  Row 4: 9655-1  → Ad Set 2 | "PSA..."    | "Kids..." | $20     |
|  ...                                                              |
|                                                                    |
|  30 ads across 10 ad sets                                         |
|  Campaign: [Select ▼]  [Launch from CSV]                         |
+------------------------------------------------------------------+
```

### Backend needed
- **New:** `/api/creative-hub/launch/parse-csv` — parse uploaded CSV
  - Match creative_name to inbox creative IDs
  - Validate all referenced creatives exist
  - Return structured batches
- **Existing:** Execute endpoint for actual launch

### What to build
| Item | Status | Work needed |
|------|--------|-------------|
| CSV upload dropzone | ❌ New | File input + drag zone |
| CSV parser | ❌ New | Parse rows into batches |
| Template download | ❌ New | Generate sample CSV |
| Preview table | ❌ New | Show parsed data before launch |
| Creative name matching | ❌ New | Fuzzy match names to IDs |

---

## SHARED BACKEND: Batch Execution Engine

All 6 approaches funnel into the same execution engine. The key change:

### Current (broken):
```
for each creative:
  create 1 ad set
  create 1 ad
```

### New (batch mode):
```
for each batch:
  create 1 ad set (named: "Batch N | formats | date")
  for each creative in batch:
    create 1 ad (named: "creative_name | Batch N")
```

### Changes to `/api/creative-hub/launch/execute/route.ts`:

```typescript
// NEW: Read batches from config
const batches = launchConfig.batches;

if (batches && batches.length > 0) {
  // BATCH MODE: 1 ad set per batch, N ads per batch
  for (const batch of batches) {
    const adsetId = await createAdSet(batch.name, ...);
    for (const creativeId of batch.creativeIds) {
      const item = selectedItems.find(i => i.id === creativeId);
      await createAd(adsetId, item, ...);
    }
  }
} else {
  // LEGACY MODE: 1 ad set per creative (backward compatible)
  for (const item of selectedItems) {
    const adsetId = await createAdSet(item.creativeName, ...);
    await createAd(adsetId, item, ...);
  }
}
```

---

## SHARED TYPES

```typescript
// Add to src/types/creativeHub.ts

interface CreativeBatch {
  id: string;
  name: string;
  creativeIds: string[];
  // Per-batch overrides (optional, for ABO)
  dailyBudget?: number;
  bidAmount?: number;
  // Copy override (optional)
  primaryTexts?: string[];
  headlines?: string[];
}

type BatchStrategy =
  | 'sequential'     // First 3, next 3...
  | 'by_format'      // Videos together, images together
  | 'by_folder'      // Same ClickUp folder = same batch
  | 'smart_mix'      // 1 video + 1 image + 1 carousel per batch
  | 'shuffle'        // Random order before batching
  | 'manual'         // User-created batches
  | 'one_per_adset'; // 1 creative per ad set (Marpipe-style fair test)

// Add to LaunchConfig:
interface LaunchConfig {
  // ...existing fields
  batches?: CreativeBatch[];
  batchStrategy?: BatchStrategy;
  creativesPerBatch?: number; // default 3
  launchMode?: 'quick' | 'grid' | 'matrix' | 'kanban' | 'chat' | 'import';
}
```

---

## SHARED STORE ACTIONS

```typescript
// Add to creativeHubStore.ts

// Batch management
createBatch: (name: string, creativeIds: string[]) => void
removeBatch: (batchId: string) => void
addCreativeToBatch: (batchId: string, creativeId: string) => void
removeCreativeFromBatch: (batchId: string, creativeId: string) => void
moveCreativeBetweenBatches: (fromBatchId: string, toBatchId: string, creativeId: string) => void

// Auto-batch strategies
autoBatch: (strategy: BatchStrategy, size: number) => void
clearBatches: () => void
shuffleBatches: () => void
```

---

## FILE STRUCTURE

```
src/components/creative-hub/launch-center/
├── LaunchCenter.tsx              # Main container with tab switcher
├── QuickLaunchTab.tsx            # Approach 1
├── GridBuilderTab.tsx            # Approach 2
├── CreativeGrid.tsx              # Shared: thumbnail grid with selection
├── BatchList.tsx                 # Shared: batch grouping display
├── MatrixTab.tsx                 # Approach 3
├── KanbanTab.tsx                 # Approach 4
├── ChatLaunchTab.tsx             # Approach 5
├── ImportTab.tsx                 # Approach 6
├── LaunchConfig.tsx              # Shared: campaign/budget/copy config
├── CreativePreviewModal.tsx      # Shared: full-screen creative preview
└── BatchExecutionStatus.tsx      # Shared: post-launch status
```

---

## BUILD ORDER (Priority)

### Sprint 1: Foundation + Quick Launch (Today)
1. **Types & Store** — Add CreativeBatch, batch actions, batch strategies
2. **Backend batch execution** — Modify execute endpoint for batch mode
3. **LaunchCenter container** — Tab switcher shell
4. **QuickLaunchTab** — Auto-batch with 1-click launch
5. **CreativeGrid** (shared) — Thumbnail grid with checkboxes
6. **Test in Chrome** — Launch 30 creatives in 3 clicks

### Sprint 2: Grid Builder + Kanban (Today if time)
7. **GridBuilderTab** — Manual batch creation from grid
8. **BatchList** (shared) — Visual batch rows
9. **KanbanTab** — Drag & drop with dnd-kit
10. **Test in Chrome** — Drag creatives between ad set lanes

### Sprint 3: Matrix + Chat + Import (Tomorrow)
11. **MatrixTab** — Creative × Copy grid with color coding
12. **Matrix data API** — Performance cross-reference
13. **ChatLaunchTab** — AI natural language launch
14. **AI plan API** — Claude API integration
15. **ImportTab** — CSV upload and parse
16. **CSV parse API** — Match names to creative IDs

---

## SUCCESS CRITERIA

| Metric | Target |
|--------|--------|
| Quick Launch: clicks to launch 30 creatives | ≤ 3 clicks |
| Quick Launch: time to launch 30 creatives | < 30 seconds |
| Grid Builder: time to manually batch 30 | < 2 minutes |
| Matrix: identify untested combos | Instant (color-coded) |
| Kanban: drag 30 creatives into 10 lanes | < 3 minutes |
| Chat: natural language to launch | 2 interactions |
| Import: CSV to launch | < 1 minute |
| Backend: all 30 ads created on Meta | < 45 seconds |
| Zero regressions: existing wizard still works | ✅ |
