import { rest } from '@/app/api/lib/supabase-persistence';

export type OnboardingStage =
  | 'store_metadata'
  | 'shopify_products'
  | 'shopify_orders'
  | 'shopify_transactions'
  | 'balance_transactions'
  | 'shopify_chargebacks'
  | 'meta_ads'
  | 'fee_learning'
  | 'classification'
  | 'pnl_snapshots';

export type StageStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';

export interface OnboardingProgress {
  store_id: string;
  first_order_date: string | null;
  total_orders: number;
  estimated_minutes: number;
  stages: Record<OnboardingStage, StageStatus>;
  stage_progress: Record<string, { fetched: number; total: number }>;
  cursors: Record<string, string | null>;
  stage_errors: Record<string, string>;
  overall_status: 'in_progress' | 'complete' | 'partial' | 'failed';
  started_at: string;
  completed_at: string | null;
  last_activity_at: string;
}

const DEFAULT_STAGES: Record<OnboardingStage, StageStatus> = {
  store_metadata: 'pending',
  shopify_products: 'pending',
  shopify_orders: 'pending',
  shopify_transactions: 'pending',
  balance_transactions: 'pending',
  shopify_chargebacks: 'pending',
  meta_ads: 'pending',
  fee_learning: 'pending',
  classification: 'pending',
  pnl_snapshots: 'pending',
};

// ── Progress Helpers ─────────────────────────────────────────

export async function getOnboardingProgress(storeId: string): Promise<OnboardingProgress | null> {
  const rows = await rest<OnboardingProgress[]>(
    `/onboarding_progress?store_id=eq.${encodeURIComponent(storeId)}&select=*&limit=1`
  ).catch(() => []);
  return rows[0] || null;
}

async function updateStageStatus(storeId: string, stage: OnboardingStage, status: StageStatus, error?: string): Promise<void> {
  const progress = await getOnboardingProgress(storeId);
  if (!progress) return;

  const stages = { ...progress.stages, [stage]: status };
  const stageErrors = { ...progress.stage_errors };
  if (error) stageErrors[stage] = error;
  else delete stageErrors[stage];

  await rest(`/onboarding_progress?store_id=eq.${encodeURIComponent(storeId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      stages,
      stage_errors: stageErrors,
      last_activity_at: new Date().toISOString(),
    }),
  }).catch(() => null);
}

export async function updateCursor(storeId: string, key: string, cursor: string | null): Promise<void> {
  const progress = await getOnboardingProgress(storeId);
  if (!progress) return;

  await rest(`/onboarding_progress?store_id=eq.${encodeURIComponent(storeId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      cursors: { ...progress.cursors, [key]: cursor },
      last_activity_at: new Date().toISOString(),
    }),
  }).catch(() => null);
}

export async function updateStageProgress(storeId: string, stage: string, fetched: number, total: number): Promise<void> {
  const progress = await getOnboardingProgress(storeId);
  if (!progress) return;

  await rest(`/onboarding_progress?store_id=eq.${encodeURIComponent(storeId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      stage_progress: { ...progress.stage_progress, [stage]: { fetched, total } },
      last_activity_at: new Date().toISOString(),
    }),
  }).catch(() => null);
}

// ── Stage Runner (resumable) ─────────────────────────────────

async function runStage(storeId: string, stage: OnboardingStage, fn: () => Promise<void>): Promise<void> {
  const progress = await getOnboardingProgress(storeId);
  if (progress?.stages[stage] === 'complete') {
    console.log(`[Onboarding] Stage "${stage}" already complete — skipping`);
    return;
  }

  // Re-run 'running' (interrupted) and 'failed' stages — cursor-based logic handles resumption
  await updateStageStatus(storeId, stage, 'running');
  try {
    await fn();
    await updateStageStatus(storeId, stage, 'complete');
    console.log(`[Onboarding] Stage "${stage}" complete for ${storeId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('skip:')) {
      await updateStageStatus(storeId, stage, 'skipped', msg.slice(5));
      console.log(`[Onboarding] Stage "${stage}" skipped: ${msg.slice(5)}`);
    } else {
      await updateStageStatus(storeId, stage, 'failed', msg);
      throw err;
    }
  }
}

// ── Discover First Order Date (from Shopify API) ─────────────

