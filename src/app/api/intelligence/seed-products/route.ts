import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

// ── Keyword generation from product title ────────────────────────────

function generateKeywords(title: string): string[][] {
  const clean = title
    .replace(/\(free today\)/gi, '')
    .replace(/\(free\)/gi, '')
    .replace(/free today/gi, '')
    .trim()
    .toLowerCase();

  const keywords: string[][] = [];

  // Full cleaned title as one keyword set
  if (clean.length >= 3) keywords.push([clean]);

  // Individual significant words (4+ chars, no stop words)
  const stopWords = ['with', 'for', 'and', 'the', 'free', 'today', 'kids', 'work', 'your', 'this', 'that', 'from', 'have', 'more', 'plus', 'pack', 'set'];
  const words = clean
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stopWords.includes(w));

  // Add 2-word combinations
  for (let i = 0; i < words.length - 1; i++) {
    keywords.push([words[i], words[i + 1]]);
  }

  // Add individual significant words (5+ chars only to avoid false matches)
  for (const word of words) {
    if (word.length >= 5) keywords.push([word]);
  }

  return keywords;
}

// ── Auto-seed product config for a store ─────────────────────────────

export async function autoSeedProductConfig(storeId: string): Promise<{
  seeded: number;
  products: Array<{ productId: string; title: string; classification: string }>;
  skipped: boolean;
}> {
  // Check if already has config
  const existing = await rest<Array<{ product_id: string }>>(
    `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id`
  ).catch(() => []);

  if (existing.length > 0) {
    return { seeded: 0, products: [], skipped: true };
  }

  // Detect store model from store_config
  let storeModel = 'standard';
  try {
    const cfgRows = await rest<Array<{ store_model: string | null }>>(
      `/store_config?store_id=eq.${enc(storeId)}&select=store_model&limit=1`
    );
    storeModel = cfgRows?.[0]?.store_model || 'standard';
  } catch { /* use default */ }

  // Get product stats from orders: product_id, title, order count, avg price, alone rate
  // "alone rate" = % of orders where this product is the only item (indicates it's a main product)
  const orders = await rest<Array<{
    line_items: string;
    total_price: number;
    financial_status: string;
  }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&order_status=neq.cancelled&financial_status=neq.voided&select=line_items,total_price,financial_status&order=created_at.desc&limit=500`
  ).catch(() => []);

  if (orders.length === 0) return { seeded: 0, products: [], skipped: false };

  // Aggregate product stats
  const productStats = new Map<string, {
    productId: string;
    title: string;
    orderCount: number;
    aloneCount: number; // orders where this product is the only item
    totalRevenue: number;
    avgPrice: number;
    priceSum: number;
  }>();

  let totalOrders = 0;
  let totalRevenue = 0;

  for (const order of orders) {
    if (order.financial_status === 'refunded') continue;

    let lineItems: Array<{ product_id?: number | string; title?: string; price?: string; quantity?: number }>;
    try {
      lineItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || [];
    } catch { continue; }

    if (lineItems.length === 0) continue;
    totalOrders++;
    totalRevenue += Number(order.total_price) || 0;
    const isAlone = lineItems.length === 1;

    for (const item of lineItems) {
      const pid = item.product_id ? String(item.product_id) : '';
      if (!pid) continue;
      const price = parseFloat(item.price || '0');

      const existing = productStats.get(pid);
      if (existing) {
        existing.orderCount++;
        existing.priceSum += price;
        existing.avgPrice = existing.priceSum / existing.orderCount;
        existing.totalRevenue += price * (item.quantity || 1);
        if (isAlone) existing.aloneCount++;
      } else {
        productStats.set(pid, {
          productId: pid,
          title: item.title || 'Unknown',
          orderCount: 1,
          aloneCount: isAlone ? 1 : 0,
          totalRevenue: price * (item.quantity || 1),
          avgPrice: price,
          priceSum: price,
        });
      }
    }
  }

  // Classify products as MAIN based on store model
  const mainProducts: Array<{ productId: string; title: string; classification: string }> = [];

  for (const [pid, stats] of productStats) {
    const aloneRate = stats.orderCount > 0 ? stats.aloneCount / stats.orderCount : 0;
    const revenueShare = totalRevenue > 0 ? stats.totalRevenue / totalRevenue : 0;
    const orderShare = totalOrders > 0 ? stats.orderCount / totalOrders : 0;

    let isMain = false;

    if (storeModel === 'free_plus_shipping') {
      // Free products with high alone rate = MAIN (funnel entry)
      isMain = stats.avgPrice === 0 && aloneRate > 0.2 && stats.orderCount >= 3;
    } else {
      // Standard: high revenue share OR high alone rate with decent order count
      isMain = (revenueShare > 0.08 && aloneRate > 0.1 && stats.orderCount >= 5) ||
               (aloneRate > 0.4 && stats.orderCount >= 10);
    }

    if (isMain) {
      mainProducts.push({ productId: pid, title: stats.title, classification: 'main' });
    }
  }

  // If no main products found, take top 3 by order count
  if (mainProducts.length === 0) {
    const sorted = [...productStats.values()].sort((a, b) => b.orderCount - a.orderCount);
    for (const p of sorted.slice(0, 3)) {
      if (p.orderCount >= 3) {
        mainProducts.push({ productId: p.productId, title: p.title, classification: 'main' });
      }
    }
  }

  // Cap at 10 main products
  const toSeed = mainProducts.slice(0, 10);

  // Upsert into product_config
  for (const product of toSeed) {
    const keywords = generateKeywords(product.title);
    await rest('/product_config?on_conflict=store_id,product_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        store_id: storeId,
        product_id: product.productId,
        product_name: product.title,
        main_keywords: keywords,
        upsell_keywords: [],
        is_active: true,
      }),
    }).catch(err => {
      console.warn(`[seed-products] Failed to seed ${product.title}:`, err instanceof Error ? err.message : err);
    });
  }

  console.log(`[seed-products] Auto-seeded ${toSeed.length} products for ${storeId}`);
  return { seeded: toSeed.length, products: toSeed, skipped: false };
}

// ── API endpoint ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { storeId?: string; all?: boolean };

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // Seed all stores
  if (body.all) {
    const stores = await rest<Array<{ id: string; name: string }>>(
      '/stores?select=id,name&order=created_at.desc'
    );

    const results = [];
    for (const store of stores) {
      const result = await autoSeedProductConfig(store.id);
      results.push({
        store: store.name,
        storeId: store.id,
        ...result,
      });
    }

    return NextResponse.json({ ok: true, results });
  }

  // Seed single store
  if (!body.storeId) {
    return NextResponse.json({ error: 'storeId required (or pass all: true)' }, { status: 400 });
  }

  const result = await autoSeedProductConfig(body.storeId);
  return NextResponse.json({ ok: true, ...result });
}
