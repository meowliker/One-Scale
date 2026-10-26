import { queueChangedAttributionDays } from "@/app/api/lib/profit-sheet-attribution-updates";
import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { rest } from "@/app/api/lib/supabase-persistence";
import {
  enqueueDays,
  claimDay,
  syncSheetDay,
} from "@/app/api/lib/profit-sheet-sync";
import { reportingDay } from "@/lib/profit-sheet/model";
import { addDays } from "@/lib/profit-sheet";
import { sheetJson } from "@/app/api/lib/profit-sheet-access";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization") || "";
  if (
    !expected ||
    Buffer.byteLength(provided) !== Buffer.byteLength(`Bearer ${expected}`) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(`Bearer ${expected}`))
  )
    return sheetJson({ error: "Unauthorized" }, 401);
  const day = reportingDay();
  // Queue all store-days twice an hour, preserving running leases. Also revisit the
  // previous day to capture late-arriving orders and Meta attribution adjustments.
  if (req.nextUrl.searchParams.get("enqueue") === "1") {
    const stores = await rest<Array<{ store_id: string }>>(
      "/profit_sheet_stores?select=store_id",
    );
    for (const store of stores)
      await enqueueDays(store.store_id, [addDays(day, -1), day]);
  }
  await queueChangedAttributionDays();
  const job = await claimDay();
  if (!job) return sheetJson({ ok: true, idle: true });
  return sheetJson(await syncSheetDay(job));
}
export const POST = GET;
