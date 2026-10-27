import { NextRequest } from "next/server";
import {
  sheetAccess,
  sheetJson,
  safeSheetError,
} from "@/app/api/lib/profit-sheet-access";
import { fetchAllRestRows } from "@/app/api/lib/supabase-pagination";
import { sheetDates } from "@/lib/profit-sheet/model";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("storeId") || "";
  const denied = await sheetAccess(req, id);
  if (denied) return denied;
  const from = req.nextUrl.searchParams.get("from") || "",
    to = req.nextUrl.searchParams.get("to") || "",
    scope = req.nextUrl.searchParams.get("scope") || "store";
  try {
    sheetDates(from, to);
  } catch (error) {
    return sheetJson(
      { error: error instanceof Error ? error.message : "Invalid dates" },
      400,
    );
  }
  try {
    const filter = `store_id=eq.${encodeURIComponent(id)}&date=gte.${from}&date=lte.${to}`;
    const [days, jobs] = await Promise.all([
      fetchAllRestRows(
        `/profit_sheet_days?${filter}&scope_id=eq.${encodeURIComponent(scope)}&select=*&order=date.asc`,
      ),
      fetchAllRestRows(
        `/profit_sheet_jobs?${filter}&select=store_id,date,status,error,updated_at,lease_until,retry_at&order=date.asc`,
      ),
    ]);
    return sheetJson({ days, jobs });
  } catch (error) {
    return sheetJson({ error: safeSheetError(error) }, 503);
  }
}
