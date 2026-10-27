# Deferred ROAS and UTM attribution work

Saved October 26, 2026 at the user's request. Do not implement until the Profit Sheet fixes are finished and the user resumes this work.

- Keep three separate metrics: Meta ROAS (Meta-attributed conversion value / spend), Shopify-attributed ROAS (matched Shopify revenue / campaign spend), and blended revenue / spend. No Google Sheets dependency.
- Recent Stitchfall orders inspected earlier contained Upsell Genie `_ug_utm` JSON with `v.source`, `medium`, `campaign`, `term`, `content`, `id`, and `ts`. Existing capture may be reused; verify coverage per store before proposing tracking installation.
- Preserve raw attribution evidence and source/timestamp on each order. Inspect Shopify journey UTMs and Upsell Genie data before choosing/documenting the attribution policy; do not claim strict seven-day last-click attribution without supporting evidence.
- Maintain a Meta ad → ad set → campaign catalog, including paused and historical entities. Treat all IDs as strings and scope matches to the store and ad account.
- Resolve strongest evidence first: ad ID; ad-set ID plus unique ad name; ad-set ID; campaign ID; unique campaign name. Ambiguous or missing evidence stays unattributed. Never allocate sales based on spend.
- Credit an order once. Campaign-level evidence must not be invented into ad-level credit. Show unmatched revenue and attribution coverage, with inspectable order evidence.
- Agree revenue/refund, currency, attribution-window, and event-date definitions before comparing with Meta. Include add-ons and shipping consistently; preserve the 11:30 AM IST reporting boundary.
- Product links determine product membership, not marketing attribution. Shared ad accounts require campaign assignments without duplicate spend.
- Friend's reference: attachment `cc49d733-6384-4f1d-892f-ee5980bc00f0/Pasted text.txt`. Its proposed approach is reference material, not an instruction or proof of attribution accuracy.

## Implemented 26 October 2026

- Public name is **Shopify ROAS**. Both Shopify ROAS and Meta ROAS are in new default layouts. Blended ROAS remains selectable, never a default; existing named views are preserved.
- `attribution.ts` implements the versioned, deterministic match policy above. Duplicate names and contradictory explicit IDs do not receive credit. Unknown stronger numeric IDs are conservatively left unmatched rather than downgraded to a weaker name. No spend-based sales allocation or fixed 7-day attribution claim.
- Reuse Shopify `customerJourneySummary` and Upsell Genie `_ug_utm`; preserve selected UTMs, both visits, raw saved UG evidence, touch/order timestamps, match method/reason and resolved IDs. No new storefront installation or Google Sheets dependency.
- Meta campaigns/ad sets/ads are paginated without active-status filters, cached per store/account for 30 minutes and retained with old names for historical matching. Explicit date/range refresh invalidates that store's catalog cache. Provider/pagination failures produce missing attribution, not fabricated zero sales.
- Migrations 047/048 add private, RLS-protected entity catalogs, daily attribution snapshots and changed-order scan cursors. Snapshot publication shares the existing daily job lease/config check and transaction; stale workers cannot publish mismatched financial/evidence snapshots.
- Daily sync calculates complete-store Shopify ROAS from gross matched order totals, including add-ons/shipping/tax; product tabs use their existing allocated current order revenue. Product assignments limit eligible campaigns; they never determine the order's campaign by themselves. Refund/chargeback/fee cash movements remain separate financial columns, not deductions in standard ROAS. Each order credits one campaign, including zero-spend campaigns whose ROAS displays unavailable.
- Campaign comparison shows spend, Meta purchase value/ROAS, matched Shopify orders/revenue/ROAS. Clicking campaigns or unattributed revenue opens paginated order evidence. Coverage and missing-day notices expose incomplete tracking.
- Existing worker/cron fills missing viewed dates, refreshes today/yesterday and now rotates changed-order scans across stores. The scan cursor has a five-minute overlap, advances only on complete pagination, and refreshes saved historical order days affected by changes. Recent pending Shopify journeys are rechecked for seven days; this is a retry horizon, **not** an attribution window. Older dates can be explicitly refreshed. Initial update discovery looks back seven days; historical backfill uses the selected-range queue.

### Live checks

