import { createHash, randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getTrackingConfig, getTrackingConfigByPixelId, insertTrackingEvent, markTrackingEventMetaDelivery } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import {
  getPersistentTrackingConfig,
  getPersistentTrackingConfigByPixelId,
  insertPersistentTrackingEvent,
  markPersistentTrackingEventMetaDelivery,
} from '@/app/api/lib/supabase-tracking';
import { forwardToMetaCapi } from '@/app/api/lib/meta-capi';

interface TrackingCollectBody {
  pixelId?: string;
  eventName?: string;
  eventId?: string;
  source?: 'browser' | 'server' | 'shopify';
  eventTime?: string;
  pageUrl?: string;
  referrer?: string;
  sessionId?: string;
  clickId?: string;
  fbp?: string;
  fbc?: string;
  value?: number;
  currency?: string;
  orderId?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  user?: {
    externalId?: string;
    email?: string;
    phone?: string;
  };
  properties?: Record<string, unknown>;
}

function normalizeEmail(email?: string): string | null {
  if (!email) return null;
  const clean = email.trim().toLowerCase();
  return clean || null;
}

function normalizePhone(phone?: string): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[^\d+]/g, '');
  return clean || null;
}

function sha256(value?: string | null): string | null {
  if (!value) return null;
  return createHash('sha256').update(value).digest('hex');
}

function readIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (!xff) return null;
  const first = xff.split(',')[0]?.trim();
  return first || null;
}

function cleanId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readQueryId(urlValue: string | undefined, keys: string[]): string | null {
  if (!urlValue) return null;
  try {
    const parsed = new URL(urlValue, 'https://internal.local');
    for (const key of keys) {
      const value = cleanId(parsed.searchParams.get(key));
      if (value) return value;
    }
  } catch {
    return null;
  }
  return null;
}

function parseEntityIds(body: TrackingCollectBody): {
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
} {
  const props = body.properties || {};
  const campaignId =
    cleanId(body.campaignId) ||
    cleanId(props.campaignId) ||
    cleanId(props.campaign_id) ||
    cleanId(props.firstTouchCampaignId) ||
    cleanId(props.first_touch_campaign_id) ||
    cleanId(props.fbCampaignId) ||
    cleanId(props.fb_campaign_id) ||
    readQueryId(body.pageUrl, ['campaign_id', 'campaignid', 'utm_campaign_id', 'fb_campaign_id', 'hsa_cam']) ||
    null;
  const adSetId =
    cleanId(body.adSetId) ||
    cleanId(props.adSetId) ||
    cleanId(props.adsetId) ||
    cleanId(props.firstTouchAdsetId) ||
    cleanId(props.ad_set_id) ||
    cleanId(props.adset_id) ||
    cleanId(props.firstTouchAdSetId) ||
    cleanId(props.first_touch_adset_id) ||
    cleanId(props.fbAdsetId) ||
    cleanId(props.fb_adset_id) ||
    readQueryId(body.pageUrl, ['adset_id', 'adsetid', 'utm_adset_id', 'fb_adset_id', 'hsa_adset']) ||
    null;
  const adId =
    cleanId(body.adId) ||
    cleanId(props.adId) ||
    cleanId(props.ad_id) ||
    cleanId(props.firstTouchAdId) ||
    cleanId(props.first_touch_ad_id) ||
    cleanId(props.fbAdId) ||
    cleanId(props.fb_ad_id) ||
    readQueryId(body.pageUrl, ['ad_id', 'adid', 'utm_ad_id', 'fb_ad_id', 'hsa_ad']) ||
    null;
  return { campaignId, adSetId, adId };
}

const ENABLE_META_CAPI_FORWARDING = process.env.ENABLE_META_CAPI_FORWARDING === '1';

