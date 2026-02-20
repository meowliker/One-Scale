/**
 * Supabase-backed meta_endpoint_snapshots and tracking event persistence.
 *
 * Mirror of the SQLite functions in db.ts:
 *   upsertMetaEndpointSnapshot  -> upsertPersistentMetaEndpointSnapshot
 *   getMetaEndpointSnapshot     -> getPersistentMetaEndpointSnapshot
 *   getLatestMetaEndpointSnapshot -> getLatestPersistentMetaEndpointSnapshot
 *   getRecentMetaEndpointSnapshots -> getRecentPersistentMetaEndpointSnapshots
 *
 * Tracking event mirrors:
 *   getStoreByDomain                      -> getPersistentStoreByDomain
 *   getTrackingConfig                     -> getPersistentTrackingConfig
 *   getTrackingShopifyPurchaseEventIdByOrderId -> getPersistentTrackingShopifyPurchaseEventIdByOrderId
 *   insertTrackingEvent                   -> insertPersistentTrackingEvent
 *   markTrackingEventMetaDelivery         -> markPersistentTrackingEventMetaDelivery
 *   getScoredTrackingAttributionBySignals -> getPersistentScoredTrackingAttributionBySignals
 *   getTrackingAttributionByTimeProximity -> getPersistentTrackingAttributionByTimeProximity
 *
 * All functions are async and use the Supabase REST API via the service-role key.
 */

import type {
  DbStore,
  DbTrackingConfig,
  DbTrackingEvent,
  DbTrackingEventSummary,
  DbTrackingEntityMetricRow,
  DbTrackingCoverageRow,
  DbTrackingTopEntityRow,
  DbTrackingUnattributedPurchaseRow,
  DbTrackingPurchaseLiveRow,
  DbTrackingAttributionLookupInput,
  DbTrackingAttributionScored,
  DbTrackingAttributionTimeProximity,
} from '@/app/api/lib/db';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type MetaSnapshotEndpoint = 'creatives' | 'adsets' | 'ads' | 'campaigns' | 'insights';

function headers(extra?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
  if (SUPABASE_SERVICE_ROLE_KEY.split('.').length === 3) {
    out.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  }
  return out;
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      ...headers(),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase request failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.text();
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
}

// ---- Row shape returned from Supabase ----

interface SnapshotRow {
  id: number;
  store_id: string;
  endpoint: string;
  scope_id: string;
  variant_key: string;
  row_count: number;
  payload_json: string;
  updated_at: string;
}

// ---- Public API ----

