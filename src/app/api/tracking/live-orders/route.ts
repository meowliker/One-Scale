import { fromZonedTime, format as formatTz, toZonedTime } from 'date-fns-tz';
import { NextRequest, NextResponse } from 'next/server';
import {
  getRecentMetaEndpointSnapshots,
  getStoreAdAccounts,
  getTrackingRecentPurchasesWithMapping,
} from '@/app/api/lib/db';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { getMetaToken } from '@/app/api/lib/tokens';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CampaignLookupRow {
  id?: string;
  name?: string;
}

interface FallbackAttributionMeta {
  confidence?: number;
  score?: number;
  matchedSignals?: Array<'click_id' | 'fbc' | 'fbp' | 'email_hash'>;
  matchedAt?: string;
  source?: 'browser' | 'server' | 'shopify';
  ageHours?: number | null;
}

function parseFallbackAttribution(raw: string | null): FallbackAttributionMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fallback = (parsed.fallbackAttribution ?? parsed.fallback_attribution) as Record<string, unknown> | null;
    if (!fallback || typeof fallback !== 'object') return null;
    const confidence = Number(fallback.confidence);
    if (!Number.isFinite(confidence)) return null;
    return {
      confidence,
      score: Number.isFinite(Number(fallback.score)) ? Number(fallback.score) : undefined,
      matchedSignals: Array.isArray(fallback.matchedSignals)
        ? (fallback.matchedSignals.filter((v): v is 'click_id' | 'fbc' | 'fbp' | 'email_hash' =>
            v === 'click_id' || v === 'fbc' || v === 'fbp' || v === 'email_hash'))
        : undefined,
      matchedAt: typeof fallback.matchedAt === 'string' ? fallback.matchedAt : undefined,
      source:
        fallback.source === 'browser' || fallback.source === 'server' || fallback.source === 'shopify'
          ? fallback.source
          : undefined,
      ageHours: Number.isFinite(Number(fallback.ageHours)) ? Number(fallback.ageHours) : null,
    };
  } catch {
    return null;
  }
}

const CAMPAIGN_LOOKUP_TTL_MS = 30 * 60 * 1000;
const campaignLookupCache = new Map<string, { at: number; map: Map<string, string> }>();
const DEFAULT_TZ = 'America/New_York';

function getStoreTimezone(storeId: string): string {
  const accounts = getStoreAdAccounts(storeId).filter((a) => a.platform === 'meta' && a.is_active === 1);
  const tz = accounts.find((a) => a.timezone)?.timezone || accounts[0]?.timezone || DEFAULT_TZ;
  return tz || DEFAULT_TZ;
}

function getTodayBoundsInTz(tz: string): { startIso: string; endIso: string; dateLabel: string } {
  const now = new Date();
  const zoned = toZonedTime(now, tz);
  const dateLabel = formatTz(zoned, 'yyyy-MM-dd', { timeZone: tz });
  return {
    startIso: fromZonedTime(`${dateLabel}T00:00:00`, tz).toISOString(),
    endIso: fromZonedTime(`${dateLabel}T23:59:59.999`, tz).toISOString(),
    dateLabel,
  };
}

async function getCampaignNameLookup(storeId: string): Promise<Map<string, string>> {
  const cached = campaignLookupCache.get(storeId);
  if (cached && Date.now() - cached.at < CAMPAIGN_LOOKUP_TTL_MS) {
    return cached.map;
  }

  const lookup = new Map<string, string>();
  const token = await getMetaToken(storeId);
  if (!token?.accessToken) {
    campaignLookupCache.set(storeId, { at: Date.now(), map: lookup });
    return lookup;
  }

  const accountIds = getStoreAdAccounts(storeId)
    .filter((row) => row.platform === 'meta' && row.is_active === 1)
    .map((row) => row.ad_account_id);

  await Promise.all(
    accountIds.map(async (accountId) => {
      try {
        const response = await fetchFromMeta<{ data?: CampaignLookupRow[] }>(
          token.accessToken,
          `/${accountId}/campaigns`,
          { fields: 'id,name', limit: '300' },
          10_000,
          0
        );
        for (const row of response.data || []) {
          const id = String(row.id || '').trim();
          const name = String(row.name || '').trim();
          if (!id || !name) continue;
          if (!lookup.has(id)) lookup.set(id, name);
        }
      } catch {
        // best-effort name hydration only
      }
    })
  );

  campaignLookupCache.set(storeId, { at: Date.now(), map: lookup });
  return lookup;
}

