import { NextRequest, NextResponse } from 'next/server';
import type { DateRangePreset } from '@/types/analytics';
import type { Campaign } from '@/types/campaign';
import {
  STORE_REPORTING_TIMEZONE,
  formatDateInTimezone,
  getDateRangeInTimezone,
} from '@/lib/timezone';
import { readSessionFromRequest } from '@/lib/auth/request-session';
import { listStoreIdsForWorkspace } from '@/app/api/lib/auth-users';
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
  rest,
} from '@/app/api/lib/supabase-persistence';
import {
  getPersistentMetaEndpointSnapshot,
} from '@/app/api/lib/supabase-tracking';
import {
  fetchLiveExchangeRate,
  getFallbackExchangeRate,
  isPlausibleRate,
} from '@/app/api/lib/live-exchange-rate';

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

interface DailyPnlSnapshotRow {
  date: string;
  revenue: number | string | null;
  cogs: number | string | null;
  ad_spend: number | string | null;
  shipping_cost: number | string | null;
  transaction_fees: number | string | null;
  refunds: number | string | null;
  chargeback_loss: number | string | null;
  net_profit: number | string | null;
  margin: number | string | null;
  order_count: number | string | null;
  full_refund_amount: number | string | null;
  partial_refund_amount: number | string | null;
  currency: string | null;
  synced_at: string | null;
}

const DASHBOARD_CURRENCY = 'USD';
const requestRateCache = new Map<string, number>();
const requestRatePromiseCache = new Map<string, Promise<number>>();
const LIVE_RATE_TIMEOUT_MS = 4_000;

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

function normalizeCurrencyCode(value?: string | null): string {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : DASHBOARD_CURRENCY;
}

async function getStoreCurrency(storeId: string): Promise<string> {
  const rows = await rest<Array<{ currency: string | null; reporting_currency?: string | null }>>(
    `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=currency,reporting_currency&limit=1`,
  ).catch(() => []);
  return normalizeCurrencyCode(rows[0]?.currency || rows[0]?.reporting_currency);
}

async function getStoredExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  date: string,
): Promise<number | null> {
  const enc = (value: string) => encodeURIComponent(value);
  const exactRows = await rest<Array<{ rate: number }>>(
    `/exchange_rates?base_currency=eq.${enc(fromCurrency)}&target_currency=eq.${enc(toCurrency)}&date=eq.${enc(date)}&select=rate&limit=1`,
  ).catch(() => []);
  if (exactRows[0]?.rate && isPlausibleRate(fromCurrency, toCurrency, Number(exactRows[0].rate))) return Number(exactRows[0].rate);

  const recentRows = await rest<Array<{ rate: number }>>(
    `/exchange_rates?base_currency=eq.${enc(fromCurrency)}&target_currency=eq.${enc(toCurrency)}&date=lte.${enc(date)}&select=rate&order=date.desc&limit=1`,
  ).catch(() => []);
  if (recentRows[0]?.rate && isPlausibleRate(fromCurrency, toCurrency, Number(recentRows[0].rate))) return Number(recentRows[0].rate);

  const legacyRecentRows = await rest<Array<{ rate: number }>>(
    `/exchange_rates?from_currency=eq.${enc(fromCurrency)}&to_currency=eq.${enc(toCurrency)}&date=lte.${enc(date)}&select=rate&order=date.desc&limit=1`,
  ).catch(() => []);
  if (legacyRecentRows[0]?.rate && isPlausibleRate(fromCurrency, toCurrency, Number(legacyRecentRows[0].rate))) return Number(legacyRecentRows[0].rate);

  const inverseRows = await rest<Array<{ rate: number }>>(
    `/exchange_rates?base_currency=eq.${enc(toCurrency)}&target_currency=eq.${enc(fromCurrency)}&date=lte.${enc(date)}&select=rate&order=date.desc&limit=1`,
  ).catch(() => []);
  if (inverseRows[0]?.rate && isPlausibleRate(fromCurrency, toCurrency, 1 / Number(inverseRows[0].rate))) return 1 / Number(inverseRows[0].rate);

  const legacyInverseRows = await rest<Array<{ rate: number }>>(
    `/exchange_rates?from_currency=eq.${enc(toCurrency)}&to_currency=eq.${enc(fromCurrency)}&date=lte.${enc(date)}&select=rate&order=date.desc&limit=1`,
  ).catch(() => []);
  if (legacyInverseRows[0]?.rate && isPlausibleRate(fromCurrency, toCurrency, 1 / Number(legacyInverseRows[0].rate))) return 1 / Number(legacyInverseRows[0].rate);

  return null;
}