export async function upsertPersistentMetaEndpointSnapshot(
  storeId: string,
  endpoint: MetaSnapshotEndpoint,
  scopeId: string,
  variantKey: string,
  payload: unknown
): Promise<void> {
  const payloadJson = JSON.stringify(payload);
  const rowCount = Array.isArray(payload) ? payload.length : 0;

  await rest(
    '/meta_endpoint_snapshots?on_conflict=store_id,endpoint,scope_id,variant_key',
    {
      method: 'POST',
      headers: headers({
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify([{
        store_id: storeId,
        endpoint,
        scope_id: scopeId,
        variant_key: variantKey,
        row_count: rowCount,
        payload_json: payloadJson,
        updated_at: new Date().toISOString(),
      }]),
    }
  );
}

export async function getPersistentMetaEndpointSnapshot<T>(
  storeId: string,
  endpoint: MetaSnapshotEndpoint,
  scopeId: string,
  variantKey: string
): Promise<{ data: T; updatedAt: string; rowCount: number } | null> {
  const rows = await rest<SnapshotRow[]>(
    `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.${encodeURIComponent(endpoint)}&scope_id=eq.${encodeURIComponent(scopeId)}&variant_key=eq.${encodeURIComponent(variantKey)}&select=payload_json,updated_at,row_count&limit=1`
  );
  const row = rows?.[0];
  if (!row) return null;
  try {
    return {
      data: JSON.parse(row.payload_json) as T,
      updatedAt: row.updated_at,
      rowCount: row.row_count,
    };
  } catch {
    return null;
  }
}

export async function getLatestPersistentMetaEndpointSnapshot<T>(
  storeId: string,
  endpoint: MetaSnapshotEndpoint,
  scopeId: string
): Promise<{ data: T; updatedAt: string; rowCount: number } | null> {
  const rows = await rest<SnapshotRow[]>(
    `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.${encodeURIComponent(endpoint)}&scope_id=eq.${encodeURIComponent(scopeId)}&select=payload_json,updated_at,row_count&order=updated_at.desc&limit=1`
  );
  const row = rows?.[0];
  if (!row) return null;
  try {
    return {
      data: JSON.parse(row.payload_json) as T,
      updatedAt: row.updated_at,
      rowCount: row.row_count,
    };
  } catch {
    return null;
  }
}

export async function getRecentPersistentMetaEndpointSnapshots<T>(
  storeId: string,
  endpoint: MetaSnapshotEndpoint,
  limit = 50
): Promise<Array<{ scopeId: string; variantKey: string; data: T; updatedAt: string; rowCount: number }>> {
  const safeLimit = Math.max(1, limit);
  const rows = await rest<SnapshotRow[]>(
    `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.${encodeURIComponent(endpoint)}&select=scope_id,variant_key,payload_json,updated_at,row_count&order=updated_at.desc&limit=${safeLimit}`
  );

  const parsed: Array<{ scopeId: string; variantKey: string; data: T; updatedAt: string; rowCount: number }> = [];
  for (const row of rows || []) {
    try {
      parsed.push({
        scopeId: row.scope_id,
        variantKey: row.variant_key,
        data: JSON.parse(row.payload_json) as T,
        updatedAt: row.updated_at,
        rowCount: row.row_count,
      });
    } catch {
      // ignore malformed payload rows
    }
  }
  return parsed;
}

// ------ Tracking Event Persistence (Supabase-backed) ------

export async function getPersistentStoreByDomain(domain: string): Promise<DbStore | null> {
  const cleaned = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  const rows = await rest<DbStore[]>(
    `/stores?domain=ilike.${encodeURIComponent(cleaned)}&select=*&limit=1`
  );
  return rows?.[0] ?? null;
}

export async function getPersistentTrackingConfig(storeId: string): Promise<DbTrackingConfig | null> {
  const rows = await rest<DbTrackingConfig[]>(
    `/tracking_configs?store_id=eq.${encodeURIComponent(storeId)}&select=*&limit=1`
  );
  return rows?.[0] ?? null;
}

export async function getPersistentTrackingConfigByPixelId(
  pixelId: string
): Promise<DbTrackingConfig | null> {
  const rows = await rest<DbTrackingConfig[]>(
    `/tracking_configs?pixel_id=eq.${encodeURIComponent(pixelId)}&select=*&limit=1`
  );
  return rows?.[0] ?? null;
}

export async function upsertPersistentTrackingConfig(
  storeId: string,
  data: {
    pixelId: string;
    domain: string;
    serverSideEnabled?: boolean;
    attributionModel?: 'first_click' | 'last_click' | 'linear' | 'time_decay' | 'position_based';
    attributionWindow?: '1day' | '7day' | '28day';
  }
): Promise<void> {
  const payload = {
    store_id: storeId,
    pixel_id: data.pixelId,
    domain: data.domain,
    server_side_enabled: data.serverSideEnabled ? 1 : 0,
    attribution_model: data.attributionModel || 'last_click',
    attribution_window: data.attributionWindow || '7day',
    updated_at: new Date().toISOString(),
  };

  await rest('/tracking_configs?on_conflict=store_id', {
    method: 'POST',
    headers: headers({
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify([payload]),
  });
}

export async function getPersistentTrackingShopifyPurchaseEventIdByOrderId(
  storeId: string,
  orderId: string
): Promise<string | null> {
  const rows = await rest<Array<{ event_id: string | null }>>(
    `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&source=eq.shopify&event_name=eq.Purchase&order_id=eq.${encodeURIComponent(orderId)}&select=event_id&order=occurred_at.desc&limit=1`
  );
  return rows?.[0]?.event_id ?? null;
}

export async function insertPersistentTrackingEvent(data: {
  storeId: string;
  eventName: string;
  eventId?: string | null;
  source?: 'browser' | 'server' | 'shopify';
  occurredAt: string;
  pageUrl?: string | null;
  referrer?: string | null;
  sessionId?: string | null;
  clickId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  externalId?: string | null;
  emailHash?: string | null;
  phoneHash?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  value?: number | null;
  currency?: string | null;
  orderId?: string | null;
  campaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
  payloadJson?: string | null;
}): Promise<{ inserted: boolean; updated: boolean }> {
  const payload = {
    store_id: data.storeId,
    event_name: data.eventName,
    event_id: data.eventId ?? null,
    source: data.source || 'browser',
    occurred_at: data.occurredAt,
    page_url: data.pageUrl ?? null,
    referrer: data.referrer ?? null,
    session_id: data.sessionId ?? null,
    click_id: data.clickId ?? null,
    fbp: data.fbp ?? null,
    fbc: data.fbc ?? null,
    external_id: data.externalId ?? null,
    email_hash: data.emailHash ?? null,
    phone_hash: data.phoneHash ?? null,
    ip_hash: data.ipHash ?? null,
    user_agent: data.userAgent ?? null,
    value: data.value ?? null,
    currency: data.currency ?? null,
    order_id: data.orderId ?? null,
    campaign_id: data.campaignId ?? null,
    adset_id: data.adSetId ?? null,
    ad_id: data.adId ?? null,
    payload_json: data.payloadJson ?? null,
  };

  // Use upsert with ON CONFLICT DO NOTHING semantics via Prefer header.
  try {
    await rest('/tracking_events', {
      method: 'POST',
      headers: headers({
        Prefer: 'resolution=ignore-duplicates,return=headers-only',
      }),
      body: JSON.stringify([payload]),
    });
    return { inserted: true, updated: false };
  } catch {
    // Row already exists (conflict on store_id, event_id) -- attempt soft update
    if (data.eventId) {
      try {
        await rest(
          `/tracking_events?store_id=eq.${encodeURIComponent(data.storeId)}&event_id=eq.${encodeURIComponent(data.eventId)}`,
          {
            method: 'PATCH',
            headers: headers({ Prefer: 'return=minimal' }),
            body: JSON.stringify({
              click_id: data.clickId ?? undefined,
              value: data.value ?? undefined,
              currency: data.currency ?? undefined,
              order_id: data.orderId ?? undefined,
              campaign_id: data.campaignId ?? undefined,
              adset_id: data.adSetId ?? undefined,
              ad_id: data.adId ?? undefined,
              payload_json: data.payloadJson ?? undefined,
            }),
          }
        );
        return { inserted: false, updated: true };
      } catch {
        return { inserted: false, updated: false };
      }
    }
    return { inserted: false, updated: false };
  }
}

export async function markPersistentTrackingEventMetaDelivery(data: {
  storeId: string;
  eventId: string;
  forwarded: boolean;
  error?: string | null;
}): Promise<void> {
  await rest(
    `/tracking_events?store_id=eq.${encodeURIComponent(data.storeId)}&event_id=eq.${encodeURIComponent(data.eventId)}`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        meta_forwarded: data.forwarded,
        meta_last_attempt_at: new Date().toISOString(),
        meta_last_error: data.error ?? null,
      }),
    }
  );
}

// -- Signal scoring helper (mirrors computeSignalMatchScore from db.ts) --

function computeSignalMatchScore(args: {
  matchedSignals: Array<'click_id' | 'fbc' | 'fbp' | 'email_hash'>;
  source: 'browser' | 'server' | 'shopify';
  ageHours: number | null;
}): number {
  const has = new Set(args.matchedSignals);
  let score = 0;

  if (has.has('click_id')) score += 72;
  if (has.has('fbc')) score += 58;
  if (has.has('fbp')) score += 24;
  if (has.has('email_hash')) score += 12;

  if (has.has('click_id') && has.has('fbc')) score += 18;
  if (args.matchedSignals.length >= 2) score += (args.matchedSignals.length - 1) * 6;

  if (args.ageHours !== null) {
    const h = args.ageHours;
    if (h > 0) {
      const recencyMultiplier =
        h <= 1 ? 1 :
        h <= 6 ? 0.97 :
        h <= 24 ? 0.9 :
        h <= 72 ? 0.75 :
        h <= 168 ? 0.55 : 0.35;
      score *= recencyMultiplier;
    }
    if (args.matchedSignals.length === 1 && has.has('email_hash') && h > 120) {
      score *= 0.35;
    }
    if (args.matchedSignals.length === 1 && has.has('fbp') && h > 48) {
      score *= 0.6;
    }
  }

  if (args.source === 'shopify') {
    score *= 0.72;
  }

  return score;
}

export async function getPersistentScoredTrackingAttributionBySignals(
  input: DbTrackingAttributionLookupInput
): Promise<DbTrackingAttributionScored | null> {
  // Build OR filter for PostgREST
  const orParts: string[] = [];
  if (input.clickId) orParts.push(`click_id.eq.${encodeURIComponent(input.clickId)}`);
  if (input.fbc) orParts.push(`fbc.eq.${encodeURIComponent(input.fbc)}`);
  if (input.fbp) orParts.push(`fbp.eq.${encodeURIComponent(input.fbp)}`);
  if (input.emailHash) orParts.push(`email_hash.eq.${encodeURIComponent(input.emailHash)}`);
  if (orParts.length === 0) return null;

  let url =
    `/tracking_events?store_id=eq.${encodeURIComponent(input.storeId)}&or=(${orParts.join(',')})&event_name=neq.Refund&or=(campaign_id.not.is.null,adset_id.not.is.null,ad_id.not.is.null)&select=campaign_id,adset_id,ad_id,occurred_at,source,click_id,fbc,fbp,email_hash&order=occurred_at.desc&limit=250`;

  if (input.beforeIso) {
    url += `&occurred_at=lte.${encodeURIComponent(input.beforeIso)}`;
  }

  const rows = await rest<Array<{
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string | null;
    occurred_at: string;
    source: 'browser' | 'server' | 'shopify';
    click_id: string | null;
    fbc: string | null;
    fbp: string | null;
    email_hash: string | null;
  }>>(url);

  if (!rows || rows.length === 0) return null;

  const beforeTs =
    input.beforeIso && Number.isFinite(Date.parse(input.beforeIso))
      ? Date.parse(input.beforeIso)
      : null;

  let best: DbTrackingAttributionScored | null = null;
  for (const row of rows) {
    const matchedSignals: Array<'click_id' | 'fbc' | 'fbp' | 'email_hash'> = [];
    if (input.clickId && row.click_id === input.clickId) matchedSignals.push('click_id');
    if (input.fbc && row.fbc === input.fbc) matchedSignals.push('fbc');
    if (input.fbp && row.fbp === input.fbp) matchedSignals.push('fbp');
    if (input.emailHash && row.email_hash === input.emailHash) matchedSignals.push('email_hash');
    if (matchedSignals.length === 0) continue;

    let ageHours: number | null = null;
    if (beforeTs !== null) {
      const rowTs = Date.parse(row.occurred_at);
      if (Number.isFinite(rowTs)) {
        ageHours = Math.max(0, (beforeTs - rowTs) / (1000 * 60 * 60));
      }
    }

    const score = computeSignalMatchScore({
      matchedSignals,
      source: row.source,
      ageHours,
    });
    const confidence = Math.max(0.05, Math.min(0.98, score / 120));

    if (!best || score > best.score || (score === best.score && row.occurred_at > best.matchedAt)) {
      best = {
        campaignId: row.campaign_id ?? null,
        adSetId: row.adset_id ?? null,
        adId: row.ad_id ?? null,
        confidence,
        score,
        matchedSignals,
        matchedAt: row.occurred_at,
        source: row.source,
        ageHours,
      };
    }
  }

  return best;
}

export async function getPersistentTrackingAttributionByTimeProximity(input: {
  storeId: string;
  occurredAt: string;
  windowMinutes?: number;
}): Promise<DbTrackingAttributionTimeProximity | null> {
  const windowMinutes = Math.max(2, Math.min(60, Math.floor(input.windowMinutes ?? 10)));
  const occurredTs = Date.parse(input.occurredAt);
  if (!Number.isFinite(occurredTs)) return null;

  const windowMs = windowMinutes * 60 * 1000;
  const lower = new Date(occurredTs - windowMs).toISOString();
  const upper = new Date(occurredTs + windowMs).toISOString();

  const rows = await rest<Array<{
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string | null;
    occurred_at: string;
    source: 'browser' | 'server' | 'shopify';
  }>>(
    `/tracking_events?store_id=eq.${encodeURIComponent(input.storeId)}&event_name=eq.Purchase&or=(campaign_id.not.is.null,adset_id.not.is.null,ad_id.not.is.null)&occurred_at=gte.${encodeURIComponent(lower)}&occurred_at=lte.${encodeURIComponent(upper)}&select=campaign_id,adset_id,ad_id,occurred_at,source&order=occurred_at.desc&limit=8`
  );

  if (!rows || rows.length === 0) return null;

  const scored = rows
    .map((row) => {
      const rowTs = Date.parse(row.occurred_at);
      if (!Number.isFinite(rowTs)) return null;
      const diffSeconds = Math.abs(Math.round((occurredTs - rowTs) / 1000));
      return { row, diffSeconds };
    })
    .filter((item): item is { row: typeof rows[number]; diffSeconds: number } => item !== null);

  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (a.diffSeconds !== b.diffSeconds) return a.diffSeconds - b.diffSeconds;
    return Date.parse(b.row.occurred_at) - Date.parse(a.row.occurred_at);
  });

  const best = scored[0];
  const bestKey = `${best.row.campaign_id || ''}|${best.row.adset_id || ''}|${best.row.ad_id || ''}`;

  const nearestDifferent = scored.find((entry) => {
    const key = `${entry.row.campaign_id || ''}|${entry.row.adset_id || ''}|${entry.row.ad_id || ''}`;
    return key !== bestKey;
  });
  if (nearestDifferent && nearestDifferent.diffSeconds - best.diffSeconds <= 120) {
    return null;
  }

  let confidence = 0.42;
  if (best.diffSeconds <= 60) confidence = 0.76;
  else if (best.diffSeconds <= 3 * 60) confidence = 0.72;
  else if (best.diffSeconds <= 5 * 60) confidence = 0.67;
  else if (best.diffSeconds <= 10 * 60) confidence = 0.6;
  else if (best.diffSeconds <= 15 * 60) confidence = 0.53;

  return {
    campaignId: best.row.campaign_id ?? null,
    adSetId: best.row.adset_id ?? null,
    adId: best.row.ad_id ?? null,
    confidence,
    score: Math.round(confidence * 100),
    matchedAt: best.row.occurred_at,
    source: best.row.source,
    ageHours: best.diffSeconds / 3600,
  };
}

