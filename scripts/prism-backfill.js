#!/usr/bin/env node
/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * GitHub Actions backfill script — runs outside Next.js, no timeouts.
 *
 * Handles: full order history, balance transactions, classification, P&L snapshots.
 * Cursor-based and resumable — safe to interrupt and re-run.
 */

// ── Mask sensitive values in all log output ──────────────────
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function maskSensitive(args) {
  return args.map(arg =>
    typeof arg === 'string'
      ? arg
          .replace(/shpat_[a-zA-Z0-9_-]+/g, 'shpat_***')
          .replace(/Bearer [a-zA-Z0-9_-]+/g, 'Bearer ***')
          .replace(/enc:v1:[a-zA-Z0-9_/+=]+/g, 'enc:***')
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***@***.***')
      : arg
  );
}

console.log = (...args) => originalLog(...maskSensitive(args));
console.error = (...args) => originalError(...maskSensitive(args));
console.warn = (...args) => originalWarn(...maskSensitive(args));

// ── Supabase client (raw REST, no SDK required) ─────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[PRISM:GitHub] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function rest(path, init = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

function enc(v) { return encodeURIComponent(v); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('[PRISM:GitHub] Starting backfill job');
  const jobType = process.env.JOB_TYPE || 'all';

  // Get stores
  let stores;
  if (process.env.STORE_ID) {
    stores = await rest(`/stores?id=eq.${enc(process.env.STORE_ID)}&select=id,name`);
  } else {
    stores = await rest('/stores?select=id,name');
  }

  console.log(`[PRISM:GitHub] Processing ${stores?.length ?? 0} stores, job=${jobType}`);

  for (const store of stores ?? []) {
    try {
      console.log(`\n[PRISM:GitHub] ── ${store.name} (${store.id}) ──`);

      // Get Shopify credentials
      const conns = await rest(
        `/connections?store_id=eq.${enc(store.id)}&platform=eq.shopify&select=access_token,shop_domain`
      );
      const conn = conns?.[0];
      if (!conn?.access_token || !conn?.shop_domain) {
        console.log('[PRISM:GitHub] No Shopify connection — skipping');
        continue;
      }

      // Decrypt token if needed (encrypted tokens start with "enc:")
      let accessToken = conn.access_token;
      if (accessToken.startsWith('enc:')) {
        console.log('[PRISM:GitHub] Token is encrypted — calling app API for decryption');
        // Cannot decrypt locally — skip store or call app API
        if (process.env.APP_URL) {
          try {
            const tokenRes = await fetch(`${process.env.APP_URL}/api/admin/fast-track`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.CRON_SECRET || ''}`,
              },
              body: JSON.stringify({ storeId: store.id }),
            });
            if (tokenRes.ok) {
              const result = await tokenRes.json();
              console.log(`[PRISM:GitHub] Fast-track via app: ${result.orders} orders, ${result.classified} classified`);
            }
          } catch (e) {
            console.warn('[PRISM:GitHub] App API call failed:', e.message);
          }
        }
        continue;
      }

      if (jobType === 'all' || jobType === 'orders') {
        await backfillOrders(store.id, accessToken, conn.shop_domain);
      }

      if (jobType === 'all' || jobType === 'balance_transactions') {
        await backfillBalanceTransactions(store.id, accessToken, conn.shop_domain);
      }

      if (jobType === 'all' || jobType === 'classify') {
        await classifyProducts(store.id);
      }

    } catch (err) {
      console.error(`[PRISM:GitHub] Failed for ${store.name}:`, err.message);
    }
  }

  console.log('\n[PRISM:GitHub] All stores complete');
}

// ── Order Backfill ──────────────────────────────────────────

async function backfillOrders(storeId, accessToken, shopDomain) {
  console.log(`[PRISM:GitHub] Fetching orders for ${shopDomain}`);

  // Get saved cursor
  const progress = await rest(
    `/onboarding_progress?store_id=eq.${enc(storeId)}&select=cursors&limit=1`
  );
  let sinceId = progress?.[0]?.cursors?.orders_since_id || '0';

  let totalFetched = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `https://${shopDomain}/admin/api/2024-01/orders.json?limit=250&status=any&since_id=${sinceId}`;
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });

    if (!res.ok) {
      console.error(`[PRISM:GitHub] Shopify ${res.status} for orders`);
      break;
    }

    const data = await res.json();
    const orders = data.orders || [];
    if (orders.length === 0) break;

    // Upsert each order
    for (const order of orders) {
      let refundTotal = 0;
      for (const refund of order.refunds || []) {
        for (const txn of refund.transactions || []) {
          refundTotal += parseFloat(txn.amount || '0');
        }
      }

      let orderStatus = 'open';
      if (order.cancelled_at) orderStatus = 'cancelled';
      else if (order.financial_status === 'refunded') orderStatus = 'refunded';
      else if (order.financial_status === 'partially_refunded') orderStatus = 'partially_refunded';
      else if (order.closed_at) orderStatus = 'closed';

      const totalShipping = (order.shipping_lines || []).reduce(
        (sum, line) => sum + parseFloat(line.price || '0'), 0
      );

      await rest('/shopify_orders_cache', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          store_id: storeId,
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
      }).catch(() => null);
    }

    totalFetched += orders.length;
    sinceId = String(orders[orders.length - 1].id);

    // Save cursor after each batch
    const curr = await rest(
      `/onboarding_progress?store_id=eq.${enc(storeId)}&select=cursors&limit=1`
    );
    await rest(`/onboarding_progress?store_id=eq.${enc(storeId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        cursors: { ...(curr?.[0]?.cursors || {}), orders_since_id: sinceId },
        last_activity_at: new Date().toISOString(),
      }),
    }).catch(() => null);

    // Log progress every 10 pages
    if (totalFetched % 2500 === 0) {
      const latest = orders[orders.length - 1]?.created_at?.split('T')[0];
      console.log(`[PRISM:GitHub] ${shopDomain}: ${totalFetched} orders, latest: ${latest}`);
    }

    hasMore = orders.length === 250;

    // Rate limiting
    const callLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
    if (callLimit) {
      const [used, max] = callLimit.split('/').map(Number);
      if (used >= max - 2) await sleep(2000);
      else await sleep(300);
    }
  }

  console.log(`[PRISM:GitHub] ${shopDomain} orders complete: ${totalFetched}`);
}

// ── Balance Transaction Backfill ────────────────────────────

async function backfillBalanceTransactions(storeId, accessToken, shopDomain) {
  console.log(`[PRISM:GitHub] Fetching balance transactions for ${shopDomain}`);

  const progress = await rest(
    `/onboarding_progress?store_id=eq.${enc(storeId)}&select=cursors,first_order_date&limit=1`
  );
  let sinceId = progress?.[0]?.cursors?.balance_txn_since_id || undefined;
  const firstOrderDate = progress?.[0]?.first_order_date || '2020-01-01';

  let totalFetched = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({ limit: '250', processed_at_min: `${firstOrderDate}T00:00:00Z` });
    if (sinceId) params.set('since_id', sinceId);

    const url = `https://${shopDomain}/admin/api/2024-01/shopify_payments/balance/transactions.json?${params}`;
    let res;
    try {
      res = await fetch(url, { headers: { 'X-Shopify-Access-Token': accessToken } });
    } catch (e) {
      console.warn(`[PRISM:GitHub] Balance txn fetch failed:`, e.message);
      break;
    }

    if (res.status === 404) {
      console.log('[PRISM:GitHub] Store does not use Shopify Payments — skipping');
      break;
    }
    if (!res.ok) {
      console.error(`[PRISM:GitHub] Balance txn API ${res.status}`);
      break;
    }

    const data = await res.json();
    const txns = data.transactions ?? [];
    if (txns.length === 0) break;

    for (const txn of txns) {
      const txnType = (txn.type || '').toLowerCase();

      await rest('/shopify_balance_transactions?on_conflict=store_id,transaction_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          store_id: storeId,
          transaction_id: String(txn.id),
          type: txnType,
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

      if (txnType === 'refund') {
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

      if (txnType === 'dispute') {
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
    }

    totalFetched += txns.length;
    sinceId = String(txns[txns.length - 1].id);

    // Save cursor
    const curr = await rest(
      `/onboarding_progress?store_id=eq.${enc(storeId)}&select=cursors&limit=1`
    );
    await rest(`/onboarding_progress?store_id=eq.${enc(storeId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        cursors: { ...(curr?.[0]?.cursors || {}), balance_txn_since_id: sinceId },
        last_activity_at: new Date().toISOString(),
      }),
    }).catch(() => null);

    if (totalFetched % 2500 === 0) {
      console.log(`[PRISM:GitHub] ${shopDomain}: ${totalFetched} balance txns`);
    }

    hasMore = txns.length === 250;
    await sleep(300);
  }

  console.log(`[PRISM:GitHub] ${shopDomain} balance txns complete: ${totalFetched}`);
}

// ── Classification ──────────────────────────────────────────

async function classifyProducts(storeId) {
  if (!process.env.APP_URL) {
    console.log('[PRISM:GitHub] No APP_URL — skipping classification');
    return;
  }

  console.log(`[PRISM:GitHub] Classifying products for ${storeId}`);
  try {
    const res = await fetch(`${process.env.APP_URL}/api/intelligence/run-classification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId }),
    });
    const result = await res.json();
    console.log(`[PRISM:GitHub] Classification: ${result.totalClassified ?? 0} products`);
  } catch (e) {
    console.warn('[PRISM:GitHub] Classification failed:', e.message);
  }
}

// ── Run ─────────────────────────────────────────────────────

main().catch(err => {
  console.error('[PRISM:GitHub] Fatal error:', err.message);
  process.exit(1);
});