async function discoverFirstOrderDate(
  accessToken: string,
  shopDomain: string,
): Promise<{ firstOrderDate: string; totalOrders: number }> {
  const { fetchFromShopify, fetchShopifyOrderCount } = await import('@/app/api/lib/shopify-client');

  const totalOrders = await fetchShopifyOrderCount(accessToken, shopDomain, { status: 'any' });

  // Get oldest order using since_id=1 (ascending by ID)
  const oldestData = await fetchFromShopify<{ orders: Array<{ created_at: string }> }>(
    accessToken, shopDomain, '/orders.json',
    { limit: '1', status: 'any', since_id: '1' },
  );

  const firstOrderDate = oldestData.orders?.[0]?.created_at?.split('T')[0]
    || new Date().toISOString().split('T')[0];

  return { firstOrderDate, totalOrders };
}

// ── Stage: Backfill ALL Historical Orders ────────────────────

async function backfillOrders(
  storeId: string,
  accessToken: string,
  shopDomain: string,
): Promise<void> {
  const { fetchFromShopify } = await import('@/app/api/lib/shopify-client');

  const progress = await getOnboardingProgress(storeId);
  let sinceId = progress?.cursors?.['orders_since_id'] || '0';
  let totalFetched = progress?.stage_progress?.shopify_orders?.fetched || 0;
  const estimatedTotal = progress?.total_orders || 0;

  let hasMore = true;

  while (hasMore) {
    const params: Record<string, string> = {
      limit: '250',
      status: 'any',
      since_id: sinceId,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await fetchFromShopify<{ orders: any[] }>(
      accessToken, shopDomain, '/orders.json', params,
    );

    const orders = data.orders || [];
    if (orders.length === 0) break;

    for (const order of orders) {
      let refundTotal = 0;
      if (order.refunds?.length > 0) {
        for (const refund of order.refunds) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const transaction of refund.transactions || []) {
            refundTotal += parseFloat(transaction.amount || '0');
          }
        }
      }

      let orderStatus = 'open';
      if (order.cancelled_at) orderStatus = 'cancelled';
      else if (order.financial_status === 'refunded') orderStatus = 'refunded';
      else if (order.financial_status === 'partially_refunded') orderStatus = 'partially_refunded';
      else if (order.closed_at) orderStatus = 'closed';

      const totalShipping = (order.shipping_lines || []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sum: number, line: any) => sum + parseFloat(line.price || '0'), 0,
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

    // Save cursor after each batch for resumability
    await updateCursor(storeId, 'orders_since_id', sinceId);
    await updateStageProgress(storeId, 'shopify_orders', totalFetched, estimatedTotal || totalFetched);

    hasMore = orders.length === 250;
  }

  console.log(`[Onboarding] Backfilled ${totalFetched} orders for ${storeId}`);
}

// ── Stage: Backfill ALL Balance Transactions ─────────────────

async function backfillBalanceTransactions(
  storeId: string,
  accessToken: string,
  shopDomain: string,
  firstOrderDate: string,
): Promise<void> {
  const { fetchFromShopify } = await import('@/app/api/lib/shopify-client');

  const progress = await getOnboardingProgress(storeId);
  let sinceId = progress?.cursors?.['balance_txn_since_id'] || undefined;
  let totalFetched = progress?.stage_progress?.balance_transactions?.fetched || 0;

  let hasMore = true;

  while (hasMore) {
    const params: Record<string, string> = {
      limit: '250',
      processed_at_min: `${firstOrderDate}T00:00:00Z`,
    };
    if (sinceId) params.since_id = sinceId;

    let data: { transactions?: Array<{
      id: number | string; type: string; amount: string; fee: string;
      net: string; currency: string; source_order_id?: number | string;
      source_type?: string; processed_at: string; payout_id?: number | string;
    }> };

    try {
      data = await fetchFromShopify(
        accessToken, shopDomain,
        '/shopify_payments/balance/transactions.json', params,
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        throw new Error('skip:Store does not use Shopify Payments');
      }
      throw err;
    }

    const txns = data.transactions ?? [];
    if (txns.length === 0) break;

    for (const txn of txns) {
      const txnType = (txn.type || '').toLowerCase();

      await rest('/shopify_balance_transactions?on_conflict=store_id,transaction_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          store_id: storeId, transaction_id: String(txn.id), type: txnType,
          amount: parseFloat(txn.amount || '0'), fee: Math.abs(parseFloat(txn.fee || '0')),
          net: parseFloat(txn.net || '0'), currency: txn.currency || 'USD',
          source_order_id: txn.source_order_id ? String(txn.source_order_id) : null,
          source_type: txn.source_type || null, processed_at: txn.processed_at,
          payout_id: txn.payout_id ? String(txn.payout_id) : null,
        }),
      }).catch(() => null);

      if (txnType === 'refund') {
        await rest('/shopify_refunds?on_conflict=store_id,transaction_id', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            store_id: storeId, transaction_id: String(txn.id),
            order_id: txn.source_order_id ? String(txn.source_order_id) : null,
            amount: Math.abs(parseFloat(txn.amount || '0')),
            fee: Math.abs(parseFloat(txn.fee || '0')),
            currency: txn.currency || 'USD', processed_at: txn.processed_at,
          }),
        }).catch(() => null);
      }

      if (txnType === 'dispute') {
        const net = parseFloat(txn.net || '0');
        await rest('/shopify_chargebacks?on_conflict=store_id,order_id', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            store_id: storeId,
            order_id: txn.source_order_id ? String(txn.source_order_id) : null,
            status: net < 0 ? 'lost' : 'won', amount: Math.abs(net), net_amount: net,
            currency: txn.currency || 'USD', finalized_at: txn.processed_at,
            last_synced_at: new Date().toISOString(),
          }),
        }).catch(() => null);
      }
    }

    totalFetched += txns.length;
    sinceId = String(txns[txns.length - 1].id);

    await updateCursor(storeId, 'balance_txn_since_id', sinceId);
    await updateStageProgress(storeId, 'balance_transactions', totalFetched, totalFetched);

    hasMore = txns.length === 250;
  }

  console.log(`[Onboarding] Backfilled ${totalFetched} balance transactions for ${storeId}`);
}

