import { NextRequest, NextResponse } from 'next/server';
import { rest, getPersistentProductCosts } from '@/app/api/lib/supabase-persistence';
import { getStoreDateRangeForPeriod } from '@/lib/pnl/dateUtils';
import { getOrderFees } from '@/lib/pnl/orderFeeSync';

/**
 * Get the store's timezone from ad account settings (server-side).
 */
async function getStoreTz(storeId: string): Promise<string> {
  try {
    const accounts = await rest<Array<{ timezone: string | null }>>(
      `/store_ad_accounts?store_id=eq.${encodeURIComponent(storeId)}&is_active=eq.1&select=timezone&limit=1`
    );
    return accounts?.[0]?.timezone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

export interface ProductBreakdownItem {
  product_id: string;
  title: string;
  image: string | null;
  vendor: string | null;
  product_type: string | null;
  requires_shipping: boolean;
  classification: 'MAIN' | 'UPSELL' | 'BUNDLE';
  units_sold: number;
  revenue: number;
  refunds: number;
  cogs: number;
  cost_per_unit: number;
  fees: number;
  ad_spend: number;
  net_profit: number;
  margin_pct: number;
  order_count: number;
}

// ── Server-side in-memory cache ────────────────────────────────────────────
interface CachedBreakdown {
  breakdown: ProductBreakdownItem[];
  timestamp: number;
}
const breakdownCache = new Map<string, CachedBreakdown>();
const CACHE_TTL_HISTORICAL = 15 * 60 * 1000; // 15 min
const CACHE_TTL_TODAY = 2 * 60 * 1000;        // 2 min

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}
// ── End cache ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const dateFrom = searchParams.get('from');
  const dateTo = searchParams.get('to');

  if (!storeId || !dateFrom || !dateTo) {
    return NextResponse.json({ error: 'storeId, from, and to are required' }, { status: 400 });
  }

  // Check cache
  const cacheKey = `${storeId}:${dateFrom}:${dateTo}`;
  const cached = breakdownCache.get(cacheKey);
  const includestoday = dateTo >= todayStr();
  const ttl = includestoday ? CACHE_TTL_TODAY : CACHE_TTL_HISTORICAL;
  if (cached && (Date.now() - cached.timestamp) < ttl) {
    return NextResponse.json({ ok: true, breakdown: cached.breakdown, dateFrom, dateTo, cached: true });
  }

  try {
    // Use same timezone-aware date bounds as universalCalculator (exact same function)
    const storeTz = await getStoreTz(storeId);
    const { start: tzStart, end: tzEnd } = getStoreDateRangeForPeriod(dateFrom, dateTo, storeTz);

    // Fetch from shopify_orders_cache (same source as universalCalculator) — NOT live Shopify API.
    // This ensures identical date boundaries and avoids rate limits.
    const [cachedOrders, storedCosts, dailyCache, productConfigRows, productIntelRows] = await Promise.all([
      rest<Array<{ shopify_order_id: string; total_price: number; subtotal_price: number; financial_status: string; order_status: string; line_items: string }>>(
        `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}&and=(created_at.gte.${encodeURIComponent(tzStart)},created_at.lte.${encodeURIComponent(tzEnd)})&select=shopify_order_id,total_price,subtotal_price,financial_status,order_status,line_items&order=created_at.asc&limit=1000`
      ).catch(() => []),
      getPersistentProductCosts(storeId).catch(() => []),
      rest<Array<{ revenue: number; ad_spend: number; fees: number }>>(
        `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${dateFrom}&date=lte.${dateTo}&select=revenue,ad_spend:ad_spend,fees:transaction_fees`
      ).catch(() =>
        rest<Array<{ revenue: number; ad_spend: number; fees: number }>>(
          `/pnl_daily_cache?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${dateFrom}&date=lte.${dateTo}&select=revenue,ad_spend,fees`
        ).catch(() => [])
      ),
      // product_config = merchant-configured main products (highest priority)
      rest<Array<{ product_id: string }>>(
        `/product_config?store_id=eq.${encodeURIComponent(storeId)}&is_active=eq.true&select=product_id`
      ).catch(() => [] as Array<{ product_id: string }>),
      // product_intelligence = PRISM behavioral classification (fallback)
      rest<Array<{ product_id: string; classification: string; manual_override: boolean; manual_classification: string | null }>>(
        `/product_intelligence?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,classification,manual_override,manual_classification`
      ).catch(() => [] as Array<{ product_id: string; classification: string; manual_override: boolean; manual_classification: string | null }>),
    ]);

    // Classification priority: product_config (merchant) > product_intelligence (PRISM) > heuristic
    // Products in product_config are always MAIN (merchant explicitly configured them)
    const configMainIds = new Set(productConfigRows.map(r => r.product_id));
    const intelClassMap = new Map<string, string>();
    for (const row of productIntelRows) {
      const cls = row.manual_override && row.manual_classification
        ? row.manual_classification : row.classification;
      if (cls) intelClassMap.set(row.product_id, cls);
    }
    const hasPrismData = configMainIds.size > 0 || intelClassMap.size > 0;

    // Build COGS lookup
    const cogsMap = new Map<string, number>();
    for (const c of storedCosts) {
      cogsMap.set(c.product_id, c.cost_per_unit);
    }

    // ── Ad Spend: from meta_spend_cache ────────────────────────────────────
    let totalAdSpend = 0;
    try {
      const spendRows = await rest<Array<{ spend: number }>>(
        `/meta_spend_cache?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${dateFrom}&date=lte.${dateTo}&select=spend`
      );
      totalAdSpend = spendRows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
    } catch { /* no spend data */ }

    // ── ALL costs by PROCESSED DATE — auto-detected from BT types ──────────
    const costs = {
      refunds: 0, chargebackLoss: 0, chargebackWon: 0, chargebackFees: 0,
      reserveHold: 0, credits: 0, debits: 0,
    };
    const costDetails: Array<{ type: string; amount: number; fee: number; net: number }> = [];
    try {
      const btByDate = await rest<Array<{ type: string; amount: string; fee: string; net: string }>>(
        `/shopify_balance_transactions?store_id=eq.${encodeURIComponent(storeId)}&type=neq.charge&type=neq.payout&and=(processed_at.gte.${encodeURIComponent(tzStart)},processed_at.lte.${encodeURIComponent(tzEnd)})&select=type,amount,fee,net`
      );
      for (const t of btByDate) {
        const amount = parseFloat(t.amount || '0');
        const fee = Math.abs(parseFloat(t.fee || '0'));
        const net = parseFloat(t.net || '0');
        costDetails.push({ type: t.type, amount, fee, net });

        switch (t.type) {
          case 'refund': costs.refunds += Math.abs(amount); break;
          case 'dispute':
            if (fee > 0) costs.chargebackFees += fee;
            if (net < 0) costs.chargebackLoss += Math.abs(net) - fee;
            else costs.chargebackWon += net;
            break;
          case 'reserve': costs.reserveHold += amount; break;
          case 'credit': costs.credits += amount; break;
          case 'debit': case 'adjustment': costs.debits += Math.abs(amount); break;
        }
      }
    } catch { /* no BT data */ }
    // ── End costs ────────────────────────────────────────────────────────────

    // Aggregate per product from cached order line_items
    interface ProductAgg {
      title: string;
      unitsSold: number;
      revenue: number;
      fees: number; // exact BT fees (or estimated for unsettled orders)
      orderIds: Set<string>;
    }
    const productMap = new Map<string, ProductAgg>();
    const classificationCounts = new Map<string, { main: number; upsell: number; bundle: number }>();
    let orderTotalRevenue = 0;
    let totalFees = 0;

    // Get EXACT fees for ALL orders (BT + Shopify API for missing ones — 100% coverage)
    const paidOrderIds = cachedOrders
      .filter(o => o.financial_status !== 'refunded' && o.financial_status !== 'voided' && Number(o.total_price) > 0)
      .map(o => String(o.shopify_order_id));
    const orderFeeMap = await getOrderFees(storeId, paidOrderIds);

    for (const order of cachedOrders) {
      if (order.financial_status === 'refunded' || order.financial_status === 'voided') continue;

      let lineItems: Array<{ product_id?: string | number; title?: string; price?: string; quantity?: number }>;
      try {
        lineItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || [];
      } catch { continue; }
      if (lineItems.length === 0) continue;

      const orderPrice = Number(order.total_price) || 0;
      orderTotalRevenue += orderPrice;

      const oid = String(order.shopify_order_id);
      const orderFee = orderFeeMap.get(oid) ?? 0;
      totalFees += orderFee;

      // Fallback: find highest-price line item (only used when no PRISM data)
      let maxPrice = -1;
      let maxPid = '';
      if (!hasPrismData) {
        for (const item of lineItems) {
          const pid = item.product_id ? String(item.product_id) : '';
          if (!pid || pid === 'null' || pid === '0') continue;
          const price = parseFloat(item.price ?? '0');
          if (price > maxPrice) { maxPrice = price; maxPid = pid; }
        }
      }

      // Compute line item total for proportional fee distribution within this order
      const orderLineTotal = lineItems.reduce((s, i) => s + parseFloat(i.price ?? '0') * (i.quantity ?? 1), 0);

      for (const item of lineItems) {
        const pid = item.product_id ? String(item.product_id) : '';
        if (!pid || pid === 'null' || pid === '0') continue;

        const lineRevenue = parseFloat(item.price ?? '0') * (item.quantity ?? 1);
        // Distribute this order's fee proportionally to this line item
        const lineFee = orderLineTotal > 0 ? orderFee * (lineRevenue / orderLineTotal) : 0;

        const existing = productMap.get(pid);
        if (existing) {
          existing.unitsSold += item.quantity ?? 1;
          existing.revenue += lineRevenue;
          existing.fees += lineFee;
          existing.orderIds.add(oid);
        } else {
          productMap.set(pid, {
            title: item.title ?? 'Unknown',
            unitsSold: item.quantity ?? 1,
            revenue: lineRevenue,
            fees: lineFee,
            orderIds: new Set([oid]),
          });
        }

        if (!hasPrismData) {
          if (!classificationCounts.has(pid)) classificationCounts.set(pid, { main: 0, upsell: 0, bundle: 0 });
          const counts = classificationCounts.get(pid)!;
          const price = parseFloat(item.price ?? '0');
          if (price === 0) counts.bundle++;
          else if (pid === maxPid) counts.main++;
          else counts.upsell++;
        }
      }
    }

    // Classification resolver: product_config > product_intelligence > heuristic
    const getClassification = (pid: string): 'MAIN' | 'UPSELL' | 'BUNDLE' => {
      // Priority 1: product_config — merchant explicitly configured these as main products
      if (configMainIds.size > 0) {
        return configMainIds.has(pid) ? 'MAIN' : 'UPSELL';
      }
      // Priority 2: product_intelligence — PRISM behavioral classification
      const intelClass = intelClassMap.get(pid);
      if (intelClass) {
        switch (intelClass) {
          case 'main': case 'subscription': return 'MAIN';
          case 'upsell': case 'downsell': case 'gift': return 'UPSELL';
          case 'bundle': return 'BUNDLE';
          case 'excluded': return 'UPSELL';
          default: return 'UPSELL';
        }
      }
      // Priority 3: highest-price heuristic (only when no classification data at all)
      const counts = classificationCounts.get(pid);
      if (!counts) return 'MAIN';
      const { main, upsell, bundle } = counts;
      if (bundle >= main && bundle >= upsell && bundle > 0) return 'BUNDLE';
      if (upsell > main) return 'UPSELL';
      return 'MAIN';
    }
    // ── End classification ───────────────────────────────────────────────────

    // Build final breakdown
    const breakdown: ProductBreakdownItem[] = [];

    // Line-item revenue total (per-product breakdown denominator)
    const lineItemRevenueTotal = Array.from(productMap.values())
      .reduce((s, agg) => s + agg.revenue, 0);

    // Revenue source: order total_price (what Shopify shows) is the primary source.
    // BT revenue can lag for recent days due to settlement delays.
    // Use order total_price as the real revenue, matching what merchant sees in Shopify.
    const productRevenueTotal = orderTotalRevenue > 0 ? orderTotalRevenue : lineItemRevenueTotal;

    // totalFees was already accumulated per-order in the loop above (exact BT + estimated unsettled)

    // When merchant has product_config (free_plus_shipping etc.), distribute ad spend
    // to MAIN products by order count, not revenue (since main products may be $0).
    // Fees still follow revenue (they're charged on actual transaction amounts).
    const mainOrderTotal = configMainIds.size > 0
      ? Array.from(productMap.entries())
          .filter(([pid]) => configMainIds.has(pid))
          .reduce((s, [, agg]) => s + agg.orderIds.size, 0)
      : 0;

    // Scale per-product line-item revenue to match order total_price sum.
    // Line-item revenue = price × qty per product (can differ from total_price due to discounts, tax, shipping).
    // order total_price = what Shopify shows = what merchant sees.
    const revenueScale = (orderTotalRevenue > 0 && lineItemRevenueTotal > 0)
      ? orderTotalRevenue / lineItemRevenueTotal : 1;

    for (const [productId, agg] of Array.from(productMap.entries())) {
      const costPerUnit = cogsMap.get(productId) ?? 0;
      const cogs = costPerUnit * agg.unitsSold;

      // Scale revenue to match order total_price (what Shopify shows)
      const scaledRevenue = agg.revenue * revenueScale;
      // Fees already accumulated per product from exact BT data
      const fees = agg.fees;

      // Ad spend: distribute to MAIN products by order count when product_config exists
      let adSpend: number;
      if (configMainIds.size > 0 && mainOrderTotal > 0) {
        adSpend = configMainIds.has(productId)
          ? totalAdSpend * (agg.orderIds.size / mainOrderTotal)
          : 0;
      } else {
        const revShare = lineItemRevenueTotal > 0 ? agg.revenue / lineItemRevenueTotal : 0;
        adSpend = totalAdSpend * revShare;
      }

      const netProfit = scaledRevenue - cogs - fees - adSpend;
      const marginPct = scaledRevenue > 0 ? (netProfit / scaledRevenue) * 100 : 0;

      breakdown.push({
        product_id: productId,
        title: agg.title,
        image: null,
        vendor: null,
        product_type: null,
        requires_shipping: true,
        classification: getClassification(productId),
        units_sold: agg.unitsSold,
        revenue: Math.round(scaledRevenue * 100) / 100,
        refunds: 0,
        cogs: Math.round(cogs * 100) / 100,
        cost_per_unit: costPerUnit,
        fees: Math.round(fees * 100) / 100,
        ad_spend: Math.round(adSpend * 100) / 100,
        net_profit: Math.round(netProfit * 100) / 100,
        margin_pct: Math.round(marginPct * 10) / 10,
        order_count: agg.orderIds.size,
      });
    }

    breakdown.sort((a, b) => b.revenue - a.revenue);

    // Store in cache
    breakdownCache.set(cacheKey, { breakdown, timestamp: Date.now() });

    const r2 = (n: number) => Math.round(n * 100) / 100;
    // Reserve is NOT in P&L — it's cash flow (Shopify holding money, not a cost)
    const netProfit = orderTotalRevenue - totalFees - totalAdSpend
      - costs.refunds - costs.chargebackLoss - costs.chargebackFees - costs.debits
      + costs.chargebackWon + costs.credits;

    return NextResponse.json({
      ok: true, breakdown, dateFrom, dateTo,
      totals: {
        revenue: r2(orderTotalRevenue),
        fees: r2(totalFees),
        adSpend: r2(totalAdSpend),
        netProfit: r2(netProfit),
        orderCount: cachedOrders.filter(o => o.financial_status !== 'refunded' && o.financial_status !== 'voided').length,
      },
      // Every cost type shown separately for verification
      costs: {
        refunds: r2(costs.refunds),
        chargebackLoss: r2(costs.chargebackLoss),
        chargebackWon: r2(costs.chargebackWon),
        chargebackFees: r2(costs.chargebackFees),
        reserveHold: r2(costs.reserveHold),
        credits: r2(costs.credits),
        debits: r2(costs.debits),
      },
      // Verification: Revenue - (all deductions) + (all additions) = Net Profit
      verification: {
        formula: 'Revenue - Fees - Ad Spend - Refunds - CB Loss - CB Fees - Debits + CB Won + Credits = Net Profit',
        calculation: `${r2(orderTotalRevenue)} - ${r2(totalFees)} - ${r2(totalAdSpend)} - ${r2(costs.refunds)} - ${r2(costs.chargebackLoss)} - ${r2(costs.chargebackFees)} - ${r2(costs.debits)} + ${r2(costs.chargebackWon)} + ${r2(costs.credits)} = ${r2(netProfit)}`,
        balanced: Math.abs(netProfit - (orderTotalRevenue - totalFees - totalAdSpend - costs.refunds - costs.chargebackLoss - costs.chargebackFees - costs.debits + costs.chargebackWon + costs.credits)) < 0.01,
      },
      // Reserve shown separately — cash flow, not P&L
      cashFlow: {
        reserveHold: r2(costs.reserveHold),
      },
      // Dropdown details: every individual BT transaction
      costDetails: costDetails.map(d => ({ type: d.type, amount: r2(d.amount), fee: r2(d.fee), net: r2(d.net) })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
