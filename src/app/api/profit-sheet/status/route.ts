import { NextRequest } from "next/server";
import { sheetAccess, sheetJson, safeSheetError } from "@/app/api/lib/profit-sheet-access";
import { rest } from "@/app/api/lib/supabase-persistence";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("storeId") || "";
  const denied = await sheetAccess(req, storeId);
  if (denied) return denied;
  try {
    return sheetJson(await rest("/rpc/profit_sheet_sync_status", {
      method: "POST", body: JSON.stringify({ p_store: storeId }),
    }));
  } catch (error) {
    return sheetJson({ error: safeSheetError(error) }, 503);
  }
}
