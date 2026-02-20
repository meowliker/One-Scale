import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  getScoredTrackingAttributionBySignals,
  getTrackingAttributionByTimeProximity,
  getTrackingShopifyPurchaseEventIdByOrderId,
  insertTrackingEvent,
} from '@/app/api/lib/db';
import type { DbTrackingAttributionScored } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import {
  getPersistentScoredTrackingAttributionBySignals,
  getPersistentTrackingAttributionByTimeProximity,
  getPersistentTrackingShopifyPurchaseEventIdByOrderId,
  insertPersistentTrackingEvent,
} from '@/app/api/lib/supabase-tracking';
import { resolveMetaEntityIdsFromUtms } from '@/app/api/lib/meta-attribution-lookup';
import { fetchFromShopify } from '@/app/api/lib/shopify-client';
import { getShopifyToken } from '@/app/api/lib/tokens';

// Allow up to 60 seconds for Shopify order backfill (Vercel default is 30s)
export const maxDuration = 60;

interface RawNoteAttribute {
  name?: string;
  value?: string | number | null;
}

interface RawRefundTransaction {
  kind?: string;
  amount?: string | number | null;
}

interface RawRefundLineItem {
  subtotal?: string | number | null;
}

interface RawRefund {
  id?: string | number;
  created_at?: string;
  transactions?: RawRefundTransaction[];
  refund_line_items?: RawRefundLineItem[];
}

interface RawShopifyOrder {
  id?: string | number;
  created_at?: string;
  updated_at?: string;
  email?: string | null;
  customer?: { email?: string | null } | null;
  total_price?: string | number;
  currency?: string;
  financial_status?: string;
  landing_site?: string | null;
  order_status_url?: string | null;
  landing_site_ref?: string | null;
  referring_site?: string | null;
  note_attributes?: RawNoteAttribute[] | null;
  refunds?: RawRefund[] | null;
}

function sha256(value?: string | null): string | null {
  if (!value) return null;
  const clean = value.trim().toLowerCase();
  if (!clean) return null;
  return createHash('sha256').update(clean).digest('hex');
}

function parseNumber(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function clampDays(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 7;
  return Math.max(1, Math.min(30, Math.floor(parsed)));
}

function decodeUrlComponentSafe(value: string): string {
  const withSpaces = value.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    return withSpaces;
  }
}

