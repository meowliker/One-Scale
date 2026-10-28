import { kickProfitSheetDiscovery } from "@/app/api/lib/profit-sheet-kick";
import { getMetaToken } from "@/app/api/lib/tokens";
import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { readSessionFromRequest } from "@/lib/auth/request-session";
import { listStoreIdsForWorkspace } from "@/app/api/lib/auth-users";
import { fetchFromMeta } from "@/app/api/lib/meta-client";
import {
  loadSheetAccounts,
  publicSheetAccounts,
  saveSheetAccounts,
  type SavedSheetAccount,
} from "@/app/api/lib/profit-sheet-storage";
import {
  addDays,
  validateSchedule,
  validHour,
  type SheetRow,
} from "@/lib/profit-sheet";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers });
async function authorize(request: NextRequest, storeId: string, write = false) {
  const session = await readSessionFromRequest(request);
  if (!session.authenticated)
    return json({ error: "Sign in to load Profit Sheet data." }, 401);
  if (!storeId) return json({ error: "Select a store first." }, 400);
  if (!session.legacy) {
    const allowed = session.workspaceId
      ? await listStoreIdsForWorkspace(session.workspaceId)
      : [];
    if (!allowed.includes(storeId))
      return json({ error: "Store access denied." }, 403);
    if (write && session.role === "viewer")
      return json({ error: "Viewers cannot change ad accounts." }, 403);
  }
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/Settings changed/i.test(message))
    return json({ error: "Accounts or products changed while this window was open. Close it and reopen to load the latest settings." }, 409);
  const text = /190|expired|OAuthException/i.test(message)
    ? "The Meta token is invalid or expired. Update the account token and retry."
    : /rate.?limit|429/i.test(message)
      ? "Meta is rate limiting requests. Wait a moment and retry."
      : "Could not complete the request. Check the saved connection and that the token has ads_read access, then retry.";
  return json({ error: text }, 502);
}