// ── Stage: Backfill Meta Ads (37 months) ─────────────────────

async function backfillMetaAds(storeId: string): Promise<void> {
  const { getPersistentConnection, listPersistentStoreAdAccounts } = await import('@/app/api/lib/supabase-persistence');
  const { fetchFromMeta } = await import('@/app/api/lib/meta-client');

  const metaConn = await getPersistentConnection(storeId, 'meta');
  if (!metaConn?.access_token) {
    throw new Error('skip:No Meta ad account connected');
  }

  const adAccounts = await listPersistentStoreAdAccounts(storeId);
  const activeAccounts = adAccounts.filter(a => a.is_active);
  if (activeAccounts.length === 0) {
    throw new Error('skip:No active Meta ad accounts');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extractPurchases = (arr: any[] | undefined): number => {
    if (!arr) return 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = arr.find((a: any) =>
      a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase',
    );
    return entry ? parseFloat(entry.value) || 0 : 0;
  };

  const progress = await getOnboardingProgress(storeId);

  for (const account of activeAccounts) {
    const adAccountId = account.ad_account_id.startsWith('act_')
      ? account.ad_account_id
      : `act_${account.ad_account_id}`;

    const cursorKey = `meta_ads_${adAccountId}_month`;
    const startMonth = progress?.cursors?.[cursorKey] ? parseInt(progress.cursors[cursorKey]!) : 0;

    for (let monthsAgo = startMonth; monthsAgo < 37; monthsAgo++) {
      const monthStart = new Date();
      monthStart.setMonth(monthStart.getMonth() - monthsAgo);
      monthStart.setDate(1);
      const since = monthStart.toISOString().split('T')[0];

      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);
      const until = monthEnd.toISOString().split('T')[0];

      try {
        const insightsData = await fetchFromMeta<{
          data: Array<{
            campaign_id: string; campaign_name: string;
            adset_id: string; adset_name: string;
            ad_id: string; ad_name: string;
            spend: string; impressions: string; clicks: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            actions: any[]; action_values: any[];
            date_start: string;
          }>;
        }>(metaConn.access_token, `/${adAccountId}/insights`, {
          time_range: JSON.stringify({ since, until }),
          time_increment: '1',
          fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values',
          level: 'ad',
          limit: '500',
          action_attribution_windows: '7d_click,1d_view',
        });

        for (const row of insightsData?.data || []) {
          const purchases = extractPurchases(row.actions);
          const purchaseValue = extractPurchases(row.action_values);

          await rest('/meta_spend_cache', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates' },
            body: JSON.stringify({
              store_id: storeId,
              ad_account_id: adAccountId,
              campaign_id: row.campaign_id,
              campaign_name: row.campaign_name,
              adset_id: row.adset_id,
              adset_name: row.adset_name,
              ad_id: row.ad_id,
              ad_name: row.ad_name,
              date: row.date_start,
              spend: parseFloat(row.spend) || 0,
              impressions: parseInt(row.impressions) || 0,
              clicks: parseInt(row.clicks) || 0,
              purchases: parseInt(String(purchases)) || 0,
              purchase_value: parseFloat(String(purchaseValue)) || 0,
              updated_at: new Date().toISOString(),
            }),
          }).catch(() => null);
        }
      } catch (err) {
        console.warn(`[Onboarding] Meta ads month ${since} failed:`, err instanceof Error ? err.message : err);
      }

      await updateCursor(storeId, cursorKey, String(monthsAgo + 1));
      await updateStageProgress(storeId, 'meta_ads', monthsAgo + 1, 37);
    }
  }
}

