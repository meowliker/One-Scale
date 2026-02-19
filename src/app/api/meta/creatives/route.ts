import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta, mapInsightsToMetrics } from '@/app/api/lib/meta-client';
import { getLatestMetaEndpointSnapshot, getMetaEndpointSnapshot, getRecentMetaEndpointSnapshots, getStoreAdAccounts, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import type { AdSet } from '@/types/campaign';
import type { Creative } from '@/types/creative';

type MetaRow = Record<string, unknown>;

interface DailyStat {
  date: string;
  spend: number;
  revenue: number;
  roas: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

interface AggregateStat {
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  frequencyWeighted: number;
}

interface InsightBundle {
  aggregateByAdId: Map<string, AggregateStat>;
  dailyByAdId: Map<string, DailyStat[]>;
}

interface AccountSourceMaps {
  campaignById: Map<string, string>;
  adSetById: Map<string, { name: string; campaignId: string }>;
}

const MAX_INSIGHT_PAGES = 4;
const MAX_VIDEO_LENGTH_LOOKUPS = 40;
const MAX_AD_PAGES = 4;

const EMPTY_AGGREGATE: AggregateStat = {
  spend: 0,
  revenue: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  frequencyWeighted: 0,
};

function hasCreativeSignal(rows: Creative[]): boolean {
  return rows.some((row) =>
    (row.spend || 0) > 0 ||
    (row.impressions || 0) > 0 ||
    (row.conversions || 0) > 0
  );
}

function deriveCreativeDeliveryStatus(
  configuredStatus: string,
  effectiveStatus: string,
  spend: number,
  impressions: number
): string {
  const configured = configuredStatus.toUpperCase();
  const effective = effectiveStatus.toUpperCase();
  if (configured === 'PAUSED' || effective === 'PAUSED') return 'Paused';
  if (configured === 'DELETED' || effective === 'DELETED') return 'Deleted';
  if (configured === 'ARCHIVED' || effective === 'ARCHIVED') return 'Archived';
  if (effective === 'DISAPPROVED') return 'Disapproved';
  if (effective === 'PENDING_REVIEW') return 'Pending Review';
  if (effective === 'WITH_ISSUES') return 'With Issues';
  if (configured === 'ACTIVE' || effective === 'ACTIVE') {
    if (spend <= 0 && impressions <= 0) return 'Not Delivering';
    return 'Delivering';
  }
  return effectiveStatus || configuredStatus || 'Unknown';
}

function deriveCreativesFromAdSetSnapshots(storeId: string): Creative[] {
  const snapshots = getRecentMetaEndpointSnapshots<AdSet[]>(storeId, 'adsets', 120);
  if (snapshots.length === 0) return [];

  const adSets = snapshots
    .flatMap((snapshot) => (Array.isArray(snapshot.data) ? snapshot.data : []))
    .filter((adSet) => !!adSet && typeof adSet === 'object');

  const creatives = adSets
    .filter((adSet) =>
      (adSet.metrics?.spend || 0) > 0 ||
      (adSet.metrics?.impressions || 0) > 0
    )
    .map((adSet) => {
      const spend = adSet.metrics?.spend || 0;
      const revenue = adSet.metrics?.revenue || 0;
      const impressions = adSet.metrics?.impressions || 0;
      const clicks = adSet.metrics?.clicks || 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const conversions = adSet.metrics?.conversions || 0;
      const frequency = adSet.metrics?.frequency || 0;
      const fatigueScore = Math.min(
        100,
        Math.round((frequency / 5) * 50 + (ctr < 1 ? 30 : 0) + ((adSet.metrics?.roas || 0) < 1 ? 20 : 0))
      );
      return {
        id: `adset_${adSet.id}`,
        name: adSet.name || `Ad Set ${adSet.id}`,
        campaignId: adSet.campaignId || undefined,
        campaignName: undefined,
        adSetId: adSet.id || undefined,
        adSetName: adSet.name || undefined,
        headline: adSet.name || '',
        primaryText: '',
        type: 'Image' as const,
        spend,
        roas: spend > 0 ? revenue / spend : 0,
        ctr,
        impressions,
        status: fatigueScore >= 60 ? 'Fatigue' as const : 'Active' as const,
        thumbnailUrl: undefined,
        revenue,
        conversions,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        frequency,
        fatigueScore,
        startDate: adSet.startDate || new Date().toISOString(),
        metaConfiguredStatus: adSet.status || undefined,
        metaEffectiveStatus: adSet.policyInfo?.effectiveStatus || adSet.status || undefined,
        metaDeliveryStatus: deriveCreativeDeliveryStatus(
          adSet.status || '',
          adSet.policyInfo?.effectiveStatus || adSet.status || '',
          spend,
          impressions
        ),
      } satisfies Creative;
    });

  const deduped = new Map<string, Creative>();
  for (const creative of creatives) {
    const existing = deduped.get(creative.id);
    if (!existing || creative.spend > existing.spend) {
      deduped.set(creative.id, creative);
    }
  }
  return [...deduped.values()];
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toStringSafe(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const runWorker = async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function pushInsightRows(
  rows: MetaRow[],
  aggregateByAdId: Map<string, AggregateStat>,
  dailyByAdId: Map<string, DailyStat[]>
): void {
  for (const row of rows) {
    const adId = toStringSafe(row.ad_id);
    if (!adId) continue;

    const metrics = mapInsightsToMetrics(row as Record<string, unknown>);
    const current = aggregateByAdId.get(adId) || { ...EMPTY_AGGREGATE };
    current.spend += metrics.spend;
    current.revenue += metrics.revenue;
    current.impressions += metrics.impressions;
    current.clicks += metrics.clicks;
    current.conversions += metrics.conversions;
    current.frequencyWeighted += metrics.frequency * metrics.impressions;
    aggregateByAdId.set(adId, current);

    const date = toStringSafe(row.date_start) || toStringSafe(row.date);
    if (!date) continue;
    const daily = dailyByAdId.get(adId) || [];
    daily.push({
      date,
      spend: metrics.spend,
      revenue: metrics.revenue,
      roas: metrics.roas,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      conversions: metrics.conversions,
    });
    dailyByAdId.set(adId, daily);
  }
}

async function fetchAdInsightsBundleForAccount(
  accessToken: string,
  accountId: string,
  datePreset: string
): Promise<InsightBundle> {
  const aggregateByAdId = new Map<string, AggregateStat>();
  const dailyByAdId = new Map<string, DailyStat[]>();
  const baseParams: Record<string, string> = {
    fields: 'ad_id,date_start,spend,impressions,reach,clicks,actions,action_values,ctr,cpc,cpm,frequency',
    level: 'ad',
    time_increment: '1',
    date_preset: datePreset,
    limit: '500',
  };

  const first = await fetchFromMeta<{ data?: MetaRow[]; paging?: { next?: string } }>(
    accessToken,
    `/${accountId}/insights`,
    baseParams,
    15_000,
    1
  ).catch(() => ({ data: [], paging: undefined }));

  pushInsightRows(first.data || [], aggregateByAdId, dailyByAdId);

  let nextUrl = first.paging?.next;
  let pages = 0;
  while (nextUrl && pages < MAX_INSIGHT_PAGES) {
    pages += 1;
    try {
      const body = await fetchJsonWithTimeout<{ data?: MetaRow[]; paging?: { next?: string } }>(
        nextUrl,
        12_000
      );
      pushInsightRows(body.data || [], aggregateByAdId, dailyByAdId);
      nextUrl = body.paging?.next;
    } catch {
      break;
    }
  }

  for (const [adId, days] of dailyByAdId.entries()) {
    days.sort((a, b) => a.date.localeCompare(b.date));
    dailyByAdId.set(adId, days);
  }

  return { aggregateByAdId, dailyByAdId };
}

async function fetchAdsForAccount(
  accessToken: string,
  accountId: string,
  filtered: boolean
): Promise<Record<string, unknown>[]> {
  const params: Record<string, string> = {
    fields: [
      'id',
      'name',
      'status',
      'effective_status',
      'campaign_id',
      'campaign_name',
      'adset_id',
      'adset_name',
      'campaign{id,name}',
      'adset{id,name,campaign_id}',
      'creative{id,title,body,image_url,thumbnail_url,video_id,effective_object_story_id}',
      'created_time',
    ].join(','),
    limit: '200',
  };
  if (filtered) {
    params.filtering = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]);
  }

  const first = await fetchFromMeta<{ data?: MetaRow[]; paging?: { next?: string } }>(
    accessToken,
    `/${accountId}/ads`,
    params,
    filtered ? 15_000 : 12_000,
    filtered ? 1 : 0
  ).catch(() => ({ data: [], paging: undefined }));

  const rows: Record<string, unknown>[] = safeRows(first.data);
  let nextUrl = first.paging?.next;
  let pages = 0;
  while (nextUrl && pages < MAX_AD_PAGES) {
    pages += 1;
    try {
      const body = await fetchJsonWithTimeout<{ data?: MetaRow[]; paging?: { next?: string } }>(nextUrl, 12_000);
      rows.push(...safeRows(body.data));
      nextUrl = body.paging?.next;
    } catch {
      break;
    }
  }
  return rows;
}

async function fetchSourceMapsForAccount(
  accessToken: string,
  accountId: string
): Promise<AccountSourceMaps> {
  const campaignById = new Map<string, string>();
  const adSetById = new Map<string, { name: string; campaignId: string }>();

  try {
    const firstCampaigns = await fetchFromMeta<{ data?: MetaRow[]; paging?: { next?: string } }>(
      accessToken,
      `/${accountId}/campaigns`,
      { fields: 'id,name', limit: '500' },
      12_000,
      0
    ).catch(() => ({ data: [], paging: undefined }));

    for (const row of safeRows(firstCampaigns.data)) {
      const id = toStringSafe(row.id);
      if (!id) continue;
      campaignById.set(id, toStringSafe(row.name));
    }

    let nextCampaigns = firstCampaigns.paging?.next;
    let campaignPages = 0;
    while (nextCampaigns && campaignPages < MAX_AD_PAGES) {
      campaignPages += 1;
      try {
        const body = await fetchJsonWithTimeout<{ data?: MetaRow[]; paging?: { next?: string } }>(
          nextCampaigns,
          12_000
        );
        for (const row of safeRows(body.data)) {
          const id = toStringSafe(row.id);
          if (!id) continue;
          campaignById.set(id, toStringSafe(row.name));
        }
        nextCampaigns = body.paging?.next;
      } catch {
        break;
      }
    }
  } catch {
    // no-op
  }

  try {
    const firstAdSets = await fetchFromMeta<{ data?: MetaRow[]; paging?: { next?: string } }>(
      accessToken,
      `/${accountId}/adsets`,
      { fields: 'id,name,campaign_id', limit: '500' },
      12_000,
      0
    ).catch(() => ({ data: [], paging: undefined }));

    for (const row of safeRows(firstAdSets.data)) {
      const id = toStringSafe(row.id);
      if (!id) continue;
      adSetById.set(id, {
        name: toStringSafe(row.name),
        campaignId: toStringSafe(row.campaign_id),
      });
    }

    let nextAdSets = firstAdSets.paging?.next;
    let adSetPages = 0;
    while (nextAdSets && adSetPages < MAX_AD_PAGES) {
      adSetPages += 1;
      try {
        const body = await fetchJsonWithTimeout<{ data?: MetaRow[]; paging?: { next?: string } }>(
          nextAdSets,
          12_000
        );
        for (const row of safeRows(body.data)) {
          const id = toStringSafe(row.id);
          if (!id) continue;
          adSetById.set(id, {
            name: toStringSafe(row.name),
            campaignId: toStringSafe(row.campaign_id),
          });
        }
        nextAdSets = body.paging?.next;
      } catch {
        break;
      }
    }
  } catch {
    // no-op
  }

  return { campaignById, adSetById };
}

async function fetchObjectRowsByIds(
  accessToken: string,
  ids: string[],
  fields: string
): Promise<Map<string, Record<string, unknown>>> {
  const rows = new Map<string, Record<string, unknown>>();
  if (ids.length === 0) return rows;

  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const chunkSize = 40;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    try {
      const response = await fetchFromMeta<Record<string, Record<string, unknown>>>(
        accessToken,
        '/',
        {
          ids: chunk.join(','),
          fields,
        },
        10_000,
        0
      );

      for (const [id, value] of Object.entries(response || {})) {
        if (!value || typeof value !== 'object') continue;
        rows.set(id, value);
      }
    } catch {
      // continue with partial data
    }
  }

  return rows;
}

function safeRows(rows: MetaRow[] | undefined): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
}

