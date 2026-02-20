import { NextRequest, NextResponse } from 'next/server';
import {
  getRecentMetaEndpointSnapshots,
  getStoreAdAccounts,
  getTrackingAttributionCoverage,
  getTrackingRecentPurchasesWithMapping,
  getTrackingRecentUnattributedPurchases,
  getTrackingTopMappedEntities,
} from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled, listPersistentStoreAdAccounts } from '@/app/api/lib/supabase-persistence';
import {
  getRecentPersistentMetaEndpointSnapshots,
  getPersistentTrackingAttributionCoverage,
  getPersistentTrackingRecentPurchasesWithMapping,
  getPersistentTrackingRecentUnattributedPurchases,
  getPersistentTrackingTopMappedEntities,
} from '@/app/api/lib/supabase-tracking';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { getMetaToken } from '@/app/api/lib/tokens';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

interface CampaignLookupRow {
  id?: string;
  name?: string;
}

interface CoverageDashboardEntityRow {
  id: string;
  name: string;
  purchases: number;
  purchaseValue: number;
}

type DiagnosticReasonCode =
  | 'no_signal'
  | 'utm_only'
  | 'signal_only'
  | 'first_touch_only'
  | 'unresolved_mapping';

interface UnmappedSignalSummary {
  hasSignal: boolean;
  hasUtm: boolean;
  hasFirstTouch: boolean;
  reasonCode: DiagnosticReasonCode;
  reasonLabel: string;
}

const CAMPAIGN_LOOKUP_TTL_MS = 30 * 60 * 1000;
const campaignLookupCache = new Map<string, { at: number; map: Map<string, string> }>();

function clampDays(raw: string | null): number {
  const parsed = Number(raw ?? '7');
  if (!Number.isFinite(parsed)) return 7;
  return Math.max(1, Math.min(30, Math.floor(parsed)));
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

  const sb = isSupabasePersistenceEnabled();
  const allAccounts = sb
    ? await listPersistentStoreAdAccounts(storeId)
    : getStoreAdAccounts(storeId);
  const accountIds = allAccounts
    .filter((row) => row.platform === 'meta' && (row.is_active === 1 || (row.is_active as unknown) === true))
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
        // Best-effort only. We still return IDs when names are unavailable.
      }
    })
  );

  campaignLookupCache.set(storeId, { at: Date.now(), map: lookup });
  return lookup;
}