// ------ Entity Metrics ------

export async function getPersistentTrackingEntityMetrics(
  storeId: string,
  sinceIso: string,
  untilIso: string
): Promise<DbTrackingEntityMetricRow[]> {
  // Fetch order_id, event_id, and source so we can deduplicate in JS
  const rows = await rest<Array<{
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string | null;
    event_name: string;
    value: number | null;
    order_id: string | null;
    event_id: string | null;
    source: string | null;
    occurred_at: string | null;
  }>>(
    `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&occurred_at=gte.${encodeURIComponent(sinceIso)}&occurred_at=lte.${encodeURIComponent(untilIso)}&or=(campaign_id.not.is.null,adset_id.not.is.null,ad_id.not.is.null)&select=campaign_id,adset_id,ad_id,event_name,value,order_id,event_id,source,occurred_at`
  );

  // Deduplicate by order_id to prevent double-counting when both browser pixel
  // and Shopify webhook/backfill create Purchase events for the same order.
  // Group by COALESCE(order_id, event_id), keep shopify-source preferred.
  const dedupMap = new Map<string, typeof rows[number]>();
  const sourceRank = (s: string | null) => s === 'shopify' ? 0 : s === 'server' ? 1 : 2;
  for (const row of rows) {
    const dedupKey = row.order_id || row.event_id || '';
    const existing = dedupMap.get(dedupKey);
    if (!existing) {
      dedupMap.set(dedupKey, row);
    } else {
      // Prefer shopify source, then more recent
      const existingRank = sourceRank(existing.source);
      const newRank = sourceRank(row.source);
      if (newRank < existingRank || (newRank === existingRank && (row.occurred_at || '') > (existing.occurred_at || ''))) {
        dedupMap.set(dedupKey, row);
      }
    }
  }

  const resultEvents = new Set([
    'Purchase', 'Lead', 'CompleteRegistration', 'Contact',
    'SubmitApplication', 'Subscribe', 'StartTrial', 'AddPaymentInfo',
    'InitiateCheckout', 'AddToCart',
  ]);

  const buckets = new Map<string, DbTrackingEntityMetricRow>();
  for (const row of dedupMap.values()) {
    const key = `${row.campaign_id || ''}|${row.adset_id || ''}|${row.ad_id || ''}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        campaign_id: row.campaign_id,
        adset_id: row.adset_id,
        ad_id: row.ad_id,
        results: 0,
        purchases: 0,
        purchase_value: 0,
      });
    }
    const bucket = buckets.get(key)!;
    if (resultEvents.has(row.event_name)) bucket.results += 1;
    if (row.event_name === 'Purchase') {
      bucket.purchases += 1;
      bucket.purchase_value += Number(row.value || 0);
    }
  }
  return [...buckets.values()];
}

// ------ Bulk Mapping ------

/**
 * Bulk-map unmapped Purchase events using signal overlap with existing tracked
 * events that have entity IDs. Fetches both sets, matches in JS, then batch-PATCHes.
 * This is the Supabase equivalent of the SQLite bulkMapUnmappedPurchases function.
 */
export async function bulkMapPersistentUnmappedPurchases(storeId: string, sinceIso: string): Promise<number> {
  // 1. Fetch unmapped Purchase events with signals
  const unmapped = await rest<Array<{
    event_id: string;
    click_id: string | null;
    fbc: string | null;
    fbp: string | null;
    email_hash: string | null;
    occurred_at: string;
  }>>(
    `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&event_name=eq.Purchase&campaign_id=is.null&adset_id=is.null&ad_id=is.null&occurred_at=gte.${encodeURIComponent(sinceIso)}&or=(click_id.not.is.null,fbc.not.is.null,fbp.not.is.null,email_hash.not.is.null)&select=event_id,click_id,fbc,fbp,email_hash,occurred_at&limit=500`
  );
  if (unmapped.length === 0) return 0;

  // 2. Fetch tracked events that HAVE entity IDs (these are from pixel tracking)
  const mapped = await rest<Array<{
    click_id: string | null;
    fbc: string | null;
    fbp: string | null;
    email_hash: string | null;
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string | null;
    occurred_at: string;
  }>>(
    `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&campaign_id=not.is.null&occurred_at=gte.${encodeURIComponent(sinceIso)}&select=click_id,fbc,fbp,email_hash,campaign_id,adset_id,ad_id,occurred_at&limit=5000`
  );
  if (mapped.length === 0) return 0;

  // 3. Build signal → entity lookup maps (priority: click_id > fbc > fbp > email_hash)
  const clickMap = new Map<string, typeof mapped[0]>();
  const fbcMap = new Map<string, typeof mapped[0]>();
  const fbpMap = new Map<string, typeof mapped[0]>();
  const emailMap = new Map<string, typeof mapped[0]>();
  for (const m of mapped) {
    if (m.click_id && !clickMap.has(m.click_id)) clickMap.set(m.click_id, m);
    if (m.fbc && !fbcMap.has(m.fbc)) fbcMap.set(m.fbc, m);
    if (m.fbp && !fbpMap.has(m.fbp)) fbpMap.set(m.fbp, m);
    if (m.email_hash && !emailMap.has(m.email_hash)) emailMap.set(m.email_hash, m);
  }

  // 4. Match and batch-update
  let updated = 0;
  for (const p of unmapped) {
    const match = (p.click_id && clickMap.get(p.click_id))
      || (p.fbc && fbcMap.get(p.fbc))
      || (p.fbp && fbpMap.get(p.fbp))
      || (p.email_hash && emailMap.get(p.email_hash))
      || null;
    if (!match) continue;
    try {
      await rest(
        `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&event_id=eq.${encodeURIComponent(p.event_id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            campaign_id: match.campaign_id,
            adset_id: match.adset_id,
            ad_id: match.ad_id,
          }),
        }
      );
      updated++;
    } catch {
      // Best-effort — continue with remaining
    }
  }
  return updated;
}

