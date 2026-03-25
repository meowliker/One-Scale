import { NextRequest, NextResponse } from 'next/server';
import type { DateRangePreset } from '@/types/analytics';
import type { Campaign } from '@/types/campaign';
import { DEFAULT_TIMEZONE, formatDateInTimezone, getDateRangeInTimezone } from '@/lib/timezone';
import { shopifyDateToStoreDate } from '@/lib/timezone';
import { fromZonedTime } from 'date-fns-tz';
import { readSessionFromRequest } from '@/lib/auth/request-session';
import { listStoreIdsForWorkspace } from '@/app/api/lib/auth-users';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaCampaigns, fetchMetaInsights, mapInsightsToMetrics } from '@/app/api/lib/meta-client';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchBalanceTransactions, fetchShopifyOrders } from '@/app/api/lib/shopify-client';
import {
  getAllStores,
  getCachedPnLDays,
  getMetaEndpointSnapshot,
  getPnlStoreSettings,
  getPnlCacheLastSynced,
} from '@/app/api/lib/db';
import {
  getPersistentCachedPnLDays,
  getPersistentPnlStoreSettings,
  getPersistentPnlCacheLastSynced,
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import {
  getPersistentMetaEndpointSnapshot,
} from '@/app/api/lib/supabase-tracking';

interface StoreOverviewRow {
  storeId: string;
  storeName: string;
  domain: string;
  productType: 'physical' | 'digital';
  revenue: number;
  adSpend: number;
  cogs: number;
  fees: number;
  shipping: number;
  refunds: number;
  fullRefundAmount: number;
  partialRefundAmount: number;
  netProfit: number;
  margin: number;
  roas: number;
  aov: number;
  orders: number;
  cpc: number;
  cpm: number;
  clicks: number;
  impressions: number;
  lastSyncedAt: string | null;
}

interface StoreOverviewResponse {
  preset: DateRangePreset;
  since: string;
  until: string;
  stores: StoreOverviewRow[];
  totals: Omit<StoreOverviewRow, 'storeId' | 'storeName' | 'domain' | 'lastSyncedAt' | 'productType'>;
  generatedAt: string;
}

interface InsightTotals {
  spend: number;
  clicks: number;
  impressions: number;
}

function toMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function toRate(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 10000) / 10000;
}

function buildScopeId(accountIds: string[]): string {
  const sorted = [...new Set(accountIds)].filter(Boolean).sort();
  return `accounts:${sorted.join(',')}`;
}

function sumCampaignTraffic(campaigns: Campaign[]): { clicks: number; impressions: number } {
  let clicks = 0;
  let impressions = 0;
  for (const campaign of campaigns) {
    clicks += campaign.metrics?.clicks || 0;
    impressions += campaign.metrics?.impressions || 0;
  }
  return { clicks, impressions };
}

function parsePreset(value: string | null): DateRangePreset {
  const allowed: DateRangePreset[] = ['today', 'yesterday', 'last3', 'last7', 'last7today', 'last14', 'last28', 'last30', 'thisMonth', 'lastMonth'];
  if (!value) return 'today';
  return allowed.includes(value as DateRangePreset) ? (value as DateRangePreset) : 'today';
}

function mapPresetToMeta(preset: DateRangePreset): string {
  switch (preset) {
    case 'today': return 'today';
    case 'yesterday': return 'yesterday';
    case 'last3': return 'last_3d';
    case 'last7': return 'last_7d';
    case 'last7today': return 'last_7d';
    case 'last14': return 'last_14d';
    case 'last28': return 'last_28d';
    case 'last30': return 'last_30d';
    case 'thisMonth': return 'this_month';
    case 'lastMonth': return 'last_month';
    default: return 'last_30d';
  }
}

async function fetchInsightTotalsForStore(
  storeId: string,
  accountIds: string[],
  metaPreset: string,
  since: string,
  until: string
): Promise<InsightTotals> {
  if (accountIds.length === 0) return { spend: 0, clicks: 0, impressions: 0 };
  const token = await getMetaToken(storeId);
  if (!token) return { spend: 0, clicks: 0, impressions: 0 };

  const allInsights = await Promise.all(
    accountIds.map((id) => fetchMetaInsights(token.accessToken, id, metaPreset).catch(() => []))
  );

  return allInsights.flat().reduce<InsightTotals>((acc, day) => {
    if (day.date_start < since || day.date_start > until) return acc;
    const m = mapInsightsToMetrics(day);
    acc.spend += m.spend || 0;
    acc.clicks += m.clicks || 0;
    acc.impressions += m.impressions || 0;
    return acc;
  }, { spend: 0, clicks: 0, impressions: 0 });
}

