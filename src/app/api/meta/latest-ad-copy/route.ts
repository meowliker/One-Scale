import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { getLatestMetaEndpointSnapshot, getMetaEndpointSnapshot } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import {
  getLatestPersistentMetaEndpointSnapshot,
  getPersistentMetaEndpointSnapshot,
} from '@/app/api/lib/supabase-tracking';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

type MetaRecord = Record<string, unknown>;

function normalizeAccountNode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed.replace(/^act_/, '')}`;
}

function asRecord(value: unknown): MetaRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as MetaRecord : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function parseDateValue(value: unknown): number {
  const text = asString(value);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortLatest<T extends MetaRecord>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const bDate = parseDateValue(b.updated_time) || parseDateValue(b.updatedAt) || parseDateValue(b.created_time) || parseDateValue(b.start_time);
    const aDate = parseDateValue(a.updated_time) || parseDateValue(a.updatedAt) || parseDateValue(a.created_time) || parseDateValue(a.start_time);
    return bDate - aDate;
  });
}

function uniqueTexts(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const texts: string[] = [];
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : '';
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    texts.push(text);
  }
  return texts;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueTexts(value.map((item) => {
    if (typeof item === 'string') return item;
    const record = asRecord(item);
    return asString(record?.text) || asString(record?.value) || asString(record?.name);
  }));
}

function assetFeedTexts(creative: MetaRecord | null, key: 'bodies' | 'titles' | 'descriptions'): string[] {
  const assetFeed = asRecord(creative?.asset_feed_spec) || asRecord(creative?.assetFeedSpec);
  const values = assetFeed?.[key];
  if (!Array.isArray(values)) return [];

  return uniqueTexts(values.map((item) => {
    if (typeof item === 'string') return item;
    const record = asRecord(item);
    return asString(record?.text) || asString(record?.value) || asString(record?.name);
  }));
}

function firstNestedString(parent: MetaRecord | null, paths: string[]): string | undefined {
  for (const path of paths) {
    let current: unknown = parent;
    for (const segment of path.split('.')) {
      current = asRecord(current)?.[segment];
      if (current === undefined || current === null) break;
    }
    const text = asString(current);
    if (text) return text;
  }
  return undefined;
}

async function graphGet<T>(accessToken: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json() as T | { error?: { message?: string } };
  if (!response.ok) {
    const errorRecord = asRecord(asRecord(data)?.error);
    const message = asString(errorRecord?.message);
    throw new Error(message || `Meta request failed (${response.status})`);
  }
  return data as T;
}

function extractCopy(ad: MetaRecord) {
  const creative = asRecord(ad.creative);
  const objectStorySpec = asRecord(creative?.object_story_spec) || asRecord(creative?.objectStorySpec);
  const linkData = asRecord(objectStorySpec?.link_data) || asRecord(objectStorySpec?.linkData);
  const videoData = asRecord(objectStorySpec?.video_data) || asRecord(objectStorySpec?.videoData);
  const videoCta = asRecord(videoData?.call_to_action) || asRecord(videoData?.callToAction);
  const videoCtaValue = asRecord(videoCta?.value);
  const linkCta = asRecord(linkData?.call_to_action) || asRecord(linkData?.callToAction);
  const linkCtaValue = asRecord(linkCta?.value);

  const primaryText =
    firstNestedString(creative, ['body', 'primaryText', 'primary_text']) ||
    firstNestedString(linkData, ['message']) ||
    firstNestedString(videoData, ['message']);
  const headline =
    firstNestedString(creative, ['headline', 'title']) ||
    firstNestedString(linkData, ['name']) ||
    firstNestedString(videoData, ['title']);
  const description =
    firstNestedString(creative, ['description', 'linkDescription', 'link_description']) ||
    firstNestedString(linkData, ['description', 'link_description']) ||
    firstNestedString(videoData, ['link_description', 'linkDescription', 'description']);
  const ctaType =
    firstNestedString(creative, ['ctaType', 'call_to_action_type']) ||
    firstNestedString(videoCta, ['type']) ||
    firstNestedString(linkCta, ['type']);
  const destinationUrl =
    firstNestedString(creative, ['destinationUrl', 'object_url', 'link_url']) ||
    firstNestedString(linkData, ['link']) ||
    firstNestedString(videoCtaValue, ['link']) ||
    firstNestedString(linkCtaValue, ['link']);

  return {
    primaryTexts: uniqueTexts([
      ...normalizeStringArray(creative?.primaryTexts),
      ...normalizeStringArray(creative?.primary_texts),
      ...assetFeedTexts(creative, 'bodies'),
      primaryText,
    ]),
    headlines: uniqueTexts([
      ...normalizeStringArray(creative?.headlines),
      ...assetFeedTexts(creative, 'titles'),
      headline,
    ]),
    descriptions: uniqueTexts([
      ...normalizeStringArray(creative?.descriptions),
      ...assetFeedTexts(creative, 'descriptions'),
      description,
    ]),
    ctaType,
    destinationUrl,
    urlTags: firstNestedString(creative, ['url_tags', 'urlTags']),
  };
}

function getId(row: MetaRecord | null | undefined): string | undefined {
  return asString(row?.id) || asString(row?.campaign_id) || asString(row?.campaignId) || asString(row?.adset_id) || asString(row?.adSetId) || asString(row?.ad_id) || asString(row?.adId);
}

function getName(row: MetaRecord | null | undefined, fallback: string): string {
  return asString(row?.name) || asString(row?.campaign_name) || asString(row?.campaignName) || asString(row?.adset_name) || asString(row?.adSetName) || asString(row?.ad_name) || asString(row?.adName) || fallback;
}

function getUpdatedAt(row: MetaRecord | null | undefined): string | undefined {
  return asString(row?.updated_time) || asString(row?.updatedAt) || asString(row?.created_time) || asString(row?.createdAt) || asString(row?.start_time);
}

function buildResponsePayload(args: {
  campaign: MetaRecord;
  adSet: MetaRecord;
  ad: MetaRecord;
  fromCache: boolean;
}) {
  const { campaign, adSet, ad, fromCache } = args;
  const copy = extractCopy(ad);
  return {
    sourceAdId: getId(ad) || '',
    sourceAdName: getName(ad, 'Latest ad'),
    sourceAdSetId: getId(adSet) || '',
    sourceAdSetName: getName(adSet, 'Latest ad set'),
    sourceMode: 'latest_adset',
    sourceCampaignId: getId(campaign) || '',
    sourceCampaignName: getName(campaign, 'Latest campaign'),
    updatedAt: getUpdatedAt(ad),
    primaryTexts: copy.primaryTexts,
    headlines: copy.headlines,
    descriptions: copy.descriptions,
    ctaType: copy.ctaType,
    destinationUrl: copy.destinationUrl,
    urlTags: copy.urlTags,
    fromCache,
  };
}

async function readSnapshot<T>(
  storeId: string,
  endpoint: 'campaigns' | 'adsets' | 'ads',
  scopeId: string,
  variantKey: string,
): Promise<T | null> {
  const snapshot = isSupabasePersistenceEnabled()
    ? await getPersistentMetaEndpointSnapshot<T>(storeId, endpoint, scopeId, variantKey)
    : getMetaEndpointSnapshot<T>(storeId, endpoint, scopeId, variantKey);
  return snapshot?.data || null;
}

async function readLatestSnapshot<T>(
  storeId: string,
  endpoint: 'campaigns' | 'adsets' | 'ads',
  scopeId: string,
): Promise<T | null> {
  const snapshot = isSupabasePersistenceEnabled()
    ? await getLatestPersistentMetaEndpointSnapshot<T>(storeId, endpoint, scopeId)
    : getLatestMetaEndpointSnapshot<T>(storeId, endpoint, scopeId);
  return snapshot?.data || null;
}

async function readSnapshotWithFallbacks<T>(
  storeId: string,
  endpoint: 'campaigns' | 'adsets' | 'ads',
  scopeId: string,
): Promise<T | null> {
  return (
    await readSnapshot<T>(storeId, endpoint, scopeId, 'latest') ||
    await readSnapshot<T>(storeId, endpoint, scopeId, 'preset:last_30d') ||
    await readSnapshot<T>(storeId, endpoint, scopeId, 'latest_nonzero') ||
    await readLatestSnapshot<T>(storeId, endpoint, scopeId)
  );
}

async function loadLatestCopyFromSnapshots(storeId: string, accountId: string) {
  const campaigns = await readSnapshotWithFallbacks<MetaRecord[]>(storeId, 'campaigns', `accounts:${accountId}`);
  for (const campaign of sortLatest(campaigns || [])) {
    const campaignId = getId(campaign);
    if (!campaignId) continue;
    const adSets = await readSnapshotWithFallbacks<MetaRecord[]>(storeId, 'adsets', campaignId);
    for (const adSet of sortLatest(adSets || [])) {
      const adSetId = getId(adSet);
      if (!adSetId) continue;
      const ads = await readSnapshotWithFallbacks<MetaRecord[]>(storeId, 'ads', adSetId);
      const latestAd = sortLatest(ads || [])[0];
      if (!latestAd || !getId(latestAd)) continue;
      return buildResponsePayload({ campaign, adSet, ad: latestAd, fromCache: true });
    }
  }
  return null;
}

async function loadLatestCopyFromMeta(accessToken: string, accountId: string) {
  const campaignsResponse = await graphGet<{ data?: MetaRecord[] }>(accessToken, `/${accountId}/campaigns`, {
    fields: 'id,name,effective_status,status,updated_time,start_time,created_time',
    limit: '100',
  });
  const latestCampaign = sortLatest(campaignsResponse.data || [])[0];
  const campaignId = getId(latestCampaign);
  if (!campaignId || !latestCampaign) {
    throw new Error('No campaigns found in the selected ad account');
  }

  const adSetsResponse = await graphGet<{ data?: MetaRecord[] }>(accessToken, `/${campaignId}/adsets`, {
    fields: 'id,name,effective_status,status,updated_time,start_time,created_time',
    limit: '100',
  });
  const latestAdSet = sortLatest(adSetsResponse.data || [])[0];
  const adSetId = getId(latestAdSet);
  if (!adSetId || !latestAdSet) {
    throw new Error('No ad sets found in the latest campaign');
  }

  const adsResponse = await graphGet<{ data?: MetaRecord[] }>(accessToken, `/${adSetId}/ads`, {
    fields: [
      'id',
      'name',
      'effective_status',
      'status',
      'updated_time',
      'created_time',
      'creative{id,name,title,body,call_to_action_type,object_url,link_url,object_story_spec,asset_feed_spec,url_tags}',
    ].join(','),
    limit: '100',
  });
  const latestAd = sortLatest(adsResponse.data || [])[0];
  if (!latestAd || !getId(latestAd)) {
    throw new Error('No ads found in the latest ad set');
  }

  return buildResponsePayload({ campaign: latestCampaign, adSet: latestAdSet, ad: latestAd, fromCache: false });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';
  const accountId = normalizeAccountNode(searchParams.get('accountId') || '');

  if (!storeId || !accountId) {
    return NextResponse.json({ error: 'storeId and accountId are required' }, { status: 400 });
  }

  try {
    const cachedPayload = await loadLatestCopyFromSnapshots(storeId, accountId);
    if (cachedPayload) {
      return NextResponse.json({ data: cachedPayload, accountId, cached: true });
    }

    const token = await getMetaToken(storeId);
    if (!token?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
    }

    const livePayload = await loadLatestCopyFromMeta(token.accessToken, accountId);
    return NextResponse.json({ data: livePayload, accountId, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch latest ad copy';
    const cachedPayload = await loadLatestCopyFromSnapshots(storeId, accountId).catch(() => null);
    if (cachedPayload) {
      return NextResponse.json({ data: cachedPayload, accountId, cached: true, warning: message });
    }
    const status = /no campaigns|no ad sets|no ads/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
