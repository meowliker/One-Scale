/**
 * Apps Script V4.4 Port — Product-Level P&L Engine
 *
 * Exact port of the Apps Script logic:
 * 1. Revenue: matchOrderToProduct (4-pass keyword matching)
 * 2. Fees: BT charge fees matched via order→product map
 * 3. Ad Spend: Meta spend matched via ad account→product keywords
 *
 * Guarantee: SUM(product ad_spend) = P&L total ad_spend
 */

import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Types ────────────────────────────────────────────────

export interface ProductConfig {
  product_id: string;
  product_name: string;
  main_keywords: string[][];   // [["texture"],["mystery box"]] — each inner array is AND-matched
  upsell_keywords: string[];   // ["texture upsell","texture bump"]
  order_count?: number;        // populated during processing
}

interface LineItem {
  product_id?: string | number;
  title?: string;
  price?: string;
  quantity?: number;
}

interface OrderRow {
  shopify_order_id: string;
  total_price: number;
  subtotal_price: number;
  financial_status: string;
  order_status: string;
  line_items: string; // JSON
}

interface BTRow {
  transaction_id: string;
  type: string;
  amount: number;
  fee: number;
  net: number;
  source_order_id: string | null;
}

interface SpendRow {
  ad_account_id: string | null;
  campaign_id: string;
  campaign_name: string | null;
  date: string;
  spend: number;
}

interface AdAccountMapping {
  ad_account_id: string;
  product_id: string | null;
  product_keywords: string[] | null;
}

export interface ProductPnLResult {
  product_id: string;
  product_name: string;
  revenue: number;
  orders: number;
  fees: number;
  ad_spend: number;
  cogs: number;
  net_profit: number;
  margin: number;
  attribution_method: string;
}

// ── Step 1: Match Order to Product (4-pass) ─────────────

/**
 * Port of matchOrderToProduct_ from Apps Script.
 * Returns product_id of the matched product, or null.
 *
 * Apps Script rule: $0 price = MAIN product (funnel/lead magnet).
 * Matching priority: $0 items first, then keyword passes.
 * Title cleaning: strips "(Free Today)", "(FREE TODAY)" etc.
 */
export function matchOrderToProduct(
  lineItems: LineItem[],
  products: ProductConfig[],
): string | null {
  // Helper: clean title for matching — strip "(Free Today)" etc.
  function cleanTitle(title: string): string {
    return title.toLowerCase()
      .replace(/\s*\(free today\)\s*/gi, '')
      .replace(/\s*\(free\)\s*/gi, '')
      .replace(/\s*free today\s*/gi, '')
      .trim();
  }

  // Pass 0 (Apps Script Fix #22): $0 items are MAIN — match them first
  const freeItems = lineItems.filter(i => parseFloat(i.price || '0') === 0 && i.title);
  if (freeItems.length > 0) {
    for (const item of freeItems) {
      const title = cleanTitle(item.title || '');
      if (!title) continue;
      for (const product of products) {
        for (const keywordSet of product.main_keywords) {
          const allMatch = keywordSet.every(kw => title.includes(kw.toLowerCase()));
          if (allMatch) return product.product_id;
        }
      }
    }
    // Also try product name match on free items
    for (const item of freeItems) {
      const title = cleanTitle(item.title || '');
      for (const product of products) {
        const pName = product.product_name.toLowerCase();
        if (pName.length >= 5 && title.includes(pName)) return product.product_id;
        if (pName.length >= 5 && pName.includes(title) && title.length >= 5) return product.product_id;
      }
    }
  }

  // Pass 1: ALL keywords in set must match title (any item)
  for (const item of lineItems) {
    const title = cleanTitle(item.title || '');
    if (!title) continue;
    for (const product of products) {
      for (const keywordSet of product.main_keywords) {
        const allMatch = keywordSet.every(kw => title.includes(kw.toLowerCase()));
        if (allMatch) return product.product_id;
      }
    }
  }

  // Pass 2: Upsell keyword → parent product
  for (const item of lineItems) {
    const title = (item.title || '').toLowerCase();
    if (!title) continue;
    for (const product of products) {
      for (const upsell of product.upsell_keywords ?? []) {
        if (title.includes(upsell.toLowerCase())) return product.product_id;
      }
    }
  }

  // Pass 3: Product name in title (min 5 chars)
  for (const item of lineItems) {
    const title = cleanTitle(item.title || '');
    if (!title) continue;
    for (const product of products) {
      const pName = product.product_name.toLowerCase();
      if (pName.length >= 5 && title.includes(pName)) return product.product_id;
      if (pName.length >= 5 && pName.includes(title) && title.length >= 5) return product.product_id;
    }
  }

  // Pass 4: 60% word overlap
  for (const item of lineItems) {
    const titleWords = cleanTitle(item.title || '')
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);

    for (const product of products) {
      const pWords = product.product_name.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2);

      if (pWords.length < 2) continue;
      const matches = pWords.filter(pw => (item.title || '').toLowerCase().includes(pw)).length;
      if (matches >= 2 && matches / pWords.length >= 0.6) return product.product_id;
    }
  }

  return null;
}

