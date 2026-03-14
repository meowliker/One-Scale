import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchFromShopify } from '@/app/api/lib/shopify-client';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/backfill-balance-txns
 *
 * Forces a 730-day (2 year) backfill of Shopify Payments balance transactions
 * for all stores. Use this after the initial 7-day sync populated incomplete data.
 *
 * This is safe to re-run — all upserts use on_conflict merge-duplicates.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const stores = await listPersistentStores();
  const results: Array<{
    storeId: string;
    status: string;
    count?: number;
    oldestTxn?: string;
    error?: string;
  }> = [];

  for (const store of stores) {
    try {
      const token = await getShopifyToken(store.id);
      if (!token?.accessToken || !token?.shopDomain) {
        results.push({ storeId: store.id, status: 'skipped', error: 'no_shopify_connection' });
        continue;
      }

      // Always go back 730 days
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 730);
      const sinceISO = sinceDate.toISOString();

      let totalCount = 0;
      let sinceId: string | undefined;
      let hasMore = true;
      let oldestProcessedAt: string | null = null;

      while (hasMore) {
        const params: Record<string, string> = {
          limit: '250',
          processed_at_min: sinceISO,
        };
        if (sinceId) params.since_id = sinceId;

        let data: {
          transactions?: Array<{
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
          }>;
        };
        try {
          data = await fetchFromShopify(
            token.accessToken,
            token.shopDomain,
            '/shopify_payments/balance/transactions.json',
            params,
          );
        } catch (err) {
          if (err instanceof Error && err.message.includes('404')) {
            results.push({ storeId: store.id, status: 'skipped', error: 'no_shopify_payments' });
            break;
          }
          throw err;
        }

        const txns = data.transactions ?? [];
        if (txns.length === 0) break;

        // Track oldest transaction for reporting
        for (const txn of txns) {
          if (!oldestProcessedAt || txn.processed_at < oldestProcessedAt) {
            oldestProcessedAt = txn.processed_at;
          }
        }

        // Upsert all transactions
        for (const txn of txns) {
          await rest('/shopify_balance_transactions?on_conflict=store_id,transaction_id', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates' },
            body: JSON.stringify({
              store_id: store.id,
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

          // Extract refunds
          if ((txn.type || '').toLowerCase() === 'refund') {
            await rest('/shopify_refunds?on_conflict=store_id,transaction_id', {
              method: 'POST',
              headers: { Prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify({
                store_id: store.id,
                transaction_id: String(txn.id),
                order_id: txn.source_order_id ? String(txn.source_order_id) : null,
                amount: Math.abs(parseFloat(txn.amount || '0')),
                fee: Math.abs(parseFloat(txn.fee || '0')),
                currency: txn.currency || 'USD',
                processed_at: txn.processed_at,
              }),
            }).catch(() => null);
          }

          // Extract disputes
          if ((txn.type || '').toLowerCase() === 'dispute') {
            const net = parseFloat(txn.net || '0');
            await rest('/shopify_chargebacks?on_conflict=store_id,order_id', {
              method: 'POST',
              headers: { Prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify({
                store_id: store.id,
                order_id: txn.source_order_id ? String(txn.source_order_id) : null,
                status: net < 0 ? 'lost' : 'won',
                amount: Math.abs(net),
                net_amount: net,
                currency: txn.currency || 'USD',
                initiated_at: txn.processed_at,
                finalized_at: txn.processed_at,
                created_at: txn.processed_at,
                last_synced_at: new Date().toISOString(),
              }),
            }).catch(() => null);
          }
        }

        totalCount += txns.length;
        sinceId = String(txns[txns.length - 1].id);
        hasMore = txns.length === 250;
      }

      results.push({
        storeId: store.id,
        status: 'completed',
        count: totalCount,
        oldestTxn: oldestProcessedAt ?? undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      results.push({ storeId: store.id, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}
