import type { PnLSummary, PnLEntry, ProductCOGS, HourlyPnLEntry } from '@/types/pnl';
import type { PnLSettings, PaymentFee } from '@/types/pnlSettings';
import { mockPnLSummary, mockDailyPnL, mockHourlyPnL } from '@/data/mockPnL';
import { mockProducts } from '@/data/mockProducts';
import { createServiceFn } from '@/services/withMockFallback';
import { apiClient } from '@/services/api';
import { buildStoreScopedKey, clearCachePrefix, memoizePromise } from '@/services/perfCache';
import type { ShopifyOrder } from '@/types/shopify';
import type { BalanceTransaction } from '@/app/api/lib/shopify-client';
import { todayInTimezone, daysAgoInTimezone, monthStartInTimezone, shopifyDateToStoreDate, getStoreTimezone, formatDateInTimezone } from '@/lib/timezone';
import { fromZonedTime } from 'date-fns-tz';

// ------ Fetch P&L settings from DB ------

async function fetchPnLSettings(): Promise<PnLSettings | null> {
  try {
    const data = await apiClient<PnLSettings>('/api/settings/pnl');
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch Meta insights directly using storeId only (no accountIds).
 * This lets the API fall back to DB-stored ad accounts, which are always correct.
 * Using apiClient would auto-inject accountIds from the frontend connection store,
 * which may be stale or contain wrong IDs.
 */
async function fetchInsightsDirectly(
  datePreset: string,
): Promise<{ data: { date: string; metrics: Record<string, number> }[] }> {
  const { useStoreStore } = await import('@/stores/storeStore');
  const storeId = useStoreStore.getState().activeStoreId;
  if (!storeId) return { data: [] };

  const res = await fetch(`/api/meta/insights?storeId=${encodeURIComponent(storeId)}&datePreset=${datePreset}`);
  if (!res.ok) return { data: [] };
  return res.json();
}

// ------ Cost Calculators ------

/**
 * Calculate the total payment processing fee for an order amount.
 * Uses the average across active gateways, or falls back to 3% if none configured.
 */
function calculatePaymentFee(orderAmount: number, fees: PaymentFee[]): number {
  const activeFees = fees.filter((f) => f.isActive);
  if (activeFees.length === 0) {
    return orderAmount * 0.03;
  }
  const avgPct = activeFees.reduce((sum, f) => sum + f.feePercentage, 0) / activeFees.length;
  const avgFixed = activeFees.reduce((sum, f) => sum + f.feeFixed, 0) / activeFees.length;
  return (orderAmount * avgPct / 100) + avgFixed;
}

/**
 * Calculate shipping cost for an order.
 * For digital products: shipping = 0 (any shipping charged is kept as revenue).
 */
function calculateShippingCost(
  order: ShopifyOrder,
  settings: PnLSettings | null,
): number {
  if (!settings) return parseFloat(order.totalPrice) * 0.05;
  if (settings.productType === 'digital') return 0;

  const shipping = settings.shipping;
  if (!shipping) return 0;

  switch (shipping.method) {
    case 'flat_rate':
      return shipping.flatRate || 0;
    case 'percentage':
      return parseFloat(order.subtotalPrice) * ((shipping.percentage || 0) / 100);
    case 'equal_charged':
      return parseFloat(order.totalShippingPrice || '0');
    case 'per_item': {
      const itemCount = order.lineItems.reduce((sum, li) => sum + li.quantity, 0);
      return itemCount * (shipping.perItemRate || 0);
    }
    default:
      return 0;
  }
}

/**
 * Calculate handling cost for an order.
 * For digital products: no handling costs.
 */
function calculateHandlingCost(
  order: ShopifyOrder,
  settings: PnLSettings | null,
): number {
  if (!settings) return 0;
  if (settings.productType === 'digital') return 0;

  const handling = settings.handling;
  if (!handling) return 0;

  switch (handling.feeType) {
    case 'per_order':
      return handling.amount || 0;
    case 'per_item': {
      const itemCount = order.lineItems.reduce((sum, li) => sum + li.quantity, 0);
      return itemCount * (handling.amount || 0);
    }
    case 'percentage':
      return parseFloat(order.subtotalPrice) * ((handling.amount || 0) / 100);
    default:
      return 0;
  }
}

/**
 * Get the revenue for an order.
 *
 * Uses `totalPrice` which matches Shopify Analytics' "Total sales" metric.
 * Shopify Total Sales = Gross Sales - Discounts - Returns + Shipping + Taxes.
 * `totalPrice` = what the customer paid = subtotal + taxes + shipping (discounts already applied).
 *
 * Refunds are tracked separately via financialStatus checks.
 */
function getAdjustedRevenue(order: ShopifyOrder, _settings: PnLSettings | null): number {
  return parseFloat(order.totalPrice);
}

// ------ Shopify Payments Real Fee Fetching ------

/**
 * Fetch Shopify Payments balance transactions and build a map of
 * real processing fees keyed by order ID.
 *
 * Only 'charge' type transactions have fees. Refund transactions have fee=0.
 * Paginates using `last_id` cursor (Shopify returns newest first).
 *
 * Returns Map<orderId, totalFee> — if an order had multiple charges
 * (rare but possible), the fees are summed.
 *
 * Also returns a feesByDate map for days where we don't have per-order data
 * (older days outside the 8-day Shopify window).
 *
 * OPTIMIZATION: Results are cached for 5 minutes to avoid re-fetching
 * when both getPnLSummary and getDailyPnL call this in the same page load.
 * We also stop fetching once transactions are older than 10 days.
 */
interface FeeData {
  feesByOrderId: Map<number, number>;
  feesByDate: Map<string, number>;
}

// Cache + in-flight deduplication for fee data.
// Both getPnLSummary and getDailyPnL call fetchRealTransactionFees concurrently.
// Without deduplication, both would fire separate paginated fetches simultaneously,
// doubling API calls and rate-limit usage.
let _feeDataCache: { data: FeeData; timestamp: number; tz: string } | null = null;
let _feeDataInflight: Promise<FeeData> | null = null;
const FEE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cache today's orders so getPnLSummary can reuse data from getDailyPnL (avoids double-fetch)
let _cachedTodayOrders: { orders: ShopifyOrder[]; timestamp: number; tz: string } | null = null;

/**
 * Clear all P&L caches. Call on manual refresh to get fresh data.
 */
export function clearPnLCaches(): void {
  _feeDataCache = null;
  _cachedTodayOrders = null;
  clearCachePrefix('pnl:');
  clearCachePrefix('product-pnl:');
  console.log('[P&L] Caches cleared');
}

async function fetchRealTransactionFees(tz: string): Promise<FeeData> {
  // Return cached result if fresh enough and same timezone
  if (_feeDataCache && _feeDataCache.tz === tz && (Date.now() - _feeDataCache.timestamp) < FEE_CACHE_TTL_MS) {
    console.log(`[P&L] Using cached Shopify Payments fees (${_feeDataCache.data.feesByOrderId.size} orders)`);
    return _feeDataCache.data;
  }

  // If a fetch is already in-flight, wait for it instead of starting a new one
  if (_feeDataInflight) {
    console.log('[P&L] Waiting for in-flight Shopify Payments fee fetch...');
    return _feeDataInflight;
  }

  // Start the actual fetch and store the promise for deduplication
  _feeDataInflight = _doFetchRealTransactionFees(tz);
  try {
    const result = await _feeDataInflight;
    return result;
  } finally {
    _feeDataInflight = null;
  }
}

async function _doFetchRealTransactionFees(tz: string): Promise<FeeData> {
  const feesByOrderId = new Map<number, number>();
  const feesByDate = new Map<string, number>();
  // Track seen transaction IDs to deduplicate — Shopify Balance Transactions API
  // sometimes returns duplicate charge entries for the same order, causing fees
  // to be double-counted.
  const seenTxnIds = new Set<number>();

  // Calculate the cutoff date — we only need fees for the last 10 days
  // (8-day Shopify order window + 2 days buffer). Older days use Meta revenue
  // with date-based fee fallback which is already populated from recent pages.
  const cutoffDateStr = daysAgoInTimezone(10, tz);

  try {
    let hasMore = true;
    let lastId: string | undefined;
    let pagesLeft = 6; // safety limit — max 1500 transactions (6 × 250), enough for 10 days
    let reachedCutoff = false;

    // Shopify Balance Transactions API returns results in DESCENDING order
    // (newest first). Pagination uses `last_id` — returns transactions with
    // IDs less than the given value (i.e., older transactions).
    while (hasMore && pagesLeft > 0 && !reachedCutoff) {
      const params: Record<string, string> = { limit: '250' };
      if (lastId) params.last_id = lastId;

      let txns: BalanceTransaction[];
      try {
        const response = await apiClient<{ data: BalanceTransaction[] }>(
          '/api/shopify/balance-transactions',
          { params, timeoutMs: 30_000, maxRetries: 2 }
        );
        txns = response.data;
      } catch (pageErr) {
        // If a single page fails, stop paginating but keep what we have
        console.warn(`[P&L] Fee page fetch failed, using ${feesByOrderId.size} orders collected so far:`, pageErr instanceof Error ? pageErr.message : pageErr);
        break;
      }

      if (txns.length === 0) break;

      for (const txn of txns) {
        // Check if this transaction is older than our cutoff (35 days ago).
        // Since results are in descending order, once we hit the cutoff,
        // all remaining transactions will also be too old.
        const dateStr = shopifyDateToStoreDate(txn.processedAt, tz);
        if (dateStr < cutoffDateStr) {
          reachedCutoff = true;
          break;
        }

        // Only 'charge' transactions have processing fees
        if (txn.type !== 'charge') continue;

        // Skip duplicate transactions — Shopify sometimes returns the same
        // charge entry twice with identical fee/amount/date, inflating totals.
        if (seenTxnIds.has(txn.id)) continue;
        seenTxnIds.add(txn.id);

        const fee = parseFloat(txn.fee);

        // ALWAYS register the order in feesByOrderId — even if fee is $0.
        // This prevents orders with zero-fee charges (gift cards, store credit,
        // certain gateway configs) from falling through to the 3% fallback estimate.
        if (txn.sourceOrderId) {
          const existing = feesByOrderId.get(txn.sourceOrderId) || 0;
          feesByOrderId.set(txn.sourceOrderId, existing + Math.max(fee, 0));
        }

        // Bucket fees by date for fallback (only positive fees contribute)
        if (fee > 0) {
          const existingDate = feesByDate.get(dateStr) || 0;
          feesByDate.set(dateStr, existingDate + fee);
        }
      }

      if (txns.length < 250) {
        hasMore = false;
      } else {
        // Use the last (oldest) transaction's ID as cursor for next page
        lastId = String(txns[txns.length - 1].id);
        // Small delay between pages — server-side retry handles rate limits
        await new Promise((r) => setTimeout(r, 150));
      }
      pagesLeft--;
    }

    console.log(`[P&L] Fetched real Shopify Payments fees for ${feesByOrderId.size} orders, ${feesByDate.size} dates, ${seenTxnIds.size} unique txns (deduped)${reachedCutoff ? ' (stopped at 10-day cutoff)' : ''}`);
  } catch (err) {
    // Gracefully handle if the endpoint is not accessible
    console.warn('[P&L] Could not fetch Shopify Payments fees, will use estimated fees:', err instanceof Error ? err.message : err);
  }

  const result = { feesByOrderId, feesByDate };

  // Cache the result
  _feeDataCache = { data: result, timestamp: Date.now(), tz };

  return result;
}

// ------ Shopify Order Fetching with Date Range ------

const PAGE_SIZE = 250; // Shopify max per page

/**
 * Fetch Shopify orders for a date range using since_id pagination (no count call).
 * Directly paginates until all orders are fetched — skips the count-first approach
 * to reduce API calls. Max 15 pages = 3750 orders per range.
 */
async function fetchOrdersForDateRange(
  startDateStr: string,
  endDateStr: string,
  tz: string,
): Promise<ShopifyOrder[]> {
  const startUtc = fromZonedTime(`${startDateStr}T00:00:00`, tz);
  const endUtc = fromZonedTime(`${endDateStr}T23:59:59`, tz);

  const dateParams = {
    created_at_min: startUtc.toISOString(),
    created_at_max: endUtc.toISOString(),
  };

  const allOrders: ShopifyOrder[] = [];
  const seenIds = new Set<number>();
  let pagesLeft = 15; // safety cap

  // Use since_id=0 on first page to force ascending order for stable pagination
  let sinceId = '0';

  while (pagesLeft > 0) {
    const response = await apiClient<{ data: ShopifyOrder[] }>('/api/shopify/orders', {
      params: { limit: String(PAGE_SIZE), since_id: sinceId, ...dateParams },
      timeoutMs: 60_000,
    });

    const orders = response.data;
    if (orders.length === 0) break;

    for (const order of orders) {
      if (!seenIds.has(order.id)) {
        seenIds.add(order.id);
        allOrders.push(order);
      }
    }

    if (orders.length < PAGE_SIZE) break; // Last page
    sinceId = String(allOrders[allOrders.length - 1].id);
    pagesLeft--;
  }

  return allOrders.filter((order) => {
    const orderDate = shopifyDateToStoreDate(order.createdAt, tz);
    return orderDate >= startDateStr && orderDate <= endDateStr;
  });
}

/**
 * Helper: paginate through all orders for a given set of params.
 * Returns deduplicated orders.
 */
async function paginateOrders(
  baseParams: Record<string, string>,
  maxPages = 3,
): Promise<ShopifyOrder[]> {
  const allOrders: ShopifyOrder[] = [];
  const seenIds = new Set<number>();
  const params = { ...baseParams };
  let pagesLeft = maxPages;

  while (pagesLeft > 0) {
    const response = await apiClient<{ data: ShopifyOrder[] }>('/api/shopify/orders', {
      params,
      timeoutMs: 60_000,
    });
    const orders = response.data;
    if (orders.length === 0) break;

    for (const order of orders) {
      if (!seenIds.has(order.id)) {
        seenIds.add(order.id);
        allOrders.push(order);
      }
    }

    if (orders.length < PAGE_SIZE) break;
    const lastOrder = allOrders[allOrders.length - 1];
    if (lastOrder) params.since_id = String(lastOrder.id);
    pagesLeft--;
  }

  return allOrders;
}

/**
 * Fetch refunded/partially_refunded orders matching given params.
 *
 * IMPORTANT: Shopify's financial_status filter does NOT support comma-separated
 * values. We must make two separate calls (one for 'refunded', one for
 * 'partially_refunded') and merge the results.
 */
async function fetchRefundedOrders(
  extraParams: Record<string, string>,
): Promise<ShopifyOrder[]> {
  const baseParams = { limit: String(PAGE_SIZE), ...extraParams };

  // Two separate calls — Shopify doesn't support comma-separated financial_status
  const [refunded, partiallyRefunded] = await Promise.all([
    paginateOrders({ ...baseParams, financial_status: 'refunded' }),
    paginateOrders({ ...baseParams, financial_status: 'partially_refunded' }),
  ]);

  // Merge and deduplicate
  const seenIds = new Set<number>();
  const merged: ShopifyOrder[] = [];
  for (const order of [...refunded, ...partiallyRefunded]) {
    if (!seenIds.has(order.id)) {
      seenIds.add(order.id);
      merged.push(order);
    }
  }
  return merged;
}

/**
 * Fetch refunded orders for the full display window.
 *
 * Two sources of refunds:
 * 1. Orders created WITHIN the window that are refunded/partially_refunded
 *    (the refund may have happened on a different day than the order)
 * 2. Orders created BEFORE the window that were refunded WITHIN the window
 *    (uses updated_at to find recently-updated old orders)
 *
 * For source 1, we exclude orders in the Shopify per-day window (those are
 * already fetched by the main order fetches).
 */
async function fetchAllRefundedOrders(
  displayStartDateStr: string,
  displayEndDateStr: string,
  shopifyWindowStartDateStr: string,
  tz: string,
): Promise<ShopifyOrder[]> {
  const displayStartUtc = fromZonedTime(`${displayStartDateStr}T00:00:00`, tz);
  const displayEndUtc = fromZonedTime(`${displayEndDateStr}T23:59:59`, tz);
  const shopifyWindowStartUtc = fromZonedTime(`${shopifyWindowStartDateStr}T00:00:00`, tz);

  // Source 1: Refunded orders created in the older part of the display window
  // (before the Shopify per-day window which is already fetched)
  const olderWindowParams: Record<string, string> = {
    created_at_min: displayStartUtc.toISOString(),
    created_at_max: shopifyWindowStartUtc.toISOString(),
  };

  // Source 2: Orders created BEFORE the display window but refunded within it
  const outsideWindowParams: Record<string, string> = {
    updated_at_min: displayStartUtc.toISOString(),
    updated_at_max: displayEndUtc.toISOString(),
    created_at_max: displayStartUtc.toISOString(),
  };

  const [olderWindowOrders, outsideOrders] = await Promise.all([
    fetchRefundedOrders(olderWindowParams),
    fetchRefundedOrders(outsideWindowParams),
  ]);

  // Merge and deduplicate
  const seenIds = new Set<number>();
  const merged: ShopifyOrder[] = [];
  for (const order of [...olderWindowOrders, ...outsideOrders]) {
    if (!seenIds.has(order.id)) {
      seenIds.add(order.id);
      merged.push(order);
    }
  }
  return merged;
}

/**
 * Extract all refunds from a set of orders, bucketed by refund creation date
 * in the store timezone (not order creation date).
 *
 * Returns a Map<dateStr, { fullRefundCount, fullRefundAmount, partialRefundCount, partialRefundAmount, totalRefunds }>
 */
interface RefundDayBucket {
  fullRefundCount: number;
  fullRefundAmount: number;
  partialRefundCount: number;
  partialRefundAmount: number;
  totalRefunds: number;
}

function collectRefundsByDate(orders: ShopifyOrder[], tz: string): Map<string, RefundDayBucket> {
  const map = new Map<string, RefundDayBucket>();

  const getOrCreate = (dateStr: string): RefundDayBucket => {
    let bucket = map.get(dateStr);
    if (!bucket) {
      bucket = { fullRefundCount: 0, fullRefundAmount: 0, partialRefundCount: 0, partialRefundAmount: 0, totalRefunds: 0 };
      map.set(dateStr, bucket);
    }
    return bucket;
  };

  for (const order of orders) {
    if (!order.refunds || order.refunds.length === 0) continue;

    const isFullRefund = order.financialStatus === 'refunded';

    for (const refund of order.refunds) {
      if (refund.totalAmount <= 0) continue;

      // Use the refund's creation date, not the order's creation date
      const refundDateStr = shopifyDateToStoreDate(refund.createdAt, tz);
      const bucket = getOrCreate(refundDateStr);

      if (isFullRefund) {
        bucket.fullRefundCount++;
        bucket.fullRefundAmount += refund.totalAmount;
      } else {
        bucket.partialRefundCount++;
        bucket.partialRefundAmount += refund.totalAmount;
      }
      bucket.totalRefunds += refund.totalAmount;
    }
  }

  return map;
}

// ------ Real Implementation ------

async function mockGetPnLSummary(): Promise<PnLSummary> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockPnLSummary;
}

async function realGetPnLSummaryUncached(): Promise<PnLSummary> {
  const tz = getStoreTimezone();
  const todayStr = todayInTimezone(tz);

  // Reuse today's orders from getDailyPnL if available (cached within last 2 min).
  // This avoids a duplicate Shopify orders fetch — the page calls getDailyPnL first.
  const useCachedOrders = _cachedTodayOrders
    && _cachedTodayOrders.tz === tz
    && (Date.now() - _cachedTodayOrders.timestamp) < 120_000;

  // Fetch refunded orders + Meta insights + fees (all use caches if getDailyPnL ran first)
  const [orders, refundedOlderOrders, historicalRes, recentRes, todayRes, pnlSettings, realFees] = await Promise.all([
    useCachedOrders
      ? Promise.resolve(_cachedTodayOrders!.orders)
      : fetchOrdersForDateRange(todayStr, todayStr, tz),
    fetchAllRefundedOrders(todayStr, todayStr, todayStr, tz),
    fetchInsightsDirectly('last_30d'),
    fetchInsightsDirectly('last_7d'),
    fetchInsightsDirectly('today'),
    fetchPnLSettings(),
    fetchRealTransactionFees(tz), // uses 5-min cache — instant if getDailyPnL ran first
  ]);

  // Merge with priority: today > last_7d > last_30d (more recent data wins)
  const insights = mergeInsights(historicalRes.data, recentRes.data, todayRes.data);

  // Collect refunds by refund date from ALL orders (today's + older refunded)
  const allOrdersForRefunds = [...orders, ...refundedOlderOrders];
  const refundsByDate = collectRefundsByDate(allOrdersForRefunds, tz);
  const todayRefunds = refundsByDate.get(todayStr);

  // Compute today's P&L from Shopify orders (revenue = non-refunded orders)
  const todayAcc = {
    revenue: 0, shipping: 0, fees: 0, cogs: 0,
    refunds: todayRefunds?.totalRefunds || 0,
    fullRefundCount: todayRefunds?.fullRefundCount || 0,
    partialRefundCount: todayRefunds?.partialRefundCount || 0,
    fullRefundAmount: todayRefunds?.fullRefundAmount || 0,
    partialRefundAmount: todayRefunds?.partialRefundAmount || 0,
  };

  let realFeeCount = 0, fallbackFeeCount = 0, realFeeTotal = 0, fallbackFeeTotal = 0;
  for (const order of orders) {
    // Skip fully refunded orders from revenue — their refund amounts are tracked by refund date above
    if (order.financialStatus === 'refunded') {
      continue;
    }

    const revenue = getAdjustedRevenue(order, pnlSettings);
    const shippingCost = calculateShippingCost(order, pnlSettings);
    const handlingCost = calculateHandlingCost(order, pnlSettings);

    // Use real Shopify Payments fee if available, otherwise fall back to settings-based estimate
    let paymentFee: number;
    if (realFees.feesByOrderId.has(order.id)) {
      paymentFee = realFees.feesByOrderId.get(order.id)!;
      realFeeCount++;
      realFeeTotal += paymentFee;
    } else {
      // Non-Shopify-Payments order (PayPal, etc.) — use settings-based calculation
      paymentFee = calculatePaymentFee(revenue, pnlSettings?.paymentFees || []);
      fallbackFeeCount++;
      fallbackFeeTotal += paymentFee;
    }

    const isDigital = pnlSettings?.productType === 'digital';
    const cogs = isDigital ? 0 : revenue * 0.3;

    todayAcc.revenue += revenue;
    todayAcc.shipping += shippingCost;
    todayAcc.fees += paymentFee + handlingCost;
    todayAcc.cogs += cogs;
  }
  console.log(`[P&L Summary] Fee breakdown: ${realFeeCount} orders with real fees ($${realFeeTotal.toFixed(2)}), ${fallbackFeeCount} orders with 3% fallback ($${fallbackFeeTotal.toFixed(2)}), total: $${todayAcc.fees.toFixed(2)}`);

  const todayAdSpend = insights
    .filter((d) => d.date === todayStr)
    .reduce((sum, d) => sum + (d.metrics.spend || 0), 0);

  const buildEntry = (
    date: string,
    p: typeof todayAcc,
    adSpend: number,
    orderCount: number,
  ): PnLEntry => {
    const netProfit = p.revenue - p.cogs - adSpend - p.shipping - p.fees - p.refunds;
    const margin = p.revenue > 0 ? (netProfit / p.revenue) * 100 : 0;
    return {
      date,
      revenue: p.revenue,
      cogs: p.cogs,
      adSpend,
      shipping: p.shipping,
      fees: p.fees,
      refunds: p.refunds,
      netProfit,
      margin,
      orderCount,
      fullRefundCount: p.fullRefundCount,
      partialRefundCount: p.partialRefundCount,
      fullRefundAmount: p.fullRefundAmount,
      partialRefundAmount: p.partialRefundAmount,
    };
  };

  const todayEntry = buildEntry(todayStr, todayAcc, todayAdSpend, orders.length);
  // Use the same entry for all periods — the actual breakdown comes from getDailyPnL()
  const emptyEntry: PnLEntry = { date: todayStr, revenue: 0, cogs: 0, adSpend: 0, shipping: 0, fees: 0, refunds: 0, netProfit: 0, margin: 0, orderCount: 0 };

  return {
    today: todayEntry,
    thisWeek: emptyEntry,
    thisMonth: emptyEntry,
    allTime: emptyEntry,
    productType: pnlSettings?.productType || 'physical',
  };
}

async function realGetPnLSummary(): Promise<PnLSummary> {
  const key = buildStoreScopedKey('pnl:summary');
  return memoizePromise(key, 45_000, realGetPnLSummaryUncached);
}

async function mockGetDailyPnL(): Promise<PnLEntry[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockDailyPnL;
}

async function realGetDailyPnLUncached(): Promise<PnLEntry[]> {
  const tz = getStoreTimezone();
  const todayStr = todayInTimezone(tz);

  const SHOPIFY_DAYS = 8;
  const dayDates: string[] = [];
  for (let i = 0; i < SHOPIFY_DAYS; i++) {
    dayDates.push(daysAgoInTimezone(i, tz));
  }

  const earliestShopifyDate = dayDates[dayDates.length - 1];
  const displayStartDate = daysAgoInTimezone(30, tz);

  // Fetch EVERYTHING in parallel — single range for all 8 days of orders,
  // Meta insights, P&L settings, refund orders, and transaction fees all at once.
  // Server-side retry on fetchFromShopify handles 429/503 rate limits.
  const [
    historicalRes, recentRes, todayRes, pnlSettings,
    allShopifyOrders, refundedOrders, realFees,
  ] = await Promise.all([
    fetchInsightsDirectly('last_30d'),
    fetchInsightsDirectly('last_7d'),
    fetchInsightsDirectly('today'),
    fetchPnLSettings(),
    // ONE range call for all 8 days instead of 8 separate day calls
    fetchOrdersForDateRange(earliestShopifyDate, todayStr, tz),
    fetchAllRefundedOrders(displayStartDate, todayStr, earliestShopifyDate, tz),
    fetchRealTransactionFees(tz),
  ]);

  // Merge with priority: today > last_7d > last_30d (more recent data wins)
  const mergedInsights = mergeInsights(historicalRes.data, recentRes.data, todayRes.data);

  // Build a map of Meta insights by date for O(1) lookup
  const insightsByDate = new Map<string, Record<string, number>>();
  for (const day of mergedInsights) {
    insightsByDate.set(day.date, day.metrics);
  }

  // Group fetched orders by date in the store timezone
  const ordersByDate = new Map<string, ShopifyOrder[]>();
  let totalShopifyOrders = 0;
  let totalShopifyRevenue = 0;
  let totalRefundedOrders = 0;
  console.log(`[P&L] Today in store TZ (${tz}): ${todayStr}`);

  for (const order of allShopifyOrders) {
    const dateStr = shopifyDateToStoreDate(order.createdAt, tz);
    if (!ordersByDate.has(dateStr)) ordersByDate.set(dateStr, []);
    ordersByDate.get(dateStr)!.push(order);
    totalShopifyOrders++;
    if (order.financialStatus === 'refunded') {
      totalRefundedOrders++;
    } else {
      totalShopifyRevenue += parseFloat(order.totalPrice);
    }
  }

  // Cache today's orders so getPnLSummary can reuse them
  const todayOrders = ordersByDate.get(todayStr) || [];
  _cachedTodayOrders = { orders: todayOrders, timestamp: Date.now(), tz };

  for (const dateStr of dayDates) {
    const orders = ordersByDate.get(dateStr) || [];
    const nonRefunded = orders.filter(o => o.financialStatus !== 'refunded');
    const refundedCount = orders.length - nonRefunded.length;
    const dayRevenue = nonRefunded.reduce((sum, o) => sum + parseFloat(o.totalPrice), 0);
    console.log(`[P&L] ${dateStr}: ${orders.length} orders (${refundedCount} refunded), revenue $${dayRevenue.toFixed(2)}`);
  }
  console.log(`[P&L] === SHOPIFY 8-DAY TOTAL: ${totalShopifyOrders} orders (${totalRefundedOrders} refunded), revenue $${totalShopifyRevenue.toFixed(2)} ===`);
  console.log(`[P&L] Fetched ${refundedOrders.length} older orders with refunds in our window`);
  console.log(`[P&L] Real Shopify Payments fees: ${realFees.feesByOrderId.size} orders mapped, ${realFees.feesByDate.size} dates mapped`);

  // Build refund-by-date map from ALL orders (window orders + older refunded orders).
  // This assigns refund amounts to the day the REFUND happened, not the day the ORDER was placed.
  const allOrdersForRefunds = [...allShopifyOrders, ...refundedOrders];
  const refundsByDate = collectRefundsByDate(allOrdersForRefunds, tz);

  // Log refund-by-date breakdown
  for (const [dateStr, bucket] of Array.from(refundsByDate.entries()).sort()) {
    console.log(`[P&L] Refunds on ${dateStr}: $${bucket.totalRefunds.toFixed(2)} (${bucket.fullRefundCount} full: $${bucket.fullRefundAmount.toFixed(2)}, ${bucket.partialRefundCount} partial: $${bucket.partialRefundAmount.toFixed(2)})`);
  }

  // Generate entries for ALL days in the last 31 days (last_30d + today).
  const allDates: string[] = [];
  for (let i = 30; i >= 0; i--) {
    allDates.push(daysAgoInTimezone(i, tz));
  }
  if (!allDates.includes(todayStr)) {
    allDates.push(todayStr);
  }

  // Include extra dates from Meta insights that might be outside our window
  for (const date of insightsByDate.keys()) {
    if (!allDates.includes(date)) allDates.push(date);
  }

  allDates.sort();

  return allDates.map((dateStr) => {
    const metrics = insightsByDate.get(dateStr);
    const adSpend = metrics?.spend || 0;
    const dayOrders = ordersByDate.get(dateStr) || [];

    // Get refunds for this day from the refund-by-date map (refunds are bucketed by refund date)
    const dayRefunds = refundsByDate.get(dateStr);

    let revenue = 0;
    let shipping = 0;
    let fees = 0;

    if (dayOrders.length > 0) {
      // Compute revenue from actual Shopify orders (excluding fully refunded ones)
      let dayRealFeeCount = 0, dayFallbackCount = 0, dayRealFees = 0, dayFallbackFees = 0;
      for (const order of dayOrders) {
        if (order.financialStatus === 'refunded') {
          // Skip fully refunded orders from revenue — refund amounts tracked by refund date
          continue;
        }
        const rev = getAdjustedRevenue(order, pnlSettings);
        revenue += rev;
        shipping += calculateShippingCost(order, pnlSettings);

        // Use real Shopify Payments fee if available, otherwise fall back to settings-based estimate
        if (realFees.feesByOrderId.has(order.id)) {
          const realFee = realFees.feesByOrderId.get(order.id)!;
          fees += realFee;
          dayRealFeeCount++;
          dayRealFees += realFee;
        } else {
          // Non-Shopify-Payments order (PayPal, etc.) — use settings-based calculation
          const fallbackFee = calculatePaymentFee(rev, pnlSettings?.paymentFees || []);
          fees += fallbackFee;
          dayFallbackCount++;
          dayFallbackFees += fallbackFee;
        }
        fees += calculateHandlingCost(order, pnlSettings);
      }
      if (dateStr === todayStr) {
        console.log(`[P&L Daily] ${dateStr} fee breakdown: ${dayRealFeeCount} real ($${dayRealFees.toFixed(2)}), ${dayFallbackCount} fallback ($${dayFallbackFees.toFixed(2)}), total: $${fees.toFixed(2)}`);
      }
    } else if (metrics) {
      // No Shopify orders this day — use Meta revenue as fallback.
      // Use real Shopify Payments fees for this date if available, else estimate at 3%.
      revenue = metrics.revenue || 0;
      if (realFees.feesByDate.has(dateStr)) {
        fees = realFees.feesByDate.get(dateStr)!;
      } else {
        fees = revenue * 0.03;
      }
    }

    // Refund amounts come from refund-by-date (when refund happened, not when order was placed)
    const refunds = dayRefunds?.totalRefunds || 0;
    const fullRefundCount = dayRefunds?.fullRefundCount || 0;
    const partialRefundCount = dayRefunds?.partialRefundCount || 0;
    const fullRefundAmount = dayRefunds?.fullRefundAmount || 0;
    const partialRefundAmount = dayRefunds?.partialRefundAmount || 0;

    const isDigital = pnlSettings?.productType === 'digital';
    const cogs = isDigital ? 0 : revenue * 0.3;
    const netProfit = revenue - cogs - adSpend - shipping - fees - refunds;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      date: dateStr,
      revenue,
      cogs,
      adSpend,
      shipping,
      fees,
      refunds,
      netProfit,
      margin,
      orderCount: dayOrders.length,
      fullRefundCount,
      partialRefundCount,
      fullRefundAmount,
      partialRefundAmount,
    };
  });
}

