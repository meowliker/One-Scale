# Meta connection persistence

Investigated 27 October 2026, before deployment.

## Findings

- Profit Sheet manual account tokens were already encrypted in Supabase (`profit_sheet_accounts`). Artfania and Stitchfall had no corresponding Meta OAuth integration row in `connections`; a generic discovery message incorrectly called this an expired token.
- Both saved manual tokens were accepted by Meta's token debugger as USER tokens with ads_read, ads_management and business_management. Meta reported an expiry of 28 November 2026 at 05:34:56 UTC. They were verified and restored into each store's encrypted integration connection. Fresh-process reads and account discovery succeeded for both: 20 businesses and 59 accounts.
- Older integration rows do have elapsed OAuth expiry dates. Keeping their database rows does not renew the credentials at Meta.

## Changes

- Supabase is authoritative when configured. A missing remote connection no longer resurrects a stale SQLite credential. Local hydration remains a best-effort cache for existing API consumers.
- Save the encrypted durable connection first, then update SQLite. A failed remote save cannot appear successful locally; a local cache failure cannot erase a successfully saved cloud connection.
- Provider expiry is normalized from seconds to milliseconds. Explicit no-expiry replacement clears a stale local expiry instead of retaining it through COALESCE. Data-access expiry is also respected.
- OAuth callbacks validate the final token before persisting; provider errors are not reflected verbatim into callback URLs. Account details remain preserved. Copied connections include expiry/validation metadata.
- Settings → Integrations shows saved/missing/expired/rejected status, the actual expiry and a near-expiry warning. Users can verify their connection, restore a stored Profit Sheet token, or save a verified replacement token. Raw tokens never return to the browser.
- A SYSTEM_USER token verified by Meta with zero expiry and no earlier data-access expiry is shown as having no scheduled expiry. Unknown/missing expiry fields never establish permanence. Meta can still revoke credentials or permissions; no background job pretends to renew an expired USER token.
- Daily Profit Sheet discovery validates an existing integration. Confirmed revocation updates metadata without deleting the credential; transient provider failures leave the connection untouched. A last_synced compare guard prevents validation results overwriting a simultaneous reconnection.

## Checks

Nine focused token/storage tests plus the Profit Sheet regression suite cover remote-save failures, cache failures, token expiry and scopes, ambiguous expiry, explicit null replacement, revoked vs transient errors, account metadata and secret redaction. Live verification uses existing tokens only; no new Meta permissions or system users were created.

## Account-wide sharing (27 October 2026)

Migration 051 adds `workspace_meta_connections`, an encrypted, server-only login per OneScale workspace. Saving or reconnecting Meta atomically updates compatibility rows for that workspace's stores. Store-level ad-account selections and Profit Sheet assignments remain separate. New stores inherit the saved login when they join the workspace; a store moved to a different workspace loses the previous workspace's login. Deleting a store does not disconnect the remaining stores.

Validation uses a compare guard so a slow response cannot overwrite newer credentials, and propagates expiry/revocation to the whole workspace. Disconnect explicitly applies to every store in the account and removes the shared login, preventing new stores from reviving it. Mutation routes check store access, and OAuth uses the authenticated workspace rather than a supplied workspace ID. Other workspaces are never included.

The existing Artfania token was verified with Meta and shared with the 12 stores in its workspace, including Palette Vista. Original encrypted rows were backed up outside the repository. Migration 051 is applied in Supabase. `tests/workspace-meta.sql` exercises sharing, isolation, selection preservation, new stores, stale validation, moves, deletion and disconnect using synthetic fixtures inside a rolled-back transaction.
