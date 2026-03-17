/**
 * Attribution Resolution Engine
 *
 * Resolves order attribution by trying multiple methods in priority order:
 *   1. fbclid exact match          -> 95% confidence
 *   2. UTM + session match         -> 80% confidence
 *   3. UTM only                    -> 65% confidence
 *   4. Session match only          -> 50% confidence
 *   5. Survey calibrated           -> 70% confidence
 *   6. Proportional fallback       -> 30% confidence
 *
 * Uses the rest() PostgREST helper for all DB operations.
 * Hashes PII (email, phone) with SHA-256 before any storage/lookup.
 * All timestamps respect the store timezone.
 */

import { createHash } from 'crypto';
import { rest } from '@/app/api/lib/supabase-persistence';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';
import { toZonedTime } from 'date-fns-tz';
import { subDays } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttributionMethod =
  | 'fbclid_match'
  | 'utm_match'
  | 'email_match'
  | 'session_match'
  | 'proportional'
  | 'survey_calibrated';

export interface AttributionResult {
  orderId: string;
  storeId: string;
  visitorId: string | null;
  fbclid: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmAdId: string | null;
  attributionMethod: AttributionMethod;
  confidenceScore: number;
  revenue: number;
}

export interface OrderData {
  email?: string | null;
  phone?: string | null;
  totalPrice?: number;
  currency?: string;
  createdAt?: string;
  landingSite?: string | null;
  referringSite?: string | null;
  noteAttributes?: Array<{ name?: string; value?: string | number | null }> | null;
}

// ---------------------------------------------------------------------------
// Internal row shapes (PostgREST responses)
// ---------------------------------------------------------------------------

interface PixelEventRow {
  id: number;
  store_id: string;
  visitor_id: string;
  session_id: string;
  event_type: string;
  page_url: string | null;
  referrer: string | null;
  order_id: string | null;
  order_value: number | null;
  fbclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  ip_hash: string | null;
  created_at: string;
}

interface OrderAttributionRow {
  id: number;
  store_id: string;
  order_id: string;
  attribution_method: string;
  visitor_id: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_ad_id: string | null;
  fbclid: string | null;
  order_value: number | null;
}

interface CalibrationRow {
  store_id: string;
  channel: string;
  multiplier: number;
  sample_size: number;
  calculated_at: string;
}

interface SpendCacheRow {
  campaign_id: string;
  spend: number;
}

interface VisitorIdentityRow {
  store_id: string;
  visitor_id: string | null;
  email_hash: string | null;
  phone_hash: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(value?: string | null): string | null {
  if (!value) return null;
  const clean = value.trim().toLowerCase();
  if (!clean) return null;
  return createHash('sha256').update(clean).digest('hex');
}

/** Build an ISO timestamp for N days ago in the store timezone. */
function daysAgoIso(days: number, timezone: string): string {
  const now = toZonedTime(new Date(), timezone);
  const past = subDays(now, days);
  return past.toISOString();
}

function extractUtmParam(
  url: string | null | undefined,
  param: string,
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'https://placeholder.local');
    return parsed.searchParams.get(param) || null;
  } catch {
    return null;
  }
}

function extractUtmsFromOrder(orderData: OrderData): {
  utmSource: string | null;
  utmCampaign: string | null;
  utmAdId: string | null;
} {
  const urls = [orderData.landingSite, orderData.referringSite];
  let utmSource: string | null = null;
  let utmCampaign: string | null = null;
  let utmAdId: string | null = null;

  for (const url of urls) {
    if (!utmSource) utmSource = extractUtmParam(url, 'utm_source');
    if (!utmCampaign) utmCampaign = extractUtmParam(url, 'utm_campaign');
    if (!utmAdId) utmAdId = extractUtmParam(url, 'utm_ad_id') || extractUtmParam(url, 'ad_id');
  }

  // Also check note_attributes (Shopify stores UTM data here via apps)
  if (orderData.noteAttributes?.length) {
    for (const attr of orderData.noteAttributes) {
      const name = String(attr.name || '').trim().toLowerCase();
      const value = String(attr.value || '').trim();
      if (!value) continue;
      if (!utmSource && (name === 'utm_source' || name === '_utm_source')) utmSource = value;
      if (!utmCampaign && (name === 'utm_campaign' || name === '_utm_campaign')) utmCampaign = value;
      if (!utmAdId && (name === 'utm_ad_id' || name === '_utm_ad_id' || name === 'ad_id')) utmAdId = value;
    }
  }

  return { utmSource, utmCampaign, utmAdId };
}

