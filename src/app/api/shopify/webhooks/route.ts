import { createHash, createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  getScoredTrackingAttributionBySignals,
  getStoreByDomain,
  getTrackingAttributionByTimeProximity,
  getTrackingConfig,
  getTrackingShopifyPurchaseEventIdByOrderId,
  insertTrackingEvent,
  markTrackingEventMetaDelivery,
} from '@/app/api/lib/db';
import { forwardToMetaCapi } from '@/app/api/lib/meta-capi';
import { resolveMetaEntityIdsFromUtms } from '@/app/api/lib/meta-attribution-lookup';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import {
  getPersistentStoreByDomain,
  getPersistentTrackingConfig,
  getPersistentTrackingShopifyPurchaseEventIdByOrderId,
  insertPersistentTrackingEvent,
  markPersistentTrackingEventMetaDelivery,
  getPersistentScoredTrackingAttributionBySignals,
  getPersistentTrackingAttributionByTimeProximity,
} from '@/app/api/lib/supabase-tracking';

function verifyShopifyHmac(rawBody: string, secret: string, hmacHeader: string): boolean {
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  return digest === hmacHeader;
}

function decodeUrlComponentSafe(value: string): string {
  const withSpaces = value.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    return withSpaces;
  }
}

function readUrlQueryParam(rawUrl: string | null | undefined, keys: string[]): string | null {
  if (!rawUrl) return null;
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  const qIdx = rawUrl.indexOf('?');
  if (qIdx === -1) return null;
  const hashIdx = rawUrl.indexOf('#', qIdx + 1);
  const query = rawUrl.slice(qIdx + 1, hashIdx === -1 ? undefined : hashIdx);
  if (!query) return null;

  for (const segment of query.split('&')) {
    if (!segment) continue;
    const eqIdx = segment.indexOf('=');
    const keyRaw = eqIdx === -1 ? segment : segment.slice(0, eqIdx);
    const valueRaw = eqIdx === -1 ? '' : segment.slice(eqIdx + 1);
    const decodedKey = decodeUrlComponentSafe(keyRaw).trim().toLowerCase();
    if (!decodedKey || !keySet.has(decodedKey)) continue;
    const decodedValue = decodeUrlComponentSafe(valueRaw).trim();
    if (decodedValue.length > 0) return decodedValue;
  }
  return null;
}

function getPayloadUrlCandidates(payload: Record<string, unknown>): Array<string | null | undefined> {
  return [
    payload.landing_site as string | undefined,
    payload.order_status_url as string | undefined,
    payload.landing_site_ref as string | undefined,
    payload.referring_site as string | undefined,
  ];
}

function readPayloadUrlParam(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const rawUrl of getPayloadUrlCandidates(payload)) {
    const value = readUrlQueryParam(rawUrl, keys);
    if (value) return value;
  }
  return null;
}

type ShopifyNoteAttribute = {
  name?: string;
  value?: string | number | null;
};

function sha256(value?: string | null): string | null {
  if (!value) return null;
  const clean = value.trim().toLowerCase();
  if (!clean) return null;
  return createHash('sha256').update(clean).digest('hex');
}

function readNoteAttributes(payload: Record<string, unknown>): ShopifyNoteAttribute[] {
  const raw = payload.note_attributes;
  return Array.isArray(raw) ? (raw as ShopifyNoteAttribute[]) : [];
}

function readNoteAttributeValue(payload: Record<string, unknown>, keys: string[]): string | null {
  const attrs = readNoteAttributes(payload);
  if (attrs.length === 0) return null;
  const keySet = new Set(keys.map((k) => k.toLowerCase()));
  for (const attr of attrs) {
    const name = String(attr.name || '').trim().toLowerCase();
    if (!name || !keySet.has(name)) continue;
    const value = String(attr.value || '').trim();
    if (value.length > 0) return value;
  }
  return null;
}

