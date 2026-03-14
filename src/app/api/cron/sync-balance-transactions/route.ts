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

const CRON_NAME = 'sync-balance-transactions';

async function logCron(
  storeId: string,
  status: string,
  rowsProcessed: number,
  error: string | null,
  durationMs: number,
) {
  try {
    await rest('/cron_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cron_name: CRON_NAME,
        store_id: storeId,
        status,
        rows_processed: rowsProcessed,
        error,
        duration_ms: durationMs,
        created_at: new Date().toISOString(),
      }),
    });
  } catch { /* don't let logging break the cron */ }
}

/**
 * GET /api/cron/sync-balance-transactions
 *
 * Daily cron that syncs Shopify Payments balance transactions for all stores.
 * Re-syncs last 7 days since dispute statuses update retroactively.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const stores = await listPersistentStores();
  const results: Array<{ storeId: string; status: string; count?: number; error?: string }> = [];

  for (const store of stores) {
    const start = Date.now();
    try {
      const token = await getShopifyToken(store.id);
      if (!token?.accessToken || !token?.shopDomain) {
        results.push({ storeId: store.id, status: 'skipped', error: 'no_shopify_connection' });
        continue;
      }

      // Check if we've ever done a full sync for this store
      let existingCount = 0;
      try {
        const countRows = await rest<Array<{ store_id: string }>>(
          `/shopify_balance_transactions?store_id=eq.${encodeURIComponent(store.id)}&select=store_id&limit=50`
        );
        existingCount = countRows?.length ?? 0;
      } catch { /* ignore */ }

      // First sync: go back 2 years to capture all historical disputes
      // Subsequent syncs: 30 days (disputes update retroactively)
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - (existingCount < 50 ? 730 : 30));
      const sinceISO = sinceDate.toISOString();

      let totalCount = 0;
      let sinceId: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const params: Record<string, string> = {
          limit: '250',
          processed_at_min: sinceISO,
        };
        if (sinceId) params.since_id = sinceId;

        let data: { transactions?: Array<{ id: number | string; type: string; amount: string; fee: string; net: string; currency: string; source_order_id?: number | string; source_type?: string; processed_at: string; payout_id?: number | string }> };
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

      await logCron(store.id, 'completed', totalCount, null, Date.now() - start);
      results.push({ storeId: store.id, status: 'completed', count: totalCount });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await logCron(store.id, 'failed', 0, msg, Date.now() - start);
      results.push({ storeId: store.id, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}
