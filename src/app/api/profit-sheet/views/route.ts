import { NextRequest } from "next/server";
import {
  sheetAccess,
  sheetJson,
  safeSheetError,
} from "@/app/api/lib/profit-sheet-access";
import { rest } from "@/app/api/lib/supabase-persistence";
import { loadConfig } from "@/app/api/lib/profit-sheet-repository";
import {
  emptyLayout,
  validateLayout,
  type SheetLayout,
} from "@/lib/profit-sheet/columns";
export const dynamic = "force-dynamic";
async function validScope(storeId: string, scope: string) {
  const config = await loadConfig(storeId);
  return scope === "store" || config.products.some((p) => p.id === scope);
}
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("storeId") || "",
    scope = req.nextUrl.searchParams.get("scope") || "store";
  const denied = await sheetAccess(req, id);
  if (denied) return denied;
  try {
    if (!(await validScope(id, scope)))
      return sheetJson({ error: "Unknown product." }, 400);
    const rows = await rest<
      Array<{
        columns: SheetLayout["columns"];
        views: SheetLayout["views"];
        active_view: string | null;
        revision: number;
      }>
    >(
      `/profit_sheet_layouts?store_id=eq.${encodeURIComponent(id)}&scope_id=eq.${encodeURIComponent(scope)}&select=columns,views,active_view,revision`,
    );
    const row = rows[0];
    return sheetJson(
      row
        ? {
            columns: row.columns,
            views: row.views,
            activeView: row.active_view,
            revision: row.revision,
          }
        : emptyLayout(scope),
    );
  } catch (e) {
    return sheetJson({ error: safeSheetError(e) }, 503);
  }
}
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null),
    id = typeof body?.storeId === "string" ? body.storeId : "",
    scope = typeof body?.scope === "string" ? body.scope : "store";
  const denied = await sheetAccess(req, id, true);
  if (denied) return denied;
  let layout: SheetLayout;
  try {
    layout = validateLayout(body?.layout, scope);
  } catch (e) {
    return sheetJson(
      { error: e instanceof Error ? e.message : "Invalid view." },
      400,
    );
  }
  try {
    if (!(await validScope(id, scope)))
      return sheetJson({ error: "Unknown product." }, 400);
    const revision = await rest<number>("/rpc/profit_sheet_save_layout", {
      method: "POST",
      body: JSON.stringify({
        p_store: id,
        p_scope: scope,
        p_revision: layout.revision,
        p_columns: layout.columns,
        p_views: layout.views,
        p_active: layout.activeView,
      }),
    });
    return sheetJson({ ...layout, revision });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Layout changed"))
      return sheetJson(
        {
          error:
            "This layout changed in another session. Reload saved settings before editing.",
        },
        409,
      );
    return sheetJson({ error: safeSheetError(e) }, 503);
  }
}
