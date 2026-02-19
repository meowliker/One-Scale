import { NextRequest, NextResponse } from 'next/server';
import { getTrackingConfig, getTrackingEventsSince } from '@/app/api/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const cfg = getTrackingConfig(storeId);
  const windowDays = cfg?.attribution_window === '1day' ? 1 : cfg?.attribution_window === '28day' ? 28 : 7;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const events = getTrackingEventsSince(storeId, since);
  const purchases = events.filter((e) => e.event_name === 'Purchase');
  const touches = events.filter((e) => e.event_name !== 'Purchase' && !!(e.click_id || e.session_id));

  let attributedRevenueLastClick = 0;
  let attributedRevenueFirstClick = 0;
  const unattributedPurchases: string[] = [];

  for (const purchase of purchases) {
    const purchaseTs = Date.parse(purchase.occurred_at);
    const candidateTouches = touches.filter((t) => {
      const tTs = Date.parse(t.occurred_at);
      if (!Number.isFinite(tTs) || tTs > purchaseTs) return false;
      const sameSession = !!purchase.session_id && !!t.session_id && purchase.session_id === t.session_id;
      const sameClick = !!purchase.click_id && !!t.click_id && purchase.click_id === t.click_id;
      return sameSession || sameClick;
    });

    if (candidateTouches.length === 0) {
      if (purchase.event_id) unattributedPurchases.push(purchase.event_id);
      continue;
    }

    const sorted = [...candidateTouches].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const firstTouch = sorted[0];
    const lastTouch = sorted[sorted.length - 1];

    const value = Number(purchase.value || 0);
    attributedRevenueFirstClick += value;
    attributedRevenueLastClick += value;

    void firstTouch;
    void lastTouch;
  }

  const totalPurchaseRevenue = purchases.reduce((sum, p) => sum + Number(p.value || 0), 0);
  const totalPurchaseCount = purchases.length;

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
      unattributedPurchaseCount: unattributedPurchases.length,
      unattributedShare: totalPurchaseCount > 0 ? unattributedPurchases.length / totalPurchaseCount : 0,
    },
  });
}