function readEntityIdsFromUrl(rawUrl?: string | null): {
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
} {
  if (!rawUrl) {
    return { campaignId: null, adSetId: null, adId: null };
  }
  return {
    campaignId: readUrlQueryParam(rawUrl, ['campaign_id', 'campaignid', 'utm_campaign_id', 'fb_campaign_id', 'hsa_cam']),
    adSetId: readUrlQueryParam(rawUrl, ['adset_id', 'adsetid', 'utm_adset_id', 'fb_adset_id', 'hsa_adset']),
    adId: readUrlQueryParam(rawUrl, ['ad_id', 'adid', 'utm_ad_id', 'fb_ad_id', 'hsa_ad']),
  };
}

function readEntityIdsFromPayload(payload: Record<string, unknown>): {
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
} {
  const fromUrls = getPayloadUrlCandidates(payload)
    .map((rawUrl) => readEntityIdsFromUrl(rawUrl))
    .reduce(
      (acc, row) => ({
        campaignId: acc.campaignId || row.campaignId,
        adSetId: acc.adSetId || row.adSetId,
        adId: acc.adId || row.adId,
      }),
      { campaignId: null as string | null, adSetId: null as string | null, adId: null as string | null }
    );

  return {
    campaignId:
      fromUrls.campaignId ||
      readNoteAttributeValue(payload, [
        '_tw_campaign_id',
        '_tw_ft_campaign_id',
        '_tw_first_campaign_id',
        'tw_campaign_id',
        'tw_ft_campaign_id',
        'tw_first_campaign_id',
        'campaign_id',
        'fb_campaign_id',
        'utm_campaign_id',
        'hsa_cam',
      ]) ||
      null,
    adSetId:
      fromUrls.adSetId ||
      readNoteAttributeValue(payload, [
        '_tw_adset_id',
        '_tw_ft_adset_id',
        '_tw_first_adset_id',
        'tw_adset_id',
        'tw_ft_adset_id',
        'tw_first_adset_id',
        'adset_id',
        'fb_adset_id',
        'utm_adset_id',
        'hsa_adset',
      ]) ||
      null,
    adId:
      fromUrls.adId ||
      readNoteAttributeValue(payload, [
        '_tw_ad_id',
        '_tw_ft_ad_id',
        '_tw_first_ad_id',
        'tw_ad_id',
        'tw_ft_ad_id',
        'tw_first_ad_id',
        'ad_id',
        'fb_ad_id',
        'utm_ad_id',
        'hsa_ad',
      ]) ||
      null,
  };
}

function parseClickIdFromFbc(fbc?: string | null): string | null {
  if (!fbc) return null;
  const trimmed = fbc.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('.');
  return parts.length >= 4 ? parts.slice(3).join('.') : null;
}

function buildFbcFromClickId(clickId: string | null): string | null {
  if (!clickId) return null;
  return `fb.1.${Math.floor(Date.now() / 1000)}.${clickId}`;
}

function readClickId(payload: Record<string, unknown>): string | null {
  const fromNote = readNoteAttributeValue(payload, [
    '_tw_click_id',
    '_tw_ft_click_id',
    '_tw_first_click_id',
    'tw_click_id',
    'tw_ft_click_id',
    'tw_first_click_id',
    'fbclid',
  ]);
  if (fromNote) return fromNote;
  const clickFromUrl = readPayloadUrlParam(payload, ['fbclid']);
  if (clickFromUrl) return clickFromUrl;

  const clickFromFbc = parseClickIdFromFbc(readPayloadUrlParam(payload, ['fbc']));
  if (clickFromFbc) return clickFromFbc;

  return null;
}

function readFbc(payload: Record<string, unknown>, clickId: string | null): string | null {
  const noteFbc = readNoteAttributeValue(payload, ['_tw_fbc', '_tw_first_fbc', 'tw_fbc', 'tw_first_fbc', 'fbc']);
  if (noteFbc) return noteFbc;

  const fromUrl = readPayloadUrlParam(payload, ['fbc']);
  if (fromUrl) return fromUrl;

  return buildFbcFromClickId(clickId);
}

function readFbp(payload: Record<string, unknown>): string | null {
  const noteFbp = readNoteAttributeValue(payload, ['_tw_fbp', 'tw_fbp', 'fbp', '_fbp']);
  return noteFbp || readPayloadUrlParam(payload, ['fbp']) || null;
}

