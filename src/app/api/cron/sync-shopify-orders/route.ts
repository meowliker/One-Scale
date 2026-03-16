import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
  getPersistentConnection,
  logStoreError,
} from '@/app/api/lib/supabase-persistence';
import { fetchFromShopify } from '@/app/api/lib/shopify-client';
import { fetchDisputesGraphQL, normalizeDisputeStatus } from '@/app/api/lib/shopify-graphql';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const SHOPIFY_API_VERSION = '2024-01';

// ---- Cron Log ----

async function logCron(
  cronName: string,
  storeId: string,
  status: string,
  rowsProcessed: number,
  error: string | null,
  durationMs: number
) {
  await rest('/cron_logs', {
    method: 'POST',
    body: JSON.stringify({
      cron_name: cronName,
      store_id: storeId,
      status,
      rows_processed: rowsProcessed,
      error,
      duration_ms: durationMs,
    }),
  });
}

// ---- Types ----

interface ShopifyOrderRaw {
  id: number;
  name: string;
  email: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  cancelled_at: string | null;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  currency: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  line_items: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refunds: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customer: any;
  note: string | null;
  tags: string;
  landing_site: string | null;
  referring_site: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  discount_codes: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shipping_lines: any[];
}

// ---- Main Handler ----

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const stores = await listPersistentStores();
  const results: Array<{ storeId: string; status: string; rows?: number; error?: string }> = [];

  for (const store of stores) {
    const start = Date.now();
    try {
      // Get Shopify connection
      const shopifyConn = await getPersistentConnection(store.id, 'shopify');
      if (!shopifyConn || !shopifyConn.access_token || !shopifyConn.shop_domain) {
        results.push({ storeId: store.id, status: 'skipped', error: 'No Shopify connection' });
        continue;
      }

      const accessToken = shopifyConn.access_token;
      const shopDomain = shopifyConn.shop_domain;

      // Fetch orders — default 20 minutes, or ?days=N for backfill
      const backfillDays = parseInt(new URL(req.url).searchParams.get('days') || '0', 10);
      const sinceMs = backfillDays > 0 ? backfillDays * 24 * 60 * 60 * 1000 : 20 * 60 * 1000;
      const twentyMinAgo = new Date(Date.now() - sinceMs).toISOString();

      // Fetch with pagination (for backfill mode)
      let allOrders: ShopifyOrderRaw[] = [];
      let sinceId: string | undefined;
      let hasMore = true;
      const maxPages = backfillDays > 0 ? 100 : 1; // Paginate only for backfill
      let page = 0;

      while (hasMore && page < maxPages) {
        const params: Record<string, string> = {
          created_at_min: twentyMinAgo,
          status: 'any',
          limit: '250',
        };
        if (sinceId) params.since_id = sinceId;

        const data = await fetchFromShopify<{ orders: ShopifyOrderRaw[] }>(
          accessToken, shopDomain, '/orders.json', params,
        );

        const batch = data?.orders || [];
        allOrders.push(...batch);
        page++;

        if (batch.length < 250) { hasMore = false; }
        else { sinceId = String(batch[batch.length - 1].id); }
      }

      const orders = allOrders;
      let upserted = 0;

      for (const order of orders) {
        // Calculate refund total
        let refundTotal = 0;
        if (order.refunds && order.refunds.length > 0) {
          for (const refund of order.refunds) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const transaction of refund.transactions || []) {
              refundTotal += parseFloat(transaction.amount || '0');
            }
          }
        }

        // Determine order status
        let orderStatus = 'open';
        if (order.cancelled_at) {
          orderStatus = 'cancelled';
        } else if (order.financial_status === 'refunded') {
          orderStatus = 'refunded';
        } else if (order.financial_status === 'partially_refunded') {
          orderStatus = 'partially_refunded';
        } else if (order.closed_at) {
          orderStatus = 'closed';
        }

        // Calculate total shipping from shipping lines
        const totalShipping = (order.shipping_lines || []).reduce(
          (sum: number, line: any) => sum + parseFloat(line.price || '0'), 0
        );

        // Upsert into shopify_orders_cache (idempotent: store_id + shopify_order_id is unique)
        await rest('/shopify_orders_cache?on_conflict=store_id,shopify_order_id', {
          method: 'POST',
          headers: {
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            store_id: store.id,
            shopify_order_id: String(order.id),
            order_name: order.name,
            email: order.email,
            created_at: order.created_at,
            updated_at: order.updated_at,
            cancelled_at: order.cancelled_at,
            financial_status: order.financial_status,
            fulfillment_status: order.fulfillment_status,
            total_price: parseFloat(order.total_price) || 0,
            subtotal_price: parseFloat(order.subtotal_price) || 0,
            total_tax: parseFloat(order.total_tax) || 0,
            total_discounts: parseFloat(order.total_discounts) || 0,
            refund_total: refundTotal,
            currency: order.currency,
            line_items: JSON.stringify(order.line_items),
            customer_id: order.customer?.id ? String(order.customer.id) : null,
            customer_email: order.customer?.email || order.email,
            order_status: orderStatus,
            tags: order.tags || '',
            landing_site: order.landing_site,
            referring_site: order.referring_site,
            discount_codes: JSON.stringify(order.discount_codes || []),
            total_shipping_price: totalShipping,
            synced_at: new Date().toISOString(),
          }),
        });

        upserted++;
      }

      // ---- Sync disputes/chargebacks via GraphQL ----
      let disputesSynced = 0;
      try {
        const disputes = await fetchDisputesGraphQL(store.id);
        for (const dispute of disputes) {
          const normalized = normalizeDisputeStatus(dispute.status);
          const orderId = dispute.order?.id
            ? dispute.order.id.replace('gid://shopify/Order/', '')
            : null;

          await rest('/shopify_chargebacks', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({
              store_id: store.id,
              order_id: orderId || dispute.id,
              amount: parseFloat(dispute.amount.amount),
              currency: dispute.amount.currencyCode,
              reason: dispute.reasonMessage || '',
              status: normalized,
              shopify_status: dispute.status,
              created_at: dispute.initiatedAt,
              updated_at: dispute.finalizedAt || dispute.initiatedAt,
            }),
          });
          disputesSynced++;
        }
      } catch (err) {
        // Disputes fetch may fail if scope not granted yet — log but don't fail
        console.warn(`[sync-shopify-orders] Disputes fetch failed for ${store.id}:`, err instanceof Error ? err.message : err);
      }

      const elapsed = Date.now() - start;
      await logCron('sync-shopify-orders', store.id, 'success', upserted + disputesSynced, null, elapsed);
      results.push({ storeId: store.id, status: 'success', rows: upserted });
    } catch (err) {
      const elapsed = Date.now() - start;
      const message = err instanceof Error ? err.message : 'Unknown error';
      await logCron('sync-shopify-orders', store.id, 'error', 0, message, elapsed).catch(() => {});
      await logStoreError(store.id, 'cron_sync_shopify_orders', message, 'Check Shopify connection and API credentials');
      results.push({ storeId: store.id, status: 'error', error: message });
      // Continue processing other stores
    }
  }

  return NextResponse.json({
    ok: true,
    cron: 'sync-shopify-orders',
    runAt: new Date().toISOString(),
    results,
  });
}