export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get("storeId") || "";
    const denied = await authorize(request, storeId);
    if (denied) return denied;
    return json({
      accounts: publicSheetAccounts(await loadSheetAccounts(storeId)),
    });
  } catch {
    return json(
      { error: "Could not load this store’s saved ad accounts. Retry." },
      503,
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const storeId = typeof body?.storeId === "string" ? body.storeId : "";
    const denied = await authorize(request, storeId, true);
    if (denied) return denied;
    if (!Array.isArray(body.accounts) || body.accounts.length > 30)
      return json({ error: "Add up to 30 accounts per store." }, 400);
    const existing = await loadSheetAccounts(storeId);
    const saved: SavedSheetAccount[] = [];
    const ids = new Set<string>();
    const integrated = body.accounts.some(
      (a: { credentialSource?: string }) =>
        a?.credentialSource === "integration",
    )
      ? await getMetaToken(storeId)
      : null;
    // Validate every entry before calling Meta or persisting anything.
    for (const entry of body.accounts) {
      if (
        !entry ||
        typeof entry.adAccountId !== "string" ||
        !/^(act_)?\d+$/.test(entry.adAccountId.trim())
      )
        return json(
          { error: "Enter a numeric ad account ID (act_ is optional)." },
          400,
        );
      const id = `act_${entry.adAccountId.trim().replace(/^act_/, "")}`;
      if (ids.has(id))
        return json(
          { error: "Each ad account can only appear once per store." },
          400,
        );
      ids.add(id);
      const error = validateSchedule(entry);
      if (error) return json({ error }, 400);
      const previous = existing.find((a) => a.adAccountId === id);
      const token =
        entry.credentialSource === "integration"
          ? integrated?.accessToken
          : typeof entry.accessToken === "string" && entry.accessToken.trim()
            ? entry.accessToken.trim()
            : previous?.accessToken;
      if (!token || token.length > 4096)
        return json(
          { error: "Enter an access token for each new account." },
          400,
        );
      saved.push({
        adAccountId: id,
        credentialSource:
          entry.credentialSource === "integration" ? "integration" : "manual",
        accessToken: token,
        name: previous?.name || id,
        currency: previous?.currency || "",
        timezone: previous?.timezone || "",
        hasToken: true,
        active: entry.active,
        start: entry.start,
        end: entry.active ? "" : entry.end,
      });
    }
    // Bounded concurrency; the existing Meta client also limits provider requests.
    for (let i = 0; i < saved.length; i += 3) {
      await Promise.all(
        saved.slice(i, i + 3).map(async (account) => {
          const previous = existing.find(
            (a) => a.adAccountId === account.adAccountId,
          );
          if (
            previous?.accessToken === account.accessToken &&
            previous.timezone
          )
            return;
          const meta = await fetchFromMeta<{
            name: string;
            currency: string;
            timezone_name: string;
            business?: { id: string; name: string };
          }>(
            account.accessToken,
            `/${account.adAccountId}`,
            { fields: "name,currency,timezone_name,business{id,name}" },
            5000,
            0,
          );
          // Reject invalid provider timezones before saving a schedule.
          formatInTimeZone(new Date(), meta.timezone_name, "yyyy-MM-dd");
          account.business = meta.business;
          account.name = meta.name;
          account.currency = meta.currency;
          account.timezone = meta.timezone_name;
        }),
      );
    }
    await saveSheetAccounts(storeId, saved, body.version);
    kickProfitSheetDiscovery(storeId);
    return json({ accounts: publicSheetAccounts(saved) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const storeId = typeof body?.storeId === "string" ? body.storeId : "";
    const denied = await authorize(request, storeId);
    if (denied) return denied;
    const account = (await loadSheetAccounts(storeId)).find(
      (a) => a.adAccountId === body?.adAccountId,
    );
    if (!account)
      return json(
        { error: "Save this ad account for the selected store first." },
        400,
      );
    const now = new Date();
    const nowLocal = formatInTimeZone(
      now,
      account.timezone,
      "yyyy-MM-dd'T'HH:mm:ss",
    );
    let end = account.active || account.end > nowLocal ? nowLocal : account.end;
    if (body.to !== undefined) {
      if (!validHour(`${body.to}T00:00`))
        return json({ error: "Invalid report end date." }, 400);
      const requestedEnd = `${addDays(body.to, 1)}T00:00`;
      if (requestedEnd < end) end = requestedEnd;
    }
    const reportingTimezone =
      typeof body.timezone === "string" ? body.timezone : account.timezone;
    try {
      formatInTimeZone(now, reportingTimezone, "yyyy-MM-dd");
    } catch {
      return json({ error: "Invalid reporting timezone." }, 400);
    }
    const from = body.from ?? account.start.slice(0, 10);
    if (
      !validHour(`${from}T00:00`) ||
      from < account.start.slice(0, 10) ||
      (body.after !== undefined &&
        (typeof body.after !== "string" || body.after.length > 4096))
    )
      return json({ error: "Invalid report cursor." }, 400);
    const publicAccount = publicSheetAccounts([account])[0];
    if (account.start >= end || from > end.slice(0, 10))
      return json({
        account: publicAccount,
        rows: [],
        fetchedAt: now.toISOString(),
        nextFrom: null,
        after: null,
      });
    const until = [addDays(from, 6), end.slice(0, 10)].sort()[0];
    type Insight = {
      date_start: string;
      spend?: string;
      clicks?: string;
      impressions?: string;
      inline_link_clicks?: string;
      actions?: Array<{ action_type: string; value: string }>;
      hourly_stats_aggregated_by_advertiser_time_zone: string;
    };
    const result = await fetchFromMeta<{
      data: Insight[];
      paging?: { next?: string; cursors?: { after?: string } };
    }>(
      account.accessToken,
      `/${account.adAccountId}/insights`,
      {
        fields:
          "date_start,spend,impressions,clicks,inline_link_clicks,actions",
        level: "account",
        time_increment: "1",
        limit: "1000",
        breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
        time_range: JSON.stringify({ since: from, until }),
        ...(body.after ? { after: body.after } : {}),
      },
      20_000,
      0,
    );
    const daily = new Map<string, SheetRow>();
    for (const row of result.data) {
      const hour =
        row.hourly_stats_aggregated_by_advertiser_time_zone?.match(
          /^(\d{2}):00/,
        );
      if (!hour) throw new Error("Missing hourly breakdown");
      const time = `${row.date_start}T${hour[1]}:00`;
      // End is exclusive; the current in-progress hour contains only Meta's reported activity so far.
      if (
        time < account.start ||
        time >= end ||
        row.date_start < from ||
        row.date_start > until
      )
        continue;
      const reportDate = formatInTimeZone(
        fromZonedTime(time, account.timezone),
        reportingTimezone,
        "yyyy-MM-dd",
      );
      const totals = daily.get(reportDate) || {
        date: reportDate,
        spend: 0,
        clicks: 0,
        impressions: 0,
        purchases: 0,
        linkClicks: 0,
      };
      totals.spend += Number(row.spend || 0);
      totals.clicks += Number(row.clicks || 0);
      totals.impressions += Number(row.impressions || 0);
      const purchases =
        row.actions?.find((a) => a.action_type === "purchase") ??
        row.actions?.find((a) => a.action_type === "omni_purchase") ??
        row.actions?.find(
          (a) => a.action_type === "offsite_conversion.fb_pixel_purchase",
        );
      totals.purchases =
        (totals.purchases || 0) + Number(purchases?.value || 0);
      totals.linkClicks =
        (totals.linkClicks || 0) + Number(row.inline_link_clicks || 0);
      daily.set(reportDate, totals);
    }
    const after = result.paging?.next ? result.paging.cursors?.after : null;
    if (result.paging?.next && (!after || after === body.after))
      throw new Error("Incomplete pagination");
    return json({
      account: publicAccount,
      rows: [...daily.values()],
      fetchedAt: now.toISOString(),
      after: after || null,
      nextFrom: until < end.slice(0, 10) ? addDays(until, 1) : null,
    });
  } catch (error) {
    return failure(error);
  }
}