function readEmailHash(payload: Record<string, unknown>): string | null {
  const directEmail = String(payload.email || '').trim();
  if (directEmail.length > 0) return sha256(directEmail);

  const customer = (payload.customer || {}) as Record<string, unknown>;
  const customerEmail = String(customer.email || '').trim();
  if (customerEmail.length > 0) return sha256(customerEmail);

  const noteEmail = readNoteAttributeValue(payload, ['_tw_email', 'email']);
  if (noteEmail) return sha256(noteEmail);

  return null;
}

interface FallbackAttributionMeta {
  confidence: number;
  score: number;
  matchedSignals: Array<'click_id' | 'fbc' | 'fbp' | 'email_hash'>;
  matchedAt: string;
  source: 'browser' | 'server' | 'shopify';
  ageHours: number | null;
  strategy: 'signal_match' | 'time_proximity';
}

function shouldAcceptFallbackAttribution(
  fallback: ReturnType<typeof getScoredTrackingAttributionBySignals>
): boolean {
  if (!fallback) return false;
  if (!(fallback.campaignId || fallback.adSetId || fallback.adId)) return false;
  const matched = new Set(fallback.matchedSignals);
  // Aggressive thresholds for ~90% attribution coverage (Triple Whale-style)
  if (matched.has('click_id') && fallback.confidence >= 0.20) return true;
  if (matched.has('fbc') && fallback.confidence >= 0.22) return true;
  if ((matched.has('fbp') || matched.has('email_hash')) && fallback.confidence >= 0.28) return true;
  return fallback.confidence >= 0.25;
}

async function mergeEntityIdsWithFallback(
  sb: boolean,
  storeId: string,
  occurredAt: string,
  fbc: string | null,
  fbp: string | null,
  emailHash: string | null,
  clickId: string | null,
  entityIds: { campaignId: string | null; adSetId: string | null; adId: string | null }
): Promise<{
  entityIds: { campaignId: string | null; adSetId: string | null; adId: string | null };
  fallbackAttribution: FallbackAttributionMeta | null;
}> {
  const tryTimeProximityModel = async () => {
    const hasSignal = Boolean(clickId || fbc || fbp || emailHash);
    if (!hasSignal) return null;

    const timeProximity = sb
      ? await getPersistentTrackingAttributionByTimeProximity({
          storeId,
          occurredAt,
          windowMinutes: 120,
        })
      : getTrackingAttributionByTimeProximity({
          storeId,
          occurredAt,
          windowMinutes: 120,
        });
    if (!timeProximity) return null;

    const matchedSignals: Array<'click_id' | 'fbc' | 'fbp' | 'email_hash'> = [];
    if (clickId) matchedSignals.push('click_id');
    if (fbc) matchedSignals.push('fbc');
    if (fbp) matchedSignals.push('fbp');
    if (emailHash) matchedSignals.push('email_hash');

    return {
      entityIds: {
        campaignId: timeProximity.campaignId,
        adSetId: timeProximity.adSetId,
        adId: timeProximity.adId,
      },
      fallbackAttribution: {
        confidence: timeProximity.confidence,
        score: timeProximity.score,
        matchedSignals,
        matchedAt: timeProximity.matchedAt,
        source: timeProximity.source,
        ageHours: timeProximity.ageHours,
        strategy: 'time_proximity' as const,
      },
    };
  };

  if (entityIds.campaignId || entityIds.adSetId || entityIds.adId) {
    return { entityIds, fallbackAttribution: null };
  }

  const fallback = sb
    ? await getPersistentScoredTrackingAttributionBySignals({
        storeId,
        beforeIso: occurredAt,
        clickId,
        fbc,
        fbp,
        emailHash,
      })
    : getScoredTrackingAttributionBySignals({
        storeId,
        beforeIso: occurredAt,
        clickId,
        fbc,
        fbp,
        emailHash,
      });

  if (!fallback) {
    return (await tryTimeProximityModel()) || { entityIds, fallbackAttribution: null };
  }
  if (!shouldAcceptFallbackAttribution(fallback)) {
    return (await tryTimeProximityModel()) || { entityIds, fallbackAttribution: null };
  }
  const acceptedFallback = fallback;

  return {
    entityIds: {
      campaignId: acceptedFallback.campaignId,
      adSetId: acceptedFallback.adSetId,
      adId: acceptedFallback.adId,
    },
    fallbackAttribution: {
      confidence: acceptedFallback.confidence,
      score: acceptedFallback.score,
      matchedSignals: acceptedFallback.matchedSignals,
      matchedAt: acceptedFallback.matchedAt,
      source: acceptedFallback.source,
      ageHours: acceptedFallback.ageHours,
      strategy: 'signal_match',
    },
  };
}

