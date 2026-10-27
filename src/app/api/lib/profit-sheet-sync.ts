import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { rest } from "./supabase-persistence";
import { loadConfig } from "./profit-sheet-repository";
import { fetchFromShopify } from "./shopify-client";
import { getShopifyToken } from "./tokens";
import { fetchFromMeta, MetaRateLimitError } from "./meta-client";
import { safeSheetError } from "./profit-sheet-access";
import { dayWindow, type SheetJob } from "@/lib/profit-sheet/model";
import {
  aggregateOrders,
  attachAds,
  hourWeight,
  type OrderInput,
  type CampaignMetric,
} from "@/lib/profit-sheet/aggregate";
import { syncFinance } from "./profit-sheet-finance";
import type { SavedSheetAccount } from "./profit-sheet-storage";
import { loadMetaCatalog, loadOrderEvidence } from "./profit-sheet-attribution";
import {
  buildAttribution,
  attributedRevenue,
  type AttributionSnapshot,
} from "@/lib/profit-sheet/attribution";
const enc = encodeURIComponent;
export async function enqueueDays(
  storeId: string,
  dates: string[],
  manual = false,
) {
  await rest("/rpc/profit_sheet_enqueue_requested", {
    method: "POST",
    body: JSON.stringify({ p_store: storeId, p_dates: dates, p_manual: manual }),
  });
}
export async function enqueueMissingDays(
  storeId: string,
  dates: string[],
  scope: string,
  metaVersion = 0,
  attributionVersion = 0,
) {
  return rest<number>("/rpc/profit_sheet_enqueue_missing", {
    method: "POST",
    body: JSON.stringify({
      p_store: storeId,
      p_dates: dates,
      p_scope: scope,
      p_finance_version: scope === "store" ? 1 : 0,
      p_meta_version: metaVersion,
      p_attribution_version: attributionVersion,
    }),
  });
}
export async function claimDay(storeId?: string, date?: string) {
  return (
    await rest<SheetJob[]>("/rpc/profit_sheet_claim", {
      method: "POST",
      body: JSON.stringify({ p_store: storeId || null, p_date: date || null }),
    })
  )[0];
}
async function metaDay(
  account: SavedSheetAccount,
  start: number,
  end: number,
  now: number,
  deadline: number,
) {
  const scheduleStart = fromZonedTime(
    account.start,
    account.timezone,
  ).getTime();
  const scheduleEnd = account.active
    ? now
    : fromZonedTime(account.end, account.timezone).getTime();
  start = Math.max(start, scheduleStart);
  end = Math.min(end, scheduleEnd, now);
  if (start >= end)
    return { metrics: [] as CampaignMetric[], estimated: false };
  let after: string | undefined;
  const seen = new Set<string>();
  const metrics: CampaignMetric[] = [];
  let estimated = false;
  type Insight = {
    date_start: string;
    campaign_id: string;
    ad_id?: string;
    spend?: string;
    clicks?: string;
    impressions?: string;
    action_values?: Array<{ action_type: string; value: string }>;
    inline_link_clicks?: string;
    actions?: Array<{ action_type: string; value: string }>;
    hourly_stats_aggregated_by_advertiser_time_zone: string;
  };
  for (let page = 0; page < 100; page++) {
    if (Date.now() > deadline) throw new Error("Sync time budget exceeded");
    const result = await fetchFromMeta<{
      data: Insight[];
      paging?: { next?: string; cursors?: { after?: string } };
    }>(
      account.accessToken,
      `/${account.adAccountId}/insights`,
      {
        fields:
          "date_start,campaign_id,ad_id,spend,clicks,impressions,inline_link_clicks,actions,action_values",
        level: "ad",
        time_increment: "1",
        breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
        limit: "500",
        time_range: JSON.stringify({
          since: formatInTimeZone(start, account.timezone, "yyyy-MM-dd"),
          until: formatInTimeZone(end - 1, account.timezone, "yyyy-MM-dd"),
        }),
        ...(after ? { after } : {}),
      },
      12000,
      0,
    );
    for (const row of result.data) {
      const hour =
        row.hourly_stats_aggregated_by_advertiser_time_zone?.match(
          /^(\d{2}):00/,
        );
      if (!hour) throw new Error("Missing hourly breakdown");
      const timestamp = fromZonedTime(
        `${row.date_start}T${hour[1]}:00:00`,
        account.timezone,
      ).getTime();
      const weight = hourWeight(timestamp, start, end, now);
      if (!weight) continue;
      if (weight < 0.999999) estimated = true;
      const purchase =
        row.actions?.find((a) => a.action_type === "purchase") ??
        row.actions?.find((a) => a.action_type === "omni_purchase") ??
        row.actions?.find(
          (a) => a.action_type === "offsite_conversion.fb_pixel_purchase",
        );
      const action = (types: string[], values = row.actions) => {
        const item = types
          .map((type) => values?.find((v) => v.action_type === type))
          .find(Boolean);
        return Number(item?.value || 0) * weight;
      };
      metrics.push({
        accountId: account.adAccountId,
        campaignId: row.campaign_id,
        adId: row.ad_id,
        spend: Number(row.spend || 0) * weight,
        impressions: Number(row.impressions || 0) * weight,
        purchaseValue: action(
          ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"],
          row.action_values || [],
        ),
        addToCart: action([
          "add_to_cart",
          "omni_add_to_cart",
          "offsite_conversion.fb_pixel_add_to_cart",
        ]),
        checkouts: action([
          "initiate_checkout",
          "omni_initiated_checkout",
          "offsite_conversion.fb_pixel_initiate_checkout",
        ]),
        landingViews: action(["landing_page_view"]),
        clicks: Number(row.clicks || 0) * weight,
        linkClicks: Number(row.inline_link_clicks || 0) * weight,
        purchases: Number(purchase?.value || 0) * weight,
      });
    }
    if (!result.paging?.next) return { metrics, estimated };
    after = result.paging.cursors?.after;
    if (!after || seen.has(after))
      throw new Error("Incomplete Meta pagination");
    seen.add(after);
  }
  throw new Error("Meta report exceeded pagination limit");
}
async function deferDay(job: SheetJob, retryAt: number) {
  await rest(`/profit_sheet_jobs?store_id=eq.${enc(job.store_id)}&date=eq.${job.date}&lease_id=eq.${job.lease_id}`, {
    method: "PATCH", body: JSON.stringify({ status: "queued", retry_at: new Date(retryAt).toISOString(),
      error: "Meta sync is scheduled automatically. Saved figures remain available.", lease_until: null, updated_at: new Date().toISOString() }),
  });
  return { ok: true, deferred: true, date: job.date, retryAt: new Date(retryAt).toISOString() };
}
export async function syncSheetDay(job: SheetJob) {
  const deadline = Date.now() + 235000;
  try {
    const config = await loadConfig(job.store_id);
    const token = await getShopifyToken(job.store_id);
    if (!token?.shopDomain) throw new Error("Missing Shopify connection");
    const { shop } = await fetchFromShopify<{ shop: { currency: string } }>(
      token.accessToken,
      token.shopDomain,
      "/shop.json",
      { fields: "currency" },
    );
    const currency = shop.currency;
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid currency");
    const window = dayWindow(job.date);
    const start = Date.parse(window.start);
    const now = Date.now();
    const end = Math.min(Date.parse(window.end), now);
    const orders: OrderInput[] = [];
    let since: string | undefined;
    const seen = new Set<string>();
    if (start < end)
      for (let page = 0; page < 100; page++) {
        if (Date.now() > deadline) throw new Error("Sync time budget exceeded");
        const result = await fetchFromShopify<{ orders: OrderInput[] }>(
          token.accessToken,
          token.shopDomain,
          "/orders.json",
          {
            status: "any",
            limit: "250",
            created_at_min: window.start,
            created_at_max: new Date(end - 1).toISOString(),
            fields:
              "id,name,total_price,current_total_price,currency,financial_status,test,cancelled_at,line_items",
            ...(since ? { since_id: since } : {}),
          },
        );
        for (const o of result.orders) {
          if (seen.has(String(o.id)))
            throw new Error("Duplicate order pagination");
          seen.add(String(o.id));
          orders.push(o);
        }
        if (result.orders.length < 250) break;
        since = String(result.orders.at(-1)!.id);
        if (page === 99)
          throw new Error("Order report exceeded pagination limit");
      }
    if (orders.some((o) => o.currency !== currency))
      throw new Error("Order currency does not match store currency");
    const fees = new Map<string, number>();
    let estimatedFees = false;
    // Use exact saved payment fees where present; otherwise retain the app's explicit estimate.
    for (let i = 0; i < orders.length; i += 100) {
      const ids = orders.slice(i, i + 100).map((o) => String(o.id));
      const feeRows = await rest<
        Array<{ source_order_id: string; fee: number; transaction_id: string }>
      >(
        `/shopify_balance_transactions?store_id=eq.${enc(job.store_id)}&source_order_id=in.(${ids.join(",")})&type=eq.charge&select=source_order_id,fee,transaction_id`,
      );
      for (const row of feeRows)
        if (!row.transaction_id.startsWith("synth_"))
          fees.set(
            String(row.source_order_id),
            (fees.get(String(row.source_order_id)) || 0) +
              Math.abs(Number(row.fee)),
          );
    }
    for (const order of orders)
      if (!fees.has(String(order.id))) {
        fees.set(String(order.id), Number(order.total_price) * 0.029 + 0.3);
        estimatedFees = true;
      }
    const rows = aggregateOrders(job.date, orders, config.products, fees, 0);
    const warnings: string[] = [];
    const errors: string[] = [];
    const metrics: CampaignMetric[] = [];
    let adsComplete = true;
    let retryAt = 0;
    const store = rows.get("store")!;
    // Older cached reports lack these fields. Mark the new format even on a
    // provider error, so navigation does not create an automatic retry loop.
    store.financeVersion = 1;
    store.refunds =
      store.chargebackLoss =
      store.chargebackWon =
      store.adjustment =
        null;
    store.shopifyFees = null;
    try {
      Object.assign(
        store,
        await syncFinance(
          job.store_id,
          { accessToken: token.accessToken, shopDomain: token.shopDomain },
          start,
          end,
          currency,
          deadline,
        ),
      );
    } catch (error) {
      errors.push(
        `Shopify Payments financial details could not be updated: ${safeSheetError(error)}`,
      );
    }
    warnings.push(
      "Total Revenue is order value before refunds (including shipping and tax). Shopify fees, refunds, chargeback debits/credits and signed adjustments use the Shopify Payments processing date. Chargeback loss is the debit when funds leave; chargeback won is the credit when returned. Payout transfers and reserves are excluded. Other payment gateways and Shopify subscription invoices are not included in financial movements.",
    );
    if (estimatedFees)
      warnings.push(
        "Product-tab Shopify fees include estimates of 2.9% + 0.30 where exact payment fees are unavailable; complete-store fees use the payment ledger.",
      );
    if (!config.accounts.length)
      warnings.push("No Meta accounts configured; ad metrics are unavailable.");
    for (let i = 0; i < config.accounts.length; i += 3)
      await Promise.all(
        config.accounts.slice(i, i + 3).map(async (account) => {
          try {
            if (account.currency !== currency)
              throw new Error("Currency mismatch");
            const result = await metaDay(account, start, end, now, deadline);
            metrics.push(...result.metrics);
            if (result.estimated)
              warnings.push(
                `${account.name}: partial boundary hours are prorated from Meta hourly reports.`,
              );
          } catch (error) {
            adsComplete = false;
            if (error instanceof MetaRateLimitError) retryAt = Math.max(retryAt, Date.now() + error.retryAfterMs);
            errors.push(
              `${account.name}: ${account.currency !== currency ? "Account currency differs from store currency." : safeSheetError(error)}`,
            );
          }
        }),
      );
    attachAds(
      rows,
      config.products,
      metrics,
      adsComplete,
      config.accounts.length > 0,
    );
    let attribution: AttributionSnapshot;
    try {
      if (!adsComplete) throw new Error("Meta insights incomplete");
      const evidence = await loadOrderEvidence(job.store_id, orders, deadline);
      const catalog = [];
      for (const account of config.accounts)
        catalog.push(
          ...(await loadMetaCatalog(job.store_id, account, deadline)),
        );
      attribution = buildAttribution(
        job.date,
        orders,
        evidence,
        catalog,
        config.products,
        metrics,
      );
    } catch (error) {
      if (error instanceof MetaRateLimitError) retryAt = Math.max(retryAt, Date.now() + error.retryAfterMs);
      const message = `Order attribution could not be updated: ${safeSheetError(error)}`;
      errors.push(message);
      attribution = {
        version: 1,
        status: "error",
        error: message,
        orders: [],
        campaigns: [],
        products: config.products,
      };
    }
    for (const [scope, row] of rows) {
      row.attributionVersion = 1;
      row.attributedRevenue = attributedRevenue(attribution, scope);
    }
    warnings.push(
      "Shopify ROAS uses order revenue matched to Meta campaigns through recorded UTMs, divided by the selected scope’s Meta spend. Each order gets one campaign credit. Last-visit UTMs take precedence, then saved Upsell Genie UTMs, then a guarded first-visit fallback. No fixed click window is assumed. Unmatched sales remain in Total Revenue. Meta and Shopify use different attribution timing.",
    );
    const payload = [...rows].map(([scopeId, metrics]) => ({
      scopeId,
      metrics,
      warnings: [
        ...warnings,
        ...errors,
        ...(scopeId !== "store" &&
        !config.products.find((p) => p.id === scopeId)?.assignments.length
          ? ["No ad account assigned to this product."]
          : []),
      ],
    }));
    if (retryAt) {
      // Preserve complete saved figures during cooldown. On the very first sync,
      // still publish Shopify data with unavailable Meta fields before retrying.
      const saved = await rest<Array<{ date: string }>>(`/profit_sheet_days?store_id=eq.${enc(job.store_id)}&date=eq.${job.date}&scope_id=eq.store&select=date&limit=1`);
      if (saved.length) return deferDay(job, retryAt);
    }
    await rest("/rpc/profit_sheet_publish_attribution", {
      method: "POST",
      body: JSON.stringify({
        p_store: job.store_id,
        p_date: job.date,
        p_lease: job.lease_id,
        p_version: config.version,
        p_currency: currency,
        p_rows: payload,
        p_attribution: attribution,
      }),
    });
    if (retryAt) return deferDay(job, retryAt);
    if (errors.length)
      await rest(
        `/profit_sheet_jobs?store_id=eq.${enc(job.store_id)}&date=eq.${job.date}&lease_id=eq.${job.lease_id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "error",
            error: errors.join(" "),
            updated_at: new Date().toISOString(),
          }),
        },
      );
    return {
      ok: !errors.length,
      date: job.date,
      error: errors.join(" ") || null,
    };
  } catch (error) {
    const changed = /Settings changed|Sync lease expired/i.test(String(error));
    const message = safeSheetError(error);
    await rest(
      `/profit_sheet_jobs?store_id=eq.${enc(job.store_id)}&date=eq.${job.date}&lease_id=eq.${job.lease_id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: changed ? "queued" : "error",
          error: changed ? null : message,
          retry_at: changed ? new Date(Date.now() + 5000).toISOString() : null,
          lease_until: null,
          updated_at: new Date().toISOString(),
        }),
      },
    ).catch(() => {});
    return changed ? { ok: true, queued: true, date: job.date } : { ok: false, date: job.date, error: message };
  }
}
