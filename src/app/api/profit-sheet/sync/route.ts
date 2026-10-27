import { NextRequest } from "next/server";
import {
  sheetAccess,
  sheetJson,
  safeSheetError,
} from "@/app/api/lib/profit-sheet-access";
import { loadConfig } from "@/app/api/lib/profit-sheet-repository";
import {
  enqueueDays,
  enqueueMissingDays,
  claimDay,
  syncSheetDay,
} from "@/app/api/lib/profit-sheet-sync";
import { sheetDates } from "@/lib/profit-sheet/model";
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = typeof body?.storeId === "string" ? body.storeId : "";
  const denied = await sheetAccess(req, id, true);
  if (denied) return denied;
  try {
    if (body.action === "queue") {
      let dates: string[];
      try {
        dates = sheetDates(body.from, body.to);
      } catch (error) {
        return sheetJson(
          { error: error instanceof Error ? error.message : "Invalid dates" },
          400,
        );
      }
      const config = await loadConfig(id);
      const scope = typeof body.scope === "string" ? body.scope : "store";
      if (scope !== "store" && !config.products.some((p) => p.id === scope))
        return sheetJson({ error: "Unknown product." }, 400);
      const queued =
        body.force === true
          ? (await enqueueDays(id, dates, true), dates.length)
          : await enqueueMissingDays(
              id,
              dates,
              scope,
              body.metaVersion === 1 ? 1 : 0,
              body.attributionVersion === 1 ? 1 : 0,
            );
      return sheetJson({ ok: true, queued });
    }
    if (body.date) {
      try {
        sheetDates(body.date, body.date);
      } catch {
        return sheetJson({ error: "Invalid reporting day." }, 400);
      }
    }
    const job = await claimDay(id, body.date);
    if (!job) return sheetJson({ ok: true, idle: true });
    return sheetJson(await syncSheetDay(job));
  } catch (error) {
    return sheetJson({ error: safeSheetError(error) }, 502);
  }
}
