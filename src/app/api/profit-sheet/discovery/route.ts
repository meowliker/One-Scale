import { loadExclusions } from "@/app/api/lib/profit-sheet-exclusions";
import { NextRequest } from "next/server";
import {
  sheetAccess,
  sheetJson,
  safeSheetError,
} from "@/app/api/lib/profit-sheet-access";
import { rest } from "@/app/api/lib/supabase-persistence";
import {
  queueDiscovery,
  processDiscovery,
} from "@/app/api/lib/profit-sheet-discovery";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("storeId") || "";
  const denied = await sheetAccess(req, id);
  if (denied) return denied;
  try {
    const [jobs, exclusions] = await Promise.all([
      rest<unknown[]>(
        `/profit_sheet_discovery?store_id=eq.${encodeURIComponent(id)}&select=status,checked_at,error,report,retry_at`,
      ),
      loadExclusions(id),
    ]);
    return sheetJson({ job: jobs[0] || null, exclusions });
  } catch (e) {
    return sheetJson({ error: safeSheetError(e) }, 502);
  }
}
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = typeof body?.storeId === "string" ? body.storeId : "";
  const denied = await sheetAccess(req, id, true);
  if (denied) return denied;
  try {
    await queueDiscovery(id);
    return sheetJson(await processDiscovery(id));
  } catch (e) {
    return sheetJson({ error: safeSheetError(e) }, 502);
  }
}
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = typeof body?.storeId === "string" ? body.storeId : "";
  const denied = await sheetAccess(req, id, true);
  if (denied) return denied;
  if (typeof body?.key !== "string" || body.key.length > 300)
    return sheetJson({ error: "Invalid exclusion" }, 400);
  try {
    await rest(
      `/profit_sheet_exclusions?store_id=eq.${encodeURIComponent(id)}&key=eq.${encodeURIComponent(body.key)}`,
      { method: "DELETE" },
    );
    await queueDiscovery(id);
    return sheetJson({ ok: true });
  } catch (e) {
    return sheetJson({ error: safeSheetError(e) }, 502);
  }
}
