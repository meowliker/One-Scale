import { NextRequest } from "next/server";
import {
  sheetAccess,
  sheetJson,
  safeSheetError,
} from "@/app/api/lib/profit-sheet-access";
import {
  loadConfig,
  publicConfig,
} from "@/app/api/lib/profit-sheet-repository";
import { rest } from "@/app/api/lib/supabase-persistence";
import { reportingDay, sheetDates } from "@/lib/profit-sheet/model";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("storeId") || "";
  const denied = await sheetAccess(req, id);
  if (denied) return denied;
  try {
    return sheetJson(publicConfig(await loadConfig(id)));
  } catch (error) {
    return sheetJson({ error: safeSheetError(error) }, 503);
  }
}
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = typeof body?.storeId === "string" ? body.storeId : "";
  const denied = await sheetAccess(req, id, true);
  if (denied) return denied;
  try {
    sheetDates(body.from, body.endToday ? reportingDay() : body.to);
    if (typeof body.endToday !== "boolean") throw new Error();
  } catch {
    return sheetJson(
      { error: "Choose a valid date range and end-date mode." },
      400,
    );
  }
  try {
    await loadConfig(id);
    await rest(`/profit_sheet_stores?store_id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        saved_from: body.from,
        saved_to: body.endToday ? null : body.to,
        end_today: body.endToday,
        updated_at: new Date().toISOString(),
      }),
    });
    return sheetJson(publicConfig(await loadConfig(id)));
  } catch (error) {
    return sheetJson({ error: safeSheetError(error) }, 503);
  }
}
