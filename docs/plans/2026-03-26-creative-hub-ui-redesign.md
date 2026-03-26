# Creative Hub UI Redesign — Product Profiles & Creative Inbox

**Date:** 2026-03-26
**Status:** Approved

## Problem

1. Product cards don't show URL, BM, ClickUp, or creative stats
2. No visual distinction between active (running ads) vs inactive products
3. Creative Inbox isn't grouped by product in a useful way
4. No per-product creative breakdown (ready/testing/launched/winners)

## Design

### Product Profile Card (Expanded Detail)

- **Active products**: Green left border + "Active" badge with campaign count
- **Paused products**: Gray left border + "Paused" badge, slightly dimmed
- **Remove**: "Defaults" row (ABO/$20/day/3d) — this is Edit Profile detail
- **Add**: URL row, BM row, 4 stat badges (Ready, Testing, Launched, Winners)
- **Add**: "Launch" button alongside Edit and Copy Library

Stat badges:
- Ready (blue) — ClickUp creatives with "Ready to Launch"
- Testing (amber) — creatives in active tests
- Launched (green) — total launched
- Winners (purple) — graduated winners

### Creative Inbox (Product-Grouped)

- Group by product with collapsible sections
- Each product section header shows: product name, ready count, testing count
- Better status badges: "Ready" (has Drive link), "No Link" (missing)
- Remove "Pending Upload" — uploads happen at launch time only

### Data Sources

- Active campaign count: `campaignLinks.filter(l => l.isActive).length`
- Ready creatives: from ClickUp inbox (status = "Ready to Launch")
- Testing creatives: from `creative_test_items` with status = "testing"
- Winners: from `creative_test_items` with status = "winner" or from `copy_library`
- URL: `profile.destinationUrl`
- BM: from `campaignLinks` aggregated `bmName`

## Implementation Tasks

1. **ProductProfileCard.tsx** — Redesign with new layout, stat badges, active/paused status
2. **ProductProfilesTab.tsx** — Pass creative stats data, sort active first
3. **CreativeInboxTab.tsx** — Better product grouping, remove "Pending Upload" status
4. **InboxCreativeRow.tsx** — Simplify status to "Ready" / "No Link"
5. **CreativeHubClient.tsx** — Fetch test data for creative stats on profiles tab