async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  date: string,
): Promise<number> {
  if (fromCurrency === toCurrency) return 1;
  const cacheKey = `${fromCurrency}:${toCurrency}:${date}`;
  const cached = requestRateCache.get(cacheKey);
  if (cached) return cached;

  const inFlight = requestRatePromiseCache.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const liveRate = await Promise.race([
      fetchLiveExchangeRate(fromCurrency, toCurrency).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LIVE_RATE_TIMEOUT_MS)),
    ]);
    if (liveRate?.rate && liveRate.rate > 0) {
      requestRateCache.set(cacheKey, liveRate.rate);
      return liveRate.rate;
    }

    const storedRate = await getStoredExchangeRate(fromCurrency, toCurrency, date);
    const fallbackRate = getFallbackExchangeRate(fromCurrency, toCurrency);
    const rate = storedRate && storedRate > 0 ? storedRate : fallbackRate || 1;

    requestRateCache.set(cacheKey, rate);
    return rate;
  })();

  requestRatePromiseCache.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    requestRatePromiseCache.delete(cacheKey);
  }
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

function asNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function maxIsoTimestamp(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!latest || Date.parse(value) > Date.parse(latest)) {
      latest = value;
    }
  }
  return latest;
}

async function getDailyPnlSnapshots(
  storeId: string,
  startDate: string,
  endDate: string,
): Promise<DailyPnlSnapshotRow[]> {
  return rest<DailyPnlSnapshotRow[]>(
    `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(storeId)}` +
      `&date=gte.${encodeURIComponent(startDate)}` +
      `&date=lte.${encodeURIComponent(endDate)}` +
      '&select=date,revenue,cogs,ad_spend,shipping_cost,transaction_fees,refunds,chargeback_loss,net_profit,margin,order_count,full_refund_amount,partial_refund_amount,currency,synced_at' +
      '&order=date.asc',
  ).catch(() => []);
}

function parsePreset(value: string | null): DateRangePreset {
  const allowed: DateRangePreset[] = ['today', 'yesterday', 'last3', 'last7', 'last7today', 'last14', 'last28', 'last30', 'thisMonth', 'lastMonth', 'custom'];
  if (!value) return 'today';
  return allowed.includes(value as DateRangePreset) ? (value as DateRangePreset) : 'today';
}

