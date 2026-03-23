# Creative Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 6-module creative testing automation system (Creative Hub) that automates the full media buyer workflow from ClickUp creative intake to Meta campaign creation, AI-powered test monitoring, and winner identification.

**Architecture:** Extends existing Next.js App Router with new page under `/dashboard/creative-hub`, new Zustand store, new API routes under `/api/creative-hub/`, and new database tables in existing SQLite/Supabase. Uses EXISTING cached campaign data from ads manager (already synced via cron) — does NOT re-fetch from Meta for discovery. Meta API calls only happen for write operations (create campaigns, upload assets, update status).

**Tech Stack:** Next.js 16 (App Router), TypeScript 5, React 19, Tailwind CSS 4, Zustand 5, Recharts 3, Framer Motion 12, Lucide React, better-sqlite3 + Supabase, Meta Marketing API v21.0

**Design Reference:** `docs/plans/2026-03-23-creative-automation-system-design.md`

**IMPORTANT:** All campaign/adset/ad data for auto-discovery comes from the EXISTING ads manager cache (`campaign_snapshots`, `adset_cache`, `ad_cache` tables or in-memory cache populated by cron). Do NOT make new Meta API calls to read campaign data.

---

## Parallel Execution Groups

Tasks are organized into parallel groups. All tasks within a group can be built simultaneously by different agents. Groups must be completed in order.

### Group A: Foundation (Types + DB + Store + Navigation)
- Task 1: Types
- Task 2: Database tables
- Task 3: Zustand store
- Task 4: Navigation update

### Group B: API Routes (all independent)
- Task 5: Product Profiles API
- Task 6: Creative Inbox API
- Task 7: Launch API
- Task 8: Active Tests API
- Task 9: Copy Library API

### Group C: UI Components (all independent)
- Task 10: Creative Hub page shell + tabs
- Task 11: Product Profiles UI
- Task 12: Creative Inbox UI
- Task 13: Launch Wizard UI (4 steps)
- Task 14: Active Tests Monitor UI
- Task 15: Completed Tests + Copy Library UI

### Group D: Integration + Polish
- Task 16: Wire UI to API routes
- Task 17: Pre-launch health checks
- Task 18: AI integration (Claude recommendations)
- Task 19: Visual polish + animations

---

## Task 1: Type Definitions

**Files:**
- Create: `src/types/creativeHub.ts`

**Step 1: Create all type definitions**

