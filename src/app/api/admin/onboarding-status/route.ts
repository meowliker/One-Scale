import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import { getOnboardingProgress } from '@/lib/onboarding/orchestrator';

export const dynamic = 'force-dynamic';

async function countRows(table: string, storeId: string): Promise<number> {
  try {
    const rows = await rest<Array<Record<string, unknown>>>(
      `/${table}?store_id=eq.${encodeURIComponent(storeId)}&select=store_id&limit=1000`
    );
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}

/**
 * GET /api/admin/onboarding-status
 *
 * Returns per-store audit data + pipeline progress for monitoring.
 * Auth: CRON_SECRET bearer token.
 */
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const stores = await listPersistentStores();

  const statusReport = await Promise.all(
    (stores ?? []).map(async (store) => {
      const storeId = store.id;
      const progress = await getOnboardingProgress(storeId);

      // Quick data audit
      const [configRows, orderCount, balanceTxnCount, chargebackCount, classificationCount, snapshotCount] = await Promise.all([
        rest<Array<{ currency: string; iana_timezone: string }>>(
          `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=currency,iana_timezone&limit=1`
        ).catch(() => []),
        countRows('shopify_orders_cache', storeId),
        countRows('shopify_balance_transactions', storeId),
        countRows('shopify_chargebacks', storeId),
        countRows('product_behaviors', storeId),
        countRows('daily_pnl_snapshots', storeId),
      ]);

      const config = configRows?.[0];
      const lastActivity = progress?.last_activity_at ? new Date(progress.last_activity_at) : null;
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

      return {
        storeId,
        domain: (store as unknown as Record<string, unknown>).shopify_domain || storeId,
        onboardingStatus: progress?.overall_status ?? 'none',

        data: {
          hasConfig: !!config,
          currency: config?.currency ?? 'unknown',
          timezone: config?.iana_timezone ?? 'unknown',
          orders: orderCount,
          balanceTransactions: balanceTxnCount,
          chargebacks: chargebackCount,
          classifications: classificationCount,
          pnlSnapshots: snapshotCount,
        },

        stages: progress?.stages ?? {},
        stageErrors: progress?.stage_errors ?? {},
        stageProgress: progress?.stage_progress ?? {},

        firstOrderDate: progress?.first_order_date,
        totalOrders: progress?.total_orders,
        startedAt: progress?.started_at,
        completedAt: progress?.completed_at,
        lastActivity: progress?.last_activity_at,

        isRunning: progress?.overall_status === 'in_progress' && lastActivity && lastActivity > fiveMinAgo,
        isStalled: progress?.overall_status === 'in_progress' && lastActivity && lastActivity < tenMinAgo,
      };
    })
  );

  return NextResponse.json({
    totalStores: statusReport.length,
    complete: statusReport.filter((s) => s.onboardingStatus === 'complete').length,
    inProgress: statusReport.filter((s) => s.isRunning).length,
    stalled: statusReport.filter((s) => s.isStalled).length,
    stores: statusReport,
  });
}
