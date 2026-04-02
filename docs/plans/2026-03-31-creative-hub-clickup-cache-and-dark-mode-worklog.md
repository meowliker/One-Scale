# Creative Hub Worklog

Date: 2026-03-31

## Scope

This worklog tracks two parallel changes in Creative Hub:

1. Fix the Launch Studio dark-mode layout bug where the overlay drops down and reveals Product Profiles behind it.
2. Add Supabase-backed ClickUp creative caching so Product Profiles can show preloaded creative counts and Launch Studio can open from cached data, with manual refresh and last-refreshed metadata.

## Guardrails

- Keep all work local to this repo.
- No git actions are being used for rollback.
- Preserve existing Creative Hub behavior with fallback logic while the cache rollout lands.
- Avoid layout restructuring while fixing the dark-mode overlay issue.

## Rollback Strategy

If something breaks, revert by file group rather than trying to partially undo logic inline:

### Dark-mode UI bug fix

- `src/components/creative-hub/CreativeHubClient.tsx`
- `src/components/creative-hub/launch-center/CreativeLaunchStudio.tsx`
- `src/components/creative-hub/launch-center/CreativeLaunchStudioShell.tsx`
- `src/components/creative-hub/launch-center/CreativeLaunchStudioChrome.tsx`
- `src/app/globals.css`

Rollback target:
- Launch Studio should render exactly as before this pass, even if that means the dark-mode drop bug returns temporarily.

### ClickUp cache feature

- `src/stores/creativeHubStore.ts`
- `src/components/creative-hub/ProductProfilesTab.tsx`
- `src/components/creative-hub/ProductProfileCard.tsx`
- `src/components/creative-hub/CreativeHubClient.tsx`
- `src/app/api/creative-hub/inbox/route.ts`
- `src/app/api/creative-hub/inbox/sync/route.ts`
- `src/app/api/lib/creative-hub-db.ts`
- `src/app/api/lib/supabase-persistence.ts`
- `src/types/creativeHub.ts`
- Any new helper files added under `src/app/api/lib/`

Rollback target:
- Product Profiles and Launch Studio return to the current live-fetch path from ClickUp.
- Manual refresh UI is removed or hidden if its backend contract is rolled back.

## Expected End State

- Product Profiles loads quickly with cached creative counts.
- Launch Studio opens with cached ClickUp creatives already available.
- Manual refresh updates the cache and surfaces last-refreshed time.
- Dark-mode switch no longer changes Launch Studio vertical positioning.

## Verification Checklist

- `npm run typecheck`
- `npm run build`
- Product Profiles opens first when entering Creative Hub.
- Product Profiles shows cached creative counts without waiting on live ClickUp.
- Launch opens with cached creatives.
- Manual refresh updates creatives and refresh timestamp.
- Dark mode and light mode both keep Launch Studio pinned correctly.

## Implementation Notes

- ClickUp cache rollout is now wired through the inbox API layer.
- New cache tables introduced:
  - `creative_hub_inbox_creatives`
  - `creative_hub_inbox_sync_status`
- `/api/creative-hub/inbox` now serves cached creatives first when a complete cache exists for the requested product scope.
- `/api/creative-hub/inbox?refresh=1` forces a live ClickUp sync and repopulates cache.
- `/api/creative-hub/inbox/sync` now forwards to the refresh path and can optionally accept `productId` for a scoped sync later.
- Supabase migration coverage was added to `/api/admin/apply-migration`.
- Cache helpers now fail open when the Supabase cache tables are missing, so Creative Hub falls back to live ClickUp instead of breaking during rollout.
- Final verification: `npm run typecheck` passed and `npm run build` passed after the cache rollout landed.

### Files touched for the cache rollout

- `src/app/api/creative-hub/inbox/route.ts`
- `src/app/api/creative-hub/inbox/sync/route.ts`
- `src/app/api/lib/creative-hub-db.ts`
- `src/app/api/lib/db.ts`
- `src/app/api/admin/apply-migration/route.ts`
- `src/types/creativeHub.ts`
- `src/stores/creativeHubStore.ts`
- `src/components/creative-hub/ProductProfilesTab.tsx`
- `src/components/creative-hub/CreativeHubClient.tsx`

### Rollback reminder

If the cache rollout causes regressions, back it out in this order:
1. Remove the inbox cache read/write helpers from `src/app/api/lib/creative-hub-db.ts`.
2. Restore `/api/creative-hub/inbox` to the live ClickUp path only.
3. Revert `/api/creative-hub/inbox/sync` to the previous delegation behavior.
4. Drop the new cache tables from local schema and Supabase migrations.

### Files touched for the dark-mode UI fix

- `src/components/creative-hub/launch-center/CreativeLaunchStudio.tsx`

### Dark-mode fix details

- Launch Studio now renders through a portal to `document.body`.
- Launch Studio locks page scroll while open.
- This removes the dashboard page wrapper from the overlay stacking context, which was the reason the Product Profiles page could peek through above the studio after switching themes.

### Dark-mode rollback reminder

If the dark-mode overlay fix causes regressions, back it out in this order:
1. Remove the `createPortal(...)` wrappers from `src/components/creative-hub/launch-center/CreativeLaunchStudio.tsx`.
2. Remove the body and document scroll-lock effect from the same file.
3. Re-test light and dark theme switching inside Launch Studio.

The cache rollout and dark-mode overlay fix should be rolled back independently if only one of them regresses.
