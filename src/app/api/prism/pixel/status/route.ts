/**
 * GET /api/prism/pixel/status?storeId=X
 *
 * Pixel health check — verifies pixel is installed and firing correctly.
 * Shows coverage rate, recent events, and issues.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

export async function GET(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 86400000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

  // Get recent pixel events
  const recentEvents = await rest<Array<{ event_type: string; created_at: string }>>(
    `/pixel_events?store_id=eq.${enc(storeId)}&created_at=gte.${enc(oneDayAgo)}` +
    `&select=event_type,created_at&order=created_at.desc&limit=100`
  ).catch(() => []);

  // Get latest event
  const latestEvent = await rest<Array<{ created_at: string }>>(
    `/pixel_events?store_id=eq.${enc(storeId)}&select=created_at&order=created_at.desc&limit=1`
  ).catch(() => []);

  // Get pixel config
  const pixelConfig = await rest<Array<{ pixel_id: string; is_active: boolean }>>(
    `/pixel_settings?store_id=eq.${enc(storeId)}&select=pixel_id,is_active&limit=1`
  ).catch(() => []);

  // Coverage: orders with pixel attribution vs total orders
  const totalOrders = await rest<Array<{ shopify_order_id: string }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(sevenDaysAgo)}` +
    `&order_status=neq.cancelled&select=shopify_order_id&limit=1000`
  ).catch(() => []);

  const attributedOrders = await rest<Array<{ order_id: string }>>(
    `/visitor_attribution?store_id=eq.${enc(storeId)}&created_at=gte.${enc(sevenDaysAgo)}` +
    `&order_id=not.is.null&select=order_id&limit=1000`
  ).catch(() => []);

  const coverageRate = totalOrders.length > 0
    ? Math.round(attributedOrders.length / totalOrders.length * 100)
    : 0;

  // Count events by type
  const eventCounts: Record<string, number> = {};
  for (const e of recentEvents) {
    eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1;
  }

  // Identify issues
  const issues: string[] = [];
  const installed = (pixelConfig[0]?.is_active ?? false) || recentEvents.length > 0;

  if (!installed) issues.push('Pixel not installed or not configured');
  if (installed && recentEvents.length === 0) issues.push('Pixel installed but no events in last 24 hours');
  if (installed && !eventCounts['page_view'] && !eventCounts['PageView']) issues.push('No page view events — pixel may not be firing on all pages');
  if (coverageRate < 30 && totalOrders.length > 5) issues.push(`Low attribution coverage (${coverageRate}%) — pixel may be blocked by ad blockers`);

  return NextResponse.json({
    store_id: storeId,
    installed,
    pixel_id: pixelConfig[0]?.pixel_id || null,
    last_event_at: latestEvent[0]?.created_at || null,
    events_today: recentEvents.length,
    event_breakdown: eventCounts,
    coverage_rate: coverageRate,
    total_orders_7d: totalOrders.length,
    attributed_orders_7d: attributedOrders.length,
    is_firing_correctly: installed && recentEvents.length > 0 && issues.length === 0,
    issues,
  });
}
