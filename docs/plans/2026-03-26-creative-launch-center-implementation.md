# Creative Launch Center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 6-tab Creative Launch Center for bulk creative testing with auto-batch, grid builder, kanban, matrix, chat, and CSV import.

**Architecture:** Tab-based UI where each tab is an independent approach sharing the same batch execution engine. All tabs produce `CreativeBatch[]` which feeds into the existing `/api/creative-hub/launch/execute` endpoint (modified for batch mode).

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand 5, dnd-kit (drag & drop), Framer Motion 12, TanStack React Table 8

---

## Task 1: Shared Types & Store (Foundation)

**Files:**
- Modify: `src/types/creativeHub.ts`
- Modify: `src/stores/creativeHubStore.ts`

### Step 1: Add batch types to creativeHub.ts

Add after the existing `LaunchConfig` interface:

```typescript
// ── Creative Launch Center Types ──

export interface CreativeBatch {
  id: string;
  name: string;
  creativeIds: string[];
  dailyBudget?: number;
  bidAmount?: number;
  primaryTexts?: string[];
  headlines?: string[];
}

export type BatchStrategy =
  | 'sequential'
  | 'by_format'
  | 'by_folder'
  | 'smart_mix'
  | 'shuffle'
  | 'one_per_adset'
  | 'manual';

export type LaunchCenterTab = 'quick' | 'grid' | 'matrix' | 'kanban' | 'chat' | 'import';
```

Add to `LaunchConfig`:
```typescript
  // Batch launch fields
  batches?: CreativeBatch[];
  batchStrategy?: BatchStrategy;
  creativesPerBatch?: number;
  launchMode?: LaunchCenterTab;
```

### Step 2: Add batch actions to creativeHubStore.ts

Add state:
```typescript
launchCenterTab: LaunchCenterTab;
batches: CreativeBatch[];
batchStrategy: BatchStrategy;
creativesPerBatch: number;
```

Add actions:
```typescript
setLaunchCenterTab: (tab: LaunchCenterTab) => void;
autoBatch: (strategy: BatchStrategy, size: number) => void;
createBatch: (name: string, creativeIds: string[]) => void;
removeBatch: (batchId: string) => void;
addCreativeToBatch: (batchId: string, creativeId: string) => void;
removeCreativeFromBatch: (batchId: string, creativeId: string) => void;
moveCreativeBetweenBatches: (from: string, to: string, creativeId: string) => void;
clearBatches: () => void;
shuffleBatches: () => void;
openLaunchCenter: (productId?: string) => void;
```

### Step 3: Commit
```bash
git add src/types/creativeHub.ts src/stores/creativeHubStore.ts
git commit -m "feat(launch-center): add batch types and store actions"
```

---

## Task 2: Backend Batch Execution Engine

**Files:**
- Modify: `src/app/api/creative-hub/launch/execute/route.ts`

### Step 1: Add batch mode to execute endpoint

In the main POST handler, after resolving creatives, add batch detection:

```typescript
const batches = launchConfig.batches;

if (batches && batches.length > 0) {
  // BATCH MODE: 1 ad set per batch
  for (const batch of batches) {
    const batchCreatives = selectedItems.filter(item =>
      batch.creativeIds.includes(item.id)
    );
    if (batchCreatives.length === 0) continue;

    // Create 1 ad set for this batch
    const adsetName = batch.name || `Batch ${batches.indexOf(batch) + 1} | ${new Date().toLocaleDateString()}`;
    const adsetId = await createAdSet(adsetName, /* use batch.dailyBudget if ABO */);

    // Create 1 ad per creative in this batch
    for (const creative of batchCreatives) {
      await createAd(adsetId, creative);
    }
  }
} else {
  // LEGACY MODE: existing 1:1 flow (backward compatible)
}
```

### Step 2: Commit
```bash
git add src/app/api/creative-hub/launch/execute/route.ts
git commit -m "feat(launch-center): add batch execution mode to launch API"
```

---

## Task 3: Launch Center Container + Quick Launch Tab

