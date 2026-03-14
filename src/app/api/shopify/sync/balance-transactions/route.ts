import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchFromShopify } from '@/app/api/lib/shopify-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface BalanceTransaction {
  id: number | string;
  type: string;
  amount: string;
  fee: string;
  net: string;
  currency: string;
  source_order_id?: number | string;
  source_type?: string;
  processed_at: string;
  payout_id?: number | string;
}

/**
 * POST /api/shopify/sync/balance-transactions
 * Body: { storeId: string, days?: number }
 *
 * Syncs Shopify Payments balance transactions for the last N days (default 7).
 * Extracts refunds and chargebacks into separate tables.
 */
export async function POST(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { storeId, days = 7 } = await request.json();
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token?.shopDomain) {
    return NextResponse.json({ error: 'No Shopify connection' }, { status: 404 });
  }

  try {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceISO = sinceDate.toISOString();

    // Fetch balance transactions from Shopify Payments API
    // This endpoint returns all transaction types: charge, refund, dispute, adjustment
    let allTxns: BalanceTransaction[] = [];
    let hasMore = true;
    let sinceId: string | undefined;

    while (hasMore) {
      const params: Record<string, string> = {
        limit: '250',
        processed_at_min: sinceISO,
      };
      if (sinceId) params.since_id = sinceId;

      let data: { transactions?: BalanceTransaction[] };
      try {
        data = await fetchFromShopify<{ transactions?: BalanceTransaction[] }>(
          token.accessToken,
          token.shopDomain,
          '/shopify_payments/balance/transactions.json',
          params,
        );
      } catch (err) {
        // 404 = store doesn't use Shopify Payments — not an error
        if (err instanceof Error && err.message.includes('404')) {
          return NextResponse.json({ ok: true, skipped: 'no_shopify_payments', count: 0 });
        }
        throw err;
      }

      const txns = data.transactions ?? [];
      if (txns.length === 0) break;

      allTxns = allTxns.concat(txns);
      sinceId = String(txns[txns.length - 1].id);
      hasMore = txns.length === 250;
    }

    if (allTxns.length === 0) {
      return NextResponse.json({ ok: true, count: 0, types: {} });
    }

    // Upsert all transactions to shopify_balance_transactions
    for (const txn of allTxns) {
      await rest('/shopify_balance_transactions?on_conflict=store_id,transaction_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          store_id: storeId,
          transaction_id: String(txn.id),
          type: (txn.type || '').toLowerCase(),
          amount: parseFloat(txn.amount || '0'),
          fee: Math.abs(parseFloat(txn.fee || '0')),
          net: parseFloat(txn.net || '0'),
          currency: txn.currency || 'USD',
          source_order_id: txn.source_order_id ? String(txn.source_order_id) : null,
          source_type: txn.source_type || null,
          processed_at: txn.processed_at,
          payout_id: txn.payout_id ? String(txn.payout_id) : null,
        }),
      }).catch(() => null);
    }

    // Extract refunds into shopify_refunds table
    const refunds = allTxns.filter(t => (t.type || '').toLowerCase() === 'refund');
    for (const txn of refunds) {
      await rest('/shopify_refunds?on_conflict=store_id,transaction_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          store_id: storeId,
          transaction_id: String(txn.id),
          order_id: txn.source_order_id ? String(txn.source_order_id) : null,
          amount: Math.abs(parseFloat(txn.amount || '0')),
          fee: Math.abs(parseFloat(txn.fee || '0')),
          currency: txn.currency || 'USD',
          processed_at: txn.processed_at,
        }),
      }).catch(() => null);
    }

    // Extract disputes into shopify_chargebacks table
    const disputes = allTxns.filter(t => (t.type || '').toLowerCase() === 'dispute');
    for (const txn of disputes) {
      const net = parseFloat(txn.net || '0');
      await rest('/shopify_chargebacks?on_conflict=store_id,order_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          store_id: storeId,
          order_id: txn.source_order_id ? String(txn.source_order_id) : null,
          status: net < 0 ? 'lost' : 'won',
          amount: Math.abs(net),
          net_amount: net,
          currency: txn.currency || 'USD',
          finalized_at: txn.processed_at,
          last_synced_at: new Date().toISOString(),
        }),
      }).catch(() => null);
    }

    // Count by type
    const types: Record<string, number> = {};
    for (const txn of allTxns) {
      const t = (txn.type || 'unknown').toLowerCase();
      types[t] = (types[t] || 0) + 1;
    }

    return NextResponse.json({ ok: true, count: allTxns.length, types });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[balance-transactions] Sync failed:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
