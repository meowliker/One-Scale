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

No application deployment or Git push was performed for this change. Supabase credential restorations are already saved, and the code is running locally.