async function realGetDailyPnL(): Promise<PnLEntry[]> {
  const key = buildStoreScopedKey('pnl:daily');
  return memoizePromise(key, 45_000, realGetDailyPnLUncached);
}

export const getPnLSummary = createServiceFn<PnLSummary>(
  'meta',
  mockGetPnLSummary,
  realGetPnLSummary
);

export const getDailyPnL = createServiceFn<PnLEntry[]>(
  'meta',
  mockGetDailyPnL,
  realGetDailyPnL
);

async function mockGetProducts(): Promise<ProductCOGS[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockProducts;
}

async function realGetProductsUncached(): Promise<ProductCOGS[]> {
  const response = await apiClient<{
    data: { id: number; title: string; variants: { sku: string; price: string; compareAtPrice: string | null }[] }[];
  }>('/api/shopify/products');

  return response.data.map((product) => {
    const variant = product.variants[0];
    const sellingPrice = parseFloat(variant?.price || '0');
    const costPerUnit = sellingPrice * 0.3;
    const margin = sellingPrice > 0 ? ((sellingPrice - costPerUnit) / sellingPrice) * 100 : 0;

    return {
      productId: String(product.id),
      productName: product.title,
      sku: variant?.sku || '',
      costPerUnit,
      sellingPrice,
      margin,
    };
  });
}

