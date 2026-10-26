import { NextRequest } from "next/server";
import {
  sheetAccess,
  sheetJson,
  safeSheetError,
} from "@/app/api/lib/profit-sheet-access";
import { loadConfig } from "@/app/api/lib/profit-sheet-repository";
import { connectedAccounts } from "@/app/api/lib/profit-sheet-meta-discovery";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("storeId") || "";
  const denied = await sheetAccess(req, id);
  if (denied) return denied;
  try {
    await loadConfig(id);
    return sheetJson(await connectedAccounts(id));
  } catch (e) {
    return sheetJson(
      {
        error: safeSheetError(e).replace(
          "Update it in Manage ad accounts.",
          "Reconnect Meta in Settings → Integrations, then refresh this list.",
        ),
      },
      502,
    );
  }
}
