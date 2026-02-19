import { getStoreAdAccounts } from '@/app/api/lib/db';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { getMetaToken } from '@/app/api/lib/tokens';

interface MetaCampaignRow {
  id: string;
  name: string;
}

interface MetaAdSetRow {
  id: string;
  name: string;
  campaign_id?: string;
}

interface MetaAdRow {
  id: string;
  name: string;
  adset_id?: string;
  campaign_id?: string;
}

interface MetaPagedResponse<T> {
  data?: T[];
  paging?: { next?: string };
}

interface LookupMaps {
  campaignByName: Map<string, string>;
  adSetByName: Map<string, string>;
  adSetByCampaignAndName: Map<string, string>;
  adByName: Map<string, string>;
  adByCampaignAndName: Map<string, string>;
  adByAdSetAndName: Map<string, string>;
}

interface LookupCacheEntry {
  at: number;
  maps: LookupMaps;
}

const LOOKUP_TTL_MS = 30 * 60 * 1000;
const lookupCache = new Map<string, LookupCacheEntry>();

function normalizeName(raw: string): string {
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // ignore decode failures
  }
  return value
    .replace(/\+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function toUniqueMap(entries: Array<[string, string]>): Map<string, string> {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const [key, value] of entries) {
    if (!key || !value) continue;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, value);
      continue;
    }
    if (prev !== value) {
      duplicates.add(key);
    }
  }
  for (const key of duplicates) {
    seen.delete(key);
  }
  return seen;
}

async function fetchAllPages<T>(
  token: string,
  endpoint: string,
  params: Record<string, string>,
  maxPages = 10
): Promise<T[]> {
  const first = await fetchFromMeta<MetaPagedResponse<T>>(token, endpoint, params, 10_000, 0);
  const rows = [...(first.data || [])];
  let next = first.paging?.next;
  let page = 0;

  while (next && page < maxPages) {
    try {
      const response = await fetch(next);
      if (!response.ok) break;
      const json = (await response.json()) as MetaPagedResponse<T>;
      rows.push(...(json.data || []));
      next = json.paging?.next;
      page += 1;
    } catch {
      break;
    }
  }

  return rows;
}