function bundleHasSpend(bundle: InsightBundle): boolean {
  for (const stat of bundle.aggregateByAdId.values()) {
    if (stat.spend > 0) return true;
  }
  return false;
}

async function fetchVideoDurationMap(accessToken: string, videoIds: string[]): Promise<Map<string, number>> {
  if (videoIds.length === 0) return new Map();
  const unique = [...new Set(videoIds.filter(Boolean))].slice(0, MAX_VIDEO_LENGTH_LOOKUPS);
  const rows = await mapWithConcurrency(unique, 4, async (videoId) => {
    try {
      const response = await fetchFromMeta<{ length?: number | string }>(
        accessToken,
        `/${videoId}`,
        { fields: 'length' },
        8_000,
        0
      );
      const length = toNumber(response.length);
      return { videoId, length: length > 0 ? Math.round(length) : 0 };
    } catch {
      return { videoId, length: 0 };
    }
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.length > 0) map.set(row.videoId, row.length);
  }
  return map;
}

function toCreative(
  ad: Record<string, unknown>,
  aggregate?: AggregateStat,
  dailyStats: DailyStat[] = [],
  videoDurationSec?: number
): Creative | null {
  const adId = toStringSafe(ad.id);
  if (!adId) return null;

  const adName = toStringSafe(ad.name) || `Ad ${adId}`;
  const createdTime = toStringSafe(ad.created_time) || new Date().toISOString();
  const creative = (ad.creative && typeof ad.creative === 'object')
    ? ad.creative as Record<string, unknown>
    : {};
  const campaignObj = (ad.campaign && typeof ad.campaign === 'object')
    ? ad.campaign as Record<string, unknown>
    : {};
  const adSetObj = (ad.adset && typeof ad.adset === 'object')
    ? ad.adset as Record<string, unknown>
    : {};
  const isVideo = !!creative.video_id;
  const metrics = aggregate || { ...EMPTY_AGGREGATE };

  const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
  const roas = metrics.spend > 0 ? metrics.revenue / metrics.spend : 0;
  const cpc = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0;
  const cpm = metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0;
  const frequency = metrics.impressions > 0
    ? metrics.frequencyWeighted / Math.max(metrics.impressions, 1)
    : 0;

  const fatigueScore = Math.min(
    100,
    Math.round((frequency / 5) * 50 + (ctr < 1 ? 30 : 0) + (roas < 1 ? 20 : 0))
  );
  const configuredStatus = toStringSafe(ad.status);
  const effectiveStatus = toStringSafe(ad.effective_status);

  return {
    id: adId,
    name: adName || (toStringSafe(creative.title) || `Ad ${adId}`),
    campaignId: toStringSafe(ad.campaign_id) || toStringSafe(campaignObj.id) || toStringSafe(adSetObj.campaign_id) || undefined,
    campaignName: toStringSafe(ad.campaign_name) || toStringSafe(campaignObj.name) || undefined,
    adSetId: toStringSafe(ad.adset_id) || toStringSafe(adSetObj.id) || undefined,
    adSetName: toStringSafe(ad.adset_name) || toStringSafe(adSetObj.name) || undefined,
    headline: toStringSafe(creative.title),
    primaryText: toStringSafe(creative.body),
    type: isVideo ? 'Video' : 'Image',
    spend: metrics.spend,
    roas,
    ctr,
    impressions: Math.round(metrics.impressions),
    status: fatigueScore >= 60 ? 'Fatigue' : 'Active',
    thumbnailUrl: toStringSafe(creative.thumbnail_url) || toStringSafe(creative.image_url) || undefined,
    revenue: metrics.revenue,
    conversions: Math.round(metrics.conversions),
    cpc,
    cpm,
    frequency,
    fatigueScore,
    startDate: createdTime,
    videoDurationSec: isVideo ? videoDurationSec : undefined,
    metaConfiguredStatus: configuredStatus || undefined,
    metaEffectiveStatus: effectiveStatus || configuredStatus || undefined,
    metaDeliveryStatus: deriveCreativeDeliveryStatus(
      configuredStatus,
      effectiveStatus || configuredStatus,
      metrics.spend,
      metrics.impressions
    ),
    dailyStats,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const accountIds = searchParams.get('accountIds');
  const datePreset = searchParams.get('datePreset') || 'last_30d';
  const preferCache = searchParams.get('preferCache') === '1';
  const debug = searchParams.get('debug') === '1';
  const startedAt = Date.now();

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  if (preferCache) {
    const exactSnapshot = getMetaEndpointSnapshot<Creative[]>(storeId, 'creatives', 'default', `datePreset:${datePreset}`);
    if (exactSnapshot && exactSnapshot.data.length > 0) {
      return NextResponse.json({
        data: exactSnapshot.data,
        stale: true,
        cached: true,
        snapshotAt: exactSnapshot.updatedAt,
        staleReason: 'snapshot_exact_fast',
      });
    }

    const last30Snapshot = datePreset !== 'last_30d'
      ? getMetaEndpointSnapshot<Creative[]>(storeId, 'creatives', 'default', 'datePreset:last_30d')
      : null;
    if (last30Snapshot && last30Snapshot.data.length > 0) {
      return NextResponse.json({
        data: last30Snapshot.data,
        stale: true,
        cached: true,
        snapshotAt: last30Snapshot.updatedAt,
        staleReason: 'snapshot_last_30d_fast',
      });
    }

    const latestSnapshot = getLatestMetaEndpointSnapshot<Creative[]>(storeId, 'creatives', 'default');
    if (latestSnapshot && latestSnapshot.data.length > 0) {
      return NextResponse.json({
        data: latestSnapshot.data,
        stale: true,
        cached: true,
        snapshotAt: latestSnapshot.updatedAt,
        staleReason: 'snapshot_latest_fast',
      });
    }

    const adSetDerived = deriveCreativesFromAdSetSnapshots(storeId);
    if (hasCreativeSignal(adSetDerived)) {
      upsertMetaEndpointSnapshot(storeId, 'creatives', 'default', `datePreset:${datePreset}`, adSetDerived);
      upsertMetaEndpointSnapshot(storeId, 'creatives', 'default', 'latest', adSetDerived);
      return NextResponse.json({
        data: adSetDerived,
        stale: true,
        cached: true,
        staleReason: 'adset_snapshot_fast',
      });
    }
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  try {
    let targetIds: string[] = [];
    if (accountIds) {
      targetIds = accountIds.split(',').filter(Boolean);
    } else {
      const mapped = getStoreAdAccounts(storeId);
      targetIds = mapped
        .filter((a) => a.platform === 'meta' && a.is_active === 1)
        .map((a) => a.ad_account_id);
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'No ad accounts specified' }, { status: 400 });
    }

    const allCreatives: Creative[] = [];

    await Promise.all(targetIds.map(async (accountId) => {
      try {
        let ads = await fetchAdsForAccount(token.accessToken, accountId, true);
        if (ads.length === 0) {
          ads = await fetchAdsForAccount(token.accessToken, accountId, false);
        }
        if (ads.length === 0) return;

        let insightBundle = await fetchAdInsightsBundleForAccount(token.accessToken, accountId, datePreset)
          .catch(() => ({ aggregateByAdId: new Map<string, AggregateStat>(), dailyByAdId: new Map<string, DailyStat[]>() }));

        if (!bundleHasSpend(insightBundle) && datePreset !== 'last_30d') {
          const fallbackBundle = await fetchAdInsightsBundleForAccount(token.accessToken, accountId, 'last_30d')
            .catch(() => null);
          if (fallbackBundle && bundleHasSpend(fallbackBundle)) {
            insightBundle = fallbackBundle;
          }
        }

        const videoIds = ads
          .map((ad) => {
            const creative = (ad.creative && typeof ad.creative === 'object')
              ? ad.creative as Record<string, unknown>
              : {};
            return toStringSafe(creative.video_id);
          })
          .filter(Boolean);
        const videoDurationMap = await fetchVideoDurationMap(token.accessToken, videoIds);
        const needsNameFallback = ads.some((ad) => {
          const campaignName = toStringSafe(ad.campaign_name);
          const adSetName = toStringSafe(ad.adset_name);
          const campaignObj = (ad.campaign && typeof ad.campaign === 'object') ? ad.campaign as Record<string, unknown> : {};
          const adSetObj = (ad.adset && typeof ad.adset === 'object') ? ad.adset as Record<string, unknown> : {};
          const nestedCampaignName = toStringSafe(campaignObj.name);
          const nestedAdSetName = toStringSafe(adSetObj.name);
          return !campaignName && !nestedCampaignName && !adSetName && !nestedAdSetName;
        });
        const sourceMapsSeed = needsNameFallback
          ? await fetchSourceMapsForAccount(token.accessToken, accountId)
          : { campaignById: new Map<string, string>(), adSetById: new Map<string, { name: string; campaignId: string }>() };
        const sourceMaps = {
          campaignById: new Map(sourceMapsSeed.campaignById),
          adSetById: new Map(sourceMapsSeed.adSetById),
        };

        if (needsNameFallback) {
          const unresolvedCampaignIds = new Set<string>();
          const unresolvedAdSetIds = new Set<string>();
          for (const ad of ads) {
            const campaignId = toStringSafe(ad.campaign_id) || toStringSafe((ad.campaign as Record<string, unknown> | undefined)?.id);
            const adSetId = toStringSafe(ad.adset_id) || toStringSafe((ad.adset as Record<string, unknown> | undefined)?.id);
            if (campaignId && !sourceMaps.campaignById.get(campaignId)) {
              unresolvedCampaignIds.add(campaignId);
            }
            if (adSetId && !sourceMaps.adSetById.get(adSetId)) {
              unresolvedAdSetIds.add(adSetId);
            }
          }

          if (unresolvedCampaignIds.size > 0) {
            const campaignRows = await fetchObjectRowsByIds(token.accessToken, [...unresolvedCampaignIds], 'name');
            for (const [id, row] of campaignRows.entries()) {
              const name = toStringSafe(row.name);
              if (name) sourceMaps.campaignById.set(id, name);
            }
          }

          if (unresolvedAdSetIds.size > 0) {
            const adSetRows = await fetchObjectRowsByIds(token.accessToken, [...unresolvedAdSetIds], 'name,campaign_id');
            for (const [id, row] of adSetRows.entries()) {
              const name = toStringSafe(row.name);
              const campaignId = toStringSafe(row.campaign_id);
              if (name || campaignId) {
                sourceMaps.adSetById.set(id, { name, campaignId });
              }
            }
          }
        }

        const creatives = ads
          .map((ad) => {
            const adId = toStringSafe(ad.id);
            const creative = (ad.creative && typeof ad.creative === 'object')
              ? ad.creative as Record<string, unknown>
              : {};
            const videoId = toStringSafe(creative.video_id);
            const row = toCreative(
              ad,
              insightBundle.aggregateByAdId.get(adId),
              insightBundle.dailyByAdId.get(adId) || [],
              videoId ? videoDurationMap.get(videoId) : undefined
            );
            if (!row) return null;
            if (row.campaignName && row.adSetName) return row;
            const adSetFromMap = row.adSetId ? sourceMaps.adSetById.get(row.adSetId) : undefined;
            const campaignId = row.campaignId || adSetFromMap?.campaignId || undefined;
            const campaignName = row.campaignName || (campaignId ? sourceMaps.campaignById.get(campaignId) : undefined);
            return {
              ...row,
              campaignId,
              campaignName: campaignName || row.campaignName,
              adSetName: row.adSetName || adSetFromMap?.name,
            };
          })
          .filter((row): row is Creative => !!row);

        allCreatives.push(...creatives);
      } catch {
        // Skip account-level failures
      }
    }));

    const deduped = new Map<string, Creative>();
    for (const creative of allCreatives) {
      const existing = deduped.get(creative.id);
      if (!existing || creative.spend > existing.spend) {
        deduped.set(creative.id, creative);
      }
    }
    const rows = [...deduped.values()];

    if (hasCreativeSignal(rows)) {
      upsertMetaEndpointSnapshot(storeId, 'creatives', 'default', `datePreset:${datePreset}`, rows);
      upsertMetaEndpointSnapshot(storeId, 'creatives', 'default', 'latest', rows);
    } else {
      const adSetDerived = deriveCreativesFromAdSetSnapshots(storeId);
      if (hasCreativeSignal(adSetDerived)) {
        upsertMetaEndpointSnapshot(storeId, 'creatives', 'default', `datePreset:${datePreset}`, adSetDerived);
        upsertMetaEndpointSnapshot(storeId, 'creatives', 'default', 'latest', adSetDerived);
        return NextResponse.json({
          data: adSetDerived,
          stale: true,
          cached: true,
          staleReason: 'adset_snapshot_fallback',
        });
      }

      const exactSnapshot = getMetaEndpointSnapshot<Creative[]>(storeId, 'creatives', 'default', `datePreset:${datePreset}`);
      const latestSnapshot = exactSnapshot ?? getLatestMetaEndpointSnapshot<Creative[]>(storeId, 'creatives', 'default');
      if (latestSnapshot && latestSnapshot.data.length > 0) {
        return NextResponse.json({
          data: latestSnapshot.data,
          stale: true,
          cached: true,
          snapshotAt: latestSnapshot.updatedAt,
          staleReason: 'live_empty',
        });
      }
    }

    const elapsedMs = Date.now() - startedAt;
    const payload: {
      data: Creative[];
      meta?: { elapsedMs: number; creativeCount: number; nonZeroSpend: number; videoCount: number };
    } = { data: rows };

    if (debug) {
      payload.meta = {
        elapsedMs,
        creativeCount: rows.length,
        nonZeroSpend: rows.filter((c) => c.spend > 0).length,
        videoCount: rows.filter((c) => c.type === 'Video').length,
      };
    }

    return NextResponse.json(payload);
  } catch (err) {
    const latestSnapshot = getLatestMetaEndpointSnapshot<Creative[]>(storeId, 'creatives', 'default');
    if (latestSnapshot && latestSnapshot.data.length > 0) {
      return NextResponse.json({
        data: latestSnapshot.data,
        stale: true,
        cached: true,
        snapshotAt: latestSnapshot.updatedAt,
        staleReason: 'live_error',
      });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch creatives';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
