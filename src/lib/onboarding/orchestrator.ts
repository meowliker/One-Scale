import { rest } from '@/app/api/lib/supabase-persistence';

export type OnboardingStage =
  | 'store_metadata'
  | 'shopify_products'
  | 'shopify_orders'
  | 'shopify_transactions'
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
  shopify_chargebacks: 'pending',
  meta_ads: 'pending',
  fee_learning: 'pending',
  classification: 'pending',
  pnl_snapshots: 'pending',
};

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

async function runStage(storeId: string, stage: OnboardingStage, fn: () => Promise<void>): Promise<void> {
  const progress = await getOnboardingProgress(storeId);
  if (progress?.stages[stage] === 'complete') {
    console.log(`[Onboarding] Stage "${stage}" already complete — skipping`);
    return;
  }

  await updateStageStatus(storeId, stage, 'running');
  try {
    await fn();
    await updateStageStatus(storeId, stage, 'complete');
    console.log(`[Onboarding] Stage "${stage}" complete for ${storeId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateStageStatus(storeId, stage, 'failed', msg);
    throw err;
  }
}

// Discover store history — find first order and total count
async function discoverStoreHistory(storeId: string): Promise<{ firstOrderDate: string; totalOrders: number }> {
  const oldest = await rest<Array<{ created_at: string }>>(
    `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}&select=created_at&order=created_at.asc&limit=1`
  ).catch(() => []);

  const firstOrderDate = oldest[0]?.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];

  // Estimate total from what's in cache
  const all = await rest<Array<{ shopify_order_id: string }>>(
    `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}&select=shopify_order_id`
  ).catch(() => []);

  return { firstOrderDate, totalOrders: all.length };
}

// Main entry point — called when OAuth completes
export async function onStoreConnected(storeId: string): Promise<void> {
  // Initialize progress record
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
    // Step 1: Mark store metadata complete (already saved during OAuth)
    await updateStageStatus(storeId, 'store_metadata', 'complete');

    // Step 2: Discover history
    const history = await discoverStoreHistory(storeId);
    await rest(`/onboarding_progress?store_id=eq.${encodeURIComponent(storeId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        first_order_date: history.firstOrderDate,
        total_orders: history.totalOrders,
        estimated_minutes: Math.max(1, Math.round(history.totalOrders / 500)),
      }),
    }).catch(() => null);

    // Step 3: Run stages in dependency order
    // Products and orders should already be in cache from sync crons
    // Mark them complete if data exists
    const hasProducts = await rest<Array<{ product_id: string }>>(
      `/product_behaviors?store_id=eq.${encodeURIComponent(storeId)}&select=product_id&limit=1`
    ).catch(() => []);

    if (hasProducts.length > 0) {
      await updateStageStatus(storeId, 'shopify_products', 'complete');
    } else {
      await updateStageStatus(storeId, 'shopify_products', 'skipped', 'No product data yet — will populate on next sync');
    }

    if (history.totalOrders > 0) {
      await updateStageStatus(storeId, 'shopify_orders', 'complete');
    } else {
      await updateStageStatus(storeId, 'shopify_orders', 'skipped', 'No orders yet — will populate on next sync');
    }

    // Fee learning
    await runStage(storeId, 'fee_learning', async () => {
      const { learnFeeRates } = await import('@/lib/pnl/feeIntelligence');
      await learnFeeRates(storeId);
    });

    // Transactions — check if we have any
    const txnCount = await rest<Array<{ id: string }>>(
      `/shopify_transaction_fees?store_id=eq.${encodeURIComponent(storeId)}&select=id&limit=1`
    ).catch(() => []);

    if (txnCount.length > 0) {
      await updateStageStatus(storeId, 'shopify_transactions', 'complete');
    } else {
      await updateStageStatus(storeId, 'shopify_transactions', 'skipped', 'No transaction data — sync will populate');
    }

    // Chargebacks
    const cbCount = await rest<Array<{ id: string }>>(
      `/shopify_chargebacks?store_id=eq.${encodeURIComponent(storeId)}&select=id&limit=1`
    ).catch(() => []);
    await updateStageStatus(storeId, 'shopify_chargebacks', cbCount.length > 0 ? 'complete' : 'skipped');

    // Meta ads — non-blocking check
    const metaConnections = await rest<Array<{ id: string }>>(
      `/connections?store_id=eq.${encodeURIComponent(storeId)}&platform=eq.meta&select=id&limit=1`
    ).catch(() => []);

    if (metaConnections.length > 0) {
      await updateStageStatus(storeId, 'meta_ads', 'complete');
    } else {
      await updateStageStatus(storeId, 'meta_ads', 'skipped', 'No Meta ad accounts connected');
    }

    // Classification
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

    // P&L snapshots — mark as pending for cron to handle
    await updateStageStatus(storeId, 'pnl_snapshots', 'skipped', 'Will build on next daily snapshot cron');

    // Mark overall complete
    await rest(`/onboarding_progress?store_id=eq.${encodeURIComponent(storeId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        overall_status: 'complete',
        completed_at: new Date().toISOString(),
      }),
    }).catch(() => null);

  } catch (err) {
    console.error(`[Onboarding] Failed for store ${storeId}:`, err);
    await rest(`/onboarding_progress?store_id=eq.${encodeURIComponent(storeId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ overall_status: 'partial' }),
    }).catch(() => null);
  }
}