function readUtmCampaign(payload: Record<string, unknown>): string | null {
  const fromNote = readNoteAttributeValue(payload, [
    '_tw_utm_campaign',
    '_tw_ft_utm_campaign',
    '_tw_first_utm_campaign',
    'tw_utm_campaign',
    'tw_ft_utm_campaign',
    'tw_first_utm_campaign',
    'utm_campaign',
  ]);
  if (fromNote) return fromNote;
  return readPayloadUrlParam(payload, ['utm_campaign']);
}

function readUtmMedium(payload: Record<string, unknown>): string | null {
  const fromNote = readNoteAttributeValue(payload, [
    '_tw_utm_medium',
    '_tw_ft_utm_medium',
    '_tw_first_utm_medium',
    'tw_utm_medium',
    'tw_ft_utm_medium',
    'tw_first_utm_medium',
    'utm_medium',
  ]);
  if (fromNote) return fromNote;
  return readPayloadUrlParam(payload, ['utm_medium']);
}

function readUtmContent(payload: Record<string, unknown>): string | null {
  const fromNote = readNoteAttributeValue(payload, [
    '_tw_utm_content',
    '_tw_ft_utm_content',
    '_tw_first_utm_content',
    'tw_utm_content',
    'tw_ft_utm_content',
    'tw_first_utm_content',
    'utm_content',
  ]);
  if (fromNote) return fromNote;
  return readPayloadUrlParam(payload, ['utm_content']);
}

const ENABLE_META_CAPI_FORWARDING = process.env.ENABLE_META_CAPI_FORWARDING !== '0';

