import { rest } from "./supabase-persistence";
import { shopifyGraphQL } from "./shopify-graphql";
import { reportingDay } from "@/lib/profit-sheet/model";
import { safeSheetError } from "./profit-sheet-access";
// Rotate one store per worker tick. Resume only after all changed-order pages have
// been read; overlap the cursor so delayed writes and equal timestamps are safe.
export async function queueChangedAttributionDays() {
  const scan = (
    await rest<
      Array<{
        store_id: string;
        scanned_until: string | null;
        checked_at: string;
      }>
    >("/rpc/profit_sheet_claim_update_scan", { method: "POST", body: "{}" })
  )[0];
  if (!scan) return;
  const deadline = Date.now() + 45000;
  const until = new Date().toISOString();
  const since = new Date(
    scan.scanned_until
      ? Date.parse(scan.scanned_until) - 300000
      : Date.now() - 7 * 86400000,
  ).toISOString();
  const dates = new Set<string>();
  const path = `/profit_sheet_attribution_updates?store_id=eq.${encodeURIComponent(scan.store_id)}&checked_at=eq.${encodeURIComponent(scan.checked_at)}`;
  try {
    let after: string | null = null;
    const cursors = new Set<string>();
    let complete = false;
    for (let page = 0; page < 100; page++) {
      if (Date.now() > deadline) throw new Error("Sync time budget exceeded");
      const result: {
        orders: {
          nodes: Array<{ createdAt: string }>;
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      } = await shopifyGraphQL(
        scan.store_id,
        `query ChangedOrders($query: String!, $after: String) { orders(first: 100, after: $after, sortKey: UPDATED_AT, query: $query) { nodes { createdAt } pageInfo { hasNextPage endCursor } } }`,
        { query: `updated_at:>='${since}' updated_at:<='${until}'`, after },
      );
      for (const order of result.orders.nodes)
        dates.add(reportingDay(new Date(order.createdAt)));
      if (!result.orders.pageInfo.hasNextPage) {
        complete = true;
        break;
      }
      after = result.orders.pageInfo.endCursor;
      if (!after || cursors.has(after))
        throw new Error("Incomplete Shopify changed-order pagination");
      cursors.add(after);
    }
    if (!complete)
      throw new Error("Changed-order report exceeded pagination limit");
    // A refund/order edit on an old order refreshes its saved report, not an
    // arbitrary new historical range. Missing ranges are handled by the UI queue.
    const changed = [...dates];
    for (let i = 0; i < changed.length; i += 100) {
      const saved = await rest<Array<{ date: string }>>(
        `/profit_sheet_days?store_id=eq.${encodeURIComponent(scan.store_id)}&scope_id=eq.store&date=in.(${changed.slice(i, i + 100).join(",")})&select=date`,
      );
      if (saved.length)
        await rest("/rpc/profit_sheet_enqueue", {
          method: "POST",
          body: JSON.stringify({
            p_store: scan.store_id,
            p_dates: saved.map((r) => r.date),
          }),
        });
    }
    // Shopify journeys can become ready without an order edit. Recheck recent
    // pending evidence; older dates remain explicitly refreshable/backfillable.
    const recent = await rest<
      Array<{
        date: string;
        snapshot: {
          orders?: Array<{
            evidence?: { journey?: { ready?: boolean } | null };
          }>;
        };
      }>
    >(
      `/profit_sheet_attribution?store_id=eq.${encodeURIComponent(scan.store_id)}&date=gte.${reportingDay(new Date(Date.now() - 7 * 86400000))}&select=date,snapshot`,
    );
    const pending = recent
      .filter((r) =>
        r.snapshot.orders?.some((o) => o.evidence?.journey?.ready === false),
      )
      .map((r) => r.date);
    if (pending.length)
      await rest("/rpc/profit_sheet_enqueue", {
        method: "POST",
        body: JSON.stringify({ p_store: scan.store_id, p_dates: pending }),
      });
    await rest(path, {
      method: "PATCH",
      body: JSON.stringify({
        scanned_until: until,
        lease_until: null,
        error: null,
      }),
    });
  } catch (error) {
    await rest(path, {
      method: "PATCH",
      body: JSON.stringify({ lease_until: null, error: safeSheetError(error) }),
    });
  }
}
