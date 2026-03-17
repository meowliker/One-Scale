import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import { getOnboardingProgress } from '@/lib/onboarding/orchestrator';
import { getAppUrl } from '@/app/api/lib/url';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface StoreAudit {
  hasStoreConfig: boolean;
  currency: string;
  timezone: string;
  hasProducts: boolean;
  productCount: number;
  hasOrders: boolean;
  orderCount: number;
  hasBalanceTransactions: boolean;
  balanceTransactionCount: number;
  hasChargebacks: boolean;
  chargebackCount: number;
  hasClassifications: boolean;
  classificationCount: number;
  hasPnLSnapshots: boolean;
  snapshotCount: number;
  stagesToRun: string[];
}

async function countRows(table: string, storeId: string, extra = ''): Promise<number> {
  try {
    const rows = await rest<Array<{ count: number }>>(
      `/${table}?store_id=eq.${encodeURIComponent(storeId)}${extra}&select=count`,
      { headers: { Prefer: 'count=exact' } }
    );
    // PostgREST returns count in content-range header; fallback to array length
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}

async function auditStore(storeId: string): Promise<StoreAudit> {
  const [configRows, productCount, orderCount, balanceTxnCount, chargebackCount, classificationCount, snapshotCount] = await Promise.all([
    rest<Array<{ currency: string; iana_timezone: string }>>(
      `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=currency,iana_timezone&limit=1`
    ).catch(() => []),
    countRows('shopify_orders_cache', storeId),
    countRows('shopify_orders_cache', storeId),
    countRows('shopify_balance_transactions', storeId),
    countRows('shopify_chargebacks', storeId),
    countRows('product_behaviors', storeId),
    countRows('daily_pnl_snapshots', storeId),
  ]);

  const config = configRows?.[0];
  const hasConfig = !!config;

  const stagesToRun: string[] = [];
  if (!hasConfig) stagesToRun.push('store_metadata');
  if (orderCount === 0) stagesToRun.push('shopify_orders');
  if (balanceTxnCount === 0) stagesToRun.push('balance_transactions');
  if (chargebackCount === 0 && balanceTxnCount === 0) stagesToRun.push('shopify_chargebacks');
  if (classificationCount === 0) stagesToRun.push('classification');
  if (snapshotCount === 0) stagesToRun.push('pnl_snapshots');

  return {
    hasStoreConfig: hasConfig,
    currency: config?.currency ?? 'unknown',
    timezone: config?.iana_timezone ?? 'unknown',
    hasProducts: productCount > 0,
    productCount,
    hasOrders: orderCount > 0,
    orderCount,
    hasBalanceTransactions: balanceTxnCount > 0,
    balanceTransactionCount: balanceTxnCount,
    hasChargebacks: chargebackCount > 0,
    chargebackCount,
    hasClassifications: classificationCount > 0,
    classificationCount,
    hasPnLSnapshots: snapshotCount > 0,
    snapshotCount,
    stagesToRun,
  };
}

/**
 * POST /api/admin/fix-existing-stores
 *
 * Audits all connected stores, identifies missing data,
 * selectively resets only missing onboarding stages, and triggers the pipeline.
 * Auth: CRON_SECRET bearer token.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const stores = await listPersistentStores();
  if (!stores || stores.length === 0) {
    return NextResponse.json({ ok: true, message: 'No stores found', storesFound: 0 });
  }

  const report: Record<string, StoreAudit> = {};
  let triggered = 0;
  let skipped = 0;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || getAppUrl(request);

  for (const store of stores) {
    const storeId = store.id;
    console.log(`[FixExisting] Auditing store: ${storeId}`);

    const audit = await auditStore(storeId);
    report[storeId] = audit;

    if (audit.stagesToRun.length === 0) {
      console.log(`[FixExisting] ${storeId} — all data present, skipping`);
      skipped++;
      continue;
    }

    console.log(`[FixExisting] ${storeId} — missing: ${audit.stagesToRun.join(', ')}`);

    // Selectively reset only missing stages in onboarding_progress
    const progress = await getOnboardingProgress(storeId);
    const currentStages = progress?.stages ?? {};

    const stagesObj = currentStages as Record<string, string>;
    const updatedStages: Record<string, string> = {
      store_metadata: stagesObj.store_metadata ?? 'pending',
      shopify_products: stagesObj.shopify_products ?? 'pending',
      shopify_orders: stagesObj.shopify_orders ?? 'pending',
      shopify_transactions: stagesObj.shopify_transactions ?? 'pending',
      balance_transactions: stagesObj.balance_transactions ?? 'pending',
      shopify_chargebacks: stagesObj.shopify_chargebacks ?? 'pending',
      meta_ads: stagesObj.meta_ads ?? 'pending',
      fee_learning: stagesObj.fee_learning ?? 'pending',
      classification: stagesObj.classification ?? 'pending',
      pnl_snapshots: stagesObj.pnl_snapshots ?? 'pending',
    };

    // Force-reset only the stages that need to run
    for (const stage of audit.stagesToRun) {
      if (stage in updatedStages) {
        updatedStages[stage] = 'pending';
      }
    }

    // Clear cursors for stages being re-run
    const currentCursors = progress?.cursors ?? {};
    const clearedCursors = { ...currentCursors };
    for (const stage of audit.stagesToRun) {
      // Clear relevant cursor keys for each stage
      if (stage === 'shopify_orders') delete clearedCursors['orders_since_id'];
      if (stage === 'balance_transactions') delete clearedCursors['balance_txn_since_id'];
      if (stage === 'pnl_snapshots') delete clearedCursors['pnl_snapshot_date'];
    }

    await rest('/onboarding_progress?on_conflict=store_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        store_id: storeId,
        overall_status: 'in_progress',
        stages: updatedStages,
        cursors: clearedCursors,
        last_activity_at: new Date().toISOString(),
        ...(progress ? {} : { started_at: new Date().toISOString(), stage_progress: {}, stage_errors: {} }),
      }),
    }).catch(() => null);

    // Fire onboarding pipeline — non-blocking
    fetch(`${baseUrl}/api/onboarding/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId }),
    }).catch((err) =>
      console.error(`[FixExisting] Failed to trigger ${storeId}:`, err)
    );

    triggered++;
  }

  return NextResponse.json({
    ok: true,
    storesFound: stores.length,
    triggered,
    skipped,
    report,
  });
}
