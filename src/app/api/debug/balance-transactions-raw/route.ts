import { NextRequest, NextResponse } from 'next/server';
import { rest } from '@/app/api/lib/supabase-persistence';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchFromShopify } from '@/app/api/lib/shopify-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/balance-transactions-raw?storeId=xxx
 *
 * Diagnostic: compares what Shopify returns vs what's in our DB.
 * Auth: CRON_SECRET bearer token.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const storeId = new URL(req.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token?.shopDomain) {
    return NextResponse.json({ error: 'No Shopify connection for this store' }, { status: 404 });
  }

  // 1. Fetch from Shopify directly (all pages)
  const allTxns: Array<{ id: string | number; type: string; amount: string; fee: string; net: string; processed_at: string; source_order_id?: string | number }> = [];
  let sinceId: string | undefined;
  let hasMore = true;

  while (hasMore && allTxns.length < 2000) {
    const params: Record<string, string> = { limit: '250' };
    if (sinceId) params.since_id = sinceId;

    const data = await fetchFromShopify(
      token.accessToken, token.shopDomain,
      '/shopify_payments/balance/transactions.json', params,
    ) as { transactions?: typeof allTxns };

    const txns = data.transactions ?? [];
    if (txns.length === 0) break;

    allTxns.push(...txns);
    sinceId = String(txns[txns.length - 1].id);
    hasMore = txns.length === 250;
  }

  // Count by type
  const shopifyByType: Record<string, number> = {};
  const disputes: Array<{ id: string | number; amount: string; fee: string; net: string; processed_at: string; source_order_id?: string | number }> = [];
  let oldest = '', newest = '';

  for (const txn of allTxns) {
    const type = (txn.type ?? 'unknown').toLowerCase();
    shopifyByType[type] = (shopifyByType[type] ?? 0) + 1;
    if (type === 'dispute') disputes.push(txn);
    if (!oldest || txn.processed_at < oldest) oldest = txn.processed_at;
    if (!newest || txn.processed_at > newest) newest = txn.processed_at;
  }

  // 2. Check what's in our database
  let dbRows: Array<{ type: string; processed_at: string }> = [];
  try {
    dbRows = await rest<typeof dbRows>(
      `/shopify_balance_transactions?store_id=eq.${encodeURIComponent(storeId)}&select=type,processed_at&order=processed_at.desc&limit=2000`
    );
  } catch { /* table may not exist */ }

  const dbByType: Record<string, number> = {};
  for (const r of dbRows) {
    const type = r.type ?? 'unknown';
    dbByType[type] = (dbByType[type] ?? 0) + 1;
  }

  // 3. Check shopify_chargebacks table
  let cbRows: Array<{ order_id: string; status: string; amount: number; finalized_at: string | null; created_at: string }> = [];
  try {
    cbRows = await rest<typeof cbRows>(
      `/shopify_chargebacks?store_id=eq.${encodeURIComponent(storeId)}&select=order_id,status,amount,finalized_at,created_at&limit=100`
    );
  } catch { /* table may not exist */ }

  return NextResponse.json({
    shopify: {
      totalFetched: allTxns.length,
      byType: shopifyByType,
      dateRange: { oldest, newest },
      disputes,
    },
    database: {
      totalRows: dbRows.length,
      byType: dbByType,
      dateRange: {
        oldest: dbRows[dbRows.length - 1]?.processed_at ?? 'none',
        newest: dbRows[0]?.processed_at ?? 'none',
      },
    },
    chargebacks: {
      totalRows: cbRows.length,
      rows: cbRows,
    },
    mismatch: {
      disputesInShopify: shopifyByType['dispute'] ?? 0,
      disputesInDatabase: dbByType['dispute'] ?? 0,
      chargebacksInTable: cbRows.length,
      problem:
        (shopifyByType['dispute'] ?? 0) > 0 && (dbByType['dispute'] ?? 0) === 0
          ? 'Disputes exist in Shopify but not in database — sync is filtering them out'
          : (shopifyByType['dispute'] ?? 0) === 0
          ? 'No disputes found in Shopify balance transactions'
          : 'Data matches',
    },
  });
}
