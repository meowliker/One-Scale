/**
 * Universal P&L Calculator — Single Source of Truth
 *
 * Every P&L view in OneScale uses this one function.
 * Zero hardcoded values. All data from Supabase.
 *
 * Calculation logic from V4.4 Apps Script:
 * - Revenue = line_items price x quantity, skip voided/refunded orders
 * - Partial refunds = subtract refund amounts from order total
 * - Fees = real transaction fees, distributed proportionally
 * - COGS = from pnl_product_costs, fallback $0 + warning
 * - Ad spend = from campaign mappings, unattributed shown separately
 * - Chargebacks: lost deducted, won shown separately
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import { calculateExpenses } from '@/lib/pnl/expenseEngine';
import { getStoreDateRangeForPeriod } from '@/lib/pnl/dateUtils';
import type { CustomExpense } from '@/types/pnlSettings';
import type {
  PnLResult,
  PnLWarning,
  ProductPnL,
  ProductClassificationType,
  ProductIntelligenceRow,
  FeeStructureRow,
  CogsSuggestionRow,
  CampaignMappingRow,
} from '@/lib/intelligence/types';

// ── Interfaces for raw data ──────────────────────────────────

interface OrderCacheRow {
  shopify_order_id: string;
  store_id: string;
  total_price: number;
  subtotal_price: number;
  total_tax: number;
  total_discounts: number;
  refund_total: number;
  total_shipping_price: number;
  financial_status: string;
  order_status: string;
  line_items: string; // JSON string
  created_at: string;
  currency: string;
}

interface LineItem {
  product_id: string;
  title: string;
  price: number;
  quantity: number;
  total_discount?: number;
  requires_shipping?: boolean;
}

interface SpendCacheRow {
  date: string;
  campaign_id: string;
  campaign_name: string;
  spend: number;
}

interface ChargebackRow {
  order_id: string;
  amount: number;
  status: string;
  created_at: string;
}

interface ProductCostRow {
  product_id: string;
  product_name: string;
  cost_per_unit: number;
  cost_type: 'fixed' | 'percentage';
  effective_date: string;
}

interface PaymentFeeRow {
  gateway_name: string;
  fee_percentage: number;
  fee_fixed: number;
  is_active: boolean;
}

interface TransactionFeeRow {
  order_id: string;
  fee: number;
  gateway?: string;
}

interface BalanceTxnRow {
  type: string;
  amount: string;
  fee: string;
  net: string;
  source_order_id: string | null;
  processed_at: string;
}

// ── Options ──────────────────────────────────────────────────

export interface CalculatorOptions {
  /** Use cached order data from shopify_orders_cache (default true) */
  useCache?: boolean;
  /** Include per-product breakdown (default true) */
  includeProductBreakdown?: boolean;
}

// ── Helper: parse line_items JSON ────────────────────────────

function parseLineItems(json: string): LineItem[] {
  try {
    const items = JSON.parse(json);
    if (!Array.isArray(items)) return [];
    return items;
  } catch {
    return [];
  }
}

// ── Main Calculator ─────────────────────────────────────────