// ── Stage: Backfill P&L Snapshots ────────────────────────────

async function backfillPnlSnapshots(storeId: string, firstOrderDate: string): Promise<void> {
  const { calculatePnL } = await import('@/lib/pnl/universalCalculator');

  const progress = await getOnboardingProgress(storeId);
  let currentDate = progress?.cursors?.['pnl_snapshot_date'] || firstOrderDate;
  let daysProcessed = progress?.stage_progress?.pnl_snapshots?.fetched || 0;

  const today = new Date().toISOString().split('T')[0];
  const totalDays = Math.max(1, Math.ceil(
    (new Date(today).getTime() - new Date(firstOrderDate).getTime()) / (1000 * 60 * 60 * 24),
  ));

  while (currentDate < today) {
    try {
      const pnl = await calculatePnL(storeId, currentDate, currentDate, {
        includeProductBreakdown: true,
      });

      if (pnl.orderCount > 0 || pnl.totalAdSpend > 0) {
        const productBreakdown: Record<string, { revenue: number; quantity: number; cogs: number }> = {};
        for (const p of pnl.products) {
          productBreakdown[p.productId] = {
            revenue: p.revenue, quantity: p.unitsSold, cogs: p.cogs,
          };
        }

        await rest('/pnl_snapshots', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            store_id: storeId,
            date: currentDate,
            revenue: pnl.totalRevenue,
            net_revenue: pnl.totalRevenue - pnl.totalRefunds,
            ad_spend: pnl.totalAdSpend,
            cogs: pnl.totalCogs,
            payment_fees: pnl.totalFees,
            handling_fees: 0,
            chargebacks: pnl.totalChargebackLoss,
            refunds: pnl.totalRefunds,
            net_profit: pnl.totalNetProfit,
            margin: Math.round(pnl.totalMargin * 100) / 100,
            order_count: pnl.orderCount,
            cancelled_count: 0,
            currency: 'USD',
            product_breakdown: JSON.stringify(productBreakdown),
            campaign_breakdown: '{}',
            computed_at: new Date().toISOString(),
          }),
        }).catch(() => null);

        await rest('/daily_pnl_snapshots?on_conflict=store_id,date', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{
            store_id: storeId,
            date: currentDate,
            revenue: pnl.totalRevenue,
            order_count: pnl.orderCount,
            cogs: pnl.totalCogs,
            ad_spend: pnl.totalAdSpend,
            shipping_cost: pnl.totalShipping,
            transaction_fees: pnl.totalFees,
            refunds: pnl.totalRefunds,
            full_refund_count: 0,
            partial_refund_count: 0,
            full_refund_amount: 0,
            partial_refund_amount: 0,
            chargeback_loss: pnl.totalChargebackLoss,
            chargeback_won: pnl.totalChargebackWon,
            net_profit: pnl.totalNetProfit,
            margin: pnl.totalMargin,
            attribution_rate: 0,
            warnings: JSON.stringify(pnl.warnings),
            product_breakdown: JSON.stringify(pnl.products),
            fee_method: pnl.feeMethod,
            synced_at: new Date().toISOString(),
            shopify_synced: pnl.orderCount > 0,
            meta_synced: pnl.totalAdSpend > 0,
          }]),
        }).catch(() => null);
      }
    } catch (err) {
      console.warn(`[Onboarding] P&L snapshot ${currentDate} failed:`, err instanceof Error ? err.message : err);
    }

    daysProcessed++;
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    currentDate = nextDate.toISOString().split('T')[0];

    // Save cursor every 5 days for efficiency
    if (daysProcessed % 5 === 0) {
      await updateCursor(storeId, 'pnl_snapshot_date', currentDate);
      await updateStageProgress(storeId, 'pnl_snapshots', daysProcessed, totalDays);
    }
  }

  await updateCursor(storeId, 'pnl_snapshot_date', currentDate);
  await updateStageProgress(storeId, 'pnl_snapshots', daysProcessed, totalDays);
  console.log(`[Onboarding] Backfilled ${daysProcessed} P&L snapshots for ${storeId}`);
}

// ── Main Entry Point ─────────────────────────────────────────