// ------ Attribution Coverage ------

export async function getPersistentTrackingAttributionCoverage(
  storeId: string,
  sinceIso: string,
  untilIso: string
): Promise<DbTrackingCoverageRow> {
  // Fetch order_id, event_id, source for deduplication
  const rows = await rest<Array<{
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string | null;
    order_id: string | null;
    event_id: string | null;
    source: string | null;
    occurred_at: string | null;
  }>>(
    `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&event_name=eq.Purchase&occurred_at=gte.${encodeURIComponent(sinceIso)}&occurred_at=lte.${encodeURIComponent(untilIso)}&select=campaign_id,adset_id,ad_id,order_id,event_id,source,occurred_at`
  );

  // Deduplicate by order_id — same logic as entity-metrics
  const dedupMap = new Map<string, typeof rows[number]>();
  const sourceRank = (s: string | null) => s === 'shopify' ? 0 : s === 'server' ? 1 : 2;
  for (const row of rows) {
    const dedupKey = row.order_id || row.event_id || '';
    const existing = dedupMap.get(dedupKey);
    if (!existing) {
      dedupMap.set(dedupKey, row);
    } else {
      const existingRank = sourceRank(existing.source);
      const newRank = sourceRank(row.source);
      if (newRank < existingRank || (newRank === existingRank && (row.occurred_at || '') > (existing.occurred_at || ''))) {
        dedupMap.set(dedupKey, row);
      }
    }
  }

  let totalPurchases = 0;
  let mappedPurchases = 0;
  let mappedCampaign = 0;
  let mappedAdset = 0;
  let mappedAd = 0;

  for (const row of dedupMap.values()) {
    totalPurchases += 1;
    const isMapped = !!(row.campaign_id || row.adset_id || row.ad_id);
    if (isMapped) mappedPurchases += 1;
    if (row.campaign_id) mappedCampaign += 1;
    if (row.adset_id) mappedAdset += 1;
    if (row.ad_id) mappedAd += 1;
  }

  return {
    total_purchases: totalPurchases,
    mapped_purchases: mappedPurchases,
    mapped_campaign: mappedCampaign,
    mapped_adset: mappedAdset,
    mapped_ad: mappedAd,
  };
}

