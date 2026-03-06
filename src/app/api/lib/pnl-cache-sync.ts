import { fromZonedTime } from 'date-fns-tz';
import { fetchBalanceTransactions, fetchShopifyOrders } from '@/app/api/lib/shopify-client';
import { fetchMetaInsights, mapInsightsToMetrics } from '@/app/api/lib/meta-client';
import { getMetaToken, getShopifyToken } from '@/app/api/lib/tokens';
import { daysAgoInTimezone, shopifyDateToStoreDate, todayInTimezone } from '@/lib/timezone';
import {
  batchUpsertCachedPnLDays,
  getAllStores,
  getHandlingFees,
  getPaymentFees,
  getPnlStoreSettings,
  getShippingSettings,
  type DbStore,
  type DbStoreAdAccount,
} from '@/app/api/lib/db';
import {
  batchUpsertPersistentCachedPnLDays,
  getPersistentHandlingFees,
  getPersistentPaymentFees,
  getPersistentPnlStoreSettings,
  getPersistentShippingSettings,
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';

type StoreWithAccounts = DbStore & { adAccounts: DbStoreAdAccount[] };

interface SyncResult {
  storeId: string;
  storeName: string;
  days: number;
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
}

function resolveStoreTimezone(store: { adAccounts?: Array<{ is_active?: number | boolean; timezone?: string | null }> }): string {
  const active = (store.adAccounts || []).find((a) => Number(a.is_active) === 1 && a.timezone);
  if (active?.timezone) return active.timezone;
  const first = (store.adAccounts || []).find((a) => a.timezone);
  return first?.timezone || 'America/New_York';
}

function buildDateRangeDays(days: number, tz: string): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    out.push(daysAgoInTimezone(i, tz));
  }
  return out;
}

function calculatePaymentFee(orderAmount: number, paymentFees: Array<{ fee_percentage: number; fee_fixed: number; is_active: number | boolean }>): number {
  const activeFees = paymentFees.filter((f) => f.is_active === 1 || f.is_active === true);
  if (activeFees.length === 0) return orderAmount * 0.03;
  const avgPct = activeFees.reduce((sum, f) => sum + (f.fee_percentage || 0), 0) / activeFees.length;
  const avgFixed = activeFees.reduce((sum, f) => sum + (f.fee_fixed || 0), 0) / activeFees.length;
  return (orderAmount * avgPct / 100) + avgFixed;
}

function calculateShippingCost(
  order: { totalPrice: string; subtotalPrice: string; totalShippingPrice: string; lineItems: Array<{ quantity: number }> },
  productType: 'physical' | 'digital',
  shipping: null | { method: string; flat_rate?: number | null; percentage?: number | null; per_item_rate?: number | null }
): number {
  if (productType === 'digital') return 0;
  if (!shipping) return parseFloat(order.totalPrice || '0') * 0.05;
  switch (shipping.method) {
    case 'flat_rate':
      return shipping.flat_rate || 0;
    case 'percentage':
      return parseFloat(order.subtotalPrice || '0') * ((shipping.percentage || 0) / 100);
    case 'equal_charged':
      return parseFloat(order.totalShippingPrice || '0');
    case 'per_item': {
      const qty = order.lineItems.reduce((sum, li) => sum + (li.quantity || 0), 0);
      return qty * (shipping.per_item_rate || 0);
    }
    default:
      return 0;
  }
}

function calculateHandlingCost(
  order: { subtotalPrice: string; lineItems: Array<{ quantity: number }> },
  productType: 'physical' | 'digital',
  handling: null | { fee_type: string; amount: number }
): number {
  if (productType === 'digital' || !handling) return 0;
  switch (handling.fee_type) {
    case 'per_order':
      return handling.amount || 0;
    case 'per_item': {
      const qty = order.lineItems.reduce((sum, li) => sum + (li.quantity || 0), 0);
      return qty * (handling.amount || 0);
    }
    case 'percentage':
      return parseFloat(order.subtotalPrice || '0') * ((handling.amount || 0) / 100);
    default:
      return 0;
  }
}

async function paginateShopifyOrders(
  token: string,
  shopDomain: string,
  opts: {
    createdAtMin?: string;
    createdAtMax?: string;
    updatedAtMin?: string;
    updatedAtMax?: string;
    financialStatus?: string;
    maxPages?: number;
  }
) {
  const all = [];
  let sinceId = '0';
  let pagesLeft = opts.maxPages ?? 50;
  while (pagesLeft > 0) {
    const rows = await fetchShopifyOrders(token, shopDomain, {
      status: 'any',
      limit: 250,
      sinceId,
      createdAtMin: opts.createdAtMin,
      createdAtMax: opts.createdAtMax,
      updatedAtMin: opts.updatedAtMin,
      updatedAtMax: opts.updatedAtMax,
      financialStatus: opts.financialStatus,
    });
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 250) break;
    sinceId = String(rows[rows.length - 1].id);
    pagesLeft -= 1;
  }
  return all;
}

