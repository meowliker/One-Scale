import { fetchFromShopify } from "./shopify-client";
import { rest } from "./supabase-persistence";
import { balanceDay, type BalanceEntry } from "@/lib/profit-sheet/finance";

export async function syncFinance(
  storeId: string,
  token: { accessToken: string; shopDomain: string },
  start: number,
  end: number,
  currency: string,
  deadline: number,
) {
  const entries: BalanceEntry[] = [];
  let lastId: string | undefined;
  const seen = new Set<string>();
  let complete = false;
  // This endpoint is newest first. It supports last_id, not date filters.
  // Walk backwards until the entire reporting window is covered.
  for (let page = 0; page < 100; page++) {
    if (Date.now() > deadline) throw new Error("Sync time budget exceeded");
    const result = await fetchFromShopify<{ transactions: BalanceEntry[] }>(
      token.accessToken,
      token.shopDomain,
      "/shopify_payments/balance/transactions.json",
      { limit: "250", test: "false", ...(lastId ? { last_id: lastId } : {}) },
    );
    if (!Array.isArray(result.transactions))
      throw new Error("Missing payment ledger");
    for (const entry of result.transactions) {
      if (seen.has(String(entry.id)))
        throw new Error("Duplicate payment pagination");
      seen.add(String(entry.id));
      entries.push(entry);
    }
    if (
      result.transactions.length < 250 ||
      result.transactions.some((e) => Date.parse(e.processed_at) < start)
    ) {
      complete = true;
      break;
    }
    lastId = String(result.transactions.at(-1)!.id);
  }
  if (!complete) throw new Error("Payment report exceeded pagination limit");
  const totals = balanceDay(entries, start, end, currency);
  // Preserve signed fees in the source ledger, and upsert so retries cannot duplicate money.
  const inWindow = entries.filter(
    (e) =>
      !e.test &&
      Date.parse(e.processed_at) >= start &&
      Date.parse(e.processed_at) < end,
  );
  if (inWindow.length)
    await rest(
      "/shopify_balance_transactions?on_conflict=store_id,transaction_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(
          inWindow.map((e) => ({
            store_id: storeId,
            transaction_id: String(e.id),
            type: e.type,
            amount: Number(e.amount),
            fee: Number(e.fee),
            net: Number(e.net),
            currency: e.currency.toUpperCase(),
            source_order_id:
              e.source_order_id == null ? null : String(e.source_order_id),
            source_type: e.source_type || null,
            processed_at: e.processed_at,
            payout_id: e.payout_id == null ? null : String(e.payout_id),
          })),
        ),
      },
    );
  return totals;
}