// ── Step 2: Split Fees by Product ───────────────────────

/**
 * Port of splitFeesByProduct_ from Apps Script.
 * Matches BT charge fees to products via order→product map.
 */
export function splitFeesByProduct(
  btTransactions: BTRow[],
  orderProductMap: Map<string, string>,
  products: ProductConfig[],
  orderCounts: Map<string, number>,
): Map<string, number> {
  const fees = new Map<string, number>();
  for (const p of products) fees.set(p.product_id, 0);

  let unmappedFees = 0;

  for (const txn of btTransactions) {
    if (txn.type !== 'charge') continue;
    const fee = Math.abs(txn.fee);
    if (fee <= 0) continue;

    const productId = txn.source_order_id ? orderProductMap.get(txn.source_order_id) : undefined;
    if (productId) {
      fees.set(productId, (fees.get(productId) ?? 0) + fee);
    } else {
      unmappedFees += fee;
    }
  }

  // Distribute unmapped fees proportionally by order count
  if (unmappedFees > 0) {
    if (products.length === 1) {
      fees.set(products[0].product_id, (fees.get(products[0].product_id) ?? 0) + unmappedFees);
    } else {
      const totalOrders = [...orderCounts.values()].reduce((s, n) => s + n, 0);
      if (totalOrders > 0) {
        for (const product of products) {
          const share = (orderCounts.get(product.product_id) ?? 0) / totalOrders;
          fees.set(product.product_id, (fees.get(product.product_id) ?? 0) + unmappedFees * share);
        }
      } else {
        const equal = unmappedFees / products.length;
        for (const p of products) {
          fees.set(p.product_id, (fees.get(p.product_id) ?? 0) + equal);
        }
      }
    }
  }

  return fees;
}

// ── Step 3: Distribute Ad Spend ─────────────────────────

/**
 * Port of FB_PRODUCT_KEYWORDS from Apps Script.
 * Maps Meta ad spend to products via ad account mappings + keywords.
 */
export function distributeAdSpend(
  spendRows: SpendRow[],
  adAccountMappings: AdAccountMapping[],
  products: ProductConfig[],
  orderCounts: Map<string, number>,
): { spend: Map<string, number>; method: string } {
  const spend = new Map<string, number>();
  for (const p of products) spend.set(p.product_id, 0);

  if (spendRows.length === 0) return { spend, method: 'none' };

  let totalMapped = 0;
  let totalSpend = 0;
  let method = 'proportional_order_count';

  // Build ad account mapping lookup
  const accountMap = new Map<string, AdAccountMapping>();
  for (const m of adAccountMappings) {
    accountMap.set(m.ad_account_id, m);
  }

  for (const row of spendRows) {
    const amount = Number(row.spend) || 0;
    if (amount <= 0) continue;
    totalSpend += amount;

    const mapping = row.ad_account_id ? accountMap.get(row.ad_account_id) : undefined;

    // Method 1: Direct product mapping on ad account
    if (mapping?.product_id) {
      spend.set(mapping.product_id, (spend.get(mapping.product_id) ?? 0) + amount);
      totalMapped += amount;
      method = 'direct_account_mapping';
      continue;
    }

    // Method 2: Keyword match against campaign name
    if (mapping?.product_keywords && row.campaign_name) {
      const campaignName = row.campaign_name.toLowerCase();
      let matched = false;

      for (const product of products) {
        const keywords = mapping.product_keywords;
        if (keywords.some(kw => campaignName.includes(kw.toLowerCase()))) {
          spend.set(product.product_id, (spend.get(product.product_id) ?? 0) + amount);
          totalMapped += amount;
          matched = true;
          method = 'keyword_match';
          break;
        }
      }

      if (matched) continue;
    }

    // Method 2b: Try matching campaign name against product names (no mapping needed)
    if (row.campaign_name) {
      const campaignName = row.campaign_name.toLowerCase();
      let matched = false;

      for (const product of products) {
        const pWords = product.product_name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (pWords.some(w => campaignName.includes(w))) {
          spend.set(product.product_id, (spend.get(product.product_id) ?? 0) + amount);
          totalMapped += amount;
          matched = true;
          if (method === 'proportional_order_count') method = 'campaign_name_match';
          break;
        }
      }

      if (matched) continue;
    }

    // Method 3: Proportional by order count (fallback)
    const totalOrders = [...orderCounts.values()].reduce((s, n) => s + n, 0);
    if (totalOrders > 0) {
      for (const p of products) {
        const share = (orderCounts.get(p.product_id) ?? 0) / totalOrders;
        spend.set(p.product_id, (spend.get(p.product_id) ?? 0) + amount * share);
      }
    } else if (products.length > 0) {
      const equal = amount / products.length;
      for (const p of products) {
        spend.set(p.product_id, (spend.get(p.product_id) ?? 0) + equal);
      }
    }
  }

  return { spend, method };
}