export async function POST(request: NextRequest) {
  const topic = request.headers.get('x-shopify-topic') || '';
  const shopDomain = (request.headers.get('x-shopify-shop-domain') || '').toLowerCase();
  const hmac = request.headers.get('x-shopify-hmac-sha256') || '';

  if (!shopDomain || !hmac) {
    return NextResponse.json({ error: 'Missing Shopify webhook headers' }, { status: 400 });
  }

  const sb = isSupabasePersistenceEnabled();
  const store = sb ? await getPersistentStoreByDomain(shopDomain) : getStoreByDomain(shopDomain);
  if (!store?.api_secret) {
    return NextResponse.json({ error: 'Unknown store or missing webhook secret' }, { status: 401 });
  }

  const rawBody = await request.text();
  if (!verifyShopifyHmac(rawBody, store.api_secret, hmac)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  const cfg = sb ? await getPersistentTrackingConfig(store.id) : getTrackingConfig(store.id);
  const createdAt = (payload.created_at as string) || new Date().toISOString();

  if (topic === 'orders/create' || topic === 'orders/updated') {
    const financialStatus = String(payload.financial_status || '').toLowerCase();
    const orderId = String(payload.id || '');
    if (!orderId) return NextResponse.json({ ok: true, ignored: true });

    const value = Number(payload.total_price || 0);
    const currency = String(payload.currency || 'USD');
    const clickId = readClickId(payload);
    const fbc = readFbc(payload, clickId);
    const fbp = readFbp(payload);
    const emailHash = readEmailHash(payload);
    const directEntityIds = readEntityIdsFromPayload(payload);
    const merged = await mergeEntityIdsWithFallback(
      sb,
      store.id,
      createdAt,
      fbc,
      fbp,
      emailHash,
      clickId,
      directEntityIds
    );
    let entityIds = merged.entityIds;
    const utmCampaign = readUtmCampaign(payload);
    const utmMedium = readUtmMedium(payload);
    const utmContent = readUtmContent(payload);
    entityIds = await resolveMetaEntityIdsFromUtms({
      storeId: store.id,
      utmCampaign,
      utmMedium,
      utmContent,
      campaignId: entityIds.campaignId,
      adSetId: entityIds.adSetId,
      adId: entityIds.adId,
    });

    const eventId = sb
      ? (await getPersistentTrackingShopifyPurchaseEventIdByOrderId(store.id, orderId)) || `shopify-order-${orderId}`
      : getTrackingShopifyPurchaseEventIdByOrderId(store.id, orderId) || `shopify-order-${orderId}`;

    const hasDirectMapping = !!(directEntityIds.campaignId || directEntityIds.adSetId || directEntityIds.adId);
    const hasUtmInputs = !!(utmCampaign || utmMedium || utmContent);
    const attributionMethod =
      merged.fallbackAttribution && !hasDirectMapping && !hasUtmInputs ? 'modeled' : 'deterministic';
    const payloadJson = JSON.stringify({
      source: 'shopify_webhook',
      topic,
      financialStatus: financialStatus || null,
      landingSite: (payload.landing_site as string) || null,
      landingSiteRef: (payload.landing_site_ref as string) || null,
      referringSite: (payload.referring_site as string) || null,
      orderStatusUrl: (payload.order_status_url as string) || null,
      utmCampaign: utmCampaign || null,
      utmMedium: utmMedium || null,
      utmContent: utmContent || null,
      attributionMethod,
      fallbackAttribution: attributionMethod === 'modeled' ? merged.fallbackAttribution : null,
    });

    const eventData = {
      storeId: store.id,
      eventName: 'Purchase',
      eventId,
      source: 'shopify' as const,
      occurredAt: createdAt,
      clickId,
      fbp,
      fbc,
      emailHash,
      value: Number.isFinite(value) ? value : 0,
      currency,
      orderId,
      campaignId: entityIds.campaignId,
      adSetId: entityIds.adSetId,
      adId: entityIds.adId,
      payloadJson,
    };

    let inserted = false;
    if (sb) {
      const result = await insertPersistentTrackingEvent(eventData);
      inserted = result.inserted;
    } else {
      const result = insertTrackingEvent(eventData);
      inserted = result.inserted;
    }

    if (
      inserted &&
      cfg &&
      (cfg.server_side_enabled === 1 || (cfg.server_side_enabled as unknown) === true) &&
      ENABLE_META_CAPI_FORWARDING &&
      financialStatus !== 'refunded'
    ) {
      try {
        // Extract maximum customer data from Shopify order for high EMQ (8.5+)
        const customer = (payload.customer || {}) as Record<string, unknown>;
        const billingAddress = (payload.billing_address || payload.shipping_address || {}) as Record<string, unknown>;
        const customerPhone = String(customer.phone || payload.phone || '').replace(/[^0-9+]/g, '') || null;
        const customerId = customer.id ? String(customer.id) : null;
        const lineItems = Array.isArray(payload.line_items) ? payload.line_items as Array<Record<string, unknown>> : [];

        await forwardToMetaCapi({
          storeId: store.id,
          pixelId: cfg.pixel_id,
          eventName: 'Purchase',
          eventId,
          eventTimeIso: createdAt,
          eventSourceUrl: (payload.order_status_url as string) || undefined,
          fbc,
          fbp,
          emailHash,
          phoneHash: customerPhone || undefined,
          value: Number.isFinite(value) ? value : 0,
          currency,
          // Use Shopify customer ID (not order ID) for cross-session matching
          externalId: customerId || orderId,
          orderId,
          // Enhanced identifiers for EMQ boost
          clientIpAddress: (payload.browser_ip as string) || (payload.client_details as Record<string, unknown>)?.browser_ip as string || undefined,
          clientUserAgent: (payload.client_details as Record<string, unknown>)?.user_agent as string || undefined,
          firstName: String(customer.first_name || billingAddress.first_name || '').trim() || undefined,
          lastName: String(customer.last_name || billingAddress.last_name || '').trim() || undefined,
          city: String(billingAddress.city || '').trim() || undefined,
          state: String(billingAddress.province_code || billingAddress.province || '').trim() || undefined,
          zip: String(billingAddress.zip || '').trim() || undefined,
          country: String(billingAddress.country_code || billingAddress.country || '').trim() || undefined,
          // Content data for better optimization
          contentIds: lineItems.map(li => String(li.product_id || li.variant_id || '')).filter(Boolean).slice(0, 10),
          contentType: 'product',
          numItems: lineItems.length || undefined,
        });
        if (sb) {
          await markPersistentTrackingEventMetaDelivery({ storeId: store.id, eventId, forwarded: true });
        } else {
          markTrackingEventMetaDelivery({ storeId: store.id, eventId, forwarded: true });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message.slice(0, 500) : 'Meta forward failed';
        if (sb) {
          await markPersistentTrackingEventMetaDelivery({
            storeId: store.id,
            eventId,
            forwarded: false,
            error: errMsg,
          });
        } else {
          markTrackingEventMetaDelivery({
            storeId: store.id,
            eventId,
            forwarded: false,
            error: errMsg,
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (topic === 'refunds/create') {
    const orderId = String(payload.order_id || '');
    const refundId = String(payload.id || '');
    const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
    const clickId = readClickId(payload);
    const fbc = readFbc(payload, clickId);
    const fbp = readFbp(payload);
    const emailHash = readEmailHash(payload);
    const directEntityIds = readEntityIdsFromPayload(payload);
    const merged = await mergeEntityIdsWithFallback(
      sb,
      store.id,
      createdAt,
      fbc,
      fbp,
      emailHash,
      clickId,
      directEntityIds
    );
    let entityIds = merged.entityIds;
    const utmCampaign = readUtmCampaign(payload);
    const utmMedium = readUtmMedium(payload);
    const utmContent = readUtmContent(payload);
    entityIds = await resolveMetaEntityIdsFromUtms({
      storeId: store.id,
      utmCampaign,
      utmMedium,
      utmContent,
      campaignId: entityIds.campaignId,
      adSetId: entityIds.adSetId,
      adId: entityIds.adId,
    });
    const amount = transactions.reduce((sum, txn) => {
      const row = txn as Record<string, unknown>;
      if (String(row.kind || '').toLowerCase() !== 'refund') return sum;
      return sum + Number(row.amount || 0);
    }, 0);
    const eventId = `shopify-refund-${refundId || orderId || Date.now()}`;
    const hasDirectMapping = !!(directEntityIds.campaignId || directEntityIds.adSetId || directEntityIds.adId);
    const hasUtmInputs = !!(utmCampaign || utmMedium || utmContent);
    const attributionMethod =
      merged.fallbackAttribution && !hasDirectMapping && !hasUtmInputs ? 'modeled' : 'deterministic';

    const refundEventData = {
      storeId: store.id,
      eventName: 'Refund',
      eventId,
      source: 'shopify' as const,
      occurredAt: createdAt,
      clickId,
      fbp,
      fbc,
      emailHash,
      value: Number.isFinite(amount) ? amount : 0,
      currency: String(payload.currency || 'USD'),
      orderId: orderId || null,
      campaignId: entityIds.campaignId,
      adSetId: entityIds.adSetId,
      adId: entityIds.adId,
      payloadJson: JSON.stringify({
        source: 'shopify_webhook',
        topic,
        orderId: orderId || null,
        refundId: refundId || null,
        landingSite: (payload.landing_site as string) || null,
        landingSiteRef: (payload.landing_site_ref as string) || null,
        referringSite: (payload.referring_site as string) || null,
        orderStatusUrl: (payload.order_status_url as string) || null,
        utmCampaign: utmCampaign || null,
        utmMedium: utmMedium || null,
        utmContent: utmContent || null,
        attributionMethod,
        fallbackAttribution: attributionMethod === 'modeled' ? merged.fallbackAttribution : null,
      }),
    };

    if (sb) {
      await insertPersistentTrackingEvent(refundEventData);
    } else {
      insertTrackingEvent(refundEventData);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: true });
}
