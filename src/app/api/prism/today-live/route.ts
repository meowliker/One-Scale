/**
 * GET /api/prism/today-live?storeId=X
 *
 * GAP 2 — Real-time today's data (estimated, not settled).
 * Shows orders/revenue placed today even before settlement.
 * Clearly labeled as LIVE / ESTIMATED.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { fromZonedTime } from 'date-fns-tz';

export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

export async function GET(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  // Get store timezone
  const config = await rest<Array<{ iana_timezone: string; currency: string }>>(
    `/store_config?store_id=eq.${enc(storeId)}&select=iana_timezone,currency&limit=1`
  ).catch(() => []);
  const tz = config[0]?.iana_timezone || 'America/New_York';
  const currency = config[0]?.currency || 'USD';

  // Today's start in store timezone
  const now = new Date();
  const todayParts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const todayStr = `${todayParts.find(p => p.type === 'year')!.value}-${todayParts.find(p => p.type === 'month')!.value}-${todayParts.find(p => p.type === 'day')!.value}`;
  const todayUtcStart = fromZonedTime(`${todayStr}T00:00:00`, tz).toISOString();

  // Today's orders (not settled yet — from orders cache)
  const todayOrders = await rest<Array<{ total_price: number; line_items: string }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(todayUtcStart)}` +
    `&order_status=neq.cancelled&financial_status=neq.refunded` +
    `&select=total_price,line_items&limit=1000`
  ).catch(() => []);

  const orderCount = todayOrders.length;
  const estimatedRevenue = todayOrders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);

  // Learned fee rate from BT data
  const btSample = await rest<Array<{ amount: number; fee: number }>>(
    `/shopify_balance_transactions?store_id=eq.${enc(storeId)}&type=eq.charge&select=amount,fee&order=processed_at.desc&limit=100`
  ).catch(() => []);
  const btRevSum = btSample.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const btFeeSum = btSample.reduce((s, r) => s + Math.abs(Number(r.fee) || 0), 0);
  const learnedFeeRate = btRevSum > 0 ? btFeeSum / btRevSum : 0;
  const estimatedFees = estimatedRevenue * learnedFeeRate;

  // Today's Meta spend
  const metaSpend = await rest<Array<{ spend: number }>>(
    `/meta_spend_cache?store_id=eq.${enc(storeId)}&date=eq.${todayStr}&select=spend`
  ).catch(() => []);
  const todayAdSpend = metaSpend.reduce((s, r) => s + (Number(r.spend) || 0), 0);

  const estimatedNetProfit = estimatedRevenue - estimatedFees - todayAdSpend;

  // Count unique products sold today
  let productsSold = 0;
  const productIds = new Set<string>();
  for (const o of todayOrders) {
    let items: Array<{ product_id?: string | number }>;
    try { items = typeof o.line_items === 'string' ? JSON.parse(o.line_items) : o.line_items || []; } catch { continue; }
    for (const i of items) { if (i.product_id) productIds.add(String(i.product_id)); }
    productsSold += items.length;
  }

  return NextResponse.json({
    status: 'LIVE',
    disclaimer: 'Estimated — not yet settled. Final numbers update after Shopify Payments settlement.',
    store_id: storeId,
    date: todayStr,
    timezone: tz,
    currency,
    orders: orderCount,
    estimated_revenue: Math.round(estimatedRevenue * 100) / 100,
    estimated_fees: Math.round(estimatedFees * 100) / 100,
    fee_rate_used: Math.round(learnedFeeRate * 10000) / 100 + '%',
    ad_spend: Math.round(todayAdSpend * 100) / 100,
    estimated_net_profit: Math.round(estimatedNetProfit * 100) / 100,
    unique_products: productIds.size,
    items_sold: productsSold,
    last_updated: now.toISOString(),
  });
}
