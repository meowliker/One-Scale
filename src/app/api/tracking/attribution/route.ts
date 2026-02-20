import { NextRequest, NextResponse } from 'next/server';
import { getTrackingConfig, getTrackingEventsSince } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getPersistentTrackingConfig, getPersistentTrackingEventsSince } from '@/app/api/lib/supabase-tracking';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Multi-signal matching: returns true if purchase and touch share any identity signal.
function hasSignalOverlap(
  purchase: { session_id: string | null; click_id: string | null; fbc: string | null; fbp: string | null; email_hash: string | null },
  touch: { session_id: string | null; click_id: string | null; fbc: string | null; fbp: string | null; email_hash: string | null }
): boolean {
  if (purchase.session_id && touch.session_id && purchase.session_id === touch.session_id) return true;
  if (purchase.click_id && touch.click_id && purchase.click_id === touch.click_id) return true;
  if (purchase.fbc && touch.fbc && purchase.fbc === touch.fbc) return true;
  if (purchase.fbp && touch.fbp && purchase.fbp === touch.fbp) return true;
  if (purchase.email_hash && touch.email_hash && purchase.email_hash === touch.email_hash) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const sb = isSupabasePersistenceEnabled();
  const cfg = sb ? await getPersistentTrackingConfig(storeId) : getTrackingConfig(storeId);
  const windowDays = cfg?.attribution_window === '1day' ? 1 : cfg?.attribution_window === '28day' ? 28 : 7;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const events = sb ? await getPersistentTrackingEventsSince(storeId, since) : getTrackingEventsSince(storeId, since);
  const purchases = events.filter((e) => e.event_name === 'Purchase');
  const touches = events.filter(
    (e) => e.event_name !== 'Purchase' && !!(e.click_id || e.session_id || e.fbc || e.fbp || e.email_hash)
  );

  let attributedRevenueLastClick = 0;
  let attributedRevenueFirstClick = 0;
  let deterministicCount = 0;
  let modeledCount = 0;
  let entityMappedCount = 0;
  const unattributedPurchases: string[] = [];

  for (const purchase of purchases) {
    const purchaseTs = Date.parse(purchase.occurred_at);

    // Check if purchase already has entity IDs (pre-attributed by backfill/webhook)
    const hasEntityMapping = !!(purchase.campaign_id || purchase.adset_id || purchase.ad_id);
    if (hasEntityMapping) {
      entityMappedCount += 1;
    }

    // Multi-signal touch matching for first/last click attribution
    const candidateTouches = touches.filter((t) => {
      const tTs = Date.parse(t.occurred_at);
      if (!Number.isFinite(tTs) || tTs > purchaseTs) return false;
      return hasSignalOverlap(purchase, t);
    });

    // Also count purchases that were entity-mapped (via backfill/webhook) as attributed
    // even if we can't find a matching browser touch
    if (candidateTouches.length === 0 && !hasEntityMapping) {
      if (purchase.event_id) unattributedPurchases.push(purchase.event_id);
      continue;
    }

    const value = Number(purchase.value || 0);

    if (candidateTouches.length > 0) {
      const sorted = [...candidateTouches].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
      void sorted[0]; // firstTouch
      void sorted[sorted.length - 1]; // lastTouch
      deterministicCount += 1;
    } else {
      // Entity-mapped but no touch found — modeled attribution
      modeledCount += 1;
    }

    attributedRevenueFirstClick += value;
    attributedRevenueLastClick += value;
  }

  const totalPurchaseRevenue = purchases.reduce((sum, p) => sum + Number(p.value || 0), 0);
  const totalPurchaseCount = purchases.length;
  const attributedCount = deterministicCount + modeledCount;

  return NextResponse.json({
    data: {
      windowDays,
      attributionModel: cfg?.attribution_model || 'last_click',
      purchaseCount: totalPurchaseCount,
      purchaseRevenue: Math.round(totalPurchaseRevenue * 100) / 100,
      attributedRevenue: {
        firstClick: Math.round(attributedRevenueFirstClick * 100) / 100,
        lastClick: Math.round(attributedRevenueLastClick * 100) / 100,
      },
      attributedCount,
      deterministicCount,
      modeledCount,
      entityMappedCount,
      unattributedPurchaseCount: unattributedPurchases.length,
      unattributedShare: totalPurchaseCount > 0 ? unattributedPurchases.length / totalPurchaseCount : 0,
      attributionRate: totalPurchaseCount > 0
        ? Math.round((attributedCount / totalPurchaseCount) * 10000) / 100
        : 0,
    },
  });
}
