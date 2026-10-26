import { NextRequest } from "next/server";
import {
  sheetAccess,
  sheetJson,
  safeSheetError,
} from "@/app/api/lib/profit-sheet-access";
import { loadConfig } from "@/app/api/lib/profit-sheet-repository";
import { fetchFromMeta } from "@/app/api/lib/meta-client";
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("storeId") || "";
  const denied = await sheetAccess(req, id);
  if (denied) return denied;
  try {
    const account = (await loadConfig(id)).accounts.find(
      (a) => a.adAccountId === req.nextUrl.searchParams.get("accountId"),
    );
    if (!account)
      return sheetJson({ error: "Select a saved ad account." }, 400);
    const after = req.nextUrl.searchParams.get("after");
    if (after && after.length > 4096)
      return sheetJson({ error: "Invalid cursor." }, 400);
    const result = await fetchFromMeta<{
      data: Array<{ id: string; name: string; status: string }>;
      paging?: { next?: string; cursors?: { after?: string } };
    }>(
      account.accessToken,
      `/${account.adAccountId}/campaigns`,
      { fields: "id,name,status", limit: "250", ...(after ? { after } : {}) },
      15000,
      0,
    );
    return sheetJson({
      campaigns: result.data,
      next: result.paging?.next ? result.paging.cursors?.after : null,
    });
  } catch (error) {
    return sheetJson({ error: safeSheetError(error) }, 502);
  }
}