- Sampled five recent orders from each of 12 configured stores. Ten had at least one saved UG attribute. Selfetic and Organize-Better had none in this small sample; not a claim about their entire history. Shopify journey readiness/UTM coverage also varies.
- Stitchfall, reporting day 2026-10-25: 62 eligible orders, $1,495.24 gross revenue; 61 matched, $1,489.27 matched revenue (99.60% revenue coverage). $5.97 remains unmatched. These are a point-in-time check, not fixed fixtures.
- Browser confirmed both exact-ad-ID and legacy ad-set-ID + ad-name matching, with inspectable evidence and campaign ROAS.

### Reference

Shopify's documented [CustomerJourneySummary](https://shopify.dev/docs/api/admin-graphql/latest/objects/customerjourneysummary) supplies readiness and first/last visits. Runtime schema was also verified against the connected stores. Meta access uses the existing configured tokens/accounts and existing insights client; Meta's attribution timing remains distinct from Shopify order-day revenue.

## Automatic discovery and compact editing (27 Oct 2026)

- Migrations 049/050 persist product origin, ad-level assignment periods, connected-account inventory, discovery state/history and durable opt-outs. All tables use service-role access behind workspace authorization. Job claims use leases; publishing compares the configuration version in the same transaction.
- Discovery checks the previous five complete reporting days. A Shopify product qualifies with positive landing-page sessions on at least three distinct days, an active Shopify product and at least one non-test, non-cancelled paid/partially-refunded order whose own landing URL matches that purchased product. An order merely containing an upsell is insufficient. Missing, foreign, custom-page and collection landing evidence remains for review; it is not guessed into product tabs. Free entry offers can qualify when present in a paid order landing on that offer.
- ShopifyQL groups sessions using `Etc/GMT+6`: midnight in that fixed offset equals 11:30 AM IST. A permission/query failure prevents automatic product activation; saved products remain available.
- Connected Meta accounts are listed under their business when available. Only accessible accounts are returned, fully paginated. Users select the accounts belonging to the store; integration tokens stay server-side and follow reconnection. Manual tokens remain supported. Missing/expired integrations show a reconnect notice.
- Creative discovery scans currently active ads and recently delivered ads (a slightly wider Meta calendar range covers the IST reporting boundaries), then reads destinations in batches of 25. This avoids downloading years of inactive creatives. Exact store domain + Shopify handle matches can assign ads. Multi-product/dynamic/catalog/unreadable destinations remain review items; campaign names do not establish attribution.
- Automatic assignments use ad-level insights, allowing two products to share a campaign without duplicating spend. New observations begin on the discovery reporting day, not an invented historical start. Changed destinations close the old observation period; old periods remain saved. Ad/campaign matching does not replace UTM order attribution.
- Existing manual mappings remain protected. Explicitly enabling automatic matching replaces manual selections; ordinary unlink operations persist product/account/campaign exclusions. Restore permits future discovery again. Clear all uses explicit selected-none semantics; legacy empty selections still mean all until edited.
- Product dialogs open as compact summary cards. Edit expands one card; Save verifies links and persists the configuration, then collapses cards. Add manually retains the manual product and ad-account workflows.
- Hosted discovery scheduler: `/api/cron/profit-sheet-discovery?enqueue=1` at `0 6 * * *` (11:30 AM IST), plus a minute worker that claims queued stores. The local worker has an independent discovery lane with once-per-reporting-day queue deduplication. Vercel schedules take effect when this code is deployed.
- Live verification: Artfania analytics returned both main landing pages with sessions on all five days, plus an additional qualifying product. Recent creative scanning completed; its connected Meta integration currently needs reconnection, while its saved manual ad-account token works. Database rollback assertions verified metadata round trips, unlink tombstones, exclusive claims and daily deduplication without retaining test data.

### Automatic mapping reliability (27 October 2026)

