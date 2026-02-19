import { NextRequest, NextResponse } from 'next/server';
import { getStore, getTrackingConfig, upsertTrackingConfig } from '@/app/api/lib/db';
import type { TrackingConfig, TrackingEvent } from '@/types/tracking';
import { getTrackingEventSummaries } from '@/app/api/lib/db';

const DEFAULT_EVENTS: Array<{ name: string; displayName: string }> = [
  { name: 'PageView', displayName: 'Page View' },
  { name: 'ViewContent', displayName: 'View Content' },
  { name: 'AddToCart', displayName: 'Add to Cart' },
  { name: 'InitiateCheckout', displayName: 'Initiate Checkout' },
  { name: 'Purchase', displayName: 'Purchase' },
];

function defaultPixelId(storeId: string): string {
  const suffix = storeId.replace(/[^a-zA-Z0-9]/g, '').slice(-12).toUpperCase();
  return `TW-${suffix || 'PIXEL'}`;
}

function toConfig(storeId: string): TrackingConfig {
  const store = getStore(storeId);
  const existing = getTrackingConfig(storeId);
  if (!existing) {
    const domain = store?.domain || `${storeId}.myshopify.com`;
    upsertTrackingConfig(storeId, {
      pixelId: defaultPixelId(storeId),
      domain,
      serverSideEnabled: false,
      attributionModel: 'last_click',
      attributionWindow: '7day',
    });
  }

  const cfg = getTrackingConfig(storeId)!;
  const summaryByName = new Map(getTrackingEventSummaries(storeId).map((s) => [s.event_name, s]));
  const events: TrackingEvent[] = DEFAULT_EVENTS.map((evt) => {
    const summary = summaryByName.get(evt.name);
    const count24h = summary?.count_24h || 0;
    return {
      name: evt.name,
      displayName: evt.displayName,
      status: count24h > 0 ? 'active' : 'inactive',
      lastFired: summary?.last_fired || null,
      count24h,
      count7d: summary?.count_7d || 0,
    };
  });

  return {
    pixelId: cfg.pixel_id,
    domain: cfg.domain,
    serverSideEnabled: cfg.server_side_enabled === 1,
    attributionModel: cfg.attribution_model,
    attributionWindow: cfg.attribution_window,
    events,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: toConfig(storeId) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load tracking config';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    const body = await request.json() as Partial<{
      pixelId: string;
      domain: string;
      serverSideEnabled: boolean;
      attributionModel: 'first_click' | 'last_click' | 'linear' | 'time_decay' | 'position_based';
      attributionWindow: '1day' | '7day' | '28day';
    }>;

    const existing = toConfig(storeId);
    upsertTrackingConfig(storeId, {
      pixelId: body.pixelId || existing.pixelId,
      domain: body.domain || existing.domain,
      serverSideEnabled: body.serverSideEnabled ?? existing.serverSideEnabled,
      attributionModel: body.attributionModel || existing.attributionModel,
      attributionWindow: body.attributionWindow || existing.attributionWindow,
    });

    return NextResponse.json({ data: toConfig(storeId) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update tracking config';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