function readQueryParam(rawUrl: string | null | undefined, keys: string[]): string | null {
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

function getOrderUrls(order: RawShopifyOrder): Array<string | null | undefined> {
  return [order.landing_site, order.order_status_url, order.landing_site_ref, order.referring_site];
}

function parseClickIdFromFbc(fbc?: string | null): string | null {
  if (!fbc) return null;
  const trimmed = fbc.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('.');
  return parts.length >= 4 ? parts.slice(3).join('.') : null;
}

function readParam(urls: Array<string | null | undefined>, keys: string[]): string | null {
  for (const rawUrl of urls) {
    const value = readQueryParam(rawUrl, keys);
    if (value) return value;
  }
  return null;
}

function readNoteAttribute(noteAttributes: RawNoteAttribute[] | null | undefined, keys: string[]): string | null {
  if (!noteAttributes || noteAttributes.length === 0) return null;
  const keySet = new Set(keys.map((k) => k.toLowerCase()));
  for (const attr of noteAttributes) {
    const name = String(attr.name || '').trim().toLowerCase();
    if (!name || !keySet.has(name)) continue;
    const value = String(attr.value || '').trim();
    if (value.length > 0) return value;
  }
  return null;
}

function readEntityIds(order: RawShopifyOrder): { campaignId: string | null; adSetId: string | null; adId: string | null } {
  const urls = getOrderUrls(order);
  return {
    campaignId:
      readParam(urls, ['campaign_id', 'campaignid', 'utm_campaign_id', 'fb_campaign_id', 'hsa_cam']) ||
      readNoteAttribute(order.note_attributes, [
        '_tw_campaign_id',
        '_tw_ft_campaign_id',
        '_tw_first_campaign_id',
        'tw_campaign_id',
        'tw_ft_campaign_id',
        'tw_first_campaign_id',
        'campaign_id',
        'campaignid',
        'fb_campaign_id',
        'utm_campaign_id',
        'hsa_cam',
      ]) ||
      null,
    adSetId:
      readParam(urls, ['adset_id', 'adsetid', 'utm_adset_id', 'fb_adset_id', 'hsa_adset']) ||
      readNoteAttribute(order.note_attributes, [
        '_tw_adset_id',
        '_tw_ft_adset_id',
        '_tw_first_adset_id',
        'tw_adset_id',
        'tw_ft_adset_id',
        'tw_first_adset_id',
        'adset_id',
        'adsetid',
        'fb_adset_id',
        'utm_adset_id',
        'hsa_adset',
      ]) ||
      null,
    adId:
      readParam(urls, ['ad_id', 'adid', 'utm_ad_id', 'fb_ad_id', 'hsa_ad']) ||
      readNoteAttribute(order.note_attributes, [
        '_tw_ad_id',
        '_tw_ft_ad_id',
        '_tw_first_ad_id',
        'tw_ad_id',
        'tw_ft_ad_id',
        'tw_first_ad_id',
        'ad_id',
        'adid',
        'fb_ad_id',
        'utm_ad_id',
        'hsa_ad',
      ]) ||
      null,
  };
}

function readFbclid(order: RawShopifyOrder): string | null {
  return (
    readParam(getOrderUrls(order), ['fbclid']) ||
    parseClickIdFromFbc(readParam(getOrderUrls(order), ['fbc'])) ||
    readNoteAttribute(order.note_attributes, [
      '_tw_click_id',
      '_tw_ft_click_id',
      '_tw_first_click_id',
      'tw_click_id',
      'tw_ft_click_id',
      'tw_first_click_id',
      'fbclid',
    ]) ||
    parseClickIdFromFbc(readNoteAttribute(order.note_attributes, ['_tw_fbc', '_tw_first_fbc', 'tw_fbc', 'tw_first_fbc', 'fbc'])) ||
    null
  );
}

function buildFbcFromClickId(clickId: string | null): string | null {
  if (!clickId) return null;
  return `fb.1.${Math.floor(Date.now() / 1000)}.${clickId}`;
}

function readFbc(order: RawShopifyOrder, clickId: string | null): string | null {
  return (
    readParam(getOrderUrls(order), ['fbc']) ||
    readNoteAttribute(order.note_attributes, ['_tw_fbc', '_tw_first_fbc', 'tw_fbc', 'tw_first_fbc', 'fbc']) ||
    buildFbcFromClickId(clickId)
  );
}

function readFbp(order: RawShopifyOrder): string | null {
  return (
    readParam(getOrderUrls(order), ['fbp']) ||
    readNoteAttribute(order.note_attributes, ['_tw_fbp', 'tw_fbp', 'fbp', '_fbp']) ||
    null
  );
}

function readEmailHash(order: RawShopifyOrder): string | null {
  return sha256(order.email || order.customer?.email || readNoteAttribute(order.note_attributes, ['_tw_email', 'email']));
}

function readUtmCampaign(order: RawShopifyOrder): string | null {
  return (
    readParam(getOrderUrls(order), ['utm_campaign']) ||
    readNoteAttribute(order.note_attributes, [
      '_tw_utm_campaign',
      '_tw_ft_utm_campaign',
      '_tw_first_utm_campaign',
      'tw_utm_campaign',
      'tw_ft_utm_campaign',
      'tw_first_utm_campaign',
      'utm_campaign',
    ]) ||
    null
  );
}

function readUtmMedium(order: RawShopifyOrder): string | null {
  return (
    readParam(getOrderUrls(order), ['utm_medium']) ||
    readNoteAttribute(order.note_attributes, [
      '_tw_utm_medium',
      '_tw_ft_utm_medium',
      '_tw_first_utm_medium',
      'tw_utm_medium',
      'tw_ft_utm_medium',
      'tw_first_utm_medium',
      'utm_medium',
    ]) ||
    null
  );
}

function readUtmContent(order: RawShopifyOrder): string | null {
  return (
    readParam(getOrderUrls(order), ['utm_content']) ||
    readNoteAttribute(order.note_attributes, [
      '_tw_utm_content',
      '_tw_ft_utm_content',
      '_tw_first_utm_content',
      'tw_utm_content',
      'tw_ft_utm_content',
      'tw_first_utm_content',
      'utm_content',
    ]) ||
    null
  );
}

function getRefundAmount(refund: RawRefund): number {
  const transactions = Array.isArray(refund.transactions) ? refund.transactions : [];
  const txnRefund = transactions.reduce((sum, txn) => {
    if (String(txn.kind || '').toLowerCase() !== 'refund') return sum;
    return sum + parseNumber(txn.amount);
  }, 0);
  if (txnRefund > 0) return txnRefund;

  const lineItems = Array.isArray(refund.refund_line_items) ? refund.refund_line_items : [];
  const lineRefund = lineItems.reduce((sum, item) => sum + parseNumber(item.subtotal), 0);
  return lineRefund > 0 ? lineRefund : 0;
}

function shouldAcceptFallbackAttribution(
  fallback: DbTrackingAttributionScored | null | undefined
): boolean {
  if (!fallback) return false;
  if (!(fallback.campaignId || fallback.adSetId || fallback.adId)) return false;
  const matched = new Set(fallback.matchedSignals);
  // Aggressive thresholds for 90%+ attribution coverage (Triple Whale-style)
  if (matched.has('click_id') && fallback.confidence >= 0.20) return true;
  if (matched.has('fbc') && fallback.confidence >= 0.22) return true;
  if ((matched.has('fbp') || matched.has('email_hash')) && fallback.confidence >= 0.28) return true;
  return fallback.confidence >= 0.25;
}

export async function POST(request: NextRequest) {
  const sb = isSupabasePersistenceEnabled();
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  let body: { days?: number } = {};
  try {
    body = (await request.json()) as { days?: number };
  } catch {
    // body is optional
  }

  const days = clampDays(body.days ?? searchParams.get('days') ?? 7);
  const createdAtMin = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const token = await getShopifyToken(storeId);
  if (!token || !token.shopDomain) {
    return NextResponse.json({ error: 'Not authenticated with Shopify' }, { status: 401 });
  }

  let sinceId = '0';
  let pages = 0;
  const maxPages = 20;
  const pageLimit = 250;

  let scannedOrders = 0;
  let insertedPurchaseEvents = 0;
  let insertedRefundEvents = 0;
  let mappedPurchaseEvents = 0;
  let mappedRefundEvents = 0;
  let updatedPurchaseEvents = 0;
  let updatedRefundEvents = 0;
  let mappedUpdatedPurchases = 0;
  let mappedUpdatedRefunds = 0;
  const attributionCache = new Map<string, DbTrackingAttributionScored | null>();

  while (pages < maxPages) {
    const response = await fetchFromShopify<{ orders: RawShopifyOrder[] }>(
      token.accessToken,
      token.shopDomain,
      '/orders.json',
      {
        status: 'any',
        limit: String(pageLimit),
        since_id: sinceId,
        created_at_min: createdAtMin,
      }
    );

    const orders = response.orders || [];
    if (orders.length === 0) break;

    pages += 1;

    for (const order of orders) {
      scannedOrders += 1;
      const orderId = String(order.id || '').trim();
      if (!orderId) continue;

      const financialStatus = String(order.financial_status || '').toLowerCase();
      const occurredAt = order.created_at || order.updated_at || new Date().toISOString();
      const currency = String(order.currency || 'USD');
      const value = parseNumber(order.total_price);
      const clickId = readFbclid(order);
      const fbc = readFbc(order, clickId);
      const fbp = readFbp(order);
      const emailHash = readEmailHash(order);
      const utmCampaign = readUtmCampaign(order);
      const utmMedium = readUtmMedium(order);
      const utmContent = readUtmContent(order);
      const directEntityIds = readEntityIds(order);
      let entityIds = directEntityIds;
      let fallbackAttributionMeta:
        | {
            confidence: number;
            score: number;
            matchedSignals: Array<'click_id' | 'fbc' | 'fbp' | 'email_hash'>;
            matchedAt: string;
            source: 'browser' | 'server' | 'shopify';
            ageHours: number | null;
            strategy: 'signal_match' | 'time_proximity';
          }
        | null = null;

      if (!entityIds.campaignId && !entityIds.adSetId && !entityIds.adId) {
        const occurredDay = String(occurredAt || '').slice(0, 10);
        const cacheKey = [clickId || '', fbc || '', fbp || '', emailHash || '', occurredDay].join('|');
        if (!attributionCache.has(cacheKey)) {
          const lookupInput = { storeId, beforeIso: occurredAt, clickId, fbc, fbp, emailHash };
          const result = sb
            ? await getPersistentScoredTrackingAttributionBySignals(lookupInput)
            : getScoredTrackingAttributionBySignals(lookupInput);
          attributionCache.set(cacheKey, result);
        }
        const fallback = attributionCache.get(cacheKey);
        if (fallback && shouldAcceptFallbackAttribution(fallback)) {
          entityIds = {
            campaignId: fallback.campaignId,
            adSetId: fallback.adSetId,
            adId: fallback.adId,
          };
          fallbackAttributionMeta = {
            confidence: fallback.confidence,
            score: fallback.score,
            matchedSignals: fallback.matchedSignals,
            matchedAt: fallback.matchedAt,
            source: fallback.source,
            ageHours: fallback.ageHours,
            strategy: 'signal_match',
          };
        } else if (clickId || fbc || fbp || emailHash) {
          const timeProximity = sb
            ? await getPersistentTrackingAttributionByTimeProximity({ storeId, occurredAt, windowMinutes: 120 })
            : getTrackingAttributionByTimeProximity({ storeId, occurredAt, windowMinutes: 120 });
          if (timeProximity) {
            entityIds = {
              campaignId: timeProximity.campaignId,
              adSetId: timeProximity.adSetId,
              adId: timeProximity.adId,
            };
            const matchedSignals: Array<'click_id' | 'fbc' | 'fbp' | 'email_hash'> = [];
            if (clickId) matchedSignals.push('click_id');
            if (fbc) matchedSignals.push('fbc');
            if (fbp) matchedSignals.push('fbp');
            if (emailHash) matchedSignals.push('email_hash');
            fallbackAttributionMeta = {
              confidence: timeProximity.confidence,
              score: timeProximity.score,
              matchedSignals,
              matchedAt: timeProximity.matchedAt,
              source: timeProximity.source,
              ageHours: timeProximity.ageHours,
              strategy: 'time_proximity',
            };
          }
        }
      }
      entityIds = await resolveMetaEntityIdsFromUtms({
        storeId,
        utmCampaign,
        utmMedium,
        utmContent,
        campaignId: entityIds.campaignId,
        adSetId: entityIds.adSetId,
        adId: entityIds.adId,
      });
      const hasDirectMapping = !!(directEntityIds.campaignId || directEntityIds.adSetId || directEntityIds.adId);
      const hasUtmInputs = !!(utmCampaign || utmMedium || utmContent);
      const attributionMethod =
        fallbackAttributionMeta && !hasDirectMapping && !hasUtmInputs ? 'modeled' : 'deterministic';

      const existingShopifyPurchaseEventId = sb
        ? await getPersistentTrackingShopifyPurchaseEventIdByOrderId(storeId, orderId)
        : getTrackingShopifyPurchaseEventIdByOrderId(storeId, orderId);
      const orderEventData = {
        storeId,
        eventName: 'Purchase',
        eventId: existingShopifyPurchaseEventId || `shopify-order-${orderId}`,
        source: 'shopify' as const,
        occurredAt,
        clickId,
        fbp,
        fbc,
        emailHash,
        value,
        currency,
        orderId,
        campaignId: entityIds.campaignId,
        adSetId: entityIds.adSetId,
        adId: entityIds.adId,
        payloadJson: JSON.stringify({
          source: `backfill_${days}d_order`,
          landingSite: order.landing_site || null,
          landingSiteRef: order.landing_site_ref || null,
          referringSite: order.referring_site || null,
          orderStatusUrl: order.order_status_url || null,
          financialStatus: financialStatus || null,
          utmCampaign: utmCampaign || null,
          utmMedium: utmMedium || null,
          utmContent: utmContent || null,
          attributionMethod,
          fallbackAttribution: attributionMethod === 'modeled' ? fallbackAttributionMeta : null,
        }),
      };
      const upsertOrderEvent = sb
        ? await insertPersistentTrackingEvent(orderEventData)
        : insertTrackingEvent(orderEventData);

      if (upsertOrderEvent.inserted) {
        insertedPurchaseEvents += 1;
        if (entityIds.campaignId || entityIds.adSetId || entityIds.adId) mappedPurchaseEvents += 1;
      } else if (upsertOrderEvent.updated) {
        updatedPurchaseEvents += 1;
        if (entityIds.campaignId || entityIds.adSetId || entityIds.adId) mappedUpdatedPurchases += 1;
      }

      const orderRefunds = Array.isArray(order.refunds) ? order.refunds : [];
      const refunds =
        orderRefunds.length > 0
          ? orderRefunds
          : financialStatus === 'refunded'
            ? [
                {
                  id: `${orderId}-status`,
                  created_at: order.updated_at || occurredAt,
                  transactions: [{ kind: 'refund', amount: value }],
                } as RawRefund,
              ]
            : [];

      for (let idx = 0; idx < refunds.length; idx++) {
        const refund = refunds[idx];
        const refundId = String(refund.id || `${orderId}-${idx + 1}`);
        const refundAmount = getRefundAmount(refund);
        if (refundAmount <= 0) continue;
        const refundEventData = {
          storeId,
          eventName: 'Refund',
          eventId: `shopify-refund-${refundId}`,
          source: 'shopify' as const,
          occurredAt: refund.created_at || order.updated_at || occurredAt,
          clickId,
          fbp,
          fbc,
          emailHash,
          value: refundAmount,
          currency,
          orderId,
          campaignId: entityIds.campaignId,
          adSetId: entityIds.adSetId,
          adId: entityIds.adId,
          payloadJson: JSON.stringify({
            source: `backfill_${days}d_refund`,
            orderId,
            refundId,
            landingSite: order.landing_site || null,
            landingSiteRef: order.landing_site_ref || null,
            referringSite: order.referring_site || null,
            orderStatusUrl: order.order_status_url || null,
            utmCampaign: utmCampaign || null,
            utmMedium: utmMedium || null,
            utmContent: utmContent || null,
            fallbackAttribution: fallbackAttributionMeta,
          }),
        };
        const upsertRefund = sb
          ? await insertPersistentTrackingEvent(refundEventData)
          : insertTrackingEvent(refundEventData);
        if (upsertRefund.inserted) {
          insertedRefundEvents += 1;
          if (entityIds.campaignId || entityIds.adSetId || entityIds.adId) mappedRefundEvents += 1;
        } else if (upsertRefund.updated) {
          updatedRefundEvents += 1;
          if (entityIds.campaignId || entityIds.adSetId || entityIds.adId) mappedUpdatedRefunds += 1;
        }
      }
    }

    const lastOrderId = orders[orders.length - 1]?.id;
    if (lastOrderId === undefined || lastOrderId === null) break;
    sinceId = String(lastOrderId);
    if (orders.length < pageLimit) break;
  }

  return NextResponse.json({
    ok: true,
    data: {
      days,
      createdAtMin,
      scannedOrders,
      pagesScanned: pages,
      insertedPurchaseEvents,
      insertedRefundEvents,
      updatedPurchaseEvents,
      updatedRefundEvents,
      mappedPurchaseEvents,
      mappedRefundEvents,
      mappedUpdatedPurchases,
      mappedUpdatedRefunds,
      mappingRatePurchases:
        insertedPurchaseEvents > 0 ? Math.round((mappedPurchaseEvents / insertedPurchaseEvents) * 10000) / 100 : 0,
      effectiveMappedPurchases: mappedPurchaseEvents + mappedUpdatedPurchases,
      shopDomain: token.shopDomain,
    },
  });
}
