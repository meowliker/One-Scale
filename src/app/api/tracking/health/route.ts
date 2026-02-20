import { NextRequest, NextResponse } from 'next/server';
import { countTrackingServerEvents24h, getLatestTrackingEventAt, getTrackingConfig, getTrackingEventSummaries } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import {
  countPersistentTrackingServerEvents24h,
  getLatestPersistentTrackingEventAt,
  getPersistentTrackingConfig,
  getPersistentTrackingEventSummaries,
} from '@/app/api/lib/supabase-tracking';
import type { HealthCheck, TrackingHealth } from '@/types/tracking';

function overallFromChecks(checks: HealthCheck[]): 'healthy' | 'warning' | 'error' {
  if (checks.some((c) => c.status === 'error')) return 'error';
  if (checks.some((c) => c.status === 'warning')) return 'warning';
  return 'healthy';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    const sb = isSupabasePersistenceEnabled();
    const nowIso = new Date().toISOString();
    const cfg = sb ? await getPersistentTrackingConfig(storeId) : getTrackingConfig(storeId);
    const summaries = sb ? await getPersistentTrackingEventSummaries(storeId) : getTrackingEventSummaries(storeId);
    const purchase = summaries.find((s) => s.event_name === 'Purchase');
    const pageView = summaries.find((s) => s.event_name === 'PageView');
    const latestEventAt = sb ? await getLatestPersistentTrackingEventAt(storeId) : getLatestTrackingEventAt(storeId);
    const serverEvent24h = sb ? await countPersistentTrackingServerEvents24h(storeId) : countTrackingServerEvents24h(storeId);

    const freshnessMinutes = latestEventAt
      ? Math.floor((Date.now() - new Date(latestEventAt).getTime()) / 60_000)
      : null;

    const checks: HealthCheck[] = [
      {
        name: 'Pixel Installation',
        status: cfg ? 'healthy' : 'warning',
        message: cfg
          ? `Pixel ${cfg.pixel_id} is configured for ${cfg.domain}.`
          : 'Tracking config not initialized yet.',
        lastChecked: nowIso,
      },
      {
        name: 'Event Firing',
        status: (pageView?.count_24h || 0) > 0 ? 'healthy' : 'warning',
        message:
          (pageView?.count_24h || 0) > 0
            ? `${pageView?.count_24h || 0} PageView events captured in the last 24 hours.`
            : 'No PageView events in the last 24 hours.',
        lastChecked: nowIso,
      },
      {
        name: 'Server-Side Tracking',
        status: serverEvent24h > 0 ? 'healthy' : 'warning',
        message:
          serverEvent24h > 0
            ? `${serverEvent24h} server-side events received in the last 24 hours.`
            : 'No server-side events received in the last 24 hours.',
        lastChecked: nowIso,
      },
      {
        name: 'Data Freshness',
        status:
          freshnessMinutes == null
            ? 'warning'
            : freshnessMinutes <= 15
            ? 'healthy'
            : freshnessMinutes <= 60
            ? 'warning'
            : 'error',
        message:
          freshnessMinutes == null
            ? 'No event data yet.'
            : `Latest event received ${freshnessMinutes} minute(s) ago.`,
        lastChecked: nowIso,
      },
      {
        name: 'Attribution Coverage',
        status: (purchase?.count_7d || 0) > 0 ? 'healthy' : 'warning',
        message:
          (purchase?.count_7d || 0) > 0
            ? `${purchase?.count_7d || 0} purchases tracked in the last 7 days.`
            : 'No purchase events in the last 7 days.',
        lastChecked: nowIso,
      },
    ];

    const payload: TrackingHealth = {
      overall: overallFromChecks(checks),
      checks,
      lastUpdated: nowIso,
    };

    return NextResponse.json({ data: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load tracking health';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

