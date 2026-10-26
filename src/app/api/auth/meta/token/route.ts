import { NextRequest } from "next/server";
import { sheetAccess, sheetJson } from "@/app/api/lib/profit-sheet-access";
import { getMetaConnectionHealth } from "@/app/api/lib/tokens";
import {
  checkMetaConnection,
  restoreSavedMetaToken,
  saveVerifiedMetaToken,
} from "@/app/api/lib/meta-connection-health";
import { MetaTokenError } from "@/app/api/lib/meta-token";
import { rest } from "@/app/api/lib/supabase-persistence";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("storeId") || "";
  const denied = await sheetAccess(req, id);
  if (denied) return denied;
  try {
    const [{ health }, saved] = await Promise.all([
      getMetaConnectionHealth(id),
      rest<Array<{ account_id: string; details: { name?: string } }>>(
        `/profit_sheet_accounts?store_id=eq.${encodeURIComponent(id)}&select=account_id,details`,
      ),
    ]);
    return sheetJson({
      health,
      savedAccounts: saved.map((a) => ({
        id: a.account_id,
        name: a.details.name || a.account_id,
      })),
    });
  } catch {
    return sheetJson(
      { error: "Could not read saved Meta connection. Retry shortly." },
      503,
    );
  }
}
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = typeof body?.storeId === "string" ? body.storeId : "";
  const denied = await sheetAccess(req, id, true);
  if (denied) return denied;
  try {
    if (body.action === "check")
      return sheetJson({ health: await checkMetaConnection(id) });
    if (
      body.action === "restore" &&
      typeof body.accountId === "string" &&
      /^act_\d+$/.test(body.accountId)
    )
      return sheetJson({
        health: await restoreSavedMetaToken(id, body.accountId),
      });
    if (
      body.action === "save" &&
      typeof body.token === "string" &&
      body.token.trim().length > 20 &&
      body.token.length <= 4096
    )
      return sheetJson({
        health: await saveVerifiedMetaToken(id, body.token.trim()),
      });
    return sheetJson(
      { error: "Choose a saved account or enter a valid Meta access token." },
      400,
    );
  } catch (e) {
    return sheetJson(
      {
        error:
          e instanceof MetaTokenError
            ? e.message
            : "Could not save the connection to Supabase. Your existing saved connection is unchanged.",
      },
      e instanceof MetaTokenError && e.code !== "unavailable" ? 400 : 503,
    );
  }
}