**Files:**
- Create: `src/components/creative-hub/launch-center/LaunchCenter.tsx`
- Create: `src/components/creative-hub/launch-center/QuickLaunchTab.tsx`
- Create: `src/components/creative-hub/launch-center/CreativeGrid.tsx`
- Create: `src/components/creative-hub/launch-center/BatchList.tsx`
- Create: `src/components/creative-hub/launch-center/LaunchConfigPanel.tsx`

### LaunchCenter.tsx
Main container with tab switcher. Renders selected tab component.
- Tab bar: Quick Launch | Grid Builder | Matrix | Kanban | Chat | Import
- Each tab renders its own component
- Shared state from creativeHubStore
- Modal overlay (full-screen) triggered from product profile or inbox

### QuickLaunchTab.tsx
- Shows creative count with format breakdown
- Batch size selector (radio: 1/set, 3/set, 5/set, custom)
- "Auto-Batch" button → calls store.autoBatch()
- Shows BatchList preview below
- Campaign selector dropdown
- Budget + duration inputs
- Big "Launch All" button with cost estimate

### CreativeGrid.tsx (shared)
- Thumbnail grid of all ready creatives for selected product
- Checkbox selection per creative
- Format icon badge (image/video/carousel)
- Past test result badge (winner/killed/untested)
- Hover: larger preview
- Click: toggle selection
- Filter bar: format, search
- "Select All" / "Clear" buttons
- Shows count: "12 of 30 selected"

### BatchList.tsx (shared)
- List of batch rows
- Each row: batch name, creative thumbnail pills, [×] remove
- Count per batch
- Total summary: "10 ad sets × 3 ads = 30 total"

### LaunchConfigPanel.tsx (shared)
- Campaign dropdown (existing) or "New Campaign" form
- CBO/ABO detection from selected campaign
- Budget field (hidden for CBO)
- Duration input
- Ad copy source: Copy Library / Default / Custom
- Collapsible advanced settings

### Step 1: Create all files with full implementations
### Step 2: Wire LaunchCenter into the creative hub page
### Step 3: Test in Chrome — select product, auto-batch, launch
### Step 4: Commit
```bash
git add src/components/creative-hub/launch-center/
git commit -m "feat(launch-center): Quick Launch tab with auto-batch and creative grid"
```

---

## Task 4: Grid Builder Tab

**Files:**
- Create: `src/components/creative-hub/launch-center/GridBuilderTab.tsx`

### GridBuilderTab.tsx
- Uses CreativeGrid (shared) for selection
- "Create Batch from Selected" button
- Shows BatchList below with manual batches
- Can create multiple batches by selecting different groups
- "Auto-Batch Remaining" for unassigned creatives
- Uses LaunchConfigPanel (shared) for campaign/budget

### Step 1: Implement GridBuilderTab
### Step 2: Test — manually group creatives into batches
### Step 3: Commit

---

## Task 5: Kanban Drag & Drop Tab

**Files:**
- Create: `src/components/creative-hub/launch-center/KanbanTab.tsx`
- Create: `src/components/creative-hub/launch-center/DraggableCreativeCard.tsx`
- Create: `src/components/creative-hub/launch-center/DroppableLane.tsx`

### KanbanTab.tsx
- Uses @dnd-kit/core DndContext, @dnd-kit/sortable
- Left lane: "Ready" creatives pool (all unassigned)
- Right lanes: Ad Set 1, Ad Set 2, ... (droppable)
- "+ Add Ad Set" button creates new lane
- Drag creative from Ready to any lane
- Drag between lanes to rearrange
- Each lane shows count and [×] to remove
- "Auto-Fill" button distributes evenly

### DraggableCreativeCard.tsx
- useSortable from dnd-kit
- Shows thumbnail, name, format badge
- Drag handle on left
- Visual feedback during drag (opacity, shadow)

### DroppableLane.tsx
- useDroppable from dnd-kit
- Column layout with header (name, count)
- SortableContext for items inside
- Drop zone highlight when dragging over
- Min-height when empty

### Step 1: Implement all kanban components
### Step 2: Test — drag 30 creatives into 10 lanes
### Step 3: Commit

---

## Task 6: Creative × Copy Matrix Tab