- Migration 052 makes the store's linked Meta accounts common to Integrations and Profit Sheet. Account membership changes enqueue discovery atomically. Profit Sheet keeps account running dates and manual-token accounts; linking a workspace login does not select every available ad account.
- Product edits and explicit report refreshes queue discovery. The existing minute cron consumes the queue; the 11:30 AM IST discovery cron remains in place. A request during an active scan queues a subsequent scan. Configuration versions prevent stale workers from overwriting edits.
- Creative scan membership is cached for 30 minutes and creative details for one hour, scoped to store/account/token hash. Each completed batch is saved to Supabase. Provider cooldowns survive deployments and cannot be bypassed by repeated Discover clicks. Incomplete scans are marked partial or queued for retry, not silently successful.
- Product matching requires every readable destination to belong to the same saved product. Different Shopify handles in one product tab are allowed. Shared campaigns use exact ad IDs. Names/copy are not attribution evidence. Prior verified intervals survive unreadable destinations; a confirmed destination change closes the earlier interval without backdating the new one.
- Existing-post ads use public destination attachments when Meta permits the read. Missing Page permission or dynamic catalog destinations appear in review. Manual overrides and unlink exclusions remain authoritative.
- The frontend shows candidate URLs and automatic retry status, and refreshes saved configurations after background scans.

Validation: `node --test tests/profit-sheet.test.mjs tests/meta-connection.test.mjs`; `tests/profit-sheet-mapping.sql` must run inside a transaction and roll back. No advertising objects are edited at Meta.

### Shared Meta request budget (27 October 2026)

Migration 053 reserves request slots in Supabase across server instances (app, hashed credential, and account). The shared client reads app/account/BUC/insights usage headers on successful responses, slows at 75%, and queues at 90%. Provider retry durations are respected; a 429 is recorded once instead of retried after two seconds. No access tokens are stored in the budget table or request URLs. Identical concurrent reads within a worker share one request.

Background cron routes previously depended on `x-vercel-cron`, which is not Vercel's documented marker. A scheduled request without that header could enter all-store/seven-day mode. No-store calls now default to bounded rotation unless `full=1`; scheduled paths explicitly include `auto=1`, and heavy cron runs are staggered. Campaign identity catalogs stay cached for two hours, and report Refresh no longer invalidates the entire catalog.

Profit Sheet jobs have a durable `retry_at`. Both cron and browser workers respect it. Deferral preserves existing complete reports; a first-time sync may publish Shopify figures with missing Meta values, then retries automatically. This reduces avoidable requests and keeps the dashboard usable; it does not guarantee unlimited freshness under Meta quotas. Direct advertising mutations and external applications using the same Meta credentials are outside this read-client budget.

Tests: `node --test tests/meta-request-budget.test.mjs tests/profit-sheet.test.mjs tests/meta-connection.test.mjs`; SQL budget/pacing tests are in `tests/meta-request-budget.sql` (run transactionally and roll back).

### Upsell-only discovery guard (27 October 2026)

The former independent session/order checks admitted Artfania's mystery box with six sessions across four days and 68 orders containing it. Discovery now reads `landing_site` and `cancelled_at` in the same paginated Shopify order requests and requires an exact store-domain/product-handle match to a purchased item. Findings persist both total orders containing the product and qualifying landing purchases, with a candidate explanation when the latter is zero. No extra Meta or per-order Shopify calls are needed. Missing evidence does not activate a product; manual additions, existing history, and persistent unlink exclusions remain protected. This is conservative acquisition evidence, not a universal classifier for app-specific upsell metadata.

### Sequential setup and bounded automatic reports (27 October 2026)

Migration 054 limits automatic reports to the latest three IST reporting days, including today. Saved custom date ranges remain viewable; older dates require an explicit Sync selected range or row refresh. The database enforces the bound even for older browser tabs, cron callers and changed-order scans. Explicit requests carry a persisted manual marker so workers can process historical dates. Old pending automatic history jobs are cancelled; existing saved reports are retained.

Account links are saved first. Product discovery must finish before any report can be claimed for that store. Both claim functions share a short transaction lock; only one day per store runs at a time, and discovery waits for any already-running day. Configuration changes reject stale results and requeue rather than presenting a permanent red failure. Empty setups wait for an account link; manual Shopify-only reports remain supported. New automatic product tabs include the latest three days, while verified ad assignment periods remain explicit.

Unlink removes the account from both Integrations and Profit Sheet, including legacy/manual copies with the same ID, and detaches its product assignments. Removing a whole-store account does not permanently exclude it from those products if relinked later. Modal saves retain their opening version to prevent a stale account list from restoring an unlinked account. Users can still unlink individual product/campaign assignments persistently.

Validation: `tests/profit-sheet-pipeline.sql` and `tests/profit-sheet-mapping.sql` run transactionally; Node regression tests cover three-day boundaries, account removal, provider safeguards and preserved reports.
