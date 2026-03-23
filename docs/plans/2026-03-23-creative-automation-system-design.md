# Creative Automation System — Full Design Document

**Date:** 2026-03-23
**Author:** Gaurav + Claude
**Status:** Approved for Implementation
**Branch:** dev/gaurav

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Module 1: Product Profiles](#module-1-product-profiles)
4. [Module 2: Creative Inbox](#module-2-creative-inbox)
5. [Module 3: Launch Wizard](#module-3-launch-wizard)
6. [Module 4: Active Test Monitor](#module-4-active-test-monitor)
7. [Module 5: Completed Tests](#module-5-completed-tests)
8. [Module 6: Copy Library](#module-6-copy-library)
9. [Safety & Validation Systems](#safety--validation-systems)
10. [Data Model](#data-model)
11. [API Routes](#api-routes)
12. [Meta API Integration](#meta-api-integration)

---

## Overview

### Problem

Media buyers manage **4 products x 50 creatives/week = 200 creatives/week** across **multiple ad accounts, BMs, pages, pixels, and Instagram accounts**. Today this means manually creating campaigns, adsets, and ads on Facebook for each creative, then monitoring and killing losers. OneScale automates this entire workflow.

### Solution

A 6-module creative automation system:

1. **Product Profiles** — Auto-discover product-to-campaign mappings from existing Meta data
2. **Creative Inbox** — ClickUp creative queue with Google Drive preview + Meta upload
3. **Launch Wizard** — Bulk campaign/adset/ad creation on Meta with full configuration
4. **Active Test Monitor** — Real-time test dashboard with AI-powered kill/scale recommendations
5. **Completed Tests** — Historical test results and analytics
6. **Copy Library** — AI-ranked winning ad copies per product

### Key Design Decisions

- **Auto-discovery over manual config**: System reverse-engineers product profiles from existing campaigns
- **AI-first copy management**: Claude analyzes winners, researches Reddit/competitors, generates new copy
- **One-click AI actions**: AI recommends kill/scale/wait, media buyer confirms with one click
- **ClickUp status sync**: Creatives move from "Ready to Launch" → "Testing" → "Winner"/"Failed"
- **Multi-copy support**: Up to 5 primary texts + 5 headlines per ad (Meta Flexible Ads)
- **Safety-first**: Pre-launch health checks, spending limit validation, team collision detection
- **Creative naming**: Uses ClickUp task name or Google Drive file name at ad level for differentiation

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CREATIVE AUTOMATION                       │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ 1. SETUP │ 2. INBOX │ 3. LAUNCH│ 4. MONITOR│ 5. AI ACTIONS  │
│          │          │          │           │                 │
│ Product  │ ClickUp  │ Bulk     │ Live test │ Claude agent    │
│ Profiles │ creative │ campaign │ dashboard │ evaluates &     │
│ (account,│ queue    │ creation │ with      │ suggests        │
│ page,    │ with     │ on Meta  │ real-time │ kill/scale      │
│ pixel,   │ Drive    │ (ABO/CBO)│ metrics   │ actions         │
│ IG, URL) │ previews │          │           │ (1-click)       │
└──────────┴──────────┴──────────┴───────────┴─────────────────┘
```

### Navigation

```
Sidebar:
  CORE WORKSPACES
    ├── Summary
    ├── Ads Manager
    ├── Creative Hub  ← (renamed from "Creative Testing")
    │     Tabs within page:
    │     ├── Product Profiles    (Module 1)
    │     ├── Creative Inbox      (Module 2)
    │     ├── Active Tests        (Module 4)
    │     ├── Completed           (Module 5)
    │     └── Copy Library        (Module 6)
    ├── P&L
    ├── Automation
    └── ...
```

Module 3 (Launch Wizard) is accessed via "Launch Selected" button in Creative Inbox — it's a full-page wizard flow, not a tab.

---

## Module 1: Product Profiles

### Purpose

Auto-discover which products map to which campaigns, ad accounts, pages, pixels, and Instagram accounts. Save this config so media buyers never have to manually set it up.

### Auto-Discovery Flow

```
STEP 1: Data we already have (from cron)
─────────────────────────────────────────
Shopify Products:  [Product A, Product B, Product C, Product D]
Meta Campaigns:    [Camp1, Camp2, Camp3, ... Camp20] (last 7 days)
  └── Each has: ad_account_id, adsets, ads, destination_urls

STEP 2: Extract URLs from ads
─────────────────────────────
For each campaign → adset → ad:
  - Pull destination URL from ad creative (link_data.link or video_data.link)
  - Pull page_id, instagram_actor_id, pixel_id from adset/ad config
  - Pull ad_account_id from the campaign

STEP 3: Auto-match (3 tiers)
─────────────────────────────
Tier 1 — URL Match:
  Ad URL: "store.com/products/summer-tee"
  Shopify: product.handle = "summer-tee"  → MATCH

Tier 2 — AI Match (Claude):
  Ad URL: "store.com/pages/summer-collection"
  Campaign name: "US_Summer-Tee_TOFU_CBO"
  Ad name: "UGC_SummerTee_30s_V2"
  Claude analysis: "This campaign is for 'Summer Tee' based on naming.
                    Campaign type: Testing (TOFU, CBO structure)"  → MATCH

Tier 3 — Manual:
  Can't match → show in "Unmapped Campaigns" section
  User selects: "This campaign goes with Product B"

STEP 4: Build Product Profile
─────────────────────────────
Product A "Summer Tee":
  ├── Linked Campaigns: [Camp1 (Testing), Camp5 (Scaling), Camp12 (Retargeting)]
  ├── Ad Account: act_123456 (extracted from Camp1)
  ├── Page: "Brand Page" (extracted from Camp1's ads)
  ├── Instagram: @brand (extracted from Camp1's ads)
  ├── Pixel: px_789 (extracted from Camp1's adset promoted_object)
  ├── Destination URL: store.com/products/summer-tee
  ├── Conversion Event: Purchase (from adset optimization_goal)
  └── AI Classification:
       Camp1 → Testing (reason: CBO, broad targeting, recent creatives)
       Camp5 → Scaling (reason: high budget, proven creatives)
       Camp12 → Retargeting (reason: custom audience, website visitors)
```

### UI: Product Profiles Page

```
┌──────────────────────────────────────────────────────────────────────┐
│ Product Profiles                     [Auto-Discover] [+ Add Manual]  │
│ Configure Meta settings per product. Auto-discovered from campaigns. │
│                                                                       │
│ 4 products mapped · 3 campaigns unmapped                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ┌──────────────────────────────────────────────────────────────┐     │
│ │ [img] Summer Tee                            Configured       │     │
│ │                                                              │     │
│ │ Ad Account: Brand US (act_123) · USD                        │     │
│ │ Page: Brand Official · IG: @brand · Pixel: Main Pixel       │     │
│ │ URL: store.com/products/summer-tee                           │     │
│ │ Conversion: Purchase · AOV: $45                              │     │
│ │                                                              │     │
│ │ Linked Campaigns:                                            │     │
│ │   Testing    US_SummerTee_CBO_Test      $60/day    3 ads     │     │
│ │   Scaling    US_SummerTee_Scale_ABO     $200/day   5 ads     │     │
│ │   Retarget   US_SummerTee_RT_LAL        $30/day    2 ads     │     │
│ │                                                              │     │
│ │ Test Defaults:                                               │     │
│ │ Structure: ABO | Budget: $20/adset | Duration: 3 days        │     │
│ │ Bid: Lowest Cost | Targeting: Broad/Advantage+               │     │
│ │                                                              │     │
│ │ [Edit Profile]  [View Copy Library (12 winners)]             │     │
│ └──────────────────────────────────────────────────────────────┘     │
│                                                                       │
│ [More product cards...]                                              │
│                                                                       │
│ ── Unmapped Campaigns (3) ─────────────────────────────────────      │
│                                                                       │
│ ┌──────────────────────────────────────────────────────────────┐     │
│ │ US_Generic_Brand_March         act_123 | $45/day             │     │
│ │ URL: store.com/pages/spring-sale                             │     │
│ │ AI: "Likely related to Summer Tee (70% confidence)"          │     │
│ │ [Map to: [Select Product]] [Ignore] [Create New Profile]     │     │
│ └──────────────────────────────────────────────────────────────┘     │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Edit Product Profile Modal

```
┌──────────────────────────────────────────────────────────────┐
│ Edit Product Profile: Summer Tee                        [X]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ── Meta Configuration ──                                     │
│                                                              │
│ Ad Account *        [Brand US (act_123456) - USD     ]      │
│ Facebook Page *     [Brand Official                  ]      │
│ Instagram Account   [@brand_official                 ]      │
│ Pixel *             [Main Pixel (px_789)             ]      │
│ Conversion Event *  [Purchase                        ]      │
│                                                              │
│ ── Product Info ──                                           │
│                                                              │
│ Average Order Value [$45                             ]      │
│ (Used for AI kill threshold recommendations)                 │
│                                                              │
│ ── Destination ──                                            │
│                                                              │
│ Landing URL *       [https://store.com/products/summer-tee] │
│ UTM Template        [utm_source=meta&utm_medium=paid&       │
│                      utm_campaign={{campaign.name}}&         │
│                      utm_content={{ad.name}}               ] │
│                                                              │
│ ── Test Defaults ──                                          │
│                                                              │
│ Campaign Structure                                           │
│ [  ABO  ] [  CBO  ]                                         │
│                                                              │
│ Budget / Adset      [$20 USD     ] /day                     │
│ Test Duration       [3           ] days                      │
│                                                              │
│ Bid Strategy        [Lowest Cost                     ]      │
│                     Lowest Cost (no cap)                     │
│                     Cost Cap        -> Bid: [$___]           │
│                     Bid Cap         -> Bid: [$___]           │
│                     Min ROAS Target -> ROAS: [___x]          │
│                                                              │
│ NOTE: Bid/ROAS values apply uniformly to ALL adsets in test  │
│                                                              │
│ Launch Status       [Active / Paused]                        │
│                                                              │
│ ── AI Kill Thresholds ──                                     │
│                                                              │
│ Min spend before AI evaluates  [$45] (recommended: 1-2x AOV)│
│ Min impressions                [500]                         │
│ Min time running               [24 hours]                    │
│ Evaluation frequency           [Every 6 hours]               │
│                                                              │
│ ── Targeting Presets ──                                       │
│                                                              │
│ Default Targeting   [Broad / Advantage+              ]      │
│                                                              │
│ Saved Presets:                                               │
│   LAL 1% Purchasers US           [Edit] [Delete]            │
│   Interest: Yoga + Fitness       [Edit] [Delete]            │
│ [+ Add Targeting Preset]                                     │
│                                                              │
│ ── Naming Template ──                                        │
│                                                              │
│ Campaign  [{Product}_{Geo}_{Date}_{Structure}           ]   │
│ Ad Set    [{Audience}_{Placement}_{BidType}             ]   │
│ Ad        [{ClickUpName}_{Version}                      ]   │
│           NOTE: Ad name uses ClickUp task name or            │
│           Google Drive file name for differentiation         │
│                                                              │
│ Preview: "SummerTee_US_20260323_ABO"                        │
│                                                              │
│ ── Linked Campaigns ──                                       │
│                                                              │
│ Testing    US_SummerTee_CBO_Test     [Change Type] [X]      │
│ Scaling    US_SummerTee_Scale        [Change Type] [X]      │
│ Retarget   US_SummerTee_RT           [Change Type] [X]      │
│ [+ Link Existing Campaign]                                   │
│                                                              │
│ ── ClickUp Integration ──                                    │
│                                                              │
│ ClickUp List   [Creative Requests - Summer Tee       ]      │
│ Auto-sync      [On]  every [30 min]                         │
│ Pull status    [Ready to Launch]                             │
│                                                              │
│                        [Cancel]  [Save Profile]              │
└──────────────────────────────────────────────────────────────┘
```

---

## Module 2: Creative Inbox

### Purpose

Queue of creatives from ClickUp ready to be tested. Shows thumbnails from Google Drive, handles upload to Meta ad accounts in background.

### ClickUp Status Flow

```
ClickUp Task Statuses:
  "Ready to Launch"  →  pulled into Creative Inbox
  "Testing"          →  set when creatives are launched to Meta
  "Winner"           →  set when AI declares winner
  "Failed"           →  set when AI kills the creative
```

Only tasks with status "Ready to Launch" are fetched into the Inbox. This prevents re-testing old creatives.

### Duplicate Detection

Even with ClickUp status flow, the system also checks:
- Has this creative name been tested before in OneScale DB?
- Is there a matching asset hash already uploaded to Meta?
- Show "Already Tested" badge with past results if found

### Google Drive Link Validation

Before upload:
1. Check URL is valid Google Drive link
2. Check file is accessible (not permission-restricted)
3. Check file format (image: JPG/PNG, video: MP4/MOV)
4. Check file size (image: <30MB, video: <4GB)
5. Show error with actionable fix if any check fails

### UI: Creative Inbox

```
┌──────────────────────────────────────────────────────────────────────┐
│ Creative Inbox                                    [Sync Now]         │
│ New creatives from ClickUp ready to test                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ Product: [All Products]  Format: [All]  Status: [New]                │
│                                                                       │
│ ── Summer Tee (8 new creatives) ─────────────────────────────────    │
│                                                                       │
│ ┌───────────────────────────────────────────────────────────────┐    │
│ │ [check] [thumb]  UGC_Testimonial_30s      Video  | New        │    │
│ │                  Hook: "I was skeptical until..."              │    │
│ │                  Angle: Social proof | Creator: @jane          │    │
│ │                  ClickUp: CRT-142                              │    │
│ │                  [Preview]                                     │    │
│ ├───────────────────────────────────────────────────────────────┤    │
│ │ [check] [thumb]  Static_Lifestyle_V3      Image  | Uploading   │    │
│ │                  Hook: "Stop scrolling if you..."              │    │
│ │                  Angle: Lifestyle | [progress bar] 78%        │    │
│ │                  [Preview]                                     │    │
│ ├───────────────────────────────────────────────────────────────┤    │
│ │ [check] [thumb]  Carousel_Benefits_V1   Carousel | Ready      │    │
│ │                  Hook: "3 reasons to switch"                   │    │
│ │                  Angle: Benefits | 3 cards                     │    │
│ │                  [Preview]                                     │    │
│ ├───────────────────────────────────────────────────────────────┤    │
│ │ [no]    [thumb]  UGC_OldHook_V1            Video | Already     │    │
│ │                  Hook: "You need this..."          Tested      │    │
│ │                  Last tested: Mar 10 | ROAS 1.2x (Failed)     │    │
│ │                  [Test Again Anyway]  [Skip]                   │    │
│ ├───────────────────────────────────────────────────────────────┤    │
│ │ [no]    [thumb]  Static_Sale_V2           Image  | Upload      │    │
│ │                  Hook: "50% off today"             Failed      │    │
│ │                  Error: "Google Drive - Access denied."        │    │
│ │                  [Retry] [Upload Manually] [Skip]              │    │
│ └───────────────────────────────────────────────────────────────┘    │
│                                                                       │
│ ── Winter Jacket (4 new creatives) ──────────────────────────────    │
│ │ ...                                                              │  │
│                                                                       │
│ ┌───────────────────────────────────────────────────────────────┐    │
│ │ Selected: 6 of 12    | Uploading: 2  | Ready: 3  | New: 1    │    │
│ │                                                               │    │
│ │ Overall Upload Progress: [progress bar] 72%                   │    │
│ │                                                               │    │
│ │         [Launch Selected (6) ->]                              │    │
│ └───────────────────────────────────────────────────────────────┘    │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Preview Modal

```
┌──────────────────────────────────────────────────────────────┐
│ Creative Preview                                        [X]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────┐  Name: UGC_Testimonial_30s      │
│  │                        │  Format: Video 30s               │
│  │   [Video Player]       │  Hook: "I was skeptical..."     │
│  │   play  0:00 / 0:30   │  Angle: Social proof             │
│  │                        │  Creator: @jane                  │
│  │                        │  Resolution: 1080x1920           │
│  └────────────────────────┘  Aspect: 9:16                    │
│                              Drive link: [Open]              │
│                              ClickUp: CRT-142                │
│                                                              │
│  Upload Status: Uploaded to act_123456                       │
│  Meta Asset ID: vid_987654321                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Module 3: Launch Wizard

### Purpose

4-step wizard to configure and launch creative tests on Meta. Accessed from Creative Inbox via "Launch Selected" button.

### Step 1 — Product & Campaign Structure

```
┌──────────────────────────────────────────────────────────────────────┐
│ Launch Creative Test                                                  │
│                                                                       │
│ (1) Campaign ─── (2) Ad Copy ─── (3) Settings ─── (4) Review        │
│ [active]          [pending]       [pending]        [pending]         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ── Select Product ──────────────────────────────────────────────     │
│                                                                       │
│ Which product are these creatives for?                                │
│                                                                       │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│ │ [img]         │ │ [img]         │ │ [img]         │ │ [img]       │  │
│ │ Summer Tee   │ │ Winter       │ │ Yoga Pants   │ │ Hoodie     │  │
│ │              │ │ Jacket       │ │              │ │ Collection │  │
│ │ act_123 USD  │ │ act_789 GBP  │ │ act_123 USD  │ │ act_456 EUR│  │
│ │ 3 campaigns  │ │ 2 campaigns  │ │ 1 campaign   │ │ New        │  │
│ │ 12 winners   │ │ 5 winners    │ │ 3 winners    │ │            │  │
│ │              │ │              │ │              │ │            │  │
│ │ [Selected]   │ │              │ │              │ │            │  │
│ └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │
│                                                                       │
│ Selected: Summer Tee | 6 creatives ready to launch                   │
│                                                                       │
│ ── Campaign Mode ───────────────────────────────────────────────     │
│                                                                       │
│ ┌────────────────────────────┐  ┌────────────────────────────┐      │
│ │ Existing Campaign          │  │ New Campaign                │      │
│ │                            │  │                            │      │
│ │ Add to your current        │  │ Create a fresh campaign    │      │
│ │ testing campaign.          │  │ with all new settings.     │      │
│ │                            │  │                            │      │
│ │ Config inherited           │  │ Uses product profile       │      │
│ │ No setup needed            │  │ defaults                   │      │
│ │                            │  │                            │      │
│ │ [Selected]                 │  │                            │      │
│ └────────────────────────────┘  └────────────────────────────┘      │
│                                                                       │
│ ── Select Campaign ─────────────────────────────────────────────     │
│                                                                       │
│ Showing campaigns linked to Summer Tee:                              │
│                                                                       │
│ (selected) Testing  US_SummerTee_CBO_Test  CBO|$60/day|3 adsets     │
│            Bid: Lowest Cost | Conv: Purchase | Broad targeting       │
│                                                                       │
│ ( )        Scaling  US_SummerTee_Scale_ABO ABO|$200/day|5 adsets    │
│            Bid: Cost Cap $25 | Conv: Purchase | LAL 1%               │
│                                                                       │
│ ( )        Retarget US_SummerTee_RT_LAL    ABO|$30/day|2 adsets     │
│            Bid: Lowest Cost | Conv: Purchase | Retargeting           │
│                                                                       │
│ [Show all campaigns] (shows non-linked campaigns too)                │
│                                                                       │
│ ── Ad Set Mode ─────────────────────────────────────────────────     │
│                                                                       │
│ How should creatives be added to this campaign?                       │
│                                                                       │
│ ┌────────────────────────────┐  ┌────────────────────────────┐      │
│ │ Create New Ad Sets         │  │ Use Existing Ad Sets        │      │
│ │                            │  │                            │      │
│ │ Each creative gets its     │  │ Add creatives as new ads   │      │
│ │ own new adset with         │  │ inside existing adsets.    │      │
│ │ identical settings.        │  │                            │      │
│ │                            │  │ Good for adding variants   │      │
│ │ Best for clean isolated    │  │ to an adset already        │      │
│ │ creative testing.          │  │ performing.                │      │
│ │                            │  │                            │      │
│ │ = 6 new adsets created     │  │ Select which adsets below  │      │
│ │                            │  │                            │      │
│ │ [Selected]                 │  │                            │      │
│ └────────────────────────────┘  └────────────────────────────┘      │
│                                                                       │
│ ── When "Create New Ad Sets" selected ──                             │
│                                                                       │
│ Budget per adset    [$20 USD     ] /day    (same for all adsets)     │
│ Test Duration       [3           ] days                              │
│                                                                       │
│ Bid Strategy        [Inherited: Lowest Cost]                         │
│                     ( ) Inherit from campaign                        │
│                     ( ) Override: Cost Cap    -> Bid: [$25   ]       │
│                     ( ) Override: Bid Cap     -> Bid: [$30   ]       │
│                     ( ) Override: Min ROAS    -> ROAS: [2.0  x]      │
│                                                                       │
│ NOTE: Bid/ROAS applies uniformly to ALL 6 new adsets                 │
│                                                                       │
│                                            [Next: Ad Copy ->]       │
│                                                                       │
│ ── When "Use Existing Ad Sets" selected ──                           │
│                                                                       │
│ How should creatives be distributed?                                  │
│                                                                       │
│ ( ) All creatives -> one adset       (6 ads in 1 adset)             │
│ (x) Distribute across adsets         (select which -> which)        │
│ ( ) One creative per adset           (pick 1 adset per creative)    │
│                                                                       │
│ Existing adsets in US_SummerTee_CBO_Test:                            │
│                                                                       │
│ [check] SummerTee_Broad_V1         $20/day | 2 ads running          │
│         Targeting: Broad 18-65+ US | Lowest Cost                    │
│         Current ads: UGC_Hook1_V1, Static_Bold_V1                   │
│                                                                       │
│         Add creatives to this adset:                                 │
│         [check] UGC_Testimonial_30s                                  │
│         [check] Static_Lifestyle_V3                                  │
│         [  ]    Carousel_Benefits_V1                                 │
│                                                                       │
│ [check] SummerTee_Broad_V2         $20/day | 1 ad running           │
│         Targeting: Broad 18-65+ US | Lowest Cost                    │
│         Current ads: Carousel_V2                                     │
│                                                                       │
│         Add creatives to this adset:                                 │
│         [  ]    UGC_Testimonial_30s                                  │
│         [  ]    Static_Lifestyle_V3                                  │
│         [check] Carousel_Benefits_V1                                 │
│         [check] UGC_Unboxing_15s                                     │
│                                                                       │
│ Summary: 4 creatives -> 2 adsets | 2 remaining unassigned            │
│                                                                       │
│ Unassigned creatives:                                                │
│ WARNING: Static_Bold_V2, UGC_Review_V1                               │
│ [Auto-assign] or [Create new adset for these]                        │
│                                                                       │
│                                            [Next: Ad Copy ->]       │
│                                                                       │
│ ── When "New Campaign" mode selected ──                              │
│                                                                       │
│ Campaign Structure                                                    │
│ [  ABO  ] [  CBO  ]                                                  │
│                                                                       │
│ Campaign Name     [SummerTee_US_20260323_ABO_Test] (editable)        │
│                                                                       │
│ Ad Account        [Brand US (act_123456) - USD           ]          │
│ Page              [Brand Official                        ]          │
│ Instagram         [@brand_official                       ]          │
│ Pixel             [Main Pixel                            ]          │
│ Conv. Event       [Purchase                              ]          │
│ Destination URL   [https://store.com/products/summer-tee   ]        │
│                                                                       │
│ (pre-filled from Product Profile, all editable)                      │
│                                                                       │
│ Budget            ABO: [$20 USD] per adset/day                       │
│                   CBO: [$120 USD] campaign/day (6 adsets x $20)      │
│                                                                       │
│ Bid Strategy      [Lowest Cost]                                      │
│                   ( ) Lowest Cost                                    │
│                   ( ) Cost Cap      -> Bid: [$___] per purchase      │
│                   ( ) Bid Cap       -> Bid: [$___] per auction       │
│                   ( ) Min ROAS      -> ROAS: [___x]                  │
│                                                                       │
│ Test Duration     [3] days                                           │
│ Launch Status     [Active / Paused]                                  │
│                                                                       │
│ Targeting                                                             │
│ Audience Preset   [Broad / Advantage+ (recommended)]                 │
│                   ( ) Broad / Advantage+                             │
│                   ( ) LAL 1% Purchasers US                           │
│                   ( ) Interest: Yoga + Fitness                       │
│                   ( ) Custom... (opens targeting builder)            │
│                                                                       │
│ Placements        [Advantage+ (all placements)]                      │
│                   ( ) Advantage+ (recommended)                       │
│                   ( ) Manual (select specific)                       │
│                                                                       │
│ Age               [18] to [65+]                                      │
│ Gender            [All]                                              │
│ Geo               [United States]                                    │
│                                                                       │
│                                            [Next: Ad Copy ->]       │
└──────────────────────────────────────────────────────────────────────┘
```

### Step 2 — Ad Copy (AI-Powered, Multi-PT/Headline)

```
┌──────────────────────────────────────────────────────────────────────┐
│ (1) Campaign ─── (2) Ad Copy ─── (3) Settings ─── (4) Review        │
│ [done]            [active]        [pending]        [pending]         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ┌─────────────────────────────┐ ┌────────────────────────────────┐  │
│ │ Winner Copy Library         │ │ AI Copy Generator              │  │
│ │                             │ │                                │  │
│ │ Top performers for          │ │ Claude analyzes your winners,  │  │
│ │ Summer Tee:                 │ │ competitors, Reddit, and your  │  │
│ │                             │ │ offer to generate copy.        │  │
│ │ ┌───────────────────────┐   │ │                                │  │
│ │ │ ROAS 4.2x | $820 rev  │   │ │ [Generate 5 PT Variations]     │  │
│ │ │ PT: "I was skeptical  │   │ │ [Generate 5 Headlines]         │  │
│ │ │ but this changed..."  │   │ │                                │  │
│ │ │ HL: "Try it risk free"│   │ │ -- AI Generated PTs --         │  │
│ │ │ [+ Add PT] [+ Add HL] │   │ │                                │  │
│ │ └───────────────────────┘   │ │ 1. "Tired of tees that shrink  │  │
│ │                             │ │    after one wash?..."          │  │
│ │ ┌───────────────────────┐   │ │    [+ Add to PT list]          │  │
│ │ │ ROAS 3.8x | $650 rev  │   │ │                                │  │
│ │ │ PT: "Stop buying cheap│   │ │ 2. "Over 10,000 five-star      │  │
│ │ │ tees that..."         │   │ │    reviews can't be wrong..."  │  │
│ │ │ HL: "Upgrade your     │   │ │    [+ Add to PT list]          │  │
│ │ │ basics"               │   │ │                                │  │
│ │ │ [+ Add PT] [+ Add HL] │   │ │ 3. "My husband stole mine     │  │
│ │ └───────────────────────┘   │ │    so I had to order two..."   │  │
│ │                             │ │    [+ Add to PT list]          │  │
│ │ ┌───────────────────────┐   │ │                                │  │
│ │ │ ROAS 3.1x | $440 rev  │   │ │ -- AI Generated Headlines --  │  │
│ │ │ ...                   │   │ │                                │  │
│ │ └───────────────────────┘   │ │ 1. "Built different"           │  │
│ └─────────────────────────────┘ │    [+ Add to Headline list]    │  │
│                                 │ 2. "Your new everyday tee"     │  │
│                                 │    [+ Add to Headline list]    │  │
│                                 └────────────────────────────────┘  │
│                                                                       │
│ ═══════════════════════════════════════════════════════════════       │
│                                                                       │
│ ── Primary Texts (3 of 5 max) ──────────────────────────────────    │
│                                                                       │
│ Apply to:  [All 6 creatives]                                         │
│                                                                       │
│  1. [I was skeptical but this changed everything. Our summer    ]   │
│     [tee is made from 100% organic cotton...                    ]   │
│     Source: Winner - ROAS 4.2x                            [X]       │
│                                                                       │
│  2. [Stop buying cheap tees that fall apart. We spent 2 years   ]   │
│     [perfecting the perfect everyday tee...                     ]   │
│     Source: Winner - ROAS 3.8x                            [X]       │
│                                                                       │
│  3. [Tired of tees that shrink after one wash? Our summer tee   ]   │
│     [stays soft and true to size, wash after wash...            ]   │
│     Source: AI Generated                                  [X]       │
│                                                                       │
│  [+ Add Primary Text]  (max 5)                                       │
│                                                                       │
│ ── Headlines (3 of 5 max) ──────────────────────────────────────    │
│                                                                       │
│  1. [Try it risk free                                           ]   │
│     Source: Winner - ROAS 4.2x                            [X]       │
│                                                                       │
│  2. [Upgrade your basics                                        ]   │
│     Source: Winner - ROAS 3.8x                            [X]       │
│                                                                       │
│  3. [Built different                                            ]   │
│     Source: AI Generated                                  [X]       │
│                                                                       │
│  [+ Add Headline]  (max 5)                                           │
│                                                                       │
│ ── Descriptions (2 of 5 max) ──────────────────────────────────     │
│                                                                       │
│  1. [Free shipping + 30 day returns                             ]   │
│                                                           [X]       │
│  2. [Shop now - summer won't wait                               ]   │
│                                                           [X]       │
│  [+ Add Description]  (max 5)                                        │
│                                                                       │
│ ── Destination URL ──────────────────────────────────────────        │
│                                                                       │
│ (x) Same URL for all creatives                                       │
│     [https://store.com/products/summer-tee                       ]  │
│                                                                       │
│ ( ) Different URL per creative                                       │
│     UGC_Testi_30s:     [store.com/products/summer-tee?offer=50off]  │
│     Static_Life_V3:    [store.com/products/summer-tee?offer=b2g1 ]  │
│     Carousel_Ben_V1:   [store.com/products/summer-tee            ]  │
│     ...                                                              │
│                                                                       │
│ ── Other Settings ──                                                 │
│                                                                       │
│ CTA Button       [Shop Now]                                          │
│ Adv+ Creative    [On]  Meta auto-optimizes creative elements        │
│                                                                       │
│ INFO: Multi-copy mode: Meta will test all combinations of            │
│ primary texts x headlines x descriptions and auto-optimize.          │
│ Your setup: 3 PTs x 3 Headlines x 2 Descriptions                    │
│ = 18 possible combinations per creative                              │
│ This uses Meta's Flexible Ads (asset_feed_spec) format.              │
│                                                                       │
│                                  [<- Back]  [Next: Settings ->]     │
└──────────────────────────────────────────────────────────────────────┘
```

### Step 3 — Advanced Settings

```
┌──────────────────────────────────────────────────────────────────────┐
│ (1) Campaign ─── (2) Ad Copy ─── (3) Settings ─── (4) Review        │
│ [done]            [done]          [active]         [pending]         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ── Schedule ──                                                       │
│                                                                       │
│ Launch Time     ( ) Immediately                                      │
│                 (x) Schedule: [2026-03-24] at [00:00] (midnight)    │
│                                                                       │
│ End Date        (x) Auto-stop after [3] days (from product defaults)│
│                 ( ) No end date (manual stop)                        │
│                 ( ) Custom: [date picker]                            │
│                                                                       │
│ ── Attribution ──                                                    │
│                                                                       │
│ Attribution     [7-day click, 1-day view (default)]                  │
│                                                                       │
│ ── UTM Parameters ──                                                 │
│                                                                       │
│ URL Tags        [utm_source=meta&utm_medium=paid&utm_campaign=      │
│                  {{campaign.name}}&utm_content={{ad.name}}        ]  │
│                                                                       │
│ ── Naming Override ──                                                │
│                                                                       │
│ Campaign  [SummerTee_US_20260323_ABO_Test] (editable)               │
│ Ad Sets   Auto: {ClickUpName}_{Audience}                             │
│ Ads       Auto: {ClickUpName}_{Version}                              │
│ NOTE: Ad names use ClickUp task name or Google Drive file name       │
│                                                                       │
│ ── Multi-Account Launch (Optional) ──                                │
│                                                                       │
│ Launch these creatives to additional ad accounts?                     │
│                                                                       │
│ [check] Brand US (act_123)  | $20/adset | Broad US | Primary       │
│ [check] Brand UK (act_789)  | L16/adset | Broad UK | Mirror        │
│ [  ]    Brand AU (act_456)  | A$30/adset| Broad AU |                │
│                                                                       │
│ Mirror account settings:                                             │
│ ( ) Same settings (budget/bid converted to local currency)          │
│ ( ) Custom per account                                               │
│                                                                       │
│ ── AI Test Rules ──                                                  │
│                                                                       │
│ Min spend before AI evaluates   [$45] per adset (1x AOV)           │
│ Min impressions                 [500]                                │
│ Min time running                [24 hours]                           │
│ Evaluation frequency            [Every 6 hours]                      │
│ Auto-kill losers                [On]  (AI pauses bad performers)    │
│ Notify on kill                  [On]  (push notification)            │
│                                                                       │
│                                  [<- Back]  [Next: Review ->]       │
└──────────────────────────────────────────────────────────────────────┘
```

### Step 4 — Review & Launch (with Pre-Launch Health Checks)

```
┌──────────────────────────────────────────────────────────────────────┐
│ (1) Campaign ─── (2) Ad Copy ─── (3) Settings ─── (4) Review        │
│ [done]            [done]          [done]           [active]          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ── Pre-Launch Health Checks ─────────────────────────────────────   │
│                                                                       │
│ OK  Meta token valid (expires in 47 days)                            │
│ OK  Ad account active, no restrictions                               │
│ OK  All 6 creatives uploaded to Meta                                 │
│ WARN Account spending: $450/$500 daily limit (90% used)              │
│      This test adds $120/day -> $570/day EXCEEDS LIMIT              │
│      Options:                                                        │
│      ( ) Reduce test budget to $8/adset ($48 total, fits limit)     │
│      ( ) Pause other campaigns to make room                         │
│      (x) Launch anyway (Meta will throttle all campaigns)           │
│ OK  Landing page: 200 OK, loads in 1.2s                              │
│ OK  Pixel firing on landing page                                     │
│ OK  No duplicate creatives detected                                  │
│ OK  No active test for this product by another team member           │
│ WARN Weekend launch - performance may differ from weekday            │
│      ( ) Launch now anyway                                           │
│      (x) Schedule for Monday Mar 25 at 00:00 EST                    │
│                                                                       │
│ ── Campaign Summary ──                                               │
│                                                                       │
│ Product:      Summer Tee                                             │
│ Mode:         Existing Campaign                                      │
│ Campaign:     US_SummerTee_CBO_Test                                  │
│ Adset Mode:   Create 6 new adsets                                    │
│ Structure:    ABO                                                    │
│ Creatives:    6                                                      │
│ Budget:       $20/adset/day | Total: $120/day                       │
│ Duration:     3 days | Max spend: $360                               │
│ Bid:          Lowest Cost                                            │
│ Targeting:    Broad/Advantage+                                       │
│ Placements:   Advantage+                                             │
│ Schedule:     Monday Mar 25, 00:00 EST                               │
│                                                                       │
│ ── Ad Copy Summary ──                                                │
│                                                                       │
│ Mode: Flexible Ads (multi-copy optimization)                         │
│ Primary Texts (3):                                                    │
│   1. "I was skeptical but this changed..."                           │
│   2. "Stop buying cheap tees that fall..."                           │
│   3. "Tired of tees that shrink after..."                            │
│ Headlines (3):                                                        │
│   1. "Try it risk free"                                              │
│   2. "Upgrade your basics"                                           │
│   3. "Built different"                                               │
│ Descriptions (2):                                                     │
│   1. "Free shipping + 30 day returns"                                │
│   2. "Shop now - summer won't wait"                                  │
│ = 18 combinations per creative | CTA: Shop Now                      │
│                                                                       │
│ ── What Will Be Created on Meta ──                                   │
│                                                                       │
│ Campaign: US_SummerTee_CBO_Test (existing)                           │
│  +-- [NEW] UGC_Testimonial_30s_Broad    -> UGC_Testimonial_30s_V1   │
│  +-- [NEW] Static_Lifestyle_V3_Broad    -> Static_Lifestyle_V3      │
│  +-- [NEW] Carousel_Benefits_V1_Broad   -> Carousel_Benefits_V1    │
│  +-- [NEW] UGC_Unboxing_15s_Broad       -> UGC_Unboxing_15s_V1     │
│  +-- [NEW] Static_Bold_V2_Broad         -> Static_Bold_V2           │
│  +-- [NEW] UGC_Review_V1_Broad          -> UGC_Review_V1            │
│                                                                       │
│ = 6 new ad sets + 6 new ads                                          │
│                                                                       │
│ ── Creative Preview Grid ──                                          │
│                                                                       │
│ [thumb1] [thumb2] [thumb3] [thumb4] [thumb5] [thumb6]                │
│ UGC_30s  Static   Carousel UGC_Unbox Static  Review                 │
│ Ready    Ready    Ready    Ready     Ready   Ready                   │
│                                                                       │
│ NOTICE: This will create 6 ad sets and 6 ads on Meta.                │
│ Estimated daily spend: $120. Total over 3 days: $360.                │
│ ClickUp tasks will be marked as "Testing".                           │
│                                                                       │
│ Launch as:  [Active]  [Paused]                                       │
│                                                                       │
│              [<- Back]  [Launch Test on Meta]                        │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Post-Launch Status Screen

```
┌──────────────────────────────────────────────────────────────────────┐
│ Launching Creative Test...                                            │
│                                                                       │
│ Creating campaign structure on Meta:                                  │
│                                                                       │
│ OK  Campaign: US_SummerTee_CBO_Test (existing, connected)            │
│ OK  Adset 1: UGC_Testimonial_30s_Broad (created)                    │
│ OK  Ad 1: UGC_Testimonial_30s_V1 (created, IN_REVIEW)               │
│ OK  Adset 2: Static_Lifestyle_V3_Broad (created)                    │
│ OK  Ad 2: Static_Lifestyle_V3 (created, IN_REVIEW)                  │
│ OK  Adset 3: Carousel_Benefits_V1_Broad (created)                   │
│ FAIL Adset 4: UGC_Unboxing_15s_Broad                                │
│      Error: Meta API rate limit exceeded                             │
│ FAIL Adset 5: Static_Bold_V2_Broad                                  │
│      Error: Meta API rate limit exceeded                             │
│ FAIL Adset 6: UGC_Review_V1_Broad                                   │
│      Error: Meta API rate limit exceeded                             │
│                                                                       │
│ ALERT: Launch Partially Failed                                       │
│                                                                       │
│ Created:  3 of 6 adsets                                              │
│ Failed:   3 adsets (Meta API rate limit exceeded)                    │
│                                                                       │
│ Created adsets are PAUSED to keep test fair.                          │
│                                                                       │
│ [Retry Failed (3)]  [Enable Created (3)]  [Rollback All]            │
│                                                                       │
│ ── ClickUp Status Updates ──                                         │
│                                                                       │
│ OK  UGC_Testimonial_30s -> "Testing"                                 │
│ OK  Static_Lifestyle_V3 -> "Testing"                                 │
│ OK  Carousel_Benefits_V1 -> "Testing"                                │
│ --  UGC_Unboxing_15s (not updated - launch failed)                   │
│ --  Static_Bold_V2 (not updated - launch failed)                     │
│ --  UGC_Review_V1 (not updated - launch failed)                      │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Module 4: Active Test Monitor

### Purpose

Real-time dashboard showing all running creative tests with AI-powered recommendations and one-click actions.

### Meta Review Status Tracking

After launch, ads go through Meta review (1-24 hours). The monitor tracks this:

```
Review Statuses:
  IN_REVIEW       → "Under Review" badge (yellow)
  ACTIVE          → "Active" badge (green)
  DISAPPROVED     → "Rejected" badge (red) + rejection reason
  WITH_ISSUES     → "Issues" badge (amber) + issue details
```

The system polls ad status every 5 minutes for the first 2 hours after launch, then every 30 minutes.

### Learning Phase Tracking

Each adset tracks learning phase status:
```
LEARNING          → "Learning" badge - needs ~50 conversions/week
LEARNING_LIMITED  → "Learning Limited" badge - insufficient events
ACTIVE            → Exited learning phase
```

AI uses learning phase status in kill decisions — never kills an ad in active learning unless metrics are catastrophically bad.

### UI: Active Tests Monitor

```
┌──────────────────────────────────────────────────────────────────────┐
│ Active Tests                           Last refresh: 30s ago [Refresh]│
│ 4 products | 23 creatives testing | $460/day total spend             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ── Team Activity ──                                                  │
│ Gaurav: Testing 6 creatives for Summer Tee (launched 2h ago)         │
│ Anay: Testing 8 creatives for Winter Jacket (launched 5h ago)        │
│                                                                       │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │ Testing  Summer Tee  | 6 active | Day 2 of 3 | $187 spent     │   │
│ │ Campaign: US_SummerTee_CBO_Test | Launched by: Gaurav          │   │
│ ├────────────────────────────────────────────────────────────────┤   │
│ │                                                                │   │
│ │ Creative          |Spend  |ROAS |CPA   |CTR  |Purch|Status    │   │
│ │ ----------------------------------------------------------------   │
│ │ UGC_Testi_30s     |$52.30 |4.2x |$13.10|3.1% |4    |Winner    │   │
│ │ Carousel_Ben      |$38.40 |2.8x |$19.20|2.4% |2    |Active    │   │
│ │ Static_Life       |$35.10 |1.5x |$35.10|1.8% |1    |Learning  │   │
│ │ UGC_Unbox         |$28.90 |0.0x |-     |2.2% |0    |Learning  │   │
│ │ Static_Bold       |$18.70 |0.0x |-     |0.6% |0    |Kill?     │   │
│ │ UGC_Review        |$13.60 |0.0x |-     |0.4% |0    |Rejected  │   │
│ │                                                                │   │
│ │ ┌──────────────────────────────────────────────────────────┐   │   │
│ │ │ ALERT: 1 of 6 creatives rejected by Meta                 │   │   │
│ │ │                                                          │   │   │
│ │ │ REJECTED: UGC_Review_V1 - "Misleading claims"            │   │   │
│ │ │ [Replace Creative] [Appeal] [Remove from Test]           │   │   │
│ │ │                                                          │   │   │
│ │ │ Test running with 5 of 6 creatives.                      │   │   │
│ │ └──────────────────────────────────────────────────────────┘   │   │
│ │                                                                │   │
│ │ ┌──────────────────────────────────────────────────────────┐   │   │
│ │ │ AI Recommendation (evaluated 2 hours ago)                 │   │   │
│ │ │                                                          │   │   │
│ │ │ KILL Static_Bold - CTR 0.6% is 3x below average.        │   │   │
│ │ │ No purchases after $18.70 spend (>1x AOV). Not engaging. │   │   │
│ │ │                                                          │   │   │
│ │ │ WAIT UGC_Unbox - CTR 2.2% is decent but 0 purchases yet.│   │   │
│ │ │ Still in learning phase. Check again in 6 hours.         │   │   │
│ │ │                                                          │   │   │
│ │ │ WAIT Static_Life - In learning phase, 1 purchase so far. │   │   │
│ │ │ ROAS 1.5x needs more data. Give it another day.          │   │   │
│ │ │                                                          │   │   │
│ │ │ SCALE UGC_Testi - ROAS 4.2x, CPA $13.10, strong CTR.   │   │   │
│ │ │ Recommend increasing budget to $40/day.                  │   │   │
│ │ │                                                          │   │   │
│ │ │ -- Copy Performance Breakdown --                         │   │   │
│ │ │ Best PT: "I was skeptical..." (72% of impressions)       │   │   │
│ │ │ Best HL: "Try it risk free" (65% of impressions)         │   │   │
│ │ │ Best Combo: PT1 x HL1 -> ROAS 5.1x                      │   │   │
│ │ │ Worst PT: "Tired of tees..." (8%) -> consider removing   │   │   │
│ │ │                                                          │   │   │
│ │ │ [Apply All Actions]  [Edit Actions]  [Dismiss]           │   │   │
│ │ └──────────────────────────────────────────────────────────┘   │   │
│ │                                                                │   │
│ │ Manual Actions:                                                │   │
│ │ [Pause Selected] [Change Budget] [Duplicate Winner]            │   │
│ └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │ Testing  Winter Jacket | 8 active | Day 1 of 3 | $89 spent    │   │
│ │ Campaign: UK_WinterJacket_Test | Launched by: Anay             │   │
│ │ ...                                                            │   │
│ └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Confirm AI Actions Modal

```
┌──────────────────────────────────────────────────────────────┐
│ Confirm AI Actions                                      [X]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ The following actions will be taken on Meta:                  │
│                                                              │
│ [check] PAUSE  Static_Bold_V2    (save $20/day)             │
│ [check] SCALE  UGC_Testi_30s    ($20 -> $40/day)            │
│ [  ]    WAIT   UGC_Unbox_15s    (no action)                 │
│ [  ]    WAIT   Static_Life      (no action)                 │
│                                                              │
│ Net budget change: $0/day (+$20 scale, -$20 kill)           │
│                                                              │
│ ClickUp tasks will be updated:                               │
│   Static_Bold -> "Failed"                                    │
│                                                              │
│ Save winning copy to library:                                │
│ [check] Save UGC_Testi_30s copy (ROAS 4.2x) to Copy Library│
│                                                              │
│           [Cancel]  [Execute Actions on Meta]                │
└──────────────────────────────────────────────────────────────┘
```

### Creative Fatigue Alerts (Post-Test, for Scaled Winners)

```
┌──────────────────────────────────────────────────────────────┐
│ Creative Fatigue Alert - Summer Tee                          │
│                                                              │
│ UGC_Testimonial_30s is showing fatigue signals:              │
│                                                              │
│   CTR:  3.1% -> 2.4% -> 1.8% (declining 3 consecutive days)│
│   CPA:  $13 -> $18 -> $24 (rising)                          │
│   Freq: 1.2 -> 1.8 -> 2.4 (audience saturation)            │
│                                                              │
│ Recommendation: Launch new creative test for Summer Tee.     │
│ You have 12 untested creatives in the Inbox.                 │
│                                                              │
│ [Launch New Test]  [Snooze 3 days]  [Dismiss]                │
└──────────────────────────────────────────────────────────────┘
```

---

## Module 5: Completed Tests

### Purpose

Historical test results. Track what worked, what didn't, and analyze patterns over time.

### UI

```
┌──────────────────────────────────────────────────────────────────────┐
│ Completed Tests                                                       │
│ Product: [All Products]  Date: [Last 30 days]  Sort: [Most Recent]   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │ Summer Tee - Test Batch #12         Mar 20-23, 2026            │   │
│ │ 6 creatives tested | 1 winner | Total spend: $312              │   │
│ │                                                                │   │
│ │ Winner: UGC_Testimonial_30s | ROAS 4.2x | CPA $13.10          │   │
│ │ Action taken: Scaled to $40/day, duplicated to scaling campaign│   │
│ │                                                                │   │
│ │ Killed: Static_Bold (CTR 0.6%), UGC_Review (Rejected by Meta) │   │
│ │ Inconclusive: UGC_Unbox (insufficient data)                    │   │
│ │                                                                │   │
│ │ [View Full Results]  [Re-test Inconclusive]                    │   │
│ └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│ [More test batches...]                                               │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Module 6: Copy Library

### Purpose

AI-ranked winning ad copies per product. Auto-populated from winning ads, searchable and reusable.

### How Winners Are Detected

Claude AI analyzes all ads in a product's campaigns considering:
- ROAS (primary metric)
- CPA
- CTR
- Total spend (must exceed minimum threshold)
- Creative type (video vs image vs carousel)
- Time period
- Statistical significance

### UI

```
┌──────────────────────────────────────────────────────────────────────┐
│ Copy Library                                                          │
│ Winning ad copies from your best performing ads, per product          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ Product: [Summer Tee]    Sort by: [ROAS]                             │
│                                                                       │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │ ROAS 4.2x | $820 revenue | 62 purchases | CTR 3.1%            │   │
│ │                                                                │   │
│ │ Primary Text:                                                  │   │
│ │ "I was skeptical but this changed everything. Our summer tee   │   │
│ │ is made from 100% organic cotton that actually gets softer..." │   │
│ │                                                                │   │
│ │ Headline: "Try it risk free"                                   │   │
│ │ Description: "Free shipping + 30 day returns"                  │   │
│ │ CTA: Shop Now                                                  │   │
│ │                                                                │   │
│ │ Source: UGC_Testi_30s (Mar 20-23, 2026)                       │   │
│ │ Best combo: PT1 x HL1 (when used with Flexible Ads)           │   │
│ │                                                                │   │
│ │ [Copy to Clipboard]  [Use in New Test]                         │   │
│ └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│ [More winning copies...]                                             │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Safety & Validation Systems

### Pre-Launch Health Check Dashboard

Before every launch, the system runs these checks:

| Check | Source | Action on Fail |
|-------|--------|---------------|
| Meta token valid | Token expiry check | Block launch, prompt re-auth |
| Ad account active | Meta API status check | Block launch |
| Account spending limit | `account.spend_cap` vs current spend | Warning with options |
| All creatives uploaded | Upload status check | Block until all ready |
| Landing page alive | HTTP HEAD request | Warning |
| Pixel firing on LP | Pixel verification | Warning |
| No duplicate creatives | OneScale DB check | Warning with past results |
| No team collision | Active tests DB check | Warning with team member info |
| Weekend check | Day of week | Warning, suggest scheduling |
| Naming collision | Meta API name check | Auto-increment version |
| Currency display | Ad account currency | Show currency next to all amounts |
| Audience overlap | Compare targeting specs | Warning if overlap detected |

### Meta Review Status Polling

```
Timeline:
  0-2 hours after launch:   Poll every 5 minutes
  2-6 hours after launch:   Poll every 15 minutes
  6-24 hours after launch:  Poll every 30 minutes
  24+ hours:                Poll every 60 minutes

On rejection:
  1. Mark ad as "Rejected" in monitor
  2. Show rejection reason from Meta
  3. Update ClickUp task to "Rejected"
  4. Offer: Replace creative, Appeal, Remove from test
  5. If >50% of test creatives rejected, alert media buyer
```

### Partial Launch Failure Handling

```
If any adset/ad creation fails mid-launch:
  1. PAUSE all successfully created adsets (keep test fair)
  2. Log which succeeded and which failed
  3. Show failure UI with options:
     - Retry Failed: attempt to create remaining adsets
     - Enable Created: unpause successful ones, run partial test
     - Rollback All: delete all created adsets, restore to pre-launch state
  4. ClickUp status only updated for successfully launched creatives
```

### Team Collision Detection

```
Before launch, check:
  1. Is there an active test for this product?
  2. Who launched it and when?
  3. How many creatives are in that test?

If collision detected:
  - Show warning with other team member's test info
  - Options:
    ( ) Add my creatives to existing test (merge into same campaign)
    ( ) Launch separate test anyway (will compete for audience)
    ( ) Wait for current test to finish
    ( ) Contact team member first
```

### Learning Phase Awareness

```
AI kill decision factors in learning phase:
  - LEARNING status: Only kill if metrics are catastrophically bad
    (e.g., CTR < 0.3%, or spend > 3x AOV with 0 conversions)
  - LEARNING_LIMITED: More lenient kills allowed
  - ACTIVE (exited learning): Standard kill thresholds apply

Display in monitor:
  Each adset shows learning phase status badge
  AI recommendations include learning phase context in reasoning
```

### Creative Fatigue Detection (for Scaled Winners)

```
Monitor scaled winners (in scaling/active campaigns) for:
  1. CTR declining for 3+ consecutive days
  2. CPA rising for 3+ consecutive days
  3. Frequency > 2.5 (audience seeing ad too many times)
  4. ROAS declining below product's average

Trigger alert when 2+ signals detected.
Suggest launching new creative test for that product.
Show count of untested creatives in Inbox.
```

---

## Data Model

### New Tables

```sql
-- Product profile configuration
product_profiles:
  id                    TEXT PRIMARY KEY
  store_id              TEXT NOT NULL
  shopify_product_id    TEXT
  product_name          TEXT NOT NULL
  product_image         TEXT
  ad_account_id         TEXT NOT NULL
  ad_account_currency   TEXT DEFAULT 'USD'
  page_id               TEXT
  instagram_actor_id    TEXT
  pixel_id              TEXT
  conversion_event      TEXT DEFAULT 'PURCHASE'
  destination_url       TEXT
  utm_template          TEXT
  average_order_value   REAL
  default_budget        REAL DEFAULT 20
  default_duration      INTEGER DEFAULT 3
  default_bid_strategy  TEXT DEFAULT 'LOWEST_COST_WITHOUT_CAP'
  default_bid_amount    REAL
  default_roas_floor    REAL
  default_structure     TEXT DEFAULT 'ABO'  -- ABO or CBO
  default_launch_status TEXT DEFAULT 'ACTIVE'
  naming_template_json  TEXT  -- JSON with campaign/adset/ad templates
  targeting_presets_json TEXT  -- JSON array of saved targeting configs
  clickup_list_id       TEXT
  clickup_sync_interval INTEGER DEFAULT 30  -- minutes
  ai_min_spend          REAL  -- min spend before AI evaluates
  ai_min_impressions    INTEGER DEFAULT 500
  ai_min_hours          INTEGER DEFAULT 24
  ai_eval_frequency     TEXT DEFAULT 'every_6h'
  created_at            TEXT DEFAULT CURRENT_TIMESTAMP
  updated_at            TEXT DEFAULT CURRENT_TIMESTAMP

-- Link products to campaigns
product_campaign_links:
  id                    TEXT PRIMARY KEY
  product_profile_id    TEXT NOT NULL REFERENCES product_profiles(id)
  campaign_id           TEXT NOT NULL  -- Meta campaign ID
  campaign_name         TEXT
  campaign_type         TEXT NOT NULL  -- testing, scaling, retargeting
  ad_account_id         TEXT NOT NULL
  is_active             INTEGER DEFAULT 1
  linked_at             TEXT DEFAULT CURRENT_TIMESTAMP

-- Creative test batches
creative_tests:
  id                    TEXT PRIMARY KEY
  store_id              TEXT NOT NULL
  product_profile_id    TEXT NOT NULL REFERENCES product_profiles(id)
  campaign_id           TEXT NOT NULL  -- Meta campaign ID
  campaign_mode         TEXT NOT NULL  -- existing, new
  adset_mode            TEXT NOT NULL  -- new_adsets, existing_adsets
  structure             TEXT NOT NULL  -- ABO, CBO
  bid_strategy          TEXT
  bid_amount            REAL
  roas_floor            REAL
  daily_budget          REAL
  test_duration         INTEGER
  launch_status         TEXT  -- ACTIVE, PAUSED
  status                TEXT DEFAULT 'launching'  -- launching, active, completed, failed, partial
  launched_by           TEXT  -- user ID/name
  launched_at           TEXT
  completed_at          TEXT
  total_spend           REAL DEFAULT 0
  winner_creative_id    TEXT
  created_at            TEXT DEFAULT CURRENT_TIMESTAMP

-- Individual creatives in a test
creative_test_items:
  id                    TEXT PRIMARY KEY
  creative_test_id      TEXT NOT NULL REFERENCES creative_tests(id)
  clickup_task_id       TEXT
  clickup_task_name     TEXT  -- used for ad naming
  creative_name         TEXT NOT NULL
  creative_type         TEXT  -- video, image, carousel
  hook                  TEXT
  angle                 TEXT
  drive_url             TEXT
  meta_asset_id         TEXT  -- uploaded asset ID in Meta
  meta_asset_type       TEXT  -- IMAGE or VIDEO
  meta_adset_id         TEXT  -- created adset ID
  meta_ad_id            TEXT  -- created ad ID
  meta_creative_id      TEXT  -- created creative ID
  upload_status         TEXT DEFAULT 'pending'  -- pending, uploading, ready, failed
  launch_status         TEXT DEFAULT 'pending'  -- pending, created, failed, rolled_back
  review_status         TEXT  -- IN_REVIEW, ACTIVE, DISAPPROVED, WITH_ISSUES
  review_feedback       TEXT  -- rejection reason from Meta
  learning_phase        TEXT  -- LEARNING, LEARNING_LIMITED, ACTIVE
  test_status           TEXT DEFAULT 'testing'  -- testing, winner, killed, inconclusive
  spend                 REAL DEFAULT 0
  revenue               REAL DEFAULT 0
  roas                  REAL DEFAULT 0
  cpa                   REAL
  ctr                   REAL
  purchases             INTEGER DEFAULT 0
  impressions           INTEGER DEFAULT 0
  ai_recommendation     TEXT  -- kill, scale, wait, graduate
  ai_reasoning          TEXT
  created_at            TEXT DEFAULT CURRENT_TIMESTAMP

-- Ad copy library
copy_library:
  id                    TEXT PRIMARY KEY
  product_profile_id    TEXT NOT NULL REFERENCES product_profiles(id)
  primary_text          TEXT NOT NULL
  headline              TEXT
  description           TEXT
  cta                   TEXT
  source_ad_id          TEXT  -- Meta ad ID where this copy won
  source_test_id        TEXT REFERENCES creative_tests(id)
  roas                  REAL
  cpa                   REAL
  ctr                   REAL
  total_spend           REAL
  total_revenue         REAL
  total_purchases       INTEGER
  is_ai_generated       INTEGER DEFAULT 0
  created_at            TEXT DEFAULT CURRENT_TIMESTAMP

-- Test launch ad copy (supports multi-PT/headline)
test_ad_copy:
  id                    TEXT PRIMARY KEY
  creative_test_id      TEXT NOT NULL REFERENCES creative_tests(id)
  copy_type             TEXT NOT NULL  -- primary_text, headline, description
  copy_text             TEXT NOT NULL
  source                TEXT  -- winner, ai_generated, manual
  source_copy_id        TEXT REFERENCES copy_library(id)
  position              INTEGER  -- ordering (1-5)

-- Creative fatigue tracking
creative_fatigue_alerts:
  id                    TEXT PRIMARY KEY
  product_profile_id    TEXT NOT NULL
  ad_id                 TEXT NOT NULL  -- Meta ad ID
  creative_name         TEXT
  campaign_id           TEXT
  ctr_trend             TEXT  -- JSON array of daily CTR values
  cpa_trend             TEXT  -- JSON array of daily CPA values
  frequency_trend       TEXT  -- JSON array of daily frequency values
  alert_type            TEXT  -- fatigue, declining
  status                TEXT DEFAULT 'active'  -- active, snoozed, dismissed
  snoozed_until         TEXT
  created_at            TEXT DEFAULT CURRENT_TIMESTAMP
```

---

## API Routes

### Product Profiles

```
GET    /api/creative-hub/product-profiles?storeId=X
POST   /api/creative-hub/product-profiles
PATCH  /api/creative-hub/product-profiles/:id
DELETE /api/creative-hub/product-profiles/:id
POST   /api/creative-hub/product-profiles/auto-discover?storeId=X
POST   /api/creative-hub/product-profiles/ai-match  (Claude matching)
```

### Creative Inbox

```
GET    /api/creative-hub/inbox?storeId=X&productId=Y
POST   /api/creative-hub/inbox/sync?storeId=X  (trigger ClickUp sync)
POST   /api/creative-hub/inbox/upload  (Drive -> Meta upload)
GET    /api/creative-hub/inbox/upload-status/:assetId
POST   /api/creative-hub/inbox/validate-drive-link
```

### Launch

```
POST   /api/creative-hub/launch/health-check  (pre-launch validations)
POST   /api/creative-hub/launch/execute  (create campaign/adsets/ads on Meta)
POST   /api/creative-hub/launch/retry/:testId  (retry failed items)
POST   /api/creative-hub/launch/rollback/:testId  (delete created items)
GET    /api/creative-hub/launch/status/:testId  (poll launch progress)
```

### Active Tests

```
GET    /api/creative-hub/tests/active?storeId=X
GET    /api/creative-hub/tests/:testId/metrics  (real-time metrics)
GET    /api/creative-hub/tests/:testId/review-status  (Meta review polling)
POST   /api/creative-hub/tests/:testId/ai-evaluate  (trigger AI evaluation)
POST   /api/creative-hub/tests/:testId/actions  (execute kill/scale/etc)
```

### Copy Library

```
GET    /api/creative-hub/copy-library?productId=X
POST   /api/creative-hub/copy-library  (save winning copy)
POST   /api/creative-hub/copy-library/ai-generate  (Claude generates new copy)
POST   /api/creative-hub/copy-library/ai-analyze  (Claude analyzes winners)
DELETE /api/creative-hub/copy-library/:id
```

### Fatigue Alerts

```
GET    /api/creative-hub/fatigue-alerts?storeId=X
POST   /api/creative-hub/fatigue-alerts/:id/snooze
POST   /api/creative-hub/fatigue-alerts/:id/dismiss
```

---

## Meta API Integration

### Campaign Creation

```
POST /act_{AD_ACCOUNT_ID}/campaigns
  name, objective (OUTCOME_SALES), status, special_ad_categories,
  campaign_budget_optimization (for CBO), daily_budget (for CBO),
  bid_strategy

POST /act_{AD_ACCOUNT_ID}/adsets
  campaign_id, name, status, daily_budget (for ABO),
  billing_event (IMPRESSIONS), optimization_goal (OFFSITE_CONVERSIONS),
  promoted_object (pixel_id, custom_event_type),
  targeting (geo, age, gender, placements, audiences),
  bid_amount (for cost cap/bid cap), roas_average_floor (for min ROAS),
  start_time, end_time

POST /act_{AD_ACCOUNT_ID}/adcreatives
  Single PT/HL: object_story_spec with link_data or video_data
  Multi PT/HL: asset_feed_spec with bodies[], titles[], descriptions[]

POST /act_{AD_ACCOUNT_ID}/ads
  name, adset_id, creative (creative_id), status
```

### Asset Upload

```
Images: POST /act_{AD_ACCOUNT_ID}/adimages (multipart, returns image_hash)
Videos: POST /act_{AD_ACCOUNT_ID}/advideos (multipart, returns video_id)
  Poll GET /{VIDEO_ID}?fields=status until status.video_status === 'ready'
```

### Review Status

```
GET /{AD_ID}?fields=review_feedback,effective_status,configured_status
  review_feedback: array of {body: string} with rejection reasons
  effective_status: ACTIVE, IN_REVIEW, DISAPPROVED, etc.
```

### Insights (for monitoring)

```
GET /{AD_ID}/insights
  ?fields=impressions,clicks,spend,ctr,cpc,cpm,actions,
          cost_per_action_type,purchase_roas,
          video_thruplay_watched_actions
  &date_preset=maximum (for test duration)

For copy breakdown (Flexible Ads):
GET /{AD_ID}/insights?breakdowns=body_asset,title_asset
```

### Batch API

For bulk operations (creating multiple adsets/ads):
```
POST https://graph.facebook.com
  batch=[
    {method: "POST", relative_url: "act_{ID}/adsets", body: "..."},
    {method: "POST", relative_url: "act_{ID}/adsets", body: "..."},
    ...
  ]
  (max 50 per batch)
```

### Learning Phase

```
GET /{ADSET_ID}?fields=learning_stage
  Returns: LEARNING, LEARNING_LIMITED, or empty (exited)
```

---

## Feature Summary Table

| Feature | Module | Priority |
|---------|--------|----------|
| Product auto-discovery from campaigns | M1 | P0 |
| AI campaign-to-product matching | M1 | P0 |
| Manual product profile config | M1 | P0 |
| ClickUp creative sync (Ready to Launch status) | M2 | P0 |
| Google Drive thumbnail preview | M2 | P1 |
| Google Drive video preview | M2 | P1 |
| Drive link validation | M2 | P0 |
| Background upload (Drive -> Meta) | M2 | P0 |
| Upload progress bar | M2 | P0 |
| Duplicate/already-tested detection | M2 | P1 |
| Product selection in launch | M3 | P0 |
| Existing vs new campaign mode | M3 | P0 |
| New vs existing adset mode | M3 | P0 |
| Creative-to-adset assignment UI | M3 | P1 |
| ABO/CBO structure selection | M3 | P0 |
| Uniform bid/ROAS across adsets | M3 | P0 |
| Multi-PT/headline (Flexible Ads) | M3 | P0 |
| Winner copy auto-population | M3 | P0 |
| AI copy generation (Claude) | M3 | P1 |
| Per-creative URL override | M3 | P1 |
| Pre-launch health checks | M3 | P0 |
| Account spending limit check | M3 | P0 |
| Landing page validation | M3 | P1 |
| Weekend launch warning | M3 | P2 |
| Team collision detection | M3 | P1 |
| Naming from ClickUp/Drive name | M3 | P0 |
| Naming collision auto-increment | M3 | P1 |
| Cross-account launch | M3 | P2 |
| Partial launch failure handling | M3 | P0 |
| ClickUp status sync (Testing/Winner/Failed) | M3/M4 | P0 |
| Real-time test metrics dashboard | M4 | P0 |
| Meta review status tracking | M4 | P0 |
| Learning phase display | M4 | P1 |
| AI kill/scale/wait recommendations | M4 | P0 |
| One-click action execution | M4 | P0 |
| Copy performance breakdown | M4 | P1 |
| Creative fatigue detection | M4 | P2 |
| Historical test results | M5 | P1 |
| AI-ranked copy library | M6 | P1 |
| Copy reuse in new tests | M6 | P1 |
| Currency display per ad account | All | P0 |

Priority: P0 = Must have for v1, P1 = Should have, P2 = Nice to have
