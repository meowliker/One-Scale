import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

export async function GET(request: NextRequest) {
  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: 'not configured' }, { status: 503 });

  let needsReauth = false;
  let hasNoData = false;
  let paymentGateway: 'shopify_payments' | 'other' | 'unknown' = 'unknown';
  let currency = 'USD';

  // Check needs_reauth flag
  try {
    const stores = await rest<Array<{ needs_reauth: boolean }>>(
      `/stores?id=eq.${enc(storeId)}&select=needs_reauth&limit=1`
    );
    needsReauth = stores?.[0]?.needs_reauth ?? false;
  } catch { /* column may not exist */ }

  // Check if store has any P&L data
  try {
    const snapshots = await rest<Array<{ date: string }>>(
      `/daily_pnl_snapshots?store_id=eq.${enc(storeId)}&select=date&limit=1`
    );
    hasNoData = !snapshots || snapshots.length === 0;
  } catch {
    hasNoData = true;
  }

  // Check payment gateway (BT presence = Shopify Payments)
  try {
    const bt = await rest<Array<{ transaction_id: string }>>(
      `/shopify_balance_transactions?store_id=eq.${enc(storeId)}&select=transaction_id&limit=1`
    );
    paymentGateway = bt && bt.length > 0 ? 'shopify_payments' : 'other';
  } catch {
    paymentGateway = 'unknown';
  }

  // Get currency
  try {
    const config = await rest<Array<{ currency: string | null }>>(
      `/store_config?store_id=eq.${enc(storeId)}&select=currency&limit=1`
    );
    currency = config?.[0]?.currency || 'USD';
  } catch { /* default USD */ }

  return NextResponse.json({ needsReauth, hasNoData, paymentGateway, currency });
}