// ── Main Entry Point: Build Product Performance ────────

export async function buildProductPerformance(
  storeId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ProductPnLResult[]> {
  // Load product config
  const products = await rest<Array<{
    product_id: string; product_name: string;
    main_keywords: string[][] | null; upsell_keywords: string[] | null;
  }>>(
    `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id,product_name,main_keywords,upsell_keywords`
  ).catch(() => []);

  if (products.length === 0) return [];

  const productConfigs: ProductConfig[] = products.map(p => ({
    product_id: p.product_id,
    product_name: p.product_name,
    main_keywords: (p.main_keywords ?? []) as string[][],
    upsell_keywords: (p.upsell_keywords ?? []) as string[],
  }));

  // Get store timezone for correct date boundaries
  let storeTz = 'America/New_York';
  try {
    const tzRows = await rest<Array<{ timezone: string | null }>>(
      `/store_ad_accounts?store_id=eq.${enc(storeId)}&is_active=eq.true&select=timezone&limit=1`
    );
    storeTz = tzRows?.[0]?.timezone || 'America/New_York';
  } catch { /* use default */ }

  // Compute timezone-aware UTC boundaries for order created_at filtering
  // dateFrom "2026-03-14" in store tz → UTC start/end
  function localDateToUtc(dateStr: string, isEnd: boolean): string {
    const d = new Date(dateStr + (isEnd ? 'T23:59:59' : 'T00:00:00'));
    // Get offset: create a date in the store timezone, find the difference
    const utcDate = new Date(dateStr + 'T12:00:00Z');
    const inTz = new Date(utcDate.toLocaleString('en-US', { timeZone: storeTz }));
    const offsetMs = utcDate.getTime() - inTz.getTime();
    return new Date(d.getTime() + offsetMs).toISOString();
  }

  const orderStart = localDateToUtc(dateFrom, false);
  const orderEnd = localDateToUtc(dateTo, true);

  // Load data in parallel
  const [orders, btTxns, spendRows, adMappings, costRows] = await Promise.all([
    // Orders for date range (timezone-aware)
    rest<OrderRow[]>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(orderStart)}&created_at=lte.${enc(orderEnd)}&order_status=neq.cancelled&select=shopify_order_id,total_price,subtotal_price,financial_status,order_status,line_items`
    ).catch(() => [] as OrderRow[]),
    // Balance transactions for date range (BT uses processed_at which is already in UTC)
    rest<BTRow[]>(
      `/shopify_balance_transactions?store_id=eq.${enc(storeId)}&and=(processed_at.gte.${enc(orderStart)},processed_at.lte.${enc(orderEnd)})&select=transaction_id,type,amount,fee,net,source_order_id`
    ).catch(() => [] as BTRow[]),
    // Meta spend for date range
    rest<SpendRow[]>(
      `/meta_spend_cache?store_id=eq.${enc(storeId)}&date=gte.${dateFrom}&date=lte.${dateTo}&select=ad_account_id,campaign_id,campaign_name,date,spend`
    ).catch(() => [] as SpendRow[]),
    // Ad account mappings
    rest<AdAccountMapping[]>(
      `/meta_ad_account_mappings?store_id=eq.${enc(storeId)}&select=ad_account_id,product_id,product_keywords`
    ).catch(() => [] as AdAccountMapping[]),
    // COGS
    rest<Array<{ product_id: string; cost_per_unit: number; cost_type: string }>>(
      `/pnl_product_costs?store_id=eq.${enc(storeId)}&select=product_id,cost_per_unit,cost_type`
    ).catch(() => []),
  ]);

  // If meta_spend_cache is empty, get total ad spend from daily_pnl_snapshots
  let pnlAdSpend = 0;
  if (spendRows.length === 0) {
    try {
      const snapshots = await rest<Array<{ ad_spend: number }>>(
        `/daily_pnl_snapshots?store_id=eq.${enc(storeId)}&date=gte.${dateFrom}&date=lte.${dateTo}&select=ad_spend`
      );
      pnlAdSpend = (snapshots ?? []).reduce((s, r) => s + (Number(r.ad_spend) || 0), 0);
    } catch { /* table may not exist */ }
  }

  // ── Step 1: Match orders to products ──────────────────
  const revenue = new Map<string, number>();
  const orderCounts = new Map<string, number>();
  const orderProductMap = new Map<string, string>(); // order_id → product_id

  for (const p of productConfigs) {
    revenue.set(p.product_id, 0);
    orderCounts.set(p.product_id, 0);
  }

  for (const order of orders) {
    if (['voided', 'refunded'].includes(order.financial_status)) continue;

    let lineItems: LineItem[];
    try {
      lineItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || [];
    } catch { continue; }

    const matched = matchOrderToProduct(lineItems, productConfigs);
    if (matched) {
      orderProductMap.set(String(order.shopify_order_id), matched);
      revenue.set(matched, (revenue.get(matched) ?? 0) + Number(order.total_price));
      orderCounts.set(matched, (orderCounts.get(matched) ?? 0) + 1);
    }
  }

  // ── Step 2: Split fees by product ─────────────────────
  const fees = splitFeesByProduct(btTxns, orderProductMap, productConfigs, orderCounts);

  // ── Step 3: Distribute ad spend ───────────────────────
  let adSpend: Map<string, number>;
  let adMethod: string;

  if (spendRows.length > 0) {
    const result = distributeAdSpend(spendRows, adMappings, productConfigs, orderCounts);
    adSpend = result.spend;
    adMethod = result.method;
  } else if (pnlAdSpend > 0) {
    // Fallback: distribute P&L ad spend proportionally by order count
    adSpend = new Map<string, number>();
    for (const p of productConfigs) adSpend.set(p.product_id, 0);
    const totalOrders = [...orderCounts.values()].reduce((s, n) => s + n, 0);
    if (totalOrders > 0) {
      for (const p of productConfigs) {
        const share = (orderCounts.get(p.product_id) ?? 0) / totalOrders;
        adSpend.set(p.product_id, round2(pnlAdSpend * share));
      }
    } else {
      const equal = round2(pnlAdSpend / productConfigs.length);
      for (const p of productConfigs) adSpend.set(p.product_id, equal);
    }
    adMethod = 'pnl_snapshot_proportional';
  } else {
    adSpend = new Map<string, number>();
    for (const p of productConfigs) adSpend.set(p.product_id, 0);
    adMethod = 'none';
  }

  // Build COGS map
  const cogsMap = new Map<string, { costPerUnit: number; costType: string }>();
  for (const c of costRows) {
    cogsMap.set(c.product_id, { costPerUnit: c.cost_per_unit, costType: c.cost_type });
  }

  // ── Build results ─────────────────────────────────────
  const results: ProductPnLResult[] = [];

  for (const product of productConfigs) {
    const pid = product.product_id;
    const rev = round2(revenue.get(pid) ?? 0);
    const fee = round2(fees.get(pid) ?? 0);
    const ads = round2(adSpend.get(pid) ?? 0);
    const ords = orderCounts.get(pid) ?? 0;

    // COGS
    let cogs = 0;
    const costData = cogsMap.get(pid);
    if (costData) {
      cogs = costData.costType === 'fixed'
        ? round2(costData.costPerUnit * ords)
        : round2(rev * (costData.costPerUnit / 100));
    }

    const profit = round2(rev - fee - ads - cogs);
    const margin = rev > 0 ? round2((profit / rev) * 100) : 0;

    results.push({
      product_id: pid,
      product_name: product.product_name,
      revenue: rev,
      orders: ords,
      fees: fee,
      ad_spend: ads,
      cogs,
      net_profit: profit,
      margin,
      attribution_method: adMethod,
    });
  }

  // Persist to product_pnl_cache
  const now = new Date().toISOString();
  const cacheRows = results.map(r => ({
    store_id: storeId,
    product_id: r.product_id,
    date: dateFrom === dateTo ? dateFrom : `${dateFrom}..${dateTo}`,
    product_name: r.product_name,
    revenue: r.revenue,
    orders: r.orders,
    fees: r.fees,
    ad_spend: r.ad_spend,
    cogs: r.cogs,
    net_profit: r.net_profit,
    margin: r.margin,
    attribution_method: r.attribution_method,
    computed_at: now,
  }));

  if (cacheRows.length > 0) {
    await rest('/product_pnl_cache?on_conflict=store_id,product_id,date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(cacheRows),
    }).catch(err => {
      console.warn('[PRISM:AppsScript] Cache persist failed:', err instanceof Error ? err.message : err);
    });
  }

  return results;
}