async function getSnapshotNameLookups(storeId: string): Promise<{
  adSetById: Map<string, string>;
  adById: Map<string, string>;
}> {
  const sb = isSupabasePersistenceEnabled();
  const adSetById = new Map<string, string>();
  const adById = new Map<string, string>();

  const adSetSnapshots = sb
    ? await getRecentPersistentMetaEndpointSnapshots<unknown[]>(storeId, 'adsets', 200)
    : getRecentMetaEndpointSnapshots<unknown[]>(storeId, 'adsets', 200);
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

  const adSnapshots = sb
    ? await getRecentPersistentMetaEndpointSnapshots<unknown[]>(storeId, 'ads', 200)
    : getRecentMetaEndpointSnapshots<unknown[]>(storeId, 'ads', 200);
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

function mapRows(
  rows: Array<{ entity_id: string; purchases: number; purchase_value: number }>,
  names: Map<string, string>
): CoverageDashboardEntityRow[] {
  return rows.map((row) => ({
    id: row.entity_id,
    name: names.get(row.entity_id) || row.entity_id,
    purchases: Number(row.purchases || 0),
    purchaseValue: Number(row.purchase_value || 0),
  }));
}

function parseJsonSafe(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNestedString(payload: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    const segments = path.split('.');
    let cursor: unknown = payload;
    for (const segment of segments) {
      if (!cursor || typeof cursor !== 'object') {
        cursor = null;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    const value = readString(cursor);
    if (value) return value;
  }
  return null;
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
    const decodedValue = readString(decodeUrlComponentSafe(valueRaw));
    if (decodedValue) return decodedValue;
  }
  return null;
}

function readNoteAttribute(payload: Record<string, unknown>, keys: string[]): string | null {
  const rawAttrs = payload.note_attributes || payload.noteAttributes;
  if (!Array.isArray(rawAttrs)) return null;
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  for (const raw of rawAttrs) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const name = readString(row.name)?.toLowerCase();
    if (!name || !keySet.has(name)) continue;
    const value = readString(row.value);
    if (value) return value;
  }
  return null;
}

function summarizeUnmappedSignals(row: { click_id: string | null; fbc: string | null; fbp: string | null; email_hash: string | null; payload_json: string | null }): UnmappedSignalSummary {
  const payload = parseJsonSafe(row.payload_json);

  const hasSignal = Boolean(row.click_id || row.fbc || row.fbp || row.email_hash);
  const hasUtm = Boolean(
    readNestedString(payload, ['utmCampaign', 'utm_campaign', 'properties.utmCampaign', 'properties.utm_campaign']) ||
      readNestedString(payload, ['utmMedium', 'utm_medium', 'properties.utmMedium', 'properties.utm_medium']) ||
      readNestedString(payload, ['utmContent', 'utm_content', 'properties.utmContent', 'properties.utm_content']) ||
      readQueryParam(
        readNestedString(payload, [
          'landing_site',
          'landingSite',
          'landing_site_ref',
          'landingSiteRef',
          'referring_site',
          'referringSite',
          'pageUrl',
          'order_status_url',
          'orderStatusUrl',
        ]),
        ['utm_campaign', 'utm_medium', 'utm_content']
      ) ||
      readNoteAttribute(payload, [
        '_tw_utm_campaign',
        '_tw_utm_medium',
        '_tw_utm_content',
        '_tw_ft_utm_campaign',
        '_tw_ft_utm_medium',
        '_tw_ft_utm_content',
        '_tw_first_utm_campaign',
        '_tw_first_utm_medium',
        '_tw_first_utm_content',
      ])
  );
  const hasFirstTouch = Boolean(
    readNestedString(payload, [
      'firstTouchCampaignId',
      'firstTouchAdSetId',
      'firstTouchAdId',
      'firstTouchClickId',
      'firstTouchUtmCampaign',
      'firstTouchUtmMedium',
      'firstTouchUtmContent',
      'properties.firstTouchCampaignId',
      'properties.firstTouchAdSetId',
      'properties.firstTouchAdId',
      'properties.firstTouchClickId',
    ]) ||
      readNoteAttribute(payload, [
        '_tw_ft_campaign_id',
        '_tw_ft_adset_id',
        '_tw_ft_ad_id',
        '_tw_ft_click_id',
        '_tw_ft_utm_campaign',
        '_tw_ft_utm_medium',
        '_tw_ft_utm_content',
        '_tw_first_campaign_id',
        '_tw_first_adset_id',
        '_tw_first_ad_id',
        '_tw_first_click_id',
        '_tw_first_utm_campaign',
        '_tw_first_utm_medium',
        '_tw_first_utm_content',
      ])
  );

  let reasonCode: DiagnosticReasonCode = 'unresolved_mapping';
  let reasonLabel = 'Signal present but mapping unresolved';

  if (!hasSignal && !hasUtm && !hasFirstTouch) {
    reasonCode = 'no_signal';
    reasonLabel = 'No signal captured';
  } else if (hasUtm && !hasSignal) {
    reasonCode = 'utm_only';
    reasonLabel = 'UTM present, click/session signal missing';
  } else if (hasSignal && !hasUtm) {
    reasonCode = 'signal_only';
    reasonLabel = 'Click/session signal present, UTM missing';
  } else if (hasFirstTouch && !hasSignal) {
    reasonCode = 'first_touch_only';
    reasonLabel = 'First-touch found, no current click/session signal';
  }

  return { hasSignal, hasUtm, hasFirstTouch, reasonCode, reasonLabel };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const days = clampDays(searchParams.get('days'));
  const untilIso = new Date().toISOString();
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const sb = isSupabasePersistenceEnabled();
    const coverage = sb
      ? await getPersistentTrackingAttributionCoverage(storeId, sinceIso, untilIso)
      : getTrackingAttributionCoverage(storeId, sinceIso, untilIso);
    const sampleLimit = Math.max(300, Math.min(10_000, coverage.total_purchases || 1_000));
    const [campaignRows, adSetRows, adRows, unattributedRows, recentPurchases, campaignNames, snapshotLookups] = await Promise.all([
      sb
        ? getPersistentTrackingTopMappedEntities(storeId, sinceIso, untilIso, 'campaign', 12)
        : getTrackingTopMappedEntities(storeId, sinceIso, untilIso, 'campaign', 12),
      sb
        ? getPersistentTrackingTopMappedEntities(storeId, sinceIso, untilIso, 'adset', 12)
        : getTrackingTopMappedEntities(storeId, sinceIso, untilIso, 'adset', 12),
      sb
        ? getPersistentTrackingTopMappedEntities(storeId, sinceIso, untilIso, 'ad', 12)
        : getTrackingTopMappedEntities(storeId, sinceIso, untilIso, 'ad', 12),
      sb
        ? getPersistentTrackingRecentUnattributedPurchases(storeId, sinceIso, untilIso, 30)
        : getTrackingRecentUnattributedPurchases(storeId, sinceIso, untilIso, 30),
      sb
        ? getPersistentTrackingRecentPurchasesWithMapping(storeId, sinceIso, untilIso, sampleLimit)
        : getTrackingRecentPurchasesWithMapping(storeId, sinceIso, untilIso, sampleLimit),
      getCampaignNameLookup(storeId),
      getSnapshotNameLookups(storeId),
    ]);

    const percent =
      coverage.total_purchases > 0
        ? Math.round((coverage.mapped_purchases / coverage.total_purchases) * 10000) / 100
        : 0;
    const unmappedRows = recentPurchases.filter((row) => !(row.campaign_id || row.adset_id || row.ad_id));
    const diagnosticCounts = new Map<DiagnosticReasonCode, number>();
    const diagnosticSample = unmappedRows.slice(0, 30).map((row) => {
      const summary = summarizeUnmappedSignals(row);
      diagnosticCounts.set(summary.reasonCode, (diagnosticCounts.get(summary.reasonCode) || 0) + 1);
      return {
        eventId: row.event_id,
        orderId: row.order_id,
        occurredAt: row.occurred_at,
        value: Number(row.value || 0),
        currency: row.currency || 'USD',
        reasonCode: summary.reasonCode,
        reasonLabel: summary.reasonLabel,
        hasSignal: summary.hasSignal,
        hasUtm: summary.hasUtm,
        hasFirstTouch: summary.hasFirstTouch,
      };
    });

    for (const row of unmappedRows.slice(30)) {
      const summary = summarizeUnmappedSignals(row);
      diagnosticCounts.set(summary.reasonCode, (diagnosticCounts.get(summary.reasonCode) || 0) + 1);
    }

    return NextResponse.json(
      {
        data: {
          windowDays: days,
          sinceIso,
          untilIso,
          coverage: {
            totalPurchases: coverage.total_purchases,
            mappedPurchases: coverage.mapped_purchases,
            mappedCampaign: coverage.mapped_campaign,
            mappedAdSet: coverage.mapped_adset,
            mappedAd: coverage.mapped_ad,
            percent,
            unattributedPurchases: Math.max(coverage.total_purchases - coverage.mapped_purchases, 0),
          },
          topCampaigns: mapRows(campaignRows, campaignNames),
          topAdSets: mapRows(adSetRows, snapshotLookups.adSetById),
          topAds: mapRows(adRows, snapshotLookups.adById),
          recentUnattributedPurchases: unattributedRows.map((row) => ({
            eventId: row.event_id,
            orderId: row.order_id,
            occurredAt: row.occurred_at,
            value: Number(row.value || 0),
            currency: row.currency || 'USD',
          })),
          diagnostics: {
            sampledPurchases: recentPurchases.length,
            sampledUnmappedPurchases: unmappedRows.length,
            reasonCounts: [
              { code: 'no_signal', label: 'No signal captured', count: diagnosticCounts.get('no_signal') || 0 },
              { code: 'utm_only', label: 'UTM present, click/session signal missing', count: diagnosticCounts.get('utm_only') || 0 },
              { code: 'signal_only', label: 'Click/session signal present, UTM missing', count: diagnosticCounts.get('signal_only') || 0 },
              { code: 'first_touch_only', label: 'First-touch found, no current click/session signal', count: diagnosticCounts.get('first_touch_only') || 0 },
              { code: 'unresolved_mapping', label: 'Signal present but mapping unresolved', count: diagnosticCounts.get('unresolved_mapping') || 0 },
            ],
            sample: diagnosticSample,
          },
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load attribution dashboard';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