async function realGetProducts(): Promise<ProductCOGS[]> {
  const key = buildStoreScopedKey('pnl:products');
  return memoizePromise(key, 5 * 60_000, realGetProductsUncached);
}

export const getProducts = createServiceFn<ProductCOGS[]>(
  'shopify',
  mockGetProducts,
  realGetProducts
);

// ------ Hourly P&L ------

// Helper: generate hourly labels
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return '12am';
  if (i < 12) return `${i}am`;
  if (i === 12) return '12pm';
  return `${i - 12}pm`;
});

async function mockGetHourlyPnL(): Promise<HourlyPnLEntry[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockHourlyPnL;
}

async function realGetHourlyPnLUncached(): Promise<HourlyPnLEntry[]> {
  const { useStoreStore } = await import('@/stores/storeStore');
  const storeId = useStoreStore.getState().activeStoreId;
  if (!storeId) return [];

  const res = await fetch(
    `/api/meta/insights?storeId=${encodeURIComponent(storeId)}&datePreset=last_30d&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone`
  );
  if (!res.ok) return [];

  const json = await res.json() as {
    data: { date: string; hour: number; metrics: Record<string, number> }[];
  };

  return (json.data || []).map((row) => {
    const m = row.metrics;
    const spend = m.spend || 0;
    const revenue = m.revenue || 0;
    const impressions = m.impressions || 0;
    const clicks = m.clicks || 0;
    const conversions = m.conversions || 0;

    return {
      date: row.date,
      hour: row.hour,
      hourLabel: HOUR_LABELS[row.hour] || `${row.hour}h`,
      spend,
      revenue,
      roas: spend > 0 ? revenue / spend : 0,
      impressions,
      clicks,
      conversions,
      cpa: conversions > 0 ? spend / conversions : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    };
  });
}

async function realGetHourlyPnL(): Promise<HourlyPnLEntry[]> {
  const key = buildStoreScopedKey('pnl:hourly');
  return memoizePromise(key, 45_000, realGetHourlyPnLUncached);
}

export const getHourlyPnL = createServiceFn<HourlyPnLEntry[]>(
  'meta',
  mockGetHourlyPnL,
  realGetHourlyPnL
);

// ------ Helpers ------

type InsightDay = { date: string; metrics: Record<string, number> };

/**
 * Merge multiple insight arrays with priority (later arrays win on duplicate dates).
 * Usage: mergeInsights(last_30d, last_7d, today) — today wins over last_7d wins over last_30d.
 */
function mergeInsights(...sources: InsightDay[][]): InsightDay[] {
  const map = new Map<string, InsightDay>();
  // Process in order — later sources overwrite earlier ones for the same date
  for (const source of sources) {
    for (const day of source) {
      map.set(day.date, day);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