async function buildLookups(storeId: string): Promise<LookupMaps> {
  const token = await getMetaToken(storeId);
  const emptyMaps: LookupMaps = {
    campaignByName: new Map(),
    adSetByName: new Map(),
    adSetByCampaignAndName: new Map(),
    adByName: new Map(),
    adByCampaignAndName: new Map(),
    adByAdSetAndName: new Map(),
  };

  if (!token?.accessToken) return emptyMaps;

  const accountIds = getStoreAdAccounts(storeId)
    .filter((a) => a.platform === 'meta' && a.is_active === 1)
    .map((a) => a.ad_account_id);
  if (accountIds.length === 0) return emptyMaps;

  const campaignRows: MetaCampaignRow[] = [];
  const adSetRows: MetaAdSetRow[] = [];
  const adRows: MetaAdRow[] = [];

  for (const accountId of accountIds) {
    try {
      const campaigns = await fetchAllPages<MetaCampaignRow>(
        token.accessToken,
        `/${accountId}/campaigns`,
        { fields: 'id,name', limit: '300' },
        5
      );
      campaignRows.push(...campaigns);
    } catch {
      // ignore account campaign lookup errors
    }

    try {
      const adSets = await fetchAllPages<MetaAdSetRow>(
        token.accessToken,
        `/${accountId}/adsets`,
        { fields: 'id,name,campaign_id', limit: '300' },
        8
      );
      adSetRows.push(...adSets);
    } catch {
      // ignore account adset lookup errors
    }

    try {
      const ads = await fetchAllPages<MetaAdRow>(
        token.accessToken,
        `/${accountId}/ads`,
        { fields: 'id,name,adset_id,campaign_id', limit: '300' },
        8
      );
      adRows.push(...ads);
    } catch {
      // ignore account ad lookup errors
    }
  }

  const campaignByName = toUniqueMap(
    campaignRows
      .map((row) => [normalizeName(row.name || ''), row.id] as [string, string])
      .filter(([name, id]) => !!name && !!id)
  );

  const adSetByName = toUniqueMap(
    adSetRows
      .map((row) => [normalizeName(row.name || ''), row.id] as [string, string])
      .filter(([name, id]) => !!name && !!id)
  );

  const adSetByCampaignAndName = toUniqueMap(
    adSetRows
      .map((row) => {
        const name = normalizeName(row.name || '');
        const campaignId = row.campaign_id || '';
        return [`${campaignId}|${name}`, row.id] as [string, string];
      })
      .filter(([key, id]) => !!key && !key.startsWith('|') && !key.endsWith('|') && !!id)
  );

  const adByName = toUniqueMap(
    adRows
      .map((row) => [normalizeName(row.name || ''), row.id] as [string, string])
      .filter(([name, id]) => !!name && !!id)
  );

  const adByCampaignAndName = toUniqueMap(
    adRows
      .map((row) => {
        const name = normalizeName(row.name || '');
        const campaignId = row.campaign_id || '';
        return [`${campaignId}|${name}`, row.id] as [string, string];
      })
      .filter(([key, id]) => !!key && !key.startsWith('|') && !key.endsWith('|') && !!id)
  );

  const adByAdSetAndName = toUniqueMap(
    adRows
      .map((row) => {
        const name = normalizeName(row.name || '');
        const adSetId = row.adset_id || '';
        return [`${adSetId}|${name}`, row.id] as [string, string];
      })
      .filter(([key, id]) => !!key && !key.startsWith('|') && !key.endsWith('|') && !!id)
  );

  return {
    campaignByName,
    adSetByName,
    adSetByCampaignAndName,
    adByName,
    adByCampaignAndName,
    adByAdSetAndName,
  };
}

async function getLookupMaps(storeId: string): Promise<LookupMaps> {
  const cached = lookupCache.get(storeId);
  if (cached && Date.now() - cached.at < LOOKUP_TTL_MS) {
    return cached.maps;
  }
  const maps = await buildLookups(storeId);
  lookupCache.set(storeId, { at: Date.now(), maps });
  return maps;
}

export async function resolveMetaIdsFromUtm(
  storeId: string,
  utm: { campaignName?: string | null; adSetName?: string | null; adName?: string | null }
): Promise<{ campaignId: string | null; adSetId: string | null; adId: string | null }> {
  const hasAny = !!(utm.campaignName || utm.adSetName || utm.adName);
  if (!hasAny) {
    return { campaignId: null, adSetId: null, adId: null };
  }

  const maps = await getLookupMaps(storeId);
  const campaignKey = utm.campaignName ? normalizeName(utm.campaignName) : '';
  const adSetKey = utm.adSetName ? normalizeName(utm.adSetName) : '';
  const adKey = utm.adName ? normalizeName(utm.adName) : '';

  const campaignId = campaignKey ? maps.campaignByName.get(campaignKey) || null : null;

  let adSetId: string | null = null;
  if (adSetKey) {
    if (campaignId) {
      adSetId = maps.adSetByCampaignAndName.get(`${campaignId}|${adSetKey}`) || null;
    }
    if (!adSetId) {
      adSetId = maps.adSetByName.get(adSetKey) || null;
    }
  }

  let adId: string | null = null;
  if (adKey) {
    if (adSetId) {
      adId = maps.adByAdSetAndName.get(`${adSetId}|${adKey}`) || null;
    }
    if (!adId && campaignId) {
      adId = maps.adByCampaignAndName.get(`${campaignId}|${adKey}`) || null;
    }
    if (!adId) {
      adId = maps.adByName.get(adKey) || null;
    }
  }

  return { campaignId, adSetId, adId };
}