// ------ Top Mapped Entities ------

export async function getPersistentTrackingTopMappedEntities(
  storeId: string,
  sinceIso: string,
  untilIso: string,
  level: 'campaign' | 'adset' | 'ad',
  limit = 20
): Promise<DbTrackingTopEntityRow[]> {
  const col =
    level === 'campaign' ? 'campaign_id' : level === 'adset' ? 'adset_id' : 'ad_id';
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));

  const rows = await rest<Array<{ [key: string]: string | number | null }>>(
    `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&event_name=eq.Purchase&occurred_at=gte.${encodeURIComponent(sinceIso)}&occurred_at=lte.${encodeURIComponent(untilIso)}&${col}=not.is.null&select=${col},value`
  );

  const buckets = new Map<string, { purchases: number; purchase_value: number }>();
  for (const row of rows) {
    const entityId = String(row[col] || '').trim();
    if (!entityId) continue;
    const existing = buckets.get(entityId) || { purchases: 0, purchase_value: 0 };
    existing.purchases += 1;
    existing.purchase_value += Number(row.value || 0);
    buckets.set(entityId, existing);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[1].purchases - a[1].purchases || b[1].purchase_value - a[1].purchase_value)
    .slice(0, safeLimit)
    .map(([entityId, d]) => ({
      entity_id: entityId,
      purchases: d.purchases,
      purchase_value: d.purchase_value,
    }));
}