```typescript
// src/types/creativeHub.ts

// ── Product Profiles ──

export interface ProductProfile {
  id: string;
  storeId: string;
  shopifyProductId?: string;
  productName: string;
  productImage?: string;
  adAccountId: string;
  adAccountCurrency: string;
  pageId?: string;
  instagramActorId?: string;
  pixelId?: string;
  conversionEvent: string;
  destinationUrl?: string;
  utmTemplate?: string;
  averageOrderValue?: number;
  defaultBudget: number;
  defaultDuration: number;
  defaultBidStrategy: BidStrategy;
  defaultBidAmount?: number;
  defaultRoasFloor?: number;
  defaultStructure: 'ABO' | 'CBO';
  defaultLaunchStatus: 'ACTIVE' | 'PAUSED';
  namingTemplate?: NamingTemplate;
  targetingPresets?: TargetingPreset[];
  clickupListId?: string;
  clickupSyncInterval: number;
  aiMinSpend?: number;
  aiMinImpressions: number;
  aiMinHours: number;
  aiEvalFrequency: string;
  createdAt: string;
  updatedAt: string;
}

export interface NamingTemplate {
  campaign: string;
  adset: string;
  ad: string;
}

export interface TargetingPreset {
  id: string;
  name: string;
  targeting: TargetingSpec;
}

export interface TargetingSpec {
  ageMin?: number;
  ageMax?: number;
  genders?: number[];
  geoLocations?: {
    countries?: string[];
    regions?: { key: string }[];
    cities?: { key: string; radius?: number; distanceUnit?: string }[];
  };
  customAudiences?: { id: string; name?: string }[];
  excludedCustomAudiences?: { id: string; name?: string }[];
  flexibleSpec?: {
    interests?: { id: string; name: string }[];
    behaviors?: { id: string; name: string }[];
  }[];
  publisherPlatforms?: string[];
  facebookPositions?: string[];
  instagramPositions?: string[];
  targetingAutomation?: { advantageAudience: number };
}

export type BidStrategy =
  | 'LOWEST_COST_WITHOUT_CAP'
  | 'COST_CAP'
  | 'LOWEST_COST_WITH_BID_CAP'
  | 'LOWEST_COST_WITH_MIN_ROAS';

export type CampaignLinkType = 'testing' | 'scaling' | 'retargeting';

export interface ProductCampaignLink {
  id: string;
  productProfileId: string;
  campaignId: string;
  campaignName: string;
  campaignType: CampaignLinkType;
  adAccountId: string;
  isActive: boolean;
  linkedAt: string;
}

// ── Creative Inbox ──

export type UploadStatus = 'pending' | 'uploading' | 'ready' | 'failed';
export type CreativeFormat = 'video' | 'image' | 'carousel';

export interface InboxCreative {
  id: string;
  clickupTaskId: string;
  clickupTaskName: string;
  productProfileId?: string;
  productName?: string;
  creativeName: string;
  creativeFormat: CreativeFormat;
  hook?: string;
  angle?: string;
  creator?: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  uploadStatus: UploadStatus;
  uploadProgress: number;
  uploadError?: string;
  metaAssetId?: string;
  metaAssetType?: 'IMAGE' | 'VIDEO';
  alreadyTested: boolean;
  pastTestResult?: {
    testDate: string;
    roas: number;
    status: 'winner' | 'killed' | 'inconclusive';
  };
  syncedAt: string;
}

// ── Launch Configuration ──

export type CampaignMode = 'existing' | 'new';
export type AdsetMode = 'new_adsets' | 'existing_adsets';
export type AdsetDistribution = 'all_to_one' | 'distribute' | 'one_per_adset';

export interface LaunchConfig {
  productProfileId: string;
  selectedCreativeIds: string[];
  campaignMode: CampaignMode;
  // Existing campaign
  existingCampaignId?: string;
  // Adset mode
  adsetMode: AdsetMode;
  adsetDistribution?: AdsetDistribution;
  existingAdsetAssignments?: Record<string, string[]>; // adsetId -> creativeIds
  // New campaign settings
  newCampaignName?: string;
  structure: 'ABO' | 'CBO';
  adAccountId?: string;
  pageId?: string;
  instagramActorId?: string;
  pixelId?: string;
  conversionEvent?: string;
  destinationUrl?: string;
  // Budget & Bid
  dailyBudget: number;
  testDuration: number;
  bidStrategy: BidStrategy;
  bidAmount?: number;
  roasFloor?: number;
  launchStatus: 'ACTIVE' | 'PAUSED';
  // Targeting
  targetingPresetId?: string;
  customTargeting?: TargetingSpec;
  // Ad Copy
  primaryTexts: CopyItem[];
  headlines: CopyItem[];
  descriptions: CopyItem[];
  ctaType: string;
  advantageCreative: boolean;
  // Per-creative URL overrides
  perCreativeUrls?: Record<string, string>; // creativeId -> url
  usePerCreativeUrls: boolean;
  // Schedule
  launchTime: 'immediately' | 'scheduled';
  scheduledDate?: string;
  scheduledTime?: string;
  endDate?: string;
  // UTM
  utmTemplate?: string;
  // Multi-account
  mirrorAccounts?: MirrorAccount[];
  // AI rules
  aiMinSpend?: number;
  aiMinImpressions?: number;
  aiMinHours?: number;
  aiEvalFrequency?: string;
  autoKill?: boolean;
  notifyOnKill?: boolean;
}

export interface CopyItem {
  id: string;
  text: string;
  source: 'winner' | 'ai_generated' | 'manual';
  sourceRoas?: number;
  sourceCopyId?: string;
}

export interface MirrorAccount {
  adAccountId: string;
  adAccountName: string;
  currency: string;
  budget: number;
  selected: boolean;
}

// ── Creative Tests ──

export type TestStatus = 'launching' | 'active' | 'completed' | 'failed' | 'partial';
export type ItemTestStatus = 'testing' | 'winner' | 'killed' | 'inconclusive';
export type ReviewStatus = 'IN_REVIEW' | 'ACTIVE' | 'DISAPPROVED' | 'WITH_ISSUES';
export type LearningPhase = 'LEARNING' | 'LEARNING_LIMITED' | 'ACTIVE';
export type AIRecommendation = 'kill' | 'scale' | 'wait' | 'graduate';

export interface CreativeTest {
  id: string;
  storeId: string;
  productProfileId: string;
  productName: string;
  campaignId: string;
  campaignName: string;
  campaignMode: CampaignMode;
  adsetMode: AdsetMode;
  structure: 'ABO' | 'CBO';
  bidStrategy: BidStrategy;
  bidAmount?: number;
  roasFloor?: number;
  dailyBudget: number;
  testDuration: number;
  launchStatus: string;
  status: TestStatus;
  launchedBy: string;
  launchedAt: string;
  completedAt?: string;
  totalSpend: number;
  winnerCreativeId?: string;
  items: CreativeTestItem[];
  adCopy: TestAdCopy[];
}

export interface CreativeTestItem {
  id: string;
  creativeTestId: string;
  clickupTaskId?: string;
  clickupTaskName?: string;
  creativeName: string;
  creativeFormat: CreativeFormat;
  hook?: string;
  angle?: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  metaAssetId?: string;
  metaAssetType?: string;
  metaAdsetId?: string;
  metaAdId?: string;
  metaCreativeId?: string;
  uploadStatus: UploadStatus;
  launchStatus: 'pending' | 'created' | 'failed' | 'rolled_back';
  reviewStatus?: ReviewStatus;
  reviewFeedback?: string;
  learningPhase?: LearningPhase;
  testStatus: ItemTestStatus;
  spend: number;
  revenue: number;
  roas: number;
  cpa?: number;
  ctr?: number;
  purchases: number;
  impressions: number;
  aiRecommendation?: AIRecommendation;
  aiReasoning?: string;
}

export interface TestAdCopy {
  id: string;
  creativeTestId: string;
  copyType: 'primary_text' | 'headline' | 'description';
  copyText: string;
  source: 'winner' | 'ai_generated' | 'manual';
  sourceCopyId?: string;
  position: number;
}

// ── Copy Library ──

export interface WinningCopy {
  id: string;
  productProfileId: string;
  primaryText: string;
  headline?: string;
  description?: string;
  cta?: string;
  sourceAdId?: string;
  sourceTestId?: string;
  roas: number;
  cpa?: number;
  ctr?: number;
  totalSpend: number;
  totalRevenue: number;
  totalPurchases: number;
  isAiGenerated: boolean;
  createdAt: string;
}

// ── Health Checks ──

export interface HealthCheck {
  check: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  details?: string;
  options?: { label: string; value: string }[];
}

export interface PreLaunchReport {
  checks: HealthCheck[];
  canLaunch: boolean;
  warnings: number;
  failures: number;
}

// ── Fatigue Alerts ──

export interface FatigueAlert {
  id: string;
  productProfileId: string;
  productName: string;
  adId: string;
  creativeName: string;
  campaignId: string;
  ctrTrend: number[];
  cpaTrend: number[];
  frequencyTrend: number[];
  alertType: 'fatigue' | 'declining';
  status: 'active' | 'snoozed' | 'dismissed';
  snoozedUntil?: string;
  createdAt: string;
}

// ── Store State ──

export type CreativeHubTab = 'profiles' | 'inbox' | 'active' | 'completed' | 'copy-library';
export type LaunchWizardStep = 1 | 2 | 3 | 4;
```

**Step 2: Commit**

```bash
git add src/types/creativeHub.ts
git commit -m "feat(creative-hub): add type definitions for creative automation system"
```

