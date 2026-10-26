import { NextRequest } from "next/server";
import {
  sheetAccess,
  sheetJson,
  safeSheetError,
} from "@/app/api/lib/profit-sheet-access";
import { loadConfig } from "@/app/api/lib/profit-sheet-repository";
import { fetchAllRestRows } from "@/app/api/lib/supabase-pagination";
import { sheetDates } from "@/lib/profit-sheet/model";
import {
  summarizeAttribution,
  type AttributionSnapshot,
} from "@/lib/profit-sheet/attribution";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams,
    id = q.get("storeId") || "",
    scope = q.get("scope") || "store";
  const denied = await sheetAccess(req, id);
  if (denied) return denied;
  let dates: string[];
  const offset = Number(q.get("offset") || 0);
  try {
    dates = sheetDates(q.get("from") || "", q.get("to") || "");
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error();
  } catch {
    return sheetJson({ error: "Invalid dates or order page." }, 400);
  }
  try {
    const config = await loadConfig(id);
    if (scope !== "store" && !config.products.some((p) => p.id === scope))
      return sheetJson({ error: "Unknown product." }, 400);
    const saved = await fetchAllRestRows<{
      date: string;
      config_version: number;
      currency: string;
      snapshot: AttributionSnapshot;
      synced_at: string;
    }>(
      `/profit_sheet_attribution?store_id=eq.${encodeURIComponent(id)}&date=gte.${dates[0]}&date=lte.${dates.at(-1)}&select=*&order=date.asc`,
    );
    const valid = saved.filter(
      (r) =>
        r.config_version === config.version &&
        r.snapshot.version === 1 &&
        r.snapshot.status === "complete",
    );
    const missing = dates.filter((d) => !valid.some((r) => r.date === d));
    const report = summarizeAttribution(
      valid.map((r) => r.snapshot),
      scope,
    );
    const { orders, ...summary } = report;
    const selection = q.get("campaign");
    const selected = orders.filter((o) =>
      selection === "unmatched"
        ? !o.scopedMatch
        : o.scopedMatch && `${o.accountId}:${o.campaignId}` === selection,
    );
    return sheetJson({
      ...summary,
      completedDays: valid.length,
      missing,
      currency: valid[0]?.currency || config.currency,
      ...(selection
        ? {
            orders: selected.slice(offset, offset + 100),
            totalOrders: selected.length,
            nextOffset: offset + 100 < selected.length ? offset + 100 : null,
          }
        : {}),
    });
  } catch (error) {
    return sheetJson({ error: safeSheetError(error) }, 503);
  }
}
