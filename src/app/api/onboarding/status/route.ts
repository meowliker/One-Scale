import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getOnboardingProgress } from '@/lib/onboarding/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ status: 'not_configured' });

  const progress = await getOnboardingProgress(storeId);

  if (!progress) {
    return NextResponse.json({
      status: 'not_started',
      overallProgress: 0,
      stages: {},
      availableData: { products: false, recentOrders: false, last30DaysPnL: false, fullHistory: false, adAttribution: false },
    });
  }

  // Compute overall progress
  const stageValues = Object.values(progress.stages);
  const completedCount = stageValues.filter(s => s === 'complete' || s === 'skipped').length;
  const overallProgress = Math.round((completedCount / stageValues.length) * 100);

  // What data is available right now?
  const availableData = {
    products: progress.stages.shopify_products === 'complete',
    recentOrders: progress.stages.shopify_orders === 'complete' || progress.stages.shopify_orders === 'skipped',
    last30DaysPnL: progress.stages.shopify_orders === 'complete' && progress.stages.fee_learning !== 'pending',
    fullHistory: progress.stages.pnl_snapshots === 'complete',
    adAttribution: progress.stages.meta_ads === 'complete',
  };

  // Estimated minutes remaining
  const pendingStages = stageValues.filter(s => s === 'pending' || s === 'running').length;
  const estimatedMinutesRemaining = Math.max(0, Math.round(pendingStages * (progress.estimated_minutes || 1) / stageValues.length));

  return NextResponse.json({
    status: progress.overall_status,
    overallProgress,
    stages: Object.fromEntries(
      Object.entries(progress.stages).map(([stage, status]) => [
        stage,
        {
          status,
          ...(progress.stage_progress[stage] || {}),
          ...(progress.stage_errors[stage] ? { error: progress.stage_errors[stage] } : {}),
        },
      ])
    ),
    availableData,
    estimatedMinutesRemaining,
    startedAt: progress.started_at,
    completedAt: progress.completed_at,
  });
}
