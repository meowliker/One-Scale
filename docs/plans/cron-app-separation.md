# Separate Meta App for Cron Jobs — Design Notes

**Status:** Saved for later implementation
**Date:** 2026-03-26

## Problem

All API calls (user-facing + cron background sync) use the same Meta App, sharing one rate limit pool. Cron jobs exhaust the quota, blocking user-facing operations (settings page can't load BMs/ad accounts).

## Solution: Two Meta Apps

| | Main App (user-facing) | Cron App (background sync) |
|---|---|---|
| Purpose | OAuth login, settings page, ad account linking, launch wizard | Spend sync, order sync, metric polling |
| Rate limit | Separate quota | Separate quota |
| Token | User OAuth token (existing flow) | System User token OR separate OAuth token |
| Credentials | Existing `app_credentials` table | New `META_CRON_APP_ID` / `META_CRON_APP_SECRET` env vars or settings UI |

## Key Technical Findings

1. **Cron jobs don't use `app_credentials`** — they only read stored OAuth tokens from `connections` table via `getMetaToken()`
2. **Rate limit is per-app** — the token carries the app's rate limit. A token generated via App A counts against App A's quota regardless of who calls it
3. **To split rate limits, need separate tokens** — users must connect twice (once per app) OR use System User tokens for cron app
4. **Current schema enforces single app per platform** — `UNIQUE(platform, workspace_id)` constraint on `app_credentials`

## Implementation Plan

### Option 1: System User Token (Recommended)
- Create second Meta app ("OneScale Sync")
- In each BM: create System User → generate token with `ads_read`, `read_insights` scopes
- Store cron tokens separately (new `cron_connections` table or `connection_type` column)
- Cron jobs use `getCronMetaToken()` instead of `getMetaToken()`
- No second OAuth flow needed — System User tokens are generated in BM settings

### Option 2: Two OAuth Flows
- Two "Connect Meta" buttons in settings
- Each uses different app credentials
- More complex UX but fully automated

### Option 3: Settings Page for Cron App Credentials
- Add "Cron App" section to Settings → API Credentials page
- Fields: Cron App ID, Cron App Secret
- Cron jobs use these credentials for token exchange
- Still needs separate token generation (System User or second OAuth)

## Database Changes Needed

```sql
-- Option A: Add connection_type to existing connections table
ALTER TABLE connections ADD COLUMN connection_type TEXT DEFAULT 'primary' CHECK(connection_type IN ('primary', 'cron'));

-- Option B: New table for cron credentials
CREATE TABLE cron_app_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '__global__',
  app_id TEXT NOT NULL,
  app_secret TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(platform, workspace_id)
);
```

## Files to Modify

- `src/app/api/lib/tokens.ts` — Add `getCronMetaToken()` function
- `src/app/api/lib/db.ts` — Add cron credentials table/column
- `src/app/api/lib/supabase-persistence.ts` — Add cron credential persistence
- `src/app/api/cron/*` — Switch from `getMetaToken()` to `getCronMetaToken()`
- `src/components/settings/ApiCredentials.tsx` — Add cron app credentials section
- `src/app/api/settings/credentials/route.ts` — Handle cron app CRUD

## Meta Setup Steps (Manual)

1. Go to developers.facebook.com → Create New App → "OneScale Sync"
2. Add permissions: `ads_read`, `read_insights`, `business_management`
3. Submit for App Review (same scopes as main app)
4. In each BM: Business Settings → System Users → Add → Generate Token for "OneScale Sync"
5. Enter System User tokens in OneScale settings page