function withCors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  const sb = isSupabasePersistenceEnabled();
  const { searchParams } = new URL(request.url);
  const storeIdFromQuery = searchParams.get('storeId');

  let body: TrackingCollectBody;
  try {
    body = await request.json() as TrackingCollectBody;
  } catch {
    return withCors(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  if (!body.eventName) {
    return withCors(NextResponse.json({ error: 'eventName is required' }, { status: 400 }));
  }

  let storeId = storeIdFromQuery || '';
  if (!storeId && body.pixelId) {
    const cfgByPixel = sb
      ? await getPersistentTrackingConfigByPixelId(body.pixelId)
      : getTrackingConfigByPixelId(body.pixelId);
    if (cfgByPixel) storeId = cfgByPixel.store_id;
  }
  if (!storeId) {
    return withCors(NextResponse.json({ error: 'storeId or valid pixelId is required' }, { status: 400 }));
  }

  const eventId = body.eventId || randomUUID();
  const eventTime = body.eventTime || new Date().toISOString();
  const ipHash = sha256(readIp(request));
  const emailHash = sha256(normalizeEmail(body.user?.email));
  const phoneHash = sha256(normalizePhone(body.user?.phone));
  const entityIds = parseEntityIds(body);

  const insertData = {
    storeId,
    eventName: body.eventName,
    eventId,
    source: body.source || 'browser' as const,
    occurredAt: eventTime,
    pageUrl: body.pageUrl,
    referrer: body.referrer,
    sessionId: body.sessionId,
    clickId: body.clickId,
    fbp: body.fbp,
    fbc: body.fbc,
    externalId: body.user?.externalId || null,
    emailHash,
    phoneHash,
    ipHash,
    userAgent: request.headers.get('user-agent'),
    value: typeof body.value === 'number' ? body.value : null,
    currency: body.currency || null,
    orderId: body.orderId || null,
    campaignId: entityIds.campaignId,
    adSetId: entityIds.adSetId,
    adId: entityIds.adId,
    payloadJson: body.properties ? JSON.stringify(body.properties) : null,
  };

  const insertResult = sb
    ? await insertPersistentTrackingEvent(insertData)
    : insertTrackingEvent(insertData);

  // Forward key commerce events to Meta CAPI (best effort, deduped by event_id).
  const trackable = new Set(['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase']);
  const cfg = sb
    ? await getPersistentTrackingConfig(storeId)
    : getTrackingConfig(storeId);
  if (
    insertResult.inserted &&
    cfg &&
    (cfg.server_side_enabled === 1 || (cfg.server_side_enabled as unknown) === true) &&
    ENABLE_META_CAPI_FORWARDING &&
    trackable.has(body.eventName)
  ) {
    try {
      await forwardToMetaCapi({
        storeId,
        pixelId: cfg.pixel_id,
        eventName: body.eventName,
        eventId,
        eventTimeIso: eventTime,
        eventSourceUrl: body.pageUrl,
        fbp: body.fbp || null,
        fbc: body.fbc || null,
        externalId: body.user?.externalId || null,
        emailHash,
        phoneHash,
        value: typeof body.value === 'number' ? body.value : null,
        currency: body.currency || null,
      });
      if (sb) {
        await markPersistentTrackingEventMetaDelivery({ storeId, eventId, forwarded: true });
      } else {
        markTrackingEventMetaDelivery({ storeId, eventId, forwarded: true });
      }
    } catch (err) {
      if (sb) {
        await markPersistentTrackingEventMetaDelivery({
          storeId,
          eventId,
          forwarded: false,
          error: err instanceof Error ? err.message.slice(0, 500) : 'Meta forward failed',
        });
      } else {
        markTrackingEventMetaDelivery({
          storeId,
          eventId,
          forwarded: false,
          error: err instanceof Error ? err.message.slice(0, 500) : 'Meta forward failed',
        });
      }
    }
  }

  return withCors(NextResponse.json({ ok: true, inserted: insertResult.inserted, updated: insertResult.updated, eventId }));
}