// ------ Recent Unattributed Purchases ------

export async function getPersistentTrackingRecentUnattributedPurchases(
  storeId: string,
  sinceIso: string,
  untilIso: string,
  limit = 25
): Promise<DbTrackingUnattributedPurchaseRow[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  return rest<DbTrackingUnattributedPurchaseRow[]>(
    `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&event_name=eq.Purchase&occurred_at=gte.${encodeURIComponent(sinceIso)}&occurred_at=lte.${encodeURIComponent(untilIso)}&campaign_id=is.null&adset_id=is.null&ad_id=is.null&select=event_id,order_id,occurred_at,value,currency&order=occurred_at.desc&limit=${safeLimit}`
  );
}

// ------ Recent Purchases With Mapping ------

export async function getPersistentTrackingRecentPurchasesWithMapping(
  storeId: string,
  sinceIso: string,
  untilIso: string,
  limit = 50
): Promise<DbTrackingPurchaseLiveRow[]> {
  const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));
  return rest<DbTrackingPurchaseLiveRow[]>(
    `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&event_name=eq.Purchase&occurred_at=gte.${encodeURIComponent(sinceIso)}&occurred_at=lte.${encodeURIComponent(untilIso)}&select=event_id,order_id,occurred_at,source,value,currency,campaign_id,adset_id,ad_id,click_id,fbc,fbp,email_hash,payload_json&order=occurred_at.desc&limit=${safeLimit}`
  );
}