export async function calculatePnL(
  storeId: string,
  dateFrom: string,
  dateTo: string,
  options: CalculatorOptions = {}
): Promise<PnLResult> {
  const { includeProductBreakdown = true } = options;
  const warnings: PnLWarning[] = [];

  // Trigger balance transaction backfill if empty (non-blocking)
  ensureBalanceTransactions(storeId);

  // ── 1. Fetch timezone first, then all data with tz-aware boundaries ──
  const timezone = await fetchStoreTimezone(storeId);
  const { start: tzStart, end: tzEnd } = getStoreDateRangeForPeriod(dateFrom, dateTo, timezone);

  const [
    orders,
    spendRows,
    chargebacks,
    productCosts,
    paymentFees,
    feeStructures,
    productIntel,
    cogsSuggestions,
    campaignMappings,
    transactionFees,
    customExpensesList,
    balanceTxns,
  ] = await Promise.all([
    fetchOrders(storeId, tzStart, tzEnd),
    fetchMetaSpend(storeId, dateFrom, dateTo),
    fetchChargebacks(storeId, tzStart, tzEnd),
    fetchProductCosts(storeId),
    fetchPaymentFees(storeId),
    fetchFeeStructures(storeId),
    fetchProductIntelligence(storeId),
    fetchCogsSuggestions(storeId),
    fetchCampaignMappings(storeId),
    fetchTransactionFees(storeId, dateFrom, dateTo),
    fetchCustomExpenses(storeId),
    fetchBalanceTransactions(storeId, tzStart, tzEnd),
  ]);

  // ── 2. Build lookup maps ─────────────────────────────────

  // Product intelligence lookup
  const intelMap = new Map<string, ProductIntelligenceRow>();
  for (const p of productIntel) {
    intelMap.set(p.product_id, p);
  }

  // COGS lookup (configured costs take priority over suggestions)
  const cogsMap = new Map<string, { cost: number; type: 'fixed' | 'percentage'; source: 'configured' | 'suggested' | 'zero' }>();
  for (const c of productCosts) {
    cogsMap.set(c.product_id, { cost: c.cost_per_unit, type: c.cost_type, source: 'configured' });
  }
  // Fill gaps with suggestions (only accepted ones)
  for (const s of cogsSuggestions) {
    if (!cogsMap.has(s.product_id) && s.status === 'accepted') {
      cogsMap.set(s.product_id, {
        cost: s.suggested_cost,
        type: s.suggested_type as 'fixed' | 'percentage',
        source: 'suggested',
      });
    }
  }

  // Transaction fees lookup (actual per-order fees)
  const txFeeMap = new Map<string, number>();
  for (const tf of transactionFees) {
    txFeeMap.set(tf.order_id, Math.abs(Number(tf.fee)));
  }

  // Fee structures lookup (auto-detected rates per gateway)
  const feeRateMap = new Map<string, { rate: number; fixed: number }>();
  for (const fs of feeStructures) {
    if (fs.is_active) {
      feeRateMap.set(fs.gateway_name, { rate: fs.effective_rate, fixed: fs.fixed_fee });
    }
  }

  // User-configured payment fees (fallback)
  const configFeeMap = new Map<string, { rate: number; fixed: number }>();
  for (const pf of paymentFees) {
    if (pf.is_active) {
      configFeeMap.set(pf.gateway_name, { rate: pf.fee_percentage / 100, fixed: pf.fee_fixed });
    }
  }

  // Campaign → product mappings
  const campMap = new Map<string, CampaignMappingRow>();
  for (const cm of campaignMappings) {
    campMap.set(cm.campaign_id, cm);
  }

  // ── 3. Process orders ────────────────────────────────────

  const productAcc = new Map<string, {
    title: string;
    classification: ProductClassificationType;
    revenue: number;
    units: number;
    cogs: number;
    cogsSource: 'configured' | 'suggested' | 'zero';
    fees: number;
    feeMethod: 'actual' | 'detected_rate' | 'configured_rate' | 'estimated';
    shipping: number;
    refunds: number;
    chargebackLoss: number;
    chargebackWon: number;
    orderIds: Set<string>;
  }>();

  let totalRevenue = 0;
  let totalCogs = 0;
  let totalFees = 0;
  let totalShipping = 0;
  let totalRefunds = 0;
  let orderCount = 0;
  let mainRevenue = 0;
  let upsellRevenue = 0;
  const missingCogsProducts: string[] = [];
  let overallFeeMethod: 'actual' | 'detected_rate' | 'configured_rate' | 'estimated' = 'actual';
  let hasActualFees = false;
  let hasEstimatedFees = false;

  for (const order of orders) {
    const isFullRefund = order.financial_status === 'refunded';
    if (isFullRefund) {
      totalRefunds += Number(order.refund_total) || Number(order.total_price);
      continue;
    }

    // Skip voided orders
    if (order.financial_status === 'voided' || order.order_status === 'cancelled') {
      continue;
    }

    const lineItems = parseLineItems(order.line_items);
    if (lineItems.length === 0) continue;

    orderCount++;
    const orderRevenue = Number(order.subtotal_price) || Number(order.total_price);

    // Per-line-item processing
    for (const item of lineItems) {
      const productId = String(item.product_id);
      const itemRevenue = Number(item.price) * Number(item.quantity);
      const itemDiscount = Number(item.total_discount) || 0;
      const netItemRevenue = itemRevenue - itemDiscount;

      // Get classification from intelligence
      const intel = intelMap.get(productId);
      const classification: ProductClassificationType =
        intel?.manual_override && intel.manual_classification
          ? (intel.manual_classification as ProductClassificationType)
          : intel?.classification || 'unknown';

      // Calculate COGS for this item
      const cogsEntry = cogsMap.get(productId);
      let itemCogs = 0;
      let cogsSource: 'configured' | 'suggested' | 'zero' = 'zero';

      if (cogsEntry) {
        cogsSource = cogsEntry.source;
        if (cogsEntry.type === 'fixed') {
          itemCogs = cogsEntry.cost * Number(item.quantity);
        } else {
          itemCogs = netItemRevenue * (cogsEntry.cost / 100);
        }
      } else {
        // Digital products default to $0 COGS (correct), physical products get warning
        const isDigital = intel?.is_digital || intel?.is_gift_card || false;
        if (!isDigital && netItemRevenue > 0) {
          missingCogsProducts.push(productId);
        }
      }

      // Accumulate per-product
      const acc = productAcc.get(productId) || {
        title: item.title || intel?.product_title || '',
        classification,
        revenue: 0,
        units: 0,
        cogs: 0,
        cogsSource,
        fees: 0,
        feeMethod: 'estimated' as const,
        shipping: 0,
        refunds: 0,
        chargebackLoss: 0,
        chargebackWon: 0,
        orderIds: new Set<string>(),
      };

      acc.revenue += netItemRevenue;
      acc.units += Number(item.quantity);
      acc.cogs += itemCogs;
      acc.orderIds.add(String(order.shopify_order_id));
      if (cogsSource !== 'zero') acc.cogsSource = cogsSource;
      productAcc.set(productId, acc);

      // EXCLUDED products: skip from totals entirely
      if (classification === 'excluded') {
        continue;
      }

      totalRevenue += netItemRevenue;
      totalCogs += itemCogs;

      if (classification === 'main' || classification === 'subscription' || classification === 'bundle') {
        mainRevenue += netItemRevenue;
      } else if (classification === 'upsell' || classification === 'downsell' || classification === 'gift') {
        upsellRevenue += netItemRevenue;
      }
    }

    // ── Fees: priority order ────────────────────────────────
    // 1. Actual transaction fees from shopify_transaction_fees table
    // 2. Auto-detected rates from fee_structures
    // 3. User-configured rates from pnl_payment_fees
    // 4. NEVER estimate with flat 3% — show warning instead

    const orderId = String(order.shopify_order_id);
    const actualFee = txFeeMap.get(orderId);

    if (actualFee !== undefined && actualFee > 0) {
      totalFees += actualFee;
      hasActualFees = true;
      // Distribute fee proportionally across line items
      if (orderRevenue > 0) {
        for (const item of lineItems) {
          const productId = String(item.product_id);
          const itemRev = Number(item.price) * Number(item.quantity);
          const proportion = itemRev / orderRevenue;
          const acc = productAcc.get(productId);
          if (acc) {
            acc.fees += actualFee * proportion;
            acc.feeMethod = 'actual';
          }
        }
      }
    } else if (feeRateMap.size > 0) {
      // Use auto-detected rates
      const defaultRate = feeRateMap.values().next().value;
      if (defaultRate) {
        const estimatedFee = orderRevenue * defaultRate.rate + defaultRate.fixed;
        totalFees += estimatedFee;
        hasEstimatedFees = true;
        if (orderRevenue > 0) {
          for (const item of lineItems) {
            const productId = String(item.product_id);
            const itemRev = Number(item.price) * Number(item.quantity);
            const proportion = itemRev / orderRevenue;
            const acc = productAcc.get(productId);
            if (acc) {
              acc.fees += estimatedFee * proportion;
              acc.feeMethod = 'detected_rate';
            }
          }
        }
      }
    } else if (configFeeMap.size > 0) {
      // Use user-configured rates
      const defaultRate = configFeeMap.values().next().value;
      if (defaultRate) {
        const estimatedFee = orderRevenue * defaultRate.rate + defaultRate.fixed;
        totalFees += estimatedFee;
        hasEstimatedFees = true;
        if (orderRevenue > 0) {
          for (const item of lineItems) {
            const productId = String(item.product_id);
            const itemRev = Number(item.price) * Number(item.quantity);
            const proportion = itemRev / orderRevenue;
            const acc = productAcc.get(productId);
            if (acc) {
              acc.fees += estimatedFee * proportion;
              acc.feeMethod = 'configured_rate';
            }
          }
        }
      }
    } else {
      // No fee data at all — add warning, do NOT estimate
      hasEstimatedFees = true;
    }

    // ── Shipping ────────────────────────────────────────────
    const shipping = Number(order.total_shipping_price) || 0;
    totalShipping += shipping;

    // ── Partial refunds ─────────────────────────────────────
    if (order.financial_status === 'partially_refunded') {
      const refundAmount = Number(order.refund_total) || 0;
      totalRefunds += refundAmount;
    }
  }

  // ── 4. Process ad spend with attribution ──────────────────

  let totalAdSpend = 0;
  let unattributedSpend = 0;

  for (const spend of spendRows) {
    const amount = Number(spend.spend);
    totalAdSpend += amount;

    const mapping = campMap.get(spend.campaign_id);
    if (mapping && mapping.product_id) {
      const acc = productAcc.get(mapping.product_id);
      if (acc) {
        acc.revenue = acc.revenue; // already accumulated
        // Just track ad spend per product
        const existingProduct = productAcc.get(mapping.product_id)!;
        existingProduct.revenue = existingProduct.revenue; // keep
      }
      // Add spend to product accumulator
      const prodAcc = productAcc.get(mapping.product_id);
      if (prodAcc) {
        // We'll handle this below
      }
    } else {
      unattributedSpend += amount;
    }
  }

  // Distribute attributed spend to products
  const productSpendMap = new Map<string, { spend: number; confidence: number }>();
  for (const spend of spendRows) {
    const mapping = campMap.get(spend.campaign_id);
    if (mapping && mapping.product_id) {
      const existing = productSpendMap.get(mapping.product_id) || { spend: 0, confidence: 0 };
      existing.spend += Number(spend.spend);
      existing.confidence = Math.max(existing.confidence, mapping.confidence);
      productSpendMap.set(mapping.product_id, existing);
    }
  }

  // ── 5. Process chargebacks ────────────────────────────────

  let totalChargebackLoss = 0;
  let totalChargebackWon = 0;
  let totalChargebackPending = 0;

  for (const cb of chargebacks) {
    const amount = Number(cb.amount);
    switch (cb.status) {
      case 'lost':
        totalChargebackLoss += amount;
        break;
      case 'won':
        totalChargebackWon += amount;
        break;
      default:
        totalChargebackPending += amount;
        break;
    }
  }

  // ── 5a. Balance transaction overrides ───────────────────────
  // When balance transactions exist, use them for settled revenue, fees, refunds, chargebacks
  // This matches the Apps Script approach (actual settled amounts)
  let settledRevenue = 0;
  let btFees = 0;
  let btRefunds = 0;
  let btChargebackLoss = 0;
  let btChargebackWon = 0;
  const hasBalanceTxns = balanceTxns.length > 0;

  if (hasBalanceTxns) {
    for (const txn of balanceTxns) {
      const amount = Math.abs(parseFloat(txn.amount || '0'));
      const fee = Math.abs(parseFloat(txn.fee || '0'));
      const net = parseFloat(txn.net || '0');

      switch (txn.type) {
        case 'charge':
          settledRevenue += amount;
          btFees += fee;
          break;
        case 'refund':
          btRefunds += amount;
          break;
        case 'dispute':
          if (net < 0) btChargebackLoss += Math.abs(net);
          else btChargebackWon += net;
          break;
        case 'adjustment':
        case 'debit':
          // V4.4: adjustments can be positive or negative
          settledRevenue += parseFloat(txn.amount || '0');
          break;
        case 'credit':
          settledRevenue += parseFloat(txn.amount || '0');
          break;
        case 'reserved_funds':
        case 'reserve':
          // Shopify holding money in reserve — deducted from settled revenue
          settledRevenue += parseFloat(txn.amount || '0');
          break;
        case 'marketplace_tax':
          // GST/VAT collected by Shopify on behalf of tax authorities
          settledRevenue += parseFloat(txn.amount || '0');
          break;
        case 'payout':
          // Payout summaries — skip (not a transaction, just a record of bank transfer)
          break;
        default:
          // Unknown type — include in revenue so money is never lost
          settledRevenue += parseFloat(txn.amount || '0');
          console.warn(`[PRISM:MONEY] Unknown BT type "${txn.type}" amount=${txn.amount} store=${storeId}`);
          break;
      }
    }

    // Override with balance transaction values (more accurate)
    totalFees = btFees;
    totalRefunds = btRefunds;
    totalChargebackLoss = btChargebackLoss;
    totalChargebackWon = btChargebackWon;
    overallFeeMethod = 'actual';
    hasActualFees = true;
    hasEstimatedFees = false;
  }

  // ── 5a-ii. Distribute refunds & chargebacks to products by order ID ──
  // Build order→product lookup from balance transactions
  if (hasBalanceTxns) {
    const refundByOrder = new Map<string, number>();
    const cbLossByOrder = new Map<string, number>();
    const cbWonByOrder = new Map<string, number>();

    for (const txn of balanceTxns) {
      const orderId = txn.source_order_id;
      if (!orderId) continue;
      const amount = Math.abs(parseFloat(txn.amount || '0'));
      const net = parseFloat(txn.net || '0');

      if (txn.type === 'refund') {
        refundByOrder.set(orderId, (refundByOrder.get(orderId) || 0) + amount);
      } else if (txn.type === 'dispute') {
        if (net < 0) cbLossByOrder.set(orderId, (cbLossByOrder.get(orderId) || 0) + Math.abs(net));
        else cbWonByOrder.set(orderId, (cbWonByOrder.get(orderId) || 0) + net);
      }
    }

    // Distribute to products based on which orders they appear in
    for (const [, acc] of productAcc) {
      let prodRefunds = 0;
      let prodCbLoss = 0;
      let prodCbWon = 0;
      for (const oid of acc.orderIds) {
        prodRefunds += refundByOrder.get(oid) || 0;
        prodCbLoss += cbLossByOrder.get(oid) || 0;
        prodCbWon += cbWonByOrder.get(oid) || 0;
      }
      acc.refunds = prodRefunds;
      acc.chargebackLoss = prodCbLoss;
      acc.chargebackWon = prodCbWon;
    }
  }

  const grossRevenue = totalRevenue;
  const revenueForPnL = hasBalanceTxns && settledRevenue > 0 ? settledRevenue : grossRevenue;
  const revenueSource: 'settled' | 'orders_api' = hasBalanceTxns && settledRevenue > 0 ? 'settled' : 'orders_api';

  // ── 5b. Calculate custom expenses ──────────────────────────
  const expenseResult = calculateExpenses(customExpensesList, { start: dateFrom, end: dateTo });
  const totalCustomExpenses = expenseResult.totalExpenses;

  // ── 6. Determine fee method ───────────────────────────────

  if (hasActualFees && !hasEstimatedFees) {
    overallFeeMethod = 'actual';
  } else if (feeRateMap.size > 0) {
    overallFeeMethod = 'detected_rate';
  } else if (configFeeMap.size > 0) {
    overallFeeMethod = 'configured_rate';
  } else {
    overallFeeMethod = 'estimated';
  }

  // ── 7. Build warnings ────────────────────────────────────

  const uniqueMissingCogs = [...new Set(missingCogsProducts)];
  if (uniqueMissingCogs.length > 0) {
    warnings.push({
      type: 'missing_cogs',
      message: `${uniqueMissingCogs.length} product(s) showing $0 COGS — configure costs in Settings > P&L`,
      severity: 'warning',
      productIds: uniqueMissingCogs,
    });
  }

  if (overallFeeMethod === 'estimated' && txFeeMap.size === 0 && feeRateMap.size === 0 && configFeeMap.size === 0) {
    warnings.push({
      type: 'no_fee_data',
      message: 'No transaction fee data available. Fees shown as $0. Connect Shopify payments or configure rates in Settings.',
      severity: 'warning',
    });
  } else if (overallFeeMethod === 'detected_rate' || overallFeeMethod === 'configured_rate') {
    warnings.push({
      type: 'estimated_fees',
      message: `Fees calculated using ${overallFeeMethod === 'detected_rate' ? 'auto-detected' : 'configured'} rates. Actual transaction fees will be more accurate.`,
      severity: 'info',
    });
  }

  if (unattributedSpend > 0) {
    warnings.push({
      type: 'unattributed_spend',
      message: `$${unattributedSpend.toFixed(2)} ad spend could not be attributed to specific products. Map campaigns in Settings.`,
      severity: 'warning',
      amount: unattributedSpend,
    });
  }

  if (totalCustomExpenses > 0 && totalRevenue > 0 && (totalCustomExpenses / totalRevenue) > 0.2) {
    warnings.push({
      type: 'high_expense_ratio',
      message: `Custom expenses are ${((totalCustomExpenses / totalRevenue) * 100).toFixed(1)}% of revenue.`,
      severity: 'warning',
      amount: totalCustomExpenses,
    });
  }

  if (productIntel.length === 0 && orders.length > 0) {
    warnings.push({
      type: 'no_products',
      message: 'Product intelligence not initialized. Run store analysis to classify products.',
      severity: 'error',
    });
  }

  // ── 8. Build product breakdown ────────────────────────────

  const products: ProductPnL[] = [];

  if (includeProductBreakdown) {
    for (const [productId, acc] of productAcc) {
      // EXCLUDED products: skip from product breakdown
      if (acc.classification === 'excluded') continue;

      const spendData = productSpendMap.get(productId);
      // UPSELL products: zero ad spend (upsells don't drive ad spend)
      const isUpsellType = acc.classification === 'upsell' || acc.classification === 'downsell' || acc.classification === 'gift';
      const adSpend = isUpsellType ? 0 : (spendData?.spend || 0);
      const adSpendConfidence = spendData?.confidence || 0;

      const netProfit = acc.revenue - acc.cogs - adSpend - acc.fees - acc.shipping
        - acc.refunds - acc.chargebackLoss + acc.chargebackWon;
      const margin = acc.revenue > 0 ? (netProfit / acc.revenue) * 100 : 0;

      products.push({
        productId,
        productTitle: acc.title,
        classification: acc.classification,
        revenue: acc.revenue,
        unitsSold: acc.units,
        cogs: acc.cogs,
        cogsSource: acc.cogsSource,
        adSpend,
        adSpendConfidence,
        fees: acc.fees,
        feeMethod: acc.feeMethod,
        shipping: acc.shipping,
        refunds: acc.refunds,
        chargebackLoss: acc.chargebackLoss,
        chargebackWon: acc.chargebackWon,
        netProfit,
        margin,
      });
    }

    // Sort by revenue descending
    products.sort((a, b) => b.revenue - a.revenue);
  }

  // ── 9. Calculate totals ───────────────────────────────────

  const totalNetProfit = revenueForPnL - totalCogs - totalAdSpend - totalFees
    - totalShipping - totalRefunds - totalChargebackLoss + totalChargebackWon - totalCustomExpenses;
  const totalMargin = revenueForPnL > 0 ? (totalNetProfit / revenueForPnL) * 100 : 0;

  // Data completeness score
  let completeness = 0;
  if (orders.length > 0) completeness += 30;                    // Have order data
  if (uniqueMissingCogs.length === 0) completeness += 20;       // All COGS configured
  if (overallFeeMethod === 'actual') completeness += 20;        // Real transaction fees
  else if (overallFeeMethod !== 'estimated') completeness += 10; // At least rate-based fees
  if (totalAdSpend > 0) completeness += 15;                     // Have ad spend data
  if (unattributedSpend === 0 && totalAdSpend > 0) completeness += 15; // All spend attributed

  return {
    storeId,
    dateFrom,
    dateTo,
    timezone,
    totalRevenue: revenueForPnL,
    grossRevenue,
    settledRevenue: hasBalanceTxns ? settledRevenue : undefined,
    revenueSource,
    totalCogs,
    totalAdSpend,
    totalFees,
    totalShipping,
    totalRefunds,
    totalChargebackLoss,
    totalChargebackWon,
    totalChargebackPending,
    totalNetProfit,
    totalMargin,
    orderCount,
    mainRevenue,
    upsellRevenue,
    unattributedSpend,
    products,
    warnings,
    feeMethod: overallFeeMethod,
    dataCompleteness: completeness,
    totalCustomExpenses,
    expenseBreakdown: expenseResult.breakdown.map(b => ({ name: b.name, amount: b.allocated })),
  };
}