function getSnapshotNameLookups(storeId: string): {
  adSetById: Map<string, string>;
  adById: Map<string, string>;
} {
  const adSetById = new Map<string, string>();
  const adById = new Map<string, string>();

  const adSetSnapshots = getRecentMetaEndpointSnapshots<unknown[]>(storeId, 'adsets', 200);
  for (const snap of adSetSnapshots) {
    if (!Array.isArray(snap.data)) continue;
    for (const raw of snap.data) {
      const row = raw as Record<string, unknown>;
      const id = String(row.id || '').trim();
      const name = String(row.name || '').trim();
      if (!id || !name) continue;
      if (!adSetById.has(id)) adSetById.set(id, name);
    }
  }

  const adSnapshots = getRecentMetaEndpointSnapshots<unknown[]>(storeId, 'ads', 200);
  for (const snap of adSnapshots) {
    if (!Array.isArray(snap.data)) continue;
    for (const raw of snap.data) {
      const row = raw as Record<string, unknown>;
      const id = String(row.id || '').trim();
      const name = String(row.name || '').trim();
      if (!id || !name) continue;
      if (!adById.has(id)) adById.set(id, name);
    }
  }

  return { adSetById, adById };
}

function scorePurchaseRow(row: Awaited<ReturnType<typeof getTrackingRecentPurchasesWithMapping>>[number]): number {
  let score = 0;
  if (row.source === 'shopify') score += 4;
  if (row.campaign_id || row.adset_id || row.ad_id) score += 2;
  if (row.click_id || row.fbc || row.fbp || row.email_hash) score += 1;
  return score;
}

function dedupePurchaseRows(
  rows: Awaited<ReturnType<typeof getTrackingRecentPurchasesWithMapping>>
): Awaited<ReturnType<typeof getTrackingRecentPurchasesWithMapping>> {
  const byOrderId = new Map<string, Awaited<ReturnType<typeof getTrackingRecentPurchasesWithMapping>>[number]>();
  const fallbackRows: Array<Awaited<ReturnType<typeof getTrackingRecentPurchasesWithMapping>>[number]> = [];

  for (const row of rows) {
    const orderId = String(row.order_id || '').trim();
    if (!orderId) {
      fallbackRows.push(row);
      continue;
    }
    const current = byOrderId.get(orderId);
    if (!current || scorePurchaseRow(row) > scorePurchaseRow(current)) {
      byOrderId.set(orderId, row);
    }
  }

  return [...byOrderId.values(), ...fallbackRows].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const limitParsed = Number(searchParams.get('limit') || '40');
  const liveLimit = Number.isFinite(limitParsed) ? Math.max(10, Math.min(120, Math.floor(limitParsed))) : 40;

  try {
    const timezone = getStoreTimezone(storeId);
    const bounds = getTodayBoundsInTz(timezone);
    const nowIso = new Date().toISOString();
    const allTodayRowsRaw = getTrackingRecentPurchasesWithMapping(storeId, bounds.startIso, nowIso, 5000);
    const allTodayRows = dedupePurchaseRows(allTodayRowsRaw);
    const rows = allTodayRows.slice(0, liveLimit);
    const [campaignLookup] = await Promise.all([getCampaignNameLookup(storeId)]);
    const snapshotLookup = getSnapshotNameLookups(storeId);

    const mappedRevenue = allTodayRows.reduce((sum, row) => {
      const mapped = !!(row.campaign_id || row.adset_id || row.ad_id);
      return sum + (mapped ? Number(row.value || 0) : 0);
    }, 0);
    const totalRevenue = allTodayRows.reduce((sum, row) => sum + Number(row.value || 0), 0);
    const mappedPurchases = allTodayRows.filter((row) => !!(row.campaign_id || row.adset_id || row.ad_id)).length;
    const totalPurchases = allTodayRows.length;

    const mappedPercent =
      totalPurchases > 0
        ? Math.round((mappedPurchases / totalPurchases) * 10000) / 100
        : 0;

    return NextResponse.json(
      {
        data: {
          dateLabel: bounds.dateLabel,
          timezone,
          today: {
            totalPurchases,
            mappedPurchases,
            unmappedPurchases: Math.max(totalPurchases - mappedPurchases, 0),
            mappedPercent,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            mappedRevenue: Math.round(mappedRevenue * 100) / 100,
          },
          liveOrders: rows.map((row) => {
            const mapped = !!(row.campaign_id || row.adset_id || row.ad_id);
            const hasSignal = !!(row.click_id || row.fbc || row.fbp || row.email_hash);
            const fallback = parseFallbackAttribution(row.payload_json);
            return {
              eventId: row.event_id,
              orderId: row.order_id,
              occurredAt: row.occurred_at,
              value: Number(row.value || 0),
              currency: row.currency || 'USD',
              source: row.source,
              mapped,
              hasSignal,
              mappingType: mapped
                ? fallback
                  ? 'modeled'
                  : 'deterministic'
                : hasSignal
                  ? 'signal_only'
                  : 'no_signal',
              fallbackConfidence: fallback?.confidence ?? null,
              fallbackMatchedSignals: fallback?.matchedSignals || [],
              campaignId: row.campaign_id,
              adSetId: row.adset_id,
              adId: row.ad_id,
              campaignName: row.campaign_id ? campaignLookup.get(row.campaign_id) || row.campaign_id : null,
              adSetName: row.adset_id ? snapshotLookup.adSetById.get(row.adset_id) || row.adset_id : null,
              adName: row.ad_id ? snapshotLookup.adById.get(row.ad_id) || row.ad_id : null,
            };
          }),
          updatedAt: new Date().toISOString(),
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load live order mapping';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