function resolveStoreTimezone(store: { adAccounts?: Array<{ is_active?: number | boolean; timezone?: string | null }> }): string {
  const active = (store.adAccounts || []).find((a) => Number(a.is_active) === 1 && a.timezone);
  if (active?.timezone) return active.timezone;
  const first = (store.adAccounts || []).find((a) => a.timezone);
  return first?.timezone || DEFAULT_TIMEZONE;
}

async function fetchShopifyTopline(
  storeId: string,
  since: string,
  until: string,
  timezone: string
): Promise<{ revenue: number; orders: number }> {
  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token?.shopDomain) return { revenue: 0, orders: 0 };

  const createdAtMin = fromZonedTime(`${since}T00:00:00`, timezone).toISOString();
  const createdAtMax = fromZonedTime(`${until}T23:59:59`, timezone).toISOString();
  let sinceId = '0';
  let totalRevenue = 0;
  let totalOrders = 0;
  let pagesLeft = 40; // 10,000 orders max per request window

  while (pagesLeft > 0) {
    const orders = await fetchShopifyOrders(token.accessToken, token.shopDomain, {
      status: 'any',
      limit: 250,
      sinceId,
      createdAtMin,
      createdAtMax,
    });

    if (orders.length === 0) break;

    for (const order of orders) {
      // Match P&L logic: exclude fully refunded orders from revenue.
      if (order.financialStatus !== 'refunded') {
        totalRevenue += parseFloat(order.totalPrice || '0');
      }
      totalOrders += 1;
    }

    if (orders.length < 250) break;
    sinceId = String(orders[orders.length - 1].id);
    pagesLeft -= 1;
  }

  return { revenue: totalRevenue, orders: totalOrders };
}

interface ShopifyCostTotals {
  fees: number;
  refunds: number;
  fullRefundAmount: number;
  partialRefundAmount: number;
}