// ── Data Fetching Helpers ────────────────────────────────────

async function fetchOrders(storeId: string, tzStart: string, tzEnd: string): Promise<OrderCacheRow[]> {
  try {
    return await rest<OrderCacheRow[]>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(tzStart)}&created_at=lte.${enc(tzEnd)}&select=*&order=created_at.asc`
    );
  } catch {
    return [];
  }
}

async function fetchMetaSpend(storeId: string, dateFrom: string, dateTo: string): Promise<SpendCacheRow[]> {
  try {
    return await rest<SpendCacheRow[]>(
      `/meta_spend_cache?store_id=eq.${enc(storeId)}&date=gte.${enc(dateFrom)}&date=lte.${enc(dateTo)}&select=date,campaign_id,campaign_name,spend`
    );
  } catch {
    return [];
  }
}

async function fetchChargebacks(storeId: string, tzStart: string, tzEnd: string): Promise<ChargebackRow[]> {
  try {
    // Query by finalized_at first (most accurate for balance-synced disputes),
    // fall back to created_at when finalized_at is null
    const dateMin = enc(tzStart);
    const dateMax = enc(tzEnd);
    const orFilter = `finalized_at.gte.${dateMin},finalized_at.lte.${dateMax}`;
    return await rest<ChargebackRow[]>(
      `/shopify_chargebacks?store_id=eq.${enc(storeId)}&or=(and(${orFilter}),and(finalized_at.is.null,created_at.gte.${dateMin},created_at.lte.${dateMax}))&select=order_id,amount,status,created_at`
    );
  } catch {
    return [];
  }
}

async function fetchProductCosts(storeId: string): Promise<ProductCostRow[]> {
  try {
    return await rest<ProductCostRow[]>(
      `/pnl_product_costs?store_id=eq.${enc(storeId)}&select=product_id,product_name,cost_per_unit,cost_type,effective_date&order=effective_date.desc`
    );
  } catch {
    return [];
  }
}

async function fetchPaymentFees(storeId: string): Promise<PaymentFeeRow[]> {
  try {
    return await rest<PaymentFeeRow[]>(
      `/pnl_payment_fees?store_id=eq.${enc(storeId)}&is_active=eq.true&select=gateway_name,fee_percentage,fee_fixed,is_active`
    );
  } catch {
    return [];
  }
}

async function fetchFeeStructures(storeId: string): Promise<FeeStructureRow[]> {
  try {
    return await rest<FeeStructureRow[]>(
      `/fee_structures?store_id=eq.${enc(storeId)}&is_active=eq.true&select=*`
    );
  } catch {
    return [];
  }
}

async function fetchProductIntelligence(storeId: string): Promise<ProductIntelligenceRow[]> {
  try {
    return await rest<ProductIntelligenceRow[]>(
      `/product_intelligence?store_id=eq.${enc(storeId)}&select=*`
    );
  } catch {
    return [];
  }
}

async function fetchCogsSuggestions(storeId: string): Promise<CogsSuggestionRow[]> {
  try {
    return await rest<CogsSuggestionRow[]>(
      `/cogs_suggestions?store_id=eq.${enc(storeId)}&select=*`
    );
  } catch {
    return [];
  }
}

async function fetchCampaignMappings(storeId: string): Promise<CampaignMappingRow[]> {
  try {
    return await rest<CampaignMappingRow[]>(
      `/campaign_product_mappings?store_id=eq.${enc(storeId)}&select=*`
    );
  } catch {
    return [];
  }
}

async function fetchTransactionFees(storeId: string, dateFrom: string, dateTo: string): Promise<TransactionFeeRow[]> {
  try {
    return await rest<TransactionFeeRow[]>(
      `/shopify_transaction_fees?store_id=eq.${enc(storeId)}&select=order_id,fee,gateway`
    );
  } catch {
    return [];
  }
}

async function fetchBalanceTransactions(storeId: string, tzStart: string, tzEnd: string): Promise<BalanceTxnRow[]> {
  try {
    return await rest<BalanceTxnRow[]>(
      `/shopify_balance_transactions?store_id=eq.${enc(storeId)}&and=(processed_at.gte.${enc(tzStart)},processed_at.lte.${enc(tzEnd)})&select=type,amount,fee,net,source_order_id,processed_at`
    );
  } catch {
    return [];
  }
}

async function ensureBalanceTransactions(storeId: string): Promise<void> {
  try {
    const rows = await rest<Array<{ store_id: string }>>(
      `/shopify_balance_transactions?store_id=eq.${enc(storeId)}&select=store_id&limit=1`
    );
    if (!rows || rows.length === 0) {
      console.log(`[PnL] Balance transactions empty for ${storeId} — triggering backfill`);
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      fetch(`${baseUrl}/api/cron/sync-balance-transactions`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      }).catch(() => null);
    }
  } catch { /* ignore */ }
}

async function fetchStoreTimezone(storeId: string): Promise<string> {
  try {
    const rows = await rest<Array<{ timezone: string | null }>>(
      `/store_ad_accounts?store_id=eq.${enc(storeId)}&is_active=eq.true&select=timezone&limit=1`
    );
    return rows?.[0]?.timezone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

interface CustomExpenseRow {
  id: number;
  name: string;
  category: 'fixed' | 'variable';
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time';
  distribution: 'daily' | 'hourly' | 'smart';
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}

async function fetchCustomExpenses(storeId: string): Promise<CustomExpense[]> {
  try {
    const rows = await rest<CustomExpenseRow[]>(
      `/pnl_custom_expenses?store_id=eq.${enc(storeId)}&is_active=eq.true&select=*`
    );
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      amount: Number(r.amount),
      frequency: r.frequency,
      distribution: r.distribution,
      startDate: r.start_date,
      endDate: r.end_date,
      isActive: r.is_active,
    }));
  } catch {
    return [];
  }
}

function enc(v: string): string {
  return encodeURIComponent(v);
}
