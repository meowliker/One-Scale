import { NextRequest, NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/auth/request-session";
import { listStoreIdsForWorkspace } from "./auth-users";
export const sheetJson = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function sheetAccess(
  request: NextRequest,
  storeId: string,
  write = false,
) {
  const session = await readSessionFromRequest(request);
  if (!session.authenticated)
    return sheetJson({ error: "Sign in to use Profit Sheet." }, 401);
  if (!storeId || !/^[\w-]+$/.test(storeId))
    return sheetJson({ error: "Select a valid store." }, 400);
  if (!session.legacy) {
    if (
      !session.workspaceId ||
      !(await listStoreIdsForWorkspace(session.workspaceId)).includes(storeId)
    )
      return sheetJson({ error: "Store access denied." }, 403);
    if (write && session.role === "viewer")
      return sheetJson(
        { error: "Viewers cannot change or sync this store." },
        403,
      );
  }
}
export function safeSheetError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/Missing Shopify connection|Shopify.*(?:401|403)/i.test(message))
    return "Shopify is disconnected, expired, or missing permission. Reconnect this store in Settings → Integrations, then refresh the day.";
  if (/Shopify.*404/i.test(message))
    return "Shopify could not find this store. Check its connection and store domain in Settings → Integrations.";
  if (/timed?\s*out|time budget exceeded|AbortError/i.test(message))
    return "The provider request timed out. Refresh this day to retry.";
  if (/Meta integration unavailable/.test(message))
    return "No usable Meta integration is saved for this store. In Settings → Integrations, reuse a saved ad-account token or connect Meta.";
  if (/190|OAuthException|expired.*token/i.test(message))
    return "Meta access token is expired or invalid. Update it in Manage ad accounts.";
  if (/rate.limit|429/i.test(message))
    return "Provider rate limit reached. Retry shortly.";
  if (/Settings changed/i.test(message))
    return "Settings changed during this request. Reload and retry.";
  return "Could not complete the operation. Check the store and ad account connections, then retry.";
}