// ------ Event Summaries ------

export async function getPersistentTrackingEventSummaries(
  storeId: string
): Promise<DbTrackingEventSummary[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await rest<Array<{
    event_name: string;
    occurred_at: string;
  }>>(
    `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&occurred_at=gte.${encodeURIComponent(sevenDaysAgo)}&select=event_name,occurred_at&order=occurred_at.desc`
  );

  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgoMs = now - 7 * 24 * 60 * 60 * 1000;

  const buckets = new Map<string, DbTrackingEventSummary>();
  for (const row of rows) {
    if (!buckets.has(row.event_name)) {
      buckets.set(row.event_name, {
        event_name: row.event_name,
        last_fired: null,
        count_24h: 0,
        count_7d: 0,
      });
    }
    const bucket = buckets.get(row.event_name)!;
    const ts = Date.parse(row.occurred_at);
    if (!bucket.last_fired || row.occurred_at > bucket.last_fired) {
      bucket.last_fired = row.occurred_at;
    }
    if (ts >= twentyFourHoursAgo) bucket.count_24h += 1;
    if (ts >= sevenDaysAgoMs) bucket.count_7d += 1;
  }

  return [...buckets.values()];
}

// ------ Latest Tracking Event At ------

export async function getLatestPersistentTrackingEventAt(
  storeId: string
): Promise<string | null> {
  const rows = await rest<Array<{ occurred_at: string }>>(
    `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&select=occurred_at&order=occurred_at.desc&limit=1`
  );
  return rows[0]?.occurred_at ?? null;
}

// ------ Count Server Events 24h ------

export async function countPersistentTrackingServerEvents24h(
  storeId: string
): Promise<number> {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&source=eq.server&occurred_at=gte.${encodeURIComponent(sinceIso)}&select=id`,
      {
        headers: {
          ...headers(),
          Prefer: 'count=exact',
          Range: '0-0',
        },
        cache: 'no-store',
      }
    );
    const contentRange = res.headers.get('content-range');
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)/);
      if (match) return Number(match[1]);
    }
    return 0;
  } catch {
    return 0;
  }
}

// ------ Events Since ------

export async function getPersistentTrackingEventsSince(
  storeId: string,
  sinceIso: string
): Promise<DbTrackingEvent[]> {
  return rest<DbTrackingEvent[]>(
    `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&occurred_at=gte.${encodeURIComponent(sinceIso)}&select=*&order=occurred_at.asc`
  );
}