function extractFbclidFromOrder(orderData: OrderData): string | null {
  const urls = [orderData.landingSite, orderData.referringSite];
  for (const url of urls) {
    const fbclid = extractUtmParam(url, 'fbclid');
    if (fbclid) return fbclid;
  }

  // Check note_attributes
  if (orderData.noteAttributes?.length) {
    for (const attr of orderData.noteAttributes) {
      const name = String(attr.name || '').trim().toLowerCase();
      const value = String(attr.value || '').trim();
      if (name === 'fbclid' || name === '_fbclid') return value || null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Confidence mapping
// ---------------------------------------------------------------------------

const CONFIDENCE_MAP: Record<AttributionMethod, number> = {
  fbclid_match: 0.95,
  utm_match: 0.80,
  email_match: 0.65,
  session_match: 0.50,
  survey_calibrated: 0.70,
  proportional: 0.30,
};

/**
 * Returns the base confidence score for a given attribution method.
 */
export function getConfidenceScore(method: AttributionMethod): number {
  return CONFIDENCE_MAP[method] ?? 0.30;
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

/**
 * Apply survey-based calibration multiplier to a base confidence.
 * Looks up attribution_calibration for the store/channel pair.
 * If calibration data exists with sufficient sample size (>= 20),
 * the base confidence is scaled by the multiplier.
 */
export async function applyCalibrationMultiplier(
  storeId: string,
  channel: string,
  baseConfidence: number,
): Promise<number> {
  try {
    const rows = await rest<CalibrationRow[]>(
      `/attribution_calibration?store_id=eq.${encodeURIComponent(storeId)}&channel=eq.${encodeURIComponent(channel)}&select=multiplier,sample_size&limit=1`,
    );

    const row = rows?.[0];
    if (!row || row.sample_size < 20) return baseConfidence;

    const calibrated = baseConfidence * Number(row.multiplier);
    return Math.max(0.05, Math.min(0.99, calibrated));
  } catch {
    // Calibration is best-effort; return original confidence on error
    return baseConfidence;
  }
}

// ---------------------------------------------------------------------------
// Resolution methods (tried in priority order)
// ---------------------------------------------------------------------------

/**
 * Method 1: fbclid exact match
 * Look up pixel_events for a matching fbclid within the attribution window (7 days).
 */
async function tryFbclidMatch(
  storeId: string,
  fbclid: string | null,
  orderCreatedAt: string,
  timezone: string,
): Promise<Partial<AttributionResult> | null> {
  if (!fbclid) return null;

  const windowStart = daysAgoIso(7, timezone);

  const rows = await rest<PixelEventRow[]>(
    `/pixel_events?store_id=eq.${encodeURIComponent(storeId)}&fbclid=eq.${encodeURIComponent(fbclid)}&created_at=gte.${encodeURIComponent(windowStart)}&created_at=lte.${encodeURIComponent(orderCreatedAt)}&select=visitor_id,session_id,utm_source,utm_campaign,utm_content,fbclid&order=created_at.desc&limit=1`,
  );

  const row = rows?.[0];
  if (!row) return null;

  return {
    visitorId: row.visitor_id,
    fbclid: row.fbclid,
    utmSource: row.utm_source,
    utmCampaign: row.utm_campaign,
    utmAdId: row.utm_content, // utm_content often carries ad ID
    attributionMethod: 'fbclid_match',
    confidenceScore: CONFIDENCE_MAP.fbclid_match,
  };
}

/**
 * Method 2: UTM + session match
 * Match by UTM source+campaign AND a session within the attribution window.
 */
async function tryUtmSessionMatch(
  storeId: string,
  utmSource: string | null,
  utmCampaign: string | null,
  orderCreatedAt: string,
  timezone: string,
): Promise<Partial<AttributionResult> | null> {
  if (!utmSource || !utmCampaign) return null;

  const windowStart = daysAgoIso(7, timezone);

  const rows = await rest<PixelEventRow[]>(
    `/pixel_events?store_id=eq.${encodeURIComponent(storeId)}&utm_source=eq.${encodeURIComponent(utmSource)}&utm_campaign=eq.${encodeURIComponent(utmCampaign)}&created_at=gte.${encodeURIComponent(windowStart)}&created_at=lte.${encodeURIComponent(orderCreatedAt)}&select=visitor_id,session_id,fbclid,utm_source,utm_campaign,utm_content&order=created_at.desc&limit=1`,
  );

  const row = rows?.[0];
  if (!row) return null;

  return {
    visitorId: row.visitor_id,
    fbclid: row.fbclid,
    utmSource: row.utm_source,
    utmCampaign: row.utm_campaign,
    utmAdId: row.utm_content,
    attributionMethod: 'utm_match',
    confidenceScore: CONFIDENCE_MAP.utm_match,
  };
}

/**
 * Method 3: UTM only (from order data, no session match needed)
 * The order itself has UTM params in the landing_site URL.
 */
function tryUtmOnly(
  utmSource: string | null,
  utmCampaign: string | null,
  utmAdId: string | null,
): Partial<AttributionResult> | null {
  if (!utmSource && !utmCampaign) return null;

  return {
    visitorId: null,
    fbclid: null,
    utmSource,
    utmCampaign,
    utmAdId,
    attributionMethod: 'utm_match',
    confidenceScore: CONFIDENCE_MAP.email_match, // 0.65 - UTM only without session
  };
}

/**
 * Method 4: Email/phone match
 * Hash the customer email/phone and look for a matching visitor identity
 * that has pixel tracking data.
 */
async function tryEmailMatch(
  storeId: string,
  orderData: OrderData,
  orderCreatedAt: string,
  timezone: string,
): Promise<Partial<AttributionResult> | null> {
  const emailHash = sha256(orderData.email);
  const phoneHash = sha256(orderData.phone);

  if (!emailHash && !phoneHash) return null;

  // Build OR filter for email_hash or phone_hash
  const orParts: string[] = [];
  if (emailHash) orParts.push(`email_hash.eq.${encodeURIComponent(emailHash)}`);
  if (phoneHash) orParts.push(`phone_hash.eq.${encodeURIComponent(phoneHash)}`);

  const identities = await rest<VisitorIdentityRow[]>(
    `/visitor_identities?store_id=eq.${encodeURIComponent(storeId)}&or=(${orParts.join(',')})&visitor_id=not.is.null&select=visitor_id&limit=1`,
  );

  const identity = identities?.[0];
  if (!identity?.visitor_id) return null;

  // Now look up pixel events for this visitor
  const windowStart = daysAgoIso(7, timezone);
  const events = await rest<PixelEventRow[]>(
    `/pixel_events?store_id=eq.${encodeURIComponent(storeId)}&visitor_id=eq.${encodeURIComponent(identity.visitor_id)}&created_at=gte.${encodeURIComponent(windowStart)}&created_at=lte.${encodeURIComponent(orderCreatedAt)}&or=(utm_source.not.is.null,fbclid.not.is.null)&select=visitor_id,fbclid,utm_source,utm_campaign,utm_content&order=created_at.desc&limit=1`,
  );

  const event = events?.[0];
  if (!event) return null;

  return {
    visitorId: identity.visitor_id,
    fbclid: event.fbclid,
    utmSource: event.utm_source,
    utmCampaign: event.utm_campaign,
    utmAdId: event.utm_content,
    attributionMethod: 'email_match',
    confidenceScore: CONFIDENCE_MAP.email_match,
  };
}

/**
 * Method 5: Session match only
 * Look for any pixel session close to the order time (within 30 min window).
 */
async function trySessionMatch(
  storeId: string,
  orderCreatedAt: string,
): Promise<Partial<AttributionResult> | null> {
  const orderTs = Date.parse(orderCreatedAt);
  if (!Number.isFinite(orderTs)) return null;

  const windowMs = 30 * 60 * 1000; // 30 minutes
  const lower = new Date(orderTs - windowMs).toISOString();
  const upper = new Date(orderTs + windowMs).toISOString();

  const rows = await rest<PixelEventRow[]>(
    `/pixel_events?store_id=eq.${encodeURIComponent(storeId)}&event_type=eq.purchase&created_at=gte.${encodeURIComponent(lower)}&created_at=lte.${encodeURIComponent(upper)}&or=(utm_source.not.is.null,fbclid.not.is.null)&select=visitor_id,fbclid,utm_source,utm_campaign,utm_content&order=created_at.desc&limit=1`,
  );

  const row = rows?.[0];
  if (!row) return null;

  return {
    visitorId: row.visitor_id,
    fbclid: row.fbclid,
    utmSource: row.utm_source,
    utmCampaign: row.utm_campaign,
    utmAdId: row.utm_content,
    attributionMethod: 'session_match',
    confidenceScore: CONFIDENCE_MAP.session_match,
  };
}

/**
 * Method 6: Survey calibrated
 * Check if there is survey response data for this order that can inform attribution.
 */
async function trySurveyCalibrated(
  storeId: string,
  orderId: string,
): Promise<Partial<AttributionResult> | null> {
  const rows = await rest<Array<{ response: string }>>(
    `/survey_responses?store_id=eq.${encodeURIComponent(storeId)}&order_id=eq.${encodeURIComponent(orderId)}&select=response&order=created_at.desc&limit=1`,
  );

  const row = rows?.[0];
  if (!row?.response) return null;

  // Parse the survey response to extract channel info
  const response = row.response.toLowerCase();
  let utmSource: string | null = null;

  if (response.includes('facebook') || response.includes('instagram') || response.includes('meta')) {
    utmSource = 'facebook';
  } else if (response.includes('google')) {
    utmSource = 'google';
  } else if (response.includes('tiktok')) {
    utmSource = 'tiktok';
  } else if (response.includes('email') || response.includes('newsletter')) {
    utmSource = 'email';
  } else if (response.includes('friend') || response.includes('referral') || response.includes('word of mouth')) {
    utmSource = 'referral';
  } else if (response.includes('search') || response.includes('organic')) {
    utmSource = 'organic';
  } else {
    utmSource = 'survey_other';
  }

  return {
    visitorId: null,
    fbclid: null,
    utmSource,
    utmCampaign: null,
    utmAdId: null,
    attributionMethod: 'survey_calibrated',
    confidenceScore: CONFIDENCE_MAP.survey_calibrated,
  };
}

/**
 * Method 7: Proportional fallback
 * Distribute attribution proportionally based on ad spend.
 * The campaign with the most spend in the period gets the attribution.
 */
async function tryProportionalFallback(
  storeId: string,
  orderCreatedAt: string,
  timezone: string,
): Promise<Partial<AttributionResult> | null> {
  const windowStart = daysAgoIso(7, timezone);
  const dateStr = orderCreatedAt.split('T')[0] || windowStart.split('T')[0];

  // Get spend data from meta_spend_cache for the recent window
  const spendRows = await rest<SpendCacheRow[]>(
    `/meta_spend_cache?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${encodeURIComponent(windowStart.split('T')[0] || '')}&date=lte.${encodeURIComponent(dateStr)}&select=campaign_id,spend&order=spend.desc&limit=5`,
  );

  if (!spendRows || spendRows.length === 0) return null;

  // Attribute to the highest-spending campaign
  const topCampaign = spendRows[0];
  if (!topCampaign || Number(topCampaign.spend) <= 0) return null;

  return {
    visitorId: null,
    fbclid: null,
    utmSource: 'facebook',
    utmCampaign: topCampaign.campaign_id,
    utmAdId: null,
    attributionMethod: 'proportional',
    confidenceScore: CONFIDENCE_MAP.proportional,
  };
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve attribution for an order by trying each method in priority order.
 *
 * @param orderId   - Shopify order ID
 * @param storeId   - Store ID
 * @param orderData - Order details (email, phone, totalPrice, landing_site, etc.)
 * @param timezone  - Store timezone (defaults to America/New_York)
 * @returns         - AttributionResult with the best match, or a proportional fallback
 */
export async function resolveAttribution(
  orderId: string,
  storeId: string,
  orderData: OrderData,
  timezone?: string,
): Promise<AttributionResult> {
  const tz = timezone || DEFAULT_TIMEZONE;
  const orderCreatedAt = orderData.createdAt || new Date().toISOString();
  const revenue = orderData.totalPrice ?? 0;

  // Extract signals from the order
  const fbclid = extractFbclidFromOrder(orderData);
  const { utmSource, utmCampaign, utmAdId } = extractUtmsFromOrder(orderData);

  // Build default result shell
  const buildResult = (partial: Partial<AttributionResult>): AttributionResult => ({
    orderId,
    storeId,
    visitorId: partial.visitorId ?? null,
    fbclid: partial.fbclid ?? null,
    utmSource: partial.utmSource ?? null,
    utmCampaign: partial.utmCampaign ?? null,
    utmAdId: partial.utmAdId ?? null,
    attributionMethod: partial.attributionMethod ?? 'proportional',
    confidenceScore: partial.confidenceScore ?? CONFIDENCE_MAP.proportional,
    revenue,
  });

  // Priority 1: fbclid exact match (95% confidence)
  try {
    const fbclidResult = await tryFbclidMatch(storeId, fbclid, orderCreatedAt, tz);
    if (fbclidResult) {
      const calibrated = await applyCalibrationMultiplier(
        storeId,
        'facebook',
        fbclidResult.confidenceScore ?? CONFIDENCE_MAP.fbclid_match,
      );
      return buildResult({ ...fbclidResult, confidenceScore: calibrated });
    }
  } catch {
    // Continue to next method
  }

  // Priority 2: UTM + session match (80% confidence)
  try {
    const utmSessionResult = await tryUtmSessionMatch(storeId, utmSource, utmCampaign, orderCreatedAt, tz);
    if (utmSessionResult) {
      const channel = utmSessionResult.utmSource || 'unknown';
      const calibrated = await applyCalibrationMultiplier(
        storeId,
        channel,
        utmSessionResult.confidenceScore ?? CONFIDENCE_MAP.utm_match,
      );
      return buildResult({ ...utmSessionResult, confidenceScore: calibrated });
    }
  } catch {
    // Continue to next method
  }

  // Priority 3: UTM only from order data (65% confidence)
  const utmOnlyResult = tryUtmOnly(utmSource, utmCampaign, utmAdId);
  if (utmOnlyResult) {
    try {
      const channel = utmOnlyResult.utmSource || 'unknown';
      const calibrated = await applyCalibrationMultiplier(
        storeId,
        channel,
        utmOnlyResult.confidenceScore ?? CONFIDENCE_MAP.email_match,
      );
      return buildResult({ ...utmOnlyResult, confidenceScore: calibrated });
    } catch {
      return buildResult(utmOnlyResult);
    }
  }

  // Priority 4: Email/phone match via visitor identity (65% confidence)
  try {
    const emailResult = await tryEmailMatch(storeId, orderData, orderCreatedAt, tz);
    if (emailResult) {
      const channel = emailResult.utmSource || 'unknown';
      const calibrated = await applyCalibrationMultiplier(
        storeId,
        channel,
        emailResult.confidenceScore ?? CONFIDENCE_MAP.email_match,
      );
      return buildResult({ ...emailResult, confidenceScore: calibrated });
    }
  } catch {
    // Continue to next method
  }

  // Priority 5: Session match by time proximity (50% confidence)
  try {
    const sessionResult = await trySessionMatch(storeId, orderCreatedAt);
    if (sessionResult) {
      return buildResult(sessionResult);
    }
  } catch {
    // Continue to next method
  }

  // Priority 6: Survey calibrated (70% confidence)
  try {
    const surveyResult = await trySurveyCalibrated(storeId, orderId);
    if (surveyResult) {
      return buildResult(surveyResult);
    }
  } catch {
    // Continue to next method
  }

  // Priority 7: Proportional fallback (30% confidence)
  try {
    const proportionalResult = await tryProportionalFallback(storeId, orderCreatedAt, tz);
    if (proportionalResult) {
      return buildResult(proportionalResult);
    }
  } catch {
    // Fall through to unattributed
  }

  // No attribution found
  return buildResult({
    attributionMethod: 'proportional',
    confidenceScore: 0,
  });
}