async function fetchShopifyCosts(
  storeId: string,
  since: string,
  until: string,
  timezone: string
): Promise<ShopifyCostTotals> {
  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token?.shopDomain) {
    return { fees: 0, refunds: 0, fullRefundAmount: 0, partialRefundAmount: 0 };
  }

  const startUtc = fromZonedTime(`${since}T00:00:00`, timezone);
  const endUtc = fromZonedTime(`${until}T23:59:59`, timezone);

  // 1) Orders in selected window for fee attribution
  let sinceId = '0';
  let pagesLeft = 40;
  const allWindowOrders: Awaited<ReturnType<typeof fetchShopifyOrders>> = [];
  while (pagesLeft > 0) {
    const orders = await fetchShopifyOrders(token.accessToken, token.shopDomain, {
      status: 'any',
      limit: 250,
      sinceId,
      createdAtMin: startUtc.toISOString(),
      createdAtMax: endUtc.toISOString(),
    });
    if (orders.length === 0) break;
    allWindowOrders.push(...orders);
    if (orders.length < 250) break;
    sinceId = String(orders[orders.length - 1].id);
    pagesLeft -= 1;
  }

  // 2) Older refunded orders updated inside window (captures refund-date-based totals)
  const refundedMap = new Map<number, (typeof allWindowOrders)[number]>();
  for (const o of allWindowOrders) refundedMap.set(o.id, o);

  let refundSinceId = '0';
  let refundPagesLeft = 20;
  while (refundPagesLeft > 0) {
    const olderRefunded = await fetchShopifyOrders(token.accessToken, token.shopDomain, {
      status: 'any',
      financialStatus: 'refunded',
      limit: 250,
      sinceId: refundSinceId,
      createdAtMax: startUtc.toISOString(),
      updatedAtMin: startUtc.toISOString(),
      updatedAtMax: endUtc.toISOString(),
    });
    if (olderRefunded.length === 0) break;
    for (const order of olderRefunded) refundedMap.set(order.id, order);
    if (olderRefunded.length < 250) break;
    refundSinceId = String(olderRefunded[olderRefunded.length - 1].id);
    refundPagesLeft -= 1;
  }

  refundSinceId = '0';
  refundPagesLeft = 20;
  while (refundPagesLeft > 0) {
    const olderPartials = await fetchShopifyOrders(token.accessToken, token.shopDomain, {
      status: 'any',
      financialStatus: 'partially_refunded',
      limit: 250,
      sinceId: refundSinceId,
      createdAtMax: startUtc.toISOString(),
      updatedAtMin: startUtc.toISOString(),
      updatedAtMax: endUtc.toISOString(),
    });
    if (olderPartials.length === 0) break;
    for (const order of olderPartials) refundedMap.set(order.id, order);
    if (olderPartials.length < 250) break;
    refundSinceId = String(olderPartials[olderPartials.length - 1].id);
    refundPagesLeft -= 1;
  }

  // 3) Real payment fees by order id (fallback: 3%)
  const feesByOrderId = new Map<number, number>();
  try {
    let lastId: string | undefined;
    let txnPagesLeft = 8;
    let reachedOld = false;
    while (txnPagesLeft > 0 && !reachedOld) {
      const txns = await fetchBalanceTransactions(token.accessToken, token.shopDomain, {
        limit: 250,
        lastId,
      });
      if (txns.length === 0) break;
      for (const tx of txns) {
        if (tx.type !== 'charge' || !tx.sourceOrderId) continue;
        const txDate = shopifyDateToStoreDate(tx.processedAt, timezone);
        if (txDate < since) {
          reachedOld = true;
          continue;
        }
        if (txDate > until) continue;
        const fee = Math.max(parseFloat(tx.fee || '0'), 0);
        feesByOrderId.set(tx.sourceOrderId, (feesByOrderId.get(tx.sourceOrderId) || 0) + fee);
      }
      if (txns.length < 250) break;
      lastId = String(txns[txns.length - 1].id);
      txnPagesLeft -= 1;
    }
  } catch {
    // If Shopify Payments scope is unavailable, fallback math below is used.
  }

  let fees = 0;
  for (const order of allWindowOrders) {
    if (order.financialStatus === 'refunded') continue;
    if (feesByOrderId.has(order.id)) {
      fees += feesByOrderId.get(order.id) || 0;
      continue;
    }
    fees += parseFloat(order.totalPrice || '0') * 0.03;
  }

  let refunds = 0;
  let fullRefundAmount = 0;
  let partialRefundAmount = 0;
  for (const order of refundedMap.values()) {
    if (!order.refunds || order.refunds.length === 0) continue;
    for (const refund of order.refunds) {
      if (!refund.totalAmount || refund.totalAmount <= 0) continue;
      const refundDate = shopifyDateToStoreDate(refund.createdAt, timezone);
      if (refundDate < since || refundDate > until) continue;
      refunds += refund.totalAmount;
      if (order.financialStatus === 'refunded') {
        fullRefundAmount += refund.totalAmount;
      } else {
        partialRefundAmount += refund.totalAmount;
      }
    }
  }

  return { fees, refunds, fullRefundAmount, partialRefundAmount };
}

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const preset = parsePreset(searchParams.get('preset'));
    const displayRange = getDateRangeInTimezone(preset, DEFAULT_TIMEZONE);
    const since = formatDateInTimezone(displayRange.start, DEFAULT_TIMEZONE);
    const until = formatDateInTimezone(displayRange.end, DEFAULT_TIMEZONE);

    const useSupabase = isSupabasePersistenceEnabled();
    const allStores = useSupabase ? await listPersistentStores() : getAllStores();

    const allowedStoreIds = !session.legacy && session.workspaceId
      ? new Set(await listStoreIdsForWorkspace(session.workspaceId))
      : null;

    const visibleStores = allowedStoreIds
      ? allStores.filter((store) => allowedStoreIds.has(store.id))
      : allStores;

    const rows: StoreOverviewRow[] = [];

    for (const store of visibleStores) {
      const storeTz = resolveStoreTimezone(store);
      const storeRange = getDateRangeInTimezone(preset, storeTz);
      const storeSince = formatDateInTimezone(storeRange.start, storeTz);
      const storeUntil = formatDateInTimezone(storeRange.end, storeTz);
      const exactVariant = `range:since:${storeSince}|until:${storeUntil}|strict:1`;
      const metaPreset = mapPresetToMeta(preset);
      const storeSettings = useSupabase
        ? await getPersistentPnlStoreSettings(store.id)
        : getPnlStoreSettings(store.id);
      const productType: 'physical' | 'digital' = storeSettings?.product_type === 'digital' ? 'digital' : 'physical';

      const pnlRows = useSupabase
        ? await getPersistentCachedPnLDays(store.id, storeSince, storeUntil)
        : getCachedPnLDays(store.id, storeSince, storeUntil);

      // Primary source remains store-scoped P&L cache; we can override revenue/orders
      // with live Shopify topline to keep parity with current P&L page values.
      let revenue = pnlRows.reduce((sum, row) => sum + (row.revenue || 0), 0);
      let adSpend = pnlRows.reduce((sum, row) => sum + (row.ad_spend || 0), 0);
      const cogsRaw = pnlRows.reduce((sum, row) => sum + (row.cogs || 0), 0);
      let fees = pnlRows.reduce((sum, row) => sum + (row.fees || 0), 0);
      const shippingRaw = pnlRows.reduce((sum, row) => sum + (row.shipping || 0), 0);
      let refunds = pnlRows.reduce((sum, row) => sum + (row.refunds || 0), 0);
      let fullRefundAmount = pnlRows.reduce((sum, row) => sum + (row.full_refund_amount || 0), 0);
      let partialRefundAmount = pnlRows.reduce((sum, row) => sum + (row.partial_refund_amount || 0), 0);
      let netProfit = pnlRows.reduce((sum, row) => sum + (row.net_profit || 0), 0);
      let orders = pnlRows.reduce((sum, row) => sum + (row.order_count || 0), 0);
      const cogs = productType === 'digital' ? 0 : cogsRaw;
      const shipping = productType === 'digital' ? 0 : shippingRaw;

      const activeAccountIds = (store.adAccounts || [])
        .filter((a) => Number(a.is_active) === 1)
        .map((a) => a.ad_account_id);
      const scopeId = buildScopeId(activeAccountIds);

      let campaignSnapshot: Campaign[] = [];
      let campaignSyncedAt: string | null = null;

      if (scopeId !== 'accounts:') {
        const exactSnap = useSupabase
          ? await getPersistentMetaEndpointSnapshot<Campaign[]>(store.id, 'campaigns', scopeId, exactVariant)
          : getMetaEndpointSnapshot<Campaign[]>(store.id, 'campaigns', scopeId, exactVariant);

        if (exactSnap?.data?.length) {
          campaignSnapshot = exactSnap.data;
          campaignSyncedAt = exactSnap.updatedAt;
        }
      }

      // Fallback: if no campaign snapshot exists for the store, fetch a lightweight live campaign set.
      if (campaignSnapshot.length === 0 && activeAccountIds.length > 0) {
        try {
          const token = await getMetaToken(store.id);
          if (token) {
            const fresh = await Promise.all(
              activeAccountIds.map((id) =>
                fetchMetaCampaigns(token.accessToken, id, { since: storeSince, until: storeUntil }, { disableDateFallback: true }).catch(() => [])
              )
            );
            const map = new Map<string, Campaign>();
            for (const group of fresh) {
              for (const c of group) map.set(c.id, c);
            }
            campaignSnapshot = Array.from(map.values());
          }
        } catch {
          // best-effort fallback only
        }
      }

      const campaignTraffic = sumCampaignTraffic(campaignSnapshot);
      const campaignSpend = campaignSnapshot.reduce((sum, c) => sum + (c.metrics?.spend || 0), 0);
      let insightTotals: InsightTotals = { spend: 0, clicks: 0, impressions: 0 };

      try {
        insightTotals = await fetchInsightTotalsForStore(
          store.id,
          activeAccountIds,
          metaPreset,
          storeSince,
          storeUntil
        );
      } catch {
        // fall back to campaign-level aggregates below
      }

      // Keep range strict; if P&L cache is missing for selected dates, fill from exact-range sources only.
      if (pnlRows.length === 0) {
        adSpend = insightTotals.spend > 0 ? insightTotals.spend : campaignSpend;
      }

      // Keep Store Overview fast: use cache first. Only compute live Shopify values if
      // the selected date window has no cached P&L rows yet.
      if (pnlRows.length === 0) {
        try {
          const shopify = await fetchShopifyTopline(store.id, storeSince, storeUntil, storeTz);
          if (shopify.orders > 0 || shopify.revenue > 0) {
            revenue = shopify.revenue;
            orders = shopify.orders;
          }
        } catch {
          // keep cache-derived values
        }
      }

      // Refunds can remain zero in cache even when fee rows are present; backfill refunds
      // (and optionally fees) from Shopify for recent presets.
      const shouldBackfillRefunds =
        (refunds === 0 && (preset === 'today' || preset === 'yesterday' || preset === 'last7' || preset === 'last7today' || preset === 'last14'))
        || (pnlRows.length === 0 && fees === 0 && refunds === 0);
      if (shouldBackfillRefunds) {
        try {
          const shopifyCosts = await fetchShopifyCosts(store.id, storeSince, storeUntil, storeTz);
          if (fees === 0) {
            fees = shopifyCosts.fees;
          }
          refunds = shopifyCosts.refunds;
          fullRefundAmount = shopifyCosts.fullRefundAmount;
          partialRefundAmount = shopifyCosts.partialRefundAmount;
        } catch {
          // keep cache-derived values
        }
      }

      const clicks = insightTotals.clicks > 0 ? insightTotals.clicks : campaignTraffic.clicks;
      const impressions = insightTotals.impressions > 0 ? insightTotals.impressions : campaignTraffic.impressions;
      const trafficSpend = insightTotals.spend > 0 ? insightTotals.spend : adSpend;

      netProfit = revenue - cogs - adSpend - shipping - fees - refunds;

      const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
      const roas = adSpend > 0 ? revenue / adSpend : 0;
      const aov = orders > 0 ? revenue / orders : 0;
      const cpc = clicks > 0 ? trafficSpend / clicks : 0;
      const cpm = impressions > 0 ? (trafficSpend * 1000) / impressions : 0;

      const pnlSyncedAt = useSupabase
        ? await getPersistentPnlCacheLastSynced(store.id)
        : getPnlCacheLastSynced(store.id);

      rows.push({
        storeId: store.id,
        storeName: store.name,
        domain: store.domain,
        productType,
        revenue: toMoney(revenue),
        adSpend: toMoney(adSpend),
        cogs: toMoney(cogs),
        fees: toMoney(fees),
        shipping: toMoney(shipping),
        refunds: toMoney(refunds),
        fullRefundAmount: toMoney(fullRefundAmount),
        partialRefundAmount: toMoney(partialRefundAmount),
        netProfit: toMoney(netProfit),
        margin: toRate(margin),
        roas: toRate(roas),
        aov: toMoney(aov),
        orders,
        cpc: toMoney(cpc),
        cpm: toMoney(cpm),
        clicks,
        impressions,
        lastSyncedAt: campaignSyncedAt || pnlSyncedAt || null,
      });
    }

    const totalsBase = rows.reduce(
      (acc, row) => {
        acc.revenue += row.revenue;
        acc.adSpend += row.adSpend;
        acc.cogs += row.cogs;
        acc.fees += row.fees;
        acc.shipping += row.shipping;
        acc.refunds += row.refunds;
        acc.fullRefundAmount += row.fullRefundAmount;
        acc.partialRefundAmount += row.partialRefundAmount;
        acc.netProfit += row.netProfit;
        acc.orders += row.orders;
        acc.clicks += row.clicks;
        acc.impressions += row.impressions;
        return acc;
      },
      {
        revenue: 0,
        adSpend: 0,
        cogs: 0,
        fees: 0,
        shipping: 0,
        refunds: 0,
        fullRefundAmount: 0,
        partialRefundAmount: 0,
        netProfit: 0,
        orders: 0,
        clicks: 0,
        impressions: 0,
      }
    );

    const totals = {
      revenue: toMoney(totalsBase.revenue),
      adSpend: toMoney(totalsBase.adSpend),
      cogs: toMoney(totalsBase.cogs),
      fees: toMoney(totalsBase.fees),
      shipping: toMoney(totalsBase.shipping),
      refunds: toMoney(totalsBase.refunds),
      fullRefundAmount: toMoney(totalsBase.fullRefundAmount),
      partialRefundAmount: toMoney(totalsBase.partialRefundAmount),
      netProfit: toMoney(totalsBase.netProfit),
      margin: toRate(totalsBase.revenue > 0 ? (totalsBase.netProfit / totalsBase.revenue) * 100 : 0),
      roas: toRate(totalsBase.adSpend > 0 ? totalsBase.revenue / totalsBase.adSpend : 0),
      aov: toMoney(totalsBase.orders > 0 ? totalsBase.revenue / totalsBase.orders : 0),
      orders: totalsBase.orders,
      cpc: toMoney(totalsBase.clicks > 0 ? totalsBase.adSpend / totalsBase.clicks : 0),
      cpm: toMoney(totalsBase.impressions > 0 ? (totalsBase.adSpend * 1000) / totalsBase.impressions : 0),
      clicks: totalsBase.clicks,
      impressions: totalsBase.impressions,
    };

    const payload: StoreOverviewResponse = {
      preset,
      since,
      until,
      stores: rows.sort((a, b) => b.netProfit - a.netProfit),
      totals,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load store overview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
