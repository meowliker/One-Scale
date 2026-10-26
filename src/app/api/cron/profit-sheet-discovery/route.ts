import {
  queueDiscovery,
  processDiscovery,
} from "@/app/api/lib/profit-sheet-discovery";
import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
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
  if (req.nextUrl.searchParams.get("enqueue") === "1") await queueDiscovery();
  return sheetJson(await processDiscovery());
}
export const POST = GET;