async function syncOneStore(store: StoreWithAccounts, days: number): Promise<SyncResult> {
  const useSupabase = isSupabasePersistenceEnabled();
  const tz = resolveStoreTimezone(store);
  const dates = buildDateRangeDays(days, tz);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1] || todayInTimezone(tz);

  const [shopifyToken, metaToken] = await Promise.all([
    getShopifyToken(store.id),
    getMetaToken(store.id),
  ]);
  if (!shopifyToken?.accessToken || !shopifyToken.shopDomain) {
    return { storeId: store.id, storeName: store.name, days, status: 'skipped', reason: 'shopify_not_connected' };
  }

  const [storeSettings, shipping, paymentFees, handling] = useSupabase
    ? await Promise.all([
        getPersistentPnlStoreSettings(store.id),
        getPersistentShippingSettings(store.id),
        getPersistentPaymentFees(store.id),
        getPersistentHandlingFees(store.id),
      ])
    : await Promise.all([
        Promise.resolve(getPnlStoreSettings(store.id)),
        Promise.resolve(getShippingSettings(store.id)),
        Promise.resolve(getPaymentFees(store.id)),
        Promise.resolve(getHandlingFees(store.id)),
      ]);

  const productType: 'physical' | 'digital' = storeSettings?.product_type === 'digital' ? 'digital' : 'physical';
  const startUtc = fromZonedTime(`${startDate}T00:00:00`, tz).toISOString();
  const endUtc = fromZonedTime(`${endDate}T23:59:59`, tz).toISOString();

  const [windowOrders, olderRefunded, olderPartials] = await Promise.all([
    paginateShopifyOrders(shopifyToken.accessToken, shopifyToken.shopDomain, {
      createdAtMin: startUtc,
      createdAtMax: endUtc,
      maxPages: 80,
    }),
    paginateShopifyOrders(shopifyToken.accessToken, shopifyToken.shopDomain, {
      createdAtMax: startUtc,
      updatedAtMin: startUtc,
      updatedAtMax: endUtc,
      financialStatus: 'refunded',
      maxPages: 40,
    }),
    paginateShopifyOrders(shopifyToken.accessToken, shopifyToken.shopDomain, {
      createdAtMax: startUtc,
      updatedAtMin: startUtc,
      updatedAtMax: endUtc,
      financialStatus: 'partially_refunded',
      maxPages: 40,
    }),
  ]);

  const allRefundOrdersMap = new Map<number, (typeof windowOrders)[number]>();
  for (const o of windowOrders) allRefundOrdersMap.set(o.id, o);
  for (const o of olderRefunded) allRefundOrdersMap.set(o.id, o);
  for (const o of olderPartials) allRefundOrdersMap.set(o.id, o);

  const ordersByDate = new Map<string, typeof windowOrders>();
  for (const d of dates) ordersByDate.set(d, []);
  for (const order of windowOrders) {
    const d = shopifyDateToStoreDate(order.createdAt, tz);
    if (!ordersByDate.has(d)) ordersByDate.set(d, []);
    ordersByDate.get(d)!.push(order);
  }

  const refundsByDate = new Map<string, { refunds: number; fullRefundCount: number; partialRefundCount: number; fullRefundAmount: number; partialRefundAmount: number }>();
  for (const d of dates) {
    refundsByDate.set(d, { refunds: 0, fullRefundCount: 0, partialRefundCount: 0, fullRefundAmount: 0, partialRefundAmount: 0 });
  }
  for (const order of allRefundOrdersMap.values()) {
    for (const refund of order.refunds || []) {
      const amount = refund.totalAmount || 0;
      if (amount <= 0) continue;
      const d = shopifyDateToStoreDate(refund.createdAt, tz);
      if (d < startDate || d > endDate) continue;
      if (!refundsByDate.has(d)) refundsByDate.set(d, { refunds: 0, fullRefundCount: 0, partialRefundCount: 0, fullRefundAmount: 0, partialRefundAmount: 0 });
      const bucket = refundsByDate.get(d)!;
      bucket.refunds += amount;
      if (order.financialStatus === 'refunded') {
        bucket.fullRefundAmount += amount;
        bucket.fullRefundCount += 1;
      } else {
        bucket.partialRefundAmount += amount;
        bucket.partialRefundCount += 1;
      }
    }
  }

  const feesByOrderId = new Map<number, number>();
  const feesByDate = new Map<string, number>();
  try {
    let lastId: string | undefined;
    let pagesLeft = 80;
    let reachedOld = false;
    while (pagesLeft > 0 && !reachedOld) {
      const txns = await fetchBalanceTransactions(shopifyToken.accessToken, shopifyToken.shopDomain, { limit: 250, lastId });
      if (txns.length === 0) break;
      for (const txn of txns) {
        if (txn.type !== 'charge' || !txn.sourceOrderId) continue;
        const d = shopifyDateToStoreDate(txn.processedAt, tz);
        if (d < startDate) {
          reachedOld = true;
          continue;
        }
        if (d > endDate) continue;
        const fee = Math.max(parseFloat(txn.fee || '0'), 0);
        feesByOrderId.set(txn.sourceOrderId, (feesByOrderId.get(txn.sourceOrderId) || 0) + fee);
        feesByDate.set(d, (feesByDate.get(d) || 0) + fee);
      }
      if (txns.length < 250) break;
      lastId = String(txns[txns.length - 1].id);
      pagesLeft -= 1;
    }
  } catch {
    // fallback fee estimation is used below
  }

  const adAccounts = (store.adAccounts || [])
    .filter((a) => Number(a.is_active) === 1)
    .map((a) => a.ad_account_id);

  const spendByDate = new Map<string, number>();
  for (const d of dates) spendByDate.set(d, 0);
  if (metaToken && adAccounts.length > 0) {
    const insightGroups = await Promise.all(
      adAccounts.map((id) => fetchMetaInsights(metaToken.accessToken, id, 'last_30d').catch(() => []))
    );
    for (const day of insightGroups.flat()) {
      const d = day.date_start;
      if (d < startDate || d > endDate) continue;
      const m = mapInsightsToMetrics(day);
      spendByDate.set(d, (spendByDate.get(d) || 0) + (m.spend || 0));
    }
    const today = todayInTimezone(tz);
    if (today >= startDate && today <= endDate) {
      const todayGroups = await Promise.all(
        adAccounts.map((id) => fetchMetaInsights(metaToken.accessToken, id, 'today').catch(() => []))
      );
      for (const day of todayGroups.flat()) {
        if (day.date_start !== today) continue;
        const m = mapInsightsToMetrics(day);
        spendByDate.set(today, (spendByDate.get(today) || 0) + (m.spend || 0));
      }
    }
  }

  const rows = dates.map((d) => {
    const dayOrders = ordersByDate.get(d) || [];
    const refundBucket = refundsByDate.get(d) || { refunds: 0, fullRefundCount: 0, partialRefundCount: 0, fullRefundAmount: 0, partialRefundAmount: 0 };
    let revenue = 0;
    let shippingCost = 0;
    let fees = 0;

    for (const order of dayOrders) {
      if (order.financialStatus === 'refunded') continue;
      const orderRevenue = parseFloat(order.totalPrice || '0');
      revenue += orderRevenue;
      shippingCost += calculateShippingCost(order, productType, shipping);
      fees += feesByOrderId.has(order.id)
        ? (feesByOrderId.get(order.id) || 0)
        : calculatePaymentFee(orderRevenue, paymentFees as Array<{ fee_percentage: number; fee_fixed: number; is_active: number | boolean }>);
      fees += calculateHandlingCost(order, productType, handling);
    }

    if (dayOrders.length === 0 && revenue === 0) {
      fees += feesByDate.get(d) || 0;
    }

    const adSpend = spendByDate.get(d) || 0;
    const cogs = productType === 'digital' ? 0 : revenue * 0.3;
    const netProfit = revenue - cogs - adSpend - shippingCost - fees - refundBucket.refunds;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      date: d,
      revenue,
      cogs,
      adSpend,
      shipping: shippingCost,
      fees,
      refunds: refundBucket.refunds,
      netProfit,
      margin,
      orderCount: dayOrders.length,
      fullRefundCount: refundBucket.fullRefundCount,
      partialRefundCount: refundBucket.partialRefundCount,
      fullRefundAmount: refundBucket.fullRefundAmount,
      partialRefundAmount: refundBucket.partialRefundAmount,
    };
  });

  if (useSupabase) {
    await batchUpsertPersistentCachedPnLDays(store.id, rows);
  } else {
    batchUpsertCachedPnLDays(store.id, rows);
  }

  return { storeId: store.id, storeName: store.name, days: rows.length, status: 'ok' };
}

export async function syncPnlCacheAllStores(days = 30): Promise<{ total: number; succeeded: number; skipped: number; failed: number; results: SyncResult[] }> {
  const useSupabase = isSupabasePersistenceEnabled();
  const stores = (useSupabase
    ? await listPersistentStores()
    : getAllStores()) as StoreWithAccounts[];

  const results: SyncResult[] = [];
  for (const store of stores) {
    try {
      results.push(await syncOneStore(store, days));
    } catch (err) {
      results.push({
        storeId: store.id,
        storeName: store.name,
        days,
        status: 'error',
        reason: err instanceof Error ? err.message : 'unknown_error',
      });
    }
  }

  return {
    total: results.length,
    succeeded: results.filter((r) => r.status === 'ok').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'error').length,
    results,
  };
}