---

## Task 2: Database Tables

**Files:**
- Modify: `src/app/api/lib/db.ts` (add table creation to init)
- Create: `src/app/api/lib/creative-hub-db.ts` (CRUD helpers)

**Step 1: Add tables to db.ts init function**

Add these CREATE TABLE statements to the existing `initializeDatabase()` function in `src/app/api/lib/db.ts`:

```sql
CREATE TABLE IF NOT EXISTS product_profiles (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  shopify_product_id TEXT,
  product_name TEXT NOT NULL,
  product_image TEXT,
  ad_account_id TEXT NOT NULL,
  ad_account_currency TEXT DEFAULT 'USD',
  page_id TEXT,
  instagram_actor_id TEXT,
  pixel_id TEXT,
  conversion_event TEXT DEFAULT 'PURCHASE',
  destination_url TEXT,
  utm_template TEXT,
  average_order_value REAL,
  default_budget REAL DEFAULT 20,
  default_duration INTEGER DEFAULT 3,
  default_bid_strategy TEXT DEFAULT 'LOWEST_COST_WITHOUT_CAP',
  default_bid_amount REAL,
  default_roas_floor REAL,
  default_structure TEXT DEFAULT 'ABO',
  default_launch_status TEXT DEFAULT 'ACTIVE',
  naming_template_json TEXT,
  targeting_presets_json TEXT,
  clickup_list_id TEXT,
  clickup_sync_interval INTEGER DEFAULT 30,
  ai_min_spend REAL,
  ai_min_impressions INTEGER DEFAULT 500,
  ai_min_hours INTEGER DEFAULT 24,
  ai_eval_frequency TEXT DEFAULT 'every_6h',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_campaign_links (
  id TEXT PRIMARY KEY,
  product_profile_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  campaign_type TEXT NOT NULL,
  ad_account_id TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  linked_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_profile_id) REFERENCES product_profiles(id)
);

CREATE TABLE IF NOT EXISTS creative_tests (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  product_profile_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  campaign_mode TEXT NOT NULL,
  adset_mode TEXT NOT NULL,
  structure TEXT NOT NULL,
  bid_strategy TEXT,
  bid_amount REAL,
  roas_floor REAL,
  daily_budget REAL,
  test_duration INTEGER,
  launch_status TEXT,
  status TEXT DEFAULT 'launching',
  launched_by TEXT,
  launched_at TEXT,
  completed_at TEXT,
  total_spend REAL DEFAULT 0,
  winner_creative_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS creative_test_items (
  id TEXT PRIMARY KEY,
  creative_test_id TEXT NOT NULL,
  clickup_task_id TEXT,
  clickup_task_name TEXT,
  creative_name TEXT NOT NULL,
  creative_format TEXT,
  hook TEXT,
  angle TEXT,
  drive_url TEXT,
  thumbnail_url TEXT,
  meta_asset_id TEXT,
  meta_asset_type TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  meta_creative_id TEXT,
  upload_status TEXT DEFAULT 'pending',
  launch_status TEXT DEFAULT 'pending',
  review_status TEXT,
  review_feedback TEXT,
  learning_phase TEXT,
  test_status TEXT DEFAULT 'testing',
  spend REAL DEFAULT 0,
  revenue REAL DEFAULT 0,
  roas REAL DEFAULT 0,
  cpa REAL,
  ctr REAL,
  purchases INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ai_recommendation TEXT,
  ai_reasoning TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (creative_test_id) REFERENCES creative_tests(id)
);

CREATE TABLE IF NOT EXISTS copy_library (
  id TEXT PRIMARY KEY,
  product_profile_id TEXT NOT NULL,
  primary_text TEXT NOT NULL,
  headline TEXT,
  description TEXT,
  cta TEXT,
  source_ad_id TEXT,
  source_test_id TEXT,
  roas REAL,
  cpa REAL,
  ctr REAL,
  total_spend REAL,
  total_revenue REAL,
  total_purchases INTEGER,
  is_ai_generated INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_ad_copy (
  id TEXT PRIMARY KEY,
  creative_test_id TEXT NOT NULL,
  copy_type TEXT NOT NULL,
  copy_text TEXT NOT NULL,
  source TEXT,
  source_copy_id TEXT,
  position INTEGER,
  FOREIGN KEY (creative_test_id) REFERENCES creative_tests(id)
);

CREATE TABLE IF NOT EXISTS creative_fatigue_alerts (
  id TEXT PRIMARY KEY,
  product_profile_id TEXT NOT NULL,
  product_name TEXT,
  ad_id TEXT NOT NULL,
  creative_name TEXT,
  campaign_id TEXT,
  ctr_trend TEXT,
  cpa_trend TEXT,
  frequency_trend TEXT,
  alert_type TEXT,
  status TEXT DEFAULT 'active',
  snoozed_until TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Step 2: Create CRUD helper file**

Create `src/app/api/lib/creative-hub-db.ts` with functions:
- `getProductProfiles(storeId)` — SELECT * FROM product_profiles WHERE store_id = ?
- `getProductProfile(id)` — SELECT by id
- `upsertProductProfile(profile)` — INSERT OR REPLACE
- `deleteProductProfile(id)` — DELETE
- `getProductCampaignLinks(profileId)` — SELECT campaign links
- `upsertProductCampaignLink(link)` — INSERT OR REPLACE
- `getCreativeTests(storeId, status?)` — SELECT tests with items
- `getCreativeTest(id)` — SELECT test with items and ad copy
- `createCreativeTest(test)` — INSERT test + items + ad_copy
- `updateCreativeTestStatus(id, status)` — UPDATE status
- `updateCreativeTestItem(id, updates)` — UPDATE item fields
- `getCopyLibrary(productProfileId)` — SELECT ordered by roas DESC
- `saveCopyToLibrary(copy)` — INSERT
- `deleteCopyFromLibrary(id)` — DELETE
- `getFatigueAlerts(storeId)` — SELECT active alerts

Each function uses the existing `getDb()` pattern from `src/app/api/lib/db.ts`.

**IMPORTANT:** For auto-discovery, use the EXISTING campaign data. Read from:
- `campaign_snapshots` table (or in-memory cache from `src/services/adsManager.ts`)
- The existing `/api/meta/campaigns` route already caches this data
- Do NOT call Meta API directly for read operations during discovery

**Step 3: Commit**

```bash
git add src/app/api/lib/db.ts src/app/api/lib/creative-hub-db.ts
git commit -m "feat(creative-hub): add database tables and CRUD helpers"
```

---

## Task 3: Zustand Store

**Files:**
- Create: `src/stores/creativeHubStore.ts`

**Step 1: Create the store**

Create a Zustand store managing all Creative Hub state:

```typescript
// Key state:
activeTab: CreativeHubTab  // 'profiles' | 'inbox' | 'active' | 'completed' | 'copy-library'
// Product Profiles
profiles: ProductProfile[]
profilesLoading: boolean
unmappedCampaigns: UnmappedCampaign[]
// Creative Inbox
inboxCreatives: InboxCreative[]
inboxLoading: boolean
selectedCreativeIds: Set<string>
uploadProgress: Map<string, number>  // creativeId -> progress %
// Launch Wizard
launchWizardOpen: boolean
launchStep: LaunchWizardStep
launchConfig: LaunchConfig
// Active Tests
activeTests: CreativeTest[]
activeTestsLoading: boolean
// Completed Tests
completedTests: CreativeTest[]
// Copy Library
copyLibrary: WinningCopy[]
// Fatigue Alerts
fatigueAlerts: FatigueAlert[]