function isValidDateParam(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function resolveRequestRange(searchParams: URLSearchParams): {
  preset: DateRangePreset;
  since: string;
  until: string;
} {
  const requestedPreset = searchParams.get('preset');
  const sinceParam = searchParams.get('since');
  const untilParam = searchParams.get('until');

  if (isValidDateParam(sinceParam) && isValidDateParam(untilParam)) {
    const since = sinceParam <= untilParam ? sinceParam : untilParam;
    const until = sinceParam <= untilParam ? untilParam : sinceParam;
    const preset = requestedPreset ? parsePreset(requestedPreset) : 'custom';
    return { preset, since, until };
  }

  const preset = parsePreset(requestedPreset);
  if (preset === 'custom') {
    const fallbackPreset: DateRangePreset = 'today';
    const displayRange = getDateRangeInTimezone(fallbackPreset, STORE_REPORTING_TIMEZONE);
    return {
      preset: fallbackPreset,
      since: formatDateInTimezone(displayRange.start, STORE_REPORTING_TIMEZONE),
      until: formatDateInTimezone(displayRange.end, STORE_REPORTING_TIMEZONE),
    };
  }

  const displayRange = getDateRangeInTimezone(preset, STORE_REPORTING_TIMEZONE);
  return {
    preset,
    since: formatDateInTimezone(displayRange.start, STORE_REPORTING_TIMEZONE),
    until: formatDateInTimezone(displayRange.end, STORE_REPORTING_TIMEZONE),
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const { preset, since, until } = resolveRequestRange(searchParams);

    const useSupabase = isSupabasePersistenceEnabled();
    const allStores = useSupabase ? await listPersistentStores() : getAllStores();

    const allowedStoreIds = !session.legacy && session.workspaceId
      ? new Set(await listStoreIdsForWorkspace(session.workspaceId))
      : null;

    const visibleStores = allowedStoreIds
      ? allStores.filter((store) => allowedStoreIds.has(store.id))
      : allStores;

    const rows: StoreOverviewRow[] = await Promise.all(visibleStores.map(async (store) => {
      const storeSince = since;
      const storeUntil = until;
      const exactVariant = `range:since:${storeSince}|until:${storeUntil}|strict:1`;
      const activeAccountIds = (store.adAccounts || [])
        .filter((a) => Number(a.is_active) === 1)
        .map((a) => a.ad_account_id);
      const scopeId = buildScopeId(activeAccountIds);

      const [storeSettings, snapshotRows, exactSnap] = await Promise.all([
        useSupabase
          ? getPersistentPnlStoreSettings(store.id)
          : Promise.resolve(getPnlStoreSettings(store.id)),
        useSupabase
          ? getDailyPnlSnapshots(store.id, storeSince, storeUntil)
          : Promise.resolve([] as DailyPnlSnapshotRow[]),
        scopeId !== 'accounts:'
          ? (
              useSupabase
                ? getPersistentMetaEndpointSnapshot<Campaign[]>(store.id, 'campaigns', scopeId, exactVariant)
                : Promise.resolve(getMetaEndpointSnapshot<Campaign[]>(store.id, 'campaigns', scopeId, exactVariant))
            )
          : Promise.resolve(null),
      ]);

      const productType: 'physical' | 'digital' = storeSettings?.product_type === 'digital' ? 'digital' : 'physical';
      const hasDailySnapshots = snapshotRows.length > 0;
      const pnlRows = hasDailySnapshots
        ? []
        : (
            useSupabase
              ? await getPersistentCachedPnLDays(store.id, storeSince, storeUntil)
              : getCachedPnLDays(store.id, storeSince, storeUntil)
          );
      const hasCachedRangeRows = hasDailySnapshots || pnlRows.length > 0;

      // Store Overview must stay fast and range-strict, so it only reads cached
      // store P&L plus exact-range Meta snapshots instead of live-scanning Shopify.
      let revenue = hasDailySnapshots
        ? snapshotRows.reduce((sum, row) => sum + asNumber(row.revenue), 0)
        : pnlRows.reduce((sum, row) => sum + (row.revenue || 0), 0);
      let adSpend = hasDailySnapshots
        ? snapshotRows.reduce((sum, row) => sum + asNumber(row.ad_spend), 0)
        : pnlRows.reduce((sum, row) => sum + (row.ad_spend || 0), 0);
      const cogsRaw = hasDailySnapshots
        ? snapshotRows.reduce((sum, row) => sum + asNumber(row.cogs), 0)
        : pnlRows.reduce((sum, row) => sum + (row.cogs || 0), 0);
      let fees = hasDailySnapshots
        ? snapshotRows.reduce((sum, row) => sum + asNumber(row.transaction_fees), 0)
        : pnlRows.reduce((sum, row) => sum + (row.fees || 0), 0);
      const shippingRaw = hasDailySnapshots
        ? snapshotRows.reduce((sum, row) => sum + asNumber(row.shipping_cost), 0)
        : pnlRows.reduce((sum, row) => sum + (row.shipping || 0), 0);
      let refunds = hasDailySnapshots
        ? snapshotRows.reduce((sum, row) => sum + asNumber(row.refunds) + asNumber(row.chargeback_loss), 0)
        : pnlRows.reduce((sum, row) => sum + (row.refunds || 0), 0);
      let fullRefundAmount = hasDailySnapshots
        ? snapshotRows.reduce((sum, row) => sum + asNumber(row.full_refund_amount), 0)
        : pnlRows.reduce((sum, row) => sum + (row.full_refund_amount || 0), 0);
      let partialRefundAmount = hasDailySnapshots
        ? snapshotRows.reduce((sum, row) => sum + asNumber(row.partial_refund_amount), 0)
        : pnlRows.reduce((sum, row) => sum + (row.partial_refund_amount || 0), 0);
      let netProfit = hasDailySnapshots
        ? snapshotRows.reduce((sum, row) => sum + asNumber(row.net_profit), 0)
        : pnlRows.reduce((sum, row) => sum + (row.net_profit || 0), 0);
      const orders = hasDailySnapshots
        ? snapshotRows.reduce((sum, row) => sum + asNumber(row.order_count), 0)
        : pnlRows.reduce((sum, row) => sum + (row.order_count || 0), 0);
      let cogs = productType === 'digital' ? 0 : cogsRaw;
      let shipping = productType === 'digital' ? 0 : shippingRaw;
      const storeCurrency = await getStoreCurrency(store.id);
      const storeToDashboardRate = await getExchangeRate(storeCurrency, DASHBOARD_CURRENCY, storeUntil);

      let campaignSnapshot: Campaign[] = [];
      let campaignSyncedAt: string | null = null;
      if (exactSnap?.data?.length) {
        campaignSnapshot = exactSnap.data;
        campaignSyncedAt = exactSnap.updatedAt;
      }

      const campaignTraffic = sumCampaignTraffic(campaignSnapshot);
      const campaignSpend = campaignSnapshot.reduce((sum, c) => sum + (c.metrics?.spend || 0), 0);

      // Keep range strict; if P&L cache is missing for selected dates, fill from exact-range sources only.
      if (!hasCachedRangeRows) {
        adSpend = campaignSpend;
      }

      if (storeCurrency !== DASHBOARD_CURRENCY && storeToDashboardRate > 0) {
        revenue *= storeToDashboardRate;
        cogs *= storeToDashboardRate;
        fees *= storeToDashboardRate;
        shipping *= storeToDashboardRate;
        refunds *= storeToDashboardRate;
        fullRefundAmount *= storeToDashboardRate;
        partialRefundAmount *= storeToDashboardRate;
      }

      const clicks = campaignTraffic.clicks;
      const impressions = campaignTraffic.impressions;
      const trafficSpend = adSpend;

      netProfit = revenue - cogs - adSpend - shipping - fees - refunds;

      const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
      const roas = adSpend > 0 ? revenue / adSpend : 0;
      const aov = orders > 0 ? revenue / orders : 0;
      const cpc = clicks > 0 ? trafficSpend / clicks : 0;
      const cpm = impressions > 0 ? (trafficSpend * 1000) / impressions : 0;

      const snapshotSyncedAt = maxIsoTimestamp(snapshotRows.map((row) => row.synced_at));
      const pnlSyncedAt = snapshotSyncedAt || campaignSyncedAt
        ? null
        : (
            useSupabase
              ? await getPersistentPnlCacheLastSynced(store.id)
              : getPnlCacheLastSynced(store.id)
          );

      return {
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
        lastSyncedAt: campaignSyncedAt || snapshotSyncedAt || pnlSyncedAt || null,
      };
    }));

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