export async function onStoreConnected(storeId: string): Promise<void> {
  // Create or update progress record
  await rest('/onboarding_progress?on_conflict=store_id', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({
      store_id: storeId,
      stages: DEFAULT_STAGES,
      stage_progress: {},
      cursors: {},
      stage_errors: {},
      overall_status: 'in_progress',
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    }),
  }).catch(() => null);

  try {
    // Get Shopify credentials
    const { getShopifyToken } = await import('@/app/api/lib/tokens');
    const token = await getShopifyToken(storeId);
    if (!token?.accessToken || !token?.shopDomain) {
      throw new Error('No Shopify connection — cannot run onboarding');
    }
    const { accessToken, shopDomain } = token;

    // Stage 1: Store metadata (already saved during OAuth)
    await updateStageStatus(storeId, 'store_metadata', 'complete');

    // Discover first order date from Shopify API (not cache)
    const progress = await getOnboardingProgress(storeId);
    let firstOrderDate = progress?.first_order_date;

    if (!firstOrderDate) {
      const history = await discoverFirstOrderDate(accessToken, shopDomain);
      firstOrderDate = history.firstOrderDate;
      await rest(`/onboarding_progress?store_id=eq.${encodeURIComponent(storeId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          first_order_date: history.firstOrderDate,
          total_orders: history.totalOrders,
          estimated_minutes: Math.max(1, Math.round(history.totalOrders / 500)),
        }),
      }).catch(() => null);
    }

    // Stage 2: Backfill ALL historical orders
    await runStage(storeId, 'shopify_orders', () =>
      backfillOrders(storeId, accessToken, shopDomain),
    );

    // Stage 3: Backfill ALL balance transactions (fees + refunds + chargebacks)
    await runStage(storeId, 'balance_transactions', () =>
      backfillBalanceTransactions(storeId, accessToken, shopDomain, firstOrderDate!),
    );

    // Stage 4: Transactions — populated by balance_transactions
    const txnCheck = await rest<Array<{ id: string }>>(
      `/shopify_balance_transactions?store_id=eq.${encodeURIComponent(storeId)}&type=eq.charge&select=id&limit=1`,
    ).catch(() => []);
    await updateStageStatus(storeId, 'shopify_transactions', txnCheck.length > 0 ? 'complete' : 'skipped');

    // Stage 5: Chargebacks — populated by balance_transactions
    const cbCheck = await rest<Array<{ id: string }>>(
      `/shopify_chargebacks?store_id=eq.${encodeURIComponent(storeId)}&select=id&limit=1`,
    ).catch(() => []);
    await updateStageStatus(storeId, 'shopify_chargebacks', cbCheck.length > 0 ? 'complete' : 'skipped');

    // Stage 6: Meta ads (37-month backfill)
    await runStage(storeId, 'meta_ads', () => backfillMetaAds(storeId));

    // Stage 7: Fee learning
    await runStage(storeId, 'fee_learning', async () => {
      const { learnFeeRates } = await import('@/lib/pnl/feeIntelligence');
      await learnFeeRates(storeId);
    });

    // Stage 8: Classification (creates product_behaviors + classifications)
    await runStage(storeId, 'classification', async () => {
      const { extractAllProductBehaviors } = await import('@/lib/intelligence/behaviorExtractor');
      const { buildStoreProfile } = await import('@/lib/intelligence/storeProfiler');
      const { classifyAllProducts } = await import('@/lib/intelligence/relativeClassifier');

      const behaviors = await extractAllProductBehaviors(storeId);
      if (behaviors.length > 0) {
        const profile = await buildStoreProfile(storeId, behaviors);
        classifyAllProducts(behaviors, profile, new Map(), new Map());
      }
    });

    // Stage 9: Products — populated by classification above
    const productCheck = await rest<Array<{ product_id: string }>>(
      `/product_behaviors?store_id=eq.${encodeURIComponent(storeId)}&select=product_id&limit=1`,
    ).catch(() => []);
    await updateStageStatus(storeId, 'shopify_products', productCheck.length > 0 ? 'complete' : 'skipped');

    // Stage 10: P&L snapshots — compute for every historical day
    await runStage(storeId, 'pnl_snapshots', () =>
      backfillPnlSnapshots(storeId, firstOrderDate!),
    );

    // Mark overall complete
    await rest(`/onboarding_progress?store_id=eq.${encodeURIComponent(storeId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        overall_status: 'complete',
        completed_at: new Date().toISOString(),
      }),
    }).catch(() => null);

    console.log(`[Onboarding] All stages complete for ${storeId}`);

  } catch (err) {
    console.error(`[Onboarding] Failed for store ${storeId}:`, err);
    await rest(`/onboarding_progress?store_id=eq.${encodeURIComponent(storeId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ overall_status: 'partial' }),
    }).catch(() => null);
  }
}