// Key actions:
setActiveTab(tab)
fetchProfiles(storeId)
autoDiscoverProfiles(storeId)
saveProfile(profile)
deleteProfile(id)
fetchInbox(storeId, productId?)
syncInbox(storeId)
toggleCreativeSelection(id)
selectAllCreatives()
deselectAllCreatives()
startUpload(creativeId)
openLaunchWizard()
closeLaunchWizard()
setLaunchStep(step)
updateLaunchConfig(partial)
executeLaunch(storeId)
fetchActiveTests(storeId)
fetchCompletedTests(storeId)
executeAIActions(testId, actions)
fetchCopyLibrary(productProfileId)
generateAICopy(productProfileId, context)
saveCopyToLibrary(copy)
```

No localStorage persistence — all data comes from API.

**Step 2: Commit**

```bash
git add src/stores/creativeHubStore.ts
git commit -m "feat(creative-hub): add Zustand store for creative hub state"
```

---

## Task 4: Navigation Update

**Files:**
- Modify: `src/data/navigation.ts`

**Step 1: Add Creative Hub to sidebar**

Replace the existing `creative-testing` and `creative-launch` nav items with a single `creative-hub` item:

```typescript
{
  label: 'Creative Hub',
  href: '/dashboard/creative-hub',
  icon: Sparkles, // from lucide-react
  description: 'Creative testing automation',
}
```

Place it in the CORE WORKSPACES section, after Ads Manager.

**Step 2: Commit**

```bash
git add src/data/navigation.ts
git commit -m "feat(creative-hub): add Creative Hub to sidebar navigation"
```

---

## Task 5: Product Profiles API

**Files:**
- Create: `src/app/api/creative-hub/product-profiles/route.ts` (GET, POST)
- Create: `src/app/api/creative-hub/product-profiles/[id]/route.ts` (PATCH, DELETE)
- Create: `src/app/api/creative-hub/product-profiles/auto-discover/route.ts` (POST)

**Key Implementation Notes:**

The `auto-discover` route is the most important. It:

1. Reads EXISTING cached campaign data from the ads manager database (campaign_snapshots or in-memory cache)
2. For each campaign, looks at the cached ad data to find destination URLs
3. Fetches Shopify products from the existing `/api/shopify/products` route or database
4. Tier 1: Matches ad URLs to Shopify product handles
5. Tier 2: Sends unmatched campaigns + product names to Claude AI for matching
6. Tier 3: Returns remaining as unmapped
7. For matched products: extracts ad_account_id, page_id, pixel_id, instagram_actor_id from the cached campaign/adset/ad data
8. Saves to product_profiles + product_campaign_links tables

**CRITICAL:** Use `getLatestMetaEndpointSnapshot()` or equivalent from existing `src/app/api/lib/db.ts` to read cached campaign data. Do NOT call Meta API.

**Step 1: Implement routes**
**Step 2: Commit**

```bash
git add src/app/api/creative-hub/product-profiles/
git commit -m "feat(creative-hub): add product profiles API with auto-discovery"
```

---

## Task 6: Creative Inbox API

**Files:**
- Create: `src/app/api/creative-hub/inbox/route.ts` (GET)
- Create: `src/app/api/creative-hub/inbox/sync/route.ts` (POST)
- Create: `src/app/api/creative-hub/inbox/upload/route.ts` (POST)
- Create: `src/app/api/creative-hub/inbox/upload-status/[assetId]/route.ts` (GET)
- Create: `src/app/api/creative-hub/inbox/validate-drive-link/route.ts` (POST)

**Key Implementation Notes:**

- `GET /inbox` — Fetches creatives from ClickUp (uses existing ClickUp integration at `/api/integrations/clickup/tasks`)
- `POST /inbox/sync` — Triggers fresh sync from ClickUp, filters for "Ready to Launch" status only
- `POST /inbox/upload` — Downloads file from Google Drive URL, uploads to Meta ad account using existing `/api/meta/upload-asset/` route pattern
- `GET /inbox/upload-status` — Polls Meta for video processing status
- `POST /inbox/validate-drive-link` — HEAD request to Drive URL, checks accessibility, file type, size
- Duplicate detection: Check creative_test_items table for matching clickup_task_id or creative_name

**Step 1: Implement routes**
**Step 2: Commit**

```bash
git add src/app/api/creative-hub/inbox/
git commit -m "feat(creative-hub): add creative inbox API with ClickUp sync and Drive upload"
```

---

## Task 7: Launch API

**Files:**
- Create: `src/app/api/creative-hub/launch/health-check/route.ts` (POST)
- Create: `src/app/api/creative-hub/launch/execute/route.ts` (POST)
- Create: `src/app/api/creative-hub/launch/retry/[testId]/route.ts` (POST)
- Create: `src/app/api/creative-hub/launch/rollback/[testId]/route.ts` (POST)
- Create: `src/app/api/creative-hub/launch/status/[testId]/route.ts` (GET)

**Key Implementation Notes:**

- `POST /launch/health-check` — Runs all pre-launch validations:
  - Token validity (check expiry)
  - Account status (from cached data)
  - Account spending limit vs current spend (from cached data)
  - Creative upload status (all must be 'ready')
  - Landing page HTTP check (HEAD request)
  - Duplicate creative check (query creative_test_items)
  - Team collision check (query creative_tests for same product with status='active')
  - Weekend warning (check day of week)
  - Naming collision check (query existing campaigns by name)
  - Currency display (from ad account data)

- `POST /launch/execute` — The main launch route:
  1. Create creative_tests record with status='launching'
  2. If new campaign: POST to Meta `/campaigns` endpoint
  3. For each creative: POST to Meta `/adsets` + `/adcreatives` + `/ads`
  4. Use Meta Batch API (50/batch) for bulk creation
  5. If multi-PT/headline: use asset_feed_spec (Flexible Ads format)
  6. If single PT/headline: use standard object_story_spec
  7. On partial failure: PAUSE all created adsets, mark test as 'partial'
  8. Update ClickUp task status to "Testing" via existing PATCH endpoint
  9. Return test ID for status polling

- Uses existing Meta client from `src/app/api/lib/meta-client.ts`
- Uses existing campaign publish pattern from `src/app/api/meta/campaigns/publish/route.ts`

**Step 1: Implement routes**
**Step 2: Commit**

```bash
git add src/app/api/creative-hub/launch/
git commit -m "feat(creative-hub): add launch API with health checks, execution, retry, rollback"
```

---

## Task 8: Active Tests API

**Files:**
- Create: `src/app/api/creative-hub/tests/active/route.ts` (GET)
- Create: `src/app/api/creative-hub/tests/[testId]/metrics/route.ts` (GET)
- Create: `src/app/api/creative-hub/tests/[testId]/review-status/route.ts` (GET)
- Create: `src/app/api/creative-hub/tests/[testId]/ai-evaluate/route.ts` (POST)
- Create: `src/app/api/creative-hub/tests/[testId]/actions/route.ts` (POST)

**Key Implementation Notes:**

- `GET /tests/active` — Query creative_tests with status IN ('active', 'launching', 'partial') + join items
- `GET /tests/:id/metrics` — Fetch latest metrics from Meta Insights API for each ad in the test
- `GET /tests/:id/review-status` — Poll Meta for ad review status (effective_status, review_feedback)
- `POST /tests/:id/ai-evaluate` — Send test data to Claude for kill/scale/wait/graduate analysis
- `POST /tests/:id/actions` — Execute actions on Meta:
  - kill: PAUSE adset via existing `/api/meta/adset-status` route
  - scale: Update budget via Meta API
  - graduate: Duplicate to scaling campaign via existing `/api/meta/duplicate` route
  - Update ClickUp task status (Winner/Failed)
  - Save winning copy to copy_library

**Step 1: Implement routes**
**Step 2: Commit**

```bash
git add src/app/api/creative-hub/tests/
git commit -m "feat(creative-hub): add active tests API with metrics, review status, AI evaluation"
```

---

## Task 9: Copy Library API

**Files:**
- Create: `src/app/api/creative-hub/copy-library/route.ts` (GET, POST, DELETE)
- Create: `src/app/api/creative-hub/copy-library/ai-generate/route.ts` (POST)
- Create: `src/app/api/creative-hub/copy-library/ai-analyze/route.ts` (POST)

**Key Implementation Notes:**

- `GET /copy-library?productId=X` — Query copy_library ordered by ROAS desc
- `POST /copy-library` — Save winning copy
- `DELETE /copy-library/:id` — Remove copy
- `POST /copy-library/ai-generate` — Claude generates 5 PT variations + 5 headlines based on:
  - Existing winners from copy_library
  - Product name, description, offer
  - Competitor research (web search)
- `POST /copy-library/ai-analyze` — Claude analyzes all ads in product's campaigns (from CACHED data) and ranks best performing copy

**Step 1: Implement routes**
**Step 2: Commit**

```bash
git add src/app/api/creative-hub/copy-library/
git commit -m "feat(creative-hub): add copy library API with AI generation and analysis"
```

---

## Task 10: Creative Hub Page Shell + Tabs

**Files:**
- Create: `src/app/dashboard/creative-hub/page.tsx`
- Create: `src/components/creative-hub/CreativeHubClient.tsx`

**Key Implementation Notes:**

Server component page.tsx wraps client component.
Client component renders:
- Page header: "Creative Hub" title + description
- Tab bar: Product Profiles | Creative Inbox | Active Tests | Completed | Copy Library
- Active tab content area
- Uses `useCreativeHubStore` for tab state

**Design patterns to follow:**
- Match existing CreativeTestingClient.tsx layout
- Use existing Tabs component from `src/components/ui/Tabs.tsx`
- Card radius: rounded-xl (12px)
- Spacing: space-y-6 between sections
- Text: text-2xl font-bold for title, text-sm text-gray-500 for description

**Step 1: Implement page shell**
**Step 2: Commit**

```bash
git add src/app/dashboard/creative-hub/ src/components/creative-hub/CreativeHubClient.tsx
git commit -m "feat(creative-hub): add page shell with tab navigation"
```

---

## Task 11: Product Profiles UI

**Files:**
- Create: `src/components/creative-hub/ProductProfilesTab.tsx`
- Create: `src/components/creative-hub/ProductProfileCard.tsx`
- Create: `src/components/creative-hub/EditProductProfileModal.tsx`
- Create: `src/components/creative-hub/UnmappedCampaignCard.tsx`

**Key Implementation Notes:**

Follow the design doc UI mockups exactly. Key components:

`ProductProfilesTab.tsx`:
- Header with "Auto-Discover" and "+ Add Manual" buttons
- Stats bar: "X products mapped · Y campaigns unmapped"
- Grid of ProductProfileCards
- "Unmapped Campaigns" section at bottom

`ProductProfileCard.tsx`:
- Product image + name + "Configured" badge
- Ad Account, Page, IG, Pixel, URL display
- Linked Campaigns list with type badges (Testing/Scaling/Retarget)
- Test Defaults summary
- Edit/View buttons
- Use rounded-xl cards with border, p-6 padding

`EditProductProfileModal.tsx`:
- Full modal form matching design doc
- Sections: Meta Config, Product Info, Destination, Test Defaults, AI Kill Thresholds, Targeting Presets, Naming Template, Linked Campaigns, ClickUp Integration
- Currency display next to all money fields
- Bid strategy radio group with conditional bid/ROAS input
- Uses existing Modal component

`UnmappedCampaignCard.tsx`:
- Campaign name, ad account, budget
- AI suggestion with confidence %
- Map to product dropdown + Ignore/Create New buttons

**Step 1: Implement all 4 components**
**Step 2: Commit**

```bash
git add src/components/creative-hub/ProductProfilesTab.tsx src/components/creative-hub/ProductProfileCard.tsx src/components/creative-hub/EditProductProfileModal.tsx src/components/creative-hub/UnmappedCampaignCard.tsx
git commit -m "feat(creative-hub): add Product Profiles UI components"
```

---

## Task 12: Creative Inbox UI

**Files:**
- Create: `src/components/creative-hub/CreativeInboxTab.tsx`
- Create: `src/components/creative-hub/InboxCreativeRow.tsx`
- Create: `src/components/creative-hub/CreativePreviewModal.tsx`
- Create: `src/components/creative-hub/UploadProgressBar.tsx`

**Key Implementation Notes:**

`CreativeInboxTab.tsx`:
- Filter bar: Product dropdown, Format dropdown, Status dropdown
- "Sync Now" button
- Grouped by product (collapsible sections)
- Bottom sticky bar: Selected count, upload progress, "Launch Selected" button
- Overall upload progress bar

`InboxCreativeRow.tsx`:
- Checkbox + thumbnail + name + format badge + status badge
- Hook, angle, creator metadata
- Upload status: pending/uploading(with progress)/ready/failed
- "Already Tested" badge with past result for duplicates
- Drive link error handling with Retry/Upload Manually/Skip buttons
- Preview button

`CreativePreviewModal.tsx`:
- Left: image/video player (use HTML5 video for Drive URLs)
- Right: metadata (name, format, hook, angle, creator, resolution, aspect ratio)
- Upload status, Meta asset ID
- Drive link, ClickUp task link

`UploadProgressBar.tsx`:
- Horizontal progress bar with percentage
- Animated fill using Framer Motion
- Color: blue when uploading, green when complete, red when failed

**Step 1: Implement all 4 components**
**Step 2: Commit**

```bash
git add src/components/creative-hub/CreativeInboxTab.tsx src/components/creative-hub/InboxCreativeRow.tsx src/components/creative-hub/CreativePreviewModal.tsx src/components/creative-hub/UploadProgressBar.tsx
git commit -m "feat(creative-hub): add Creative Inbox UI with upload progress and preview"
```

---

## Task 13: Launch Wizard UI (4 Steps)

**Files:**
- Create: `src/components/creative-hub/LaunchWizard.tsx` (main wizard shell)
- Create: `src/components/creative-hub/launch/LaunchStep1Campaign.tsx`
- Create: `src/components/creative-hub/launch/LaunchStep2AdCopy.tsx`
- Create: `src/components/creative-hub/launch/LaunchStep3Settings.tsx`
- Create: `src/components/creative-hub/launch/LaunchStep4Review.tsx`
- Create: `src/components/creative-hub/launch/WizardStepIndicator.tsx`
- Create: `src/components/creative-hub/launch/HealthCheckPanel.tsx`
- Create: `src/components/creative-hub/launch/PostLaunchStatus.tsx`

**Key Implementation Notes:**

This is a full-page wizard overlay (or separate route `/dashboard/creative-hub/launch`).

`LaunchWizard.tsx`:
- WizardStepIndicator at top (reuse pattern from CampaignCreateWizard)
- Renders current step component
- Back/Next navigation at bottom
- Step 4's "Launch" button triggers the launch API

`LaunchStep1Campaign.tsx`:
- Product selector grid (card-based, like ObjectiveStep)
- Campaign mode toggle (Existing / New)
- If Existing: campaign list from product_campaign_links
- Adset mode toggle (Create New / Use Existing)
- If New Adsets: budget, bid, duration fields
- If Existing Adsets: adset list with creative assignment checkboxes
- If New Campaign: full config form (account, page, pixel, targeting, etc.)
- All money fields show currency from ad account

`LaunchStep2AdCopy.tsx`:
- Two-column: Winner Copy Library (left) + AI Generator (right)
- Multi-PT list (1-5 items, add/remove)
- Multi-headline list (1-5 items, add/remove)
- Multi-description list (1-5 items, add/remove)
- Per-creative URL override toggle
- CTA dropdown, Advantage+ toggle
- Info banner showing combination count (PTs x HLs x Descs)
- "Generate 5 PT Variations" and "Generate 5 Headlines" buttons for AI

`LaunchStep3Settings.tsx`:
- Schedule: immediately / scheduled date+time
- End date: auto-stop / no end / custom
- Attribution window dropdown
- UTM template input
- Naming override (campaign/adset/ad names, editable)
- Multi-account launch checkboxes (optional)
- AI test rules: min spend, min impressions, min time, eval frequency, auto-kill toggle

`LaunchStep4Review.tsx`:
- HealthCheckPanel at top (pre-launch validations)
- Campaign summary card
- Ad copy summary
- "What will be created on Meta" tree view
- Creative preview grid (thumbnails)
- Warning/notice banners
- Launch status toggle (Active / Paused)
- "Launch Test on Meta" button

`HealthCheckPanel.tsx`:
- List of health check results with ok/warn/fail icons
- Expandable options for warnings (e.g., spending limit options)
- Weekend warning with schedule suggestion

`PostLaunchStatus.tsx`:
- Real-time launch progress (creating campaign, adsets, ads)
- Success/failure per item with status icons
- Partial failure handling: Retry/Enable/Rollback buttons
- ClickUp status update log

**Step 1: Implement all 8 components**
**Step 2: Commit**

```bash
git add src/components/creative-hub/LaunchWizard.tsx src/components/creative-hub/launch/
git commit -m "feat(creative-hub): add 4-step Launch Wizard UI"
```

---

## Task 14: Active Tests Monitor UI

**Files:**
- Create: `src/components/creative-hub/ActiveTestsTab.tsx`
- Create: `src/components/creative-hub/TestCard.tsx`
- Create: `src/components/creative-hub/TestItemRow.tsx`
- Create: `src/components/creative-hub/AIRecommendationPanel.tsx`
- Create: `src/components/creative-hub/ConfirmActionsModal.tsx`
- Create: `src/components/creative-hub/ReviewStatusBadge.tsx`
- Create: `src/components/creative-hub/FatigueAlertBanner.tsx`

**Key Implementation Notes:**

`ActiveTestsTab.tsx`:
- Header with refresh button and auto-refresh indicator (every 90s)
- Team activity bar (who's testing what)
- List of TestCards grouped by product
- Fatigue alert banners at top

`TestCard.tsx`:
- Collapsible card per test
- Header: product name, creative count, day X of Y, total spend
- Campaign name, launched by
- Table of TestItemRows with sortable columns
- AIRecommendationPanel below table
- Manual action buttons: Pause Selected, Change Budget, Duplicate Winner

`TestItemRow.tsx`:
- Creative name, spend, ROAS, CPA, CTR, purchases, status
- ReviewStatusBadge (In Review / Active / Rejected)
- Learning phase indicator
- AI recommendation badge (kill/scale/wait)
- Color coding: green for winners, red for kill candidates, yellow for testing

`AIRecommendationPanel.tsx`:
- AI evaluation timestamp
- List of recommendations with reasoning
- Copy performance breakdown (which PT/HL combo wins)
- "Apply All Actions" / "Edit Actions" / "Dismiss" buttons

`ConfirmActionsModal.tsx`:
- Checklist of actions to be taken (PAUSE, SCALE, etc.)
- Net budget change calculation
- ClickUp status updates preview
- "Save winning copy to library" checkbox
- Execute/Cancel buttons

`ReviewStatusBadge.tsx`:
- IN_REVIEW: yellow badge
- ACTIVE: green badge
- DISAPPROVED: red badge with rejection reason tooltip
- WITH_ISSUES: amber badge

`FatigueAlertBanner.tsx`:
- Alert banner showing creative fatigue signals
- CTR/CPA/Frequency trend arrows
- "Launch New Test" / "Snooze" / "Dismiss" buttons

**Step 1: Implement all 7 components**
**Step 2: Commit**

```bash
git add src/components/creative-hub/ActiveTestsTab.tsx src/components/creative-hub/TestCard.tsx src/components/creative-hub/TestItemRow.tsx src/components/creative-hub/AIRecommendationPanel.tsx src/components/creative-hub/ConfirmActionsModal.tsx src/components/creative-hub/ReviewStatusBadge.tsx src/components/creative-hub/FatigueAlertBanner.tsx
git commit -m "feat(creative-hub): add Active Tests Monitor UI with AI recommendations"
```

---

## Task 15: Completed Tests + Copy Library UI

**Files:**
- Create: `src/components/creative-hub/CompletedTestsTab.tsx`
- Create: `src/components/creative-hub/CompletedTestCard.tsx`
- Create: `src/components/creative-hub/CopyLibraryTab.tsx`
- Create: `src/components/creative-hub/CopyCard.tsx`

**Key Implementation Notes:**

`CompletedTestsTab.tsx`:
- Filters: Product, Date range, Sort by
- List of CompletedTestCards

`CompletedTestCard.tsx`:
- Test batch name, date range, creative count
- Winner highlight with ROAS/CPA
- Killed/inconclusive summary
- Action taken summary
- "View Full Results" / "Re-test Inconclusive" buttons

`CopyLibraryTab.tsx`:
- Product filter dropdown
- Sort by: ROAS, CPA, Spend, Date
- Grid of CopyCards
- "Generate AI Copy" button

`CopyCard.tsx`:
- Performance metrics banner (ROAS, revenue, purchases, CTR)
- Primary text, headline, description, CTA
- Source info (which test/ad it came from)
- "Copy to Clipboard" / "Use in New Test" buttons

**Step 1: Implement all 4 components**
**Step 2: Commit**

```bash
git add src/components/creative-hub/CompletedTestsTab.tsx src/components/creative-hub/CompletedTestCard.tsx src/components/creative-hub/CopyLibraryTab.tsx src/components/creative-hub/CopyCard.tsx
git commit -m "feat(creative-hub): add Completed Tests and Copy Library UI"
```

---

## Task 16: Wire UI to API Routes

**Files:**
- Modify: `src/stores/creativeHubStore.ts` (add fetch logic)
- Modify: `src/components/creative-hub/CreativeHubClient.tsx` (add data loading)

**Key Implementation Notes:**

Wire all store actions to actual API calls:
- `fetchProfiles` → GET `/api/creative-hub/product-profiles?storeId=X`
- `autoDiscoverProfiles` → POST `/api/creative-hub/product-profiles/auto-discover`
- `saveProfile` → POST/PATCH `/api/creative-hub/product-profiles`
- `fetchInbox` → GET `/api/creative-hub/inbox?storeId=X&productId=Y`
- `syncInbox` → POST `/api/creative-hub/inbox/sync`
- `startUpload` → POST `/api/creative-hub/inbox/upload`
- `executeLaunch` → POST `/api/creative-hub/launch/execute`
- `fetchActiveTests` → GET `/api/creative-hub/tests/active?storeId=X`
- etc.

Use `useEffect` in CreativeHubClient to fetch initial data based on active tab.
Use `useStoreStore` to get active storeId.

**Step 1: Implement wiring**
**Step 2: Commit**

```bash
git add src/stores/creativeHubStore.ts src/components/creative-hub/CreativeHubClient.tsx
git commit -m "feat(creative-hub): wire UI components to API routes"
```

---

## Task 17: Pre-Launch Health Checks Implementation

**Files:**
- Modify: `src/app/api/creative-hub/launch/health-check/route.ts`

**Key Implementation Notes:**

Implement each health check:

1. **Token validity**: Check Meta token expiry from `third_party_tokens` table
2. **Account active**: Check from CACHED ad account data
3. **Spending limit**: Read `account.spend_cap` from CACHED data, compare to sum of active adset budgets
4. **Creatives uploaded**: Check all selected creative upload_status === 'ready'
5. **Landing page**: HTTP HEAD request to destination URL, check status 200
6. **Pixel check**: Verify pixel_id exists in CACHED pixel data
7. **Duplicate check**: Query creative_test_items for matching names
8. **Team collision**: Query creative_tests WHERE product_profile_id = X AND status = 'active'
9. **Weekend check**: `new Date().getDay()` — 0=Sun, 6=Sat
10. **Naming collision**: Check if campaign name exists in CACHED campaign data
11. **Audience overlap**: Compare targeting specs between test and scaling campaigns

Return `PreLaunchReport` with all results.

**Step 1: Implement health checks**
**Step 2: Commit**

```bash
git add src/app/api/creative-hub/launch/health-check/route.ts
git commit -m "feat(creative-hub): implement all pre-launch health checks"
```

---

## Task 18: AI Integration (Claude Recommendations)

**Files:**
- Modify: `src/app/api/creative-hub/tests/[testId]/ai-evaluate/route.ts`
- Modify: `src/app/api/creative-hub/copy-library/ai-generate/route.ts`
- Modify: `src/app/api/creative-hub/copy-library/ai-analyze/route.ts`
- Modify: `src/app/api/creative-hub/product-profiles/auto-discover/route.ts` (AI matching)

**Key Implementation Notes:**

Use existing AI pattern from `src/app/api/ai/` routes. Call Claude API with structured prompts.

**AI Evaluate Test:**
Prompt includes: test items with metrics, product AOV, learning phase status, min spend thresholds.
Claude returns: `{ items: [{ id, recommendation: 'kill'|'scale'|'wait', reasoning: string }], copyAnalysis: { bestPT, bestHL, bestCombo } }`

**AI Generate Copy:**
Prompt includes: existing winners from copy_library, product name/description, offer details.
Claude returns: `{ primaryTexts: string[], headlines: string[] }`

**AI Analyze Winners:**
Prompt includes: all ads from product's campaigns (from CACHED data) with metrics.
Claude returns: ranked list of best performing copy with reasoning.

**AI Campaign Matching:**
Prompt includes: campaign names + URLs + product names.
Claude returns: `{ matches: [{ campaignId, productId, type, confidence }] }`

**Step 1: Implement AI routes**
**Step 2: Commit**

```bash
git add src/app/api/creative-hub/tests/ src/app/api/creative-hub/copy-library/ src/app/api/creative-hub/product-profiles/
git commit -m "feat(creative-hub): add Claude AI integration for recommendations and copy generation"
```

---

## Task 19: Visual Polish + Animations

**Files:**
- Modify: All creative-hub components

**Key Implementation Notes:**

Apply design patterns from Madgicx/Triple Whale study:

1. **Card depth**: `rounded-xl border border-border bg-surface-elevated shadow-sm`
2. **Metric values**: `text-2xl font-bold` with trend arrows (green up / red down)
3. **Status badges**: Pill-shaped `rounded-full px-2.5 py-0.5 text-xs font-medium`
   - Green: `bg-emerald-50 text-emerald-700 border border-emerald-200`
   - Red: `bg-red-50 text-red-700 border border-red-200`
   - Yellow: `bg-amber-50 text-amber-700 border border-amber-200`
   - Blue: `bg-blue-50 text-blue-700 border border-blue-200`
4. **Progress bars**: Framer Motion `layoutId` for smooth width transitions
5. **Tab transitions**: `motion.div` with fade in/out on tab change
6. **Card hover**: `hover:shadow-md hover:border-blue-200 transition-all duration-200`
7. **Upload progress**: Animated gradient bar with pulse effect
8. **Wizard step indicator**: Connected dots with gradient progress line
9. **AI recommendation panel**: Subtle gradient background `bg-gradient-to-r from-blue-50 to-indigo-50`
10. **Table rows**: Alternating subtle background, hover highlight
11. **Sparklines**: Mini area charts in metric cards using Recharts
12. **Loading states**: Skeleton placeholders matching component shapes

**Step 1: Apply visual polish across all components**
**Step 2: Commit**

```bash
git add src/components/creative-hub/
git commit -m "feat(creative-hub): add visual polish, animations, and design refinements"
```

---

## Execution Summary

| Group | Tasks | Can Parallelize? | Est. Components |
|-------|-------|-----------------|-----------------|
| A: Foundation | 1-4 | Yes (all 4) | 4 files |
| B: API Routes | 5-9 | Yes (all 5) | ~20 route files |
| C: UI Components | 10-15 | Yes (all 6) | ~30 component files |
| D: Integration | 16-19 | Partially (16+17 parallel, 18+19 parallel) | Modifications |

**Total new files:** ~55
**Total modified files:** ~3 (db.ts, navigation.ts, existing store)