**Files:**
- Create: `src/components/creative-hub/launch-center/MatrixTab.tsx`
- Create: `src/app/api/creative-hub/matrix/data/route.ts`

### MatrixTab.tsx
- Grid: rows = creatives, columns = copy variations (from Copy Library)
- Each cell shows performance if combo was tested before
- Color coding: dark green (>3x ROAS), green (>2x), gray (untested), red (<1x)
- Click untested cells to select for launch
- Metric selector dropdown (ROAS, CPA, CTR)
- "Launch Selected Combos" button
- Each selected combo = 1 ad (creative + copy pair)

### API: /api/creative-hub/matrix/data
- Inputs: productProfileId, storeId
- Cross-reference creative_test_items with copy_library
- For each creative × copy combo, find matching test and return metrics
- Returns: `{ creatives: [], copies: [], matrix: { [creativeId]: { [copyId]: { roas, cpa, ctr, tested } } } }`

### Step 1: Implement matrix data API
### Step 2: Implement MatrixTab component
### Step 3: Test — see color-coded grid, click untested cells, launch
### Step 4: Commit

---

## Task 7: Chat-Based Launch Tab

**Files:**
- Create: `src/components/creative-hub/launch-center/ChatLaunchTab.tsx`
- Create: `src/app/api/creative-hub/launch/ai-plan/route.ts`

### ChatLaunchTab.tsx
- Chat message list (user + AI messages)
- Text input at bottom
- AI responds with structured launch plan
- Plan shows: campaign, batch count, creatives per batch, budget, duration
- "Edit Plan" button → switches to Grid tab with batches pre-loaded
- "Launch Now" button → executes plan

### API: /api/creative-hub/launch/ai-plan
- Inputs: userMessage, productProfileId, storeId, availableCreatives
- Uses Claude API to parse natural language intent
- Returns structured LaunchConfig with batches
- System prompt includes: available creatives, existing campaigns, copy library

### Step 1: Implement AI plan API
### Step 2: Implement ChatLaunchTab component
### Step 3: Test — type "test all creatives 3 per set", confirm plan, launch
### Step 4: Commit

---

## Task 8: CSV Import Tab

**Files:**
- Create: `src/components/creative-hub/launch-center/ImportTab.tsx`

### ImportTab.tsx
- File upload dropzone (CSV/Excel)
- Template download button
- Preview table after upload
- Maps CSV rows to creatives by name matching
- Shows matched/unmatched count
- "Launch from CSV" button

### CSV Format:
```
creative_name,ad_set,headline,primary_text,budget
10546-1,Batch 1,"Unlock 150+","FREE Today!",20
10350-1,Batch 1,"Unlock 150+","FREE Today!",20
9655-1,Batch 2,"PSA: She wants","Help kids build",20
```

### Step 1: Implement ImportTab with CSV parsing
### Step 2: Test — upload CSV, preview, launch
### Step 3: Commit

---

## Task 9: Integration + Polish

**Files:**
- Modify: `src/app/dashboard/creative-hub/page.tsx` — Add launch center route/modal
- Modify: `src/components/creative-hub/ProductProfilesTab.tsx` — Wire "Launch" button to launch center
- Modify: `src/components/creative-hub/CreativeInboxTab.tsx` — Wire "Launch Selected" to launch center

### Step 1: Wire all entry points to LaunchCenter
### Step 2: Test full flow: Product Profiles → Launch → Quick Launch → Execute
### Step 3: Test full flow: Creative Inbox → Select → Launch → Grid Builder → Execute
### Step 4: Final commit

---

## Parallel Agent Assignment

| Agent | Tasks | Estimated Time |
|-------|-------|---------------|
| Agent A | Task 1 (Types) + Task 2 (Backend) | 15 min |
| Agent B | Task 3 (Container + Quick Launch + CreativeGrid + BatchList) | 30 min |
| Agent C | Task 4 (Grid Builder) + Task 5 (Kanban) | 30 min |
| Agent D | Task 6 (Matrix) + Task 7 (Chat) + Task 8 (Import) | 30 min |
| Main | Task 9 (Integration) after agents complete | 15 min |
