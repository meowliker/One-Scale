import { getRecentMetaEndpointSnapshots, getStoreAdAccounts } from '@/app/api/lib/db';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { getMetaToken } from '@/app/api/lib/tokens';

interface MetaAttributionLookup {
  campaignByName: Map<string, string>;
  adSetByName: Map<string, string>;
  adByName: Map<string, string>;
}

interface ResolveMetaEntityIdsInput {
  storeId: string;
  utmCampaign?: string | null;
  utmMedium?: string | null;
  utmContent?: string | null;
  campaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
}

interface ResolveMetaEntityIdsResult {
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
}

interface MetaInsightsRow {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
}

const LOOKUP_TTL_MS = 30 * 60 * 1000;
const MAX_INSIGHTS_PAGES = 5;
const lookupCache = new Map<string, { at: number; lookup: MetaAttributionLookup }>();
const inFlightLookup = new Map<string, Promise<MetaAttributionLookup>>();

function createLookup(): MetaAttributionLookup {
  return {
    campaignByName: new Map<string, string>(),
    adSetByName: new Map<string, string>(),
    adByName: new Map<string, string>(),
  };
}

function toStringSafe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function normalizeLookupKey(raw: string): string {
  let value = raw.trim();
  if (!value) return '';
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep raw value when decoding fails
  }
  return value
    .replace(/\+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function addLookupRow(map: Map<string, string>, name: string | undefined, id: string | undefined): void {
  if (!name || !id) return;
  const key = normalizeLookupKey(name);
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, id);
  }
}

function scoreLookupMatch(target: string, candidate: string): number {
  if (target === candidate) return 1;

  if (target.includes(candidate) || candidate.includes(target)) {
    const shorter = Math.min(target.length, candidate.length);
    const longer = Math.max(target.length, candidate.length) || 1;
    return 0.9 + (shorter / longer) * 0.09;
  }

  const targetTokens = new Set(target.split(' ').filter(Boolean));
  const candidateTokens = new Set(candidate.split(' ').filter(Boolean));
  if (targetTokens.size === 0 || candidateTokens.size === 0) return 0;

  let common = 0;
  for (const token of targetTokens) {
    if (candidateTokens.has(token)) common += 1;
  }
  if (common === 0) return 0;

  const overlap = common / Math.max(targetTokens.size, candidateTokens.size);
  const targetFirst = target.split(' ')[0] || '';
  const candidateFirst = candidate.split(' ')[0] || '';
  const prefixBonus = targetFirst && candidateFirst && targetFirst === candidateFirst ? 0.05 : 0;
  return Math.min(0.89, overlap + prefixBonus);
}

function findLookupId(map: Map<string, string>, raw: string | null | undefined): string | null {
  if (!raw) return null;
  const target = normalizeLookupKey(raw);
  if (!target) return null;

  const exact = map.get(target);
  if (exact) return exact;

  let bestId: string | null = null;
  let bestScore = 0;
  let ambiguous = false;

  for (const [candidateKey, candidateId] of map.entries()) {
    const score = scoreLookupMatch(target, candidateKey);
    if (score < 0.86) continue;
    if (score > bestScore) {
      bestScore = score;
      bestId = candidateId;
      ambiguous = false;
      continue;
    }
    if (Math.abs(score - bestScore) < 1e-6 && bestId && candidateId !== bestId) {
      ambiguous = true;
    }
  }

  if (!bestId || ambiguous) return null;
  return bestId;
}

function ingestFromSnapshots(storeId: string, lookup: MetaAttributionLookup): void {
  const campaignSnapshots = getRecentMetaEndpointSnapshots<unknown[]>(storeId, 'campaigns', 120);
  for (const snapshot of campaignSnapshots) {
    if (!Array.isArray(snapshot.data)) continue;
    for (const raw of snapshot.data) {
      const row = raw as Record<string, unknown>;
      addLookupRow(lookup.campaignByName, toStringSafe(row.name), toStringSafe(row.id));
    }
  }

  const adSetSnapshots = getRecentMetaEndpointSnapshots<unknown[]>(storeId, 'adsets', 120);
  for (const snapshot of adSetSnapshots) {
    if (!Array.isArray(snapshot.data)) continue;
    for (const raw of snapshot.data) {
      const row = raw as Record<string, unknown>;
      addLookupRow(lookup.adSetByName, toStringSafe(row.name), toStringSafe(row.id));
    }
  }

  const adSnapshots = getRecentMetaEndpointSnapshots<unknown[]>(storeId, 'ads', 120);
  for (const snapshot of adSnapshots) {
    if (!Array.isArray(snapshot.data)) continue;
    for (const raw of snapshot.data) {
      const row = raw as Record<string, unknown>;
      addLookupRow(lookup.adByName, toStringSafe(row.name), toStringSafe(row.id));
    }
  }
}

async function fetchInsightsPages(
  accessToken: string,
  accountId: string,
  lookup: MetaAttributionLookup
): Promise<void> {
  const initial = await fetchFromMeta<{ data?: MetaInsightsRow[]; paging?: { next?: string } }>(
    accessToken,
    `/${accountId}/insights`,
    {
      fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name',
      level: 'ad',
      date_preset: 'last_30d',
      limit: '500',
    },
    12_000,
    0
  ).catch(() => ({ data: [] as MetaInsightsRow[] }));
  let response: { data?: MetaInsightsRow[]; paging?: { next?: string } } = initial;

  const addRows = (rows: MetaInsightsRow[] | undefined) => {
    if (!rows) return;
    for (const row of rows) {
      addLookupRow(lookup.campaignByName, row.campaign_name, row.campaign_id);
      addLookupRow(lookup.adSetByName, row.adset_name, row.adset_id);
      addLookupRow(lookup.adByName, row.ad_name, row.ad_id);
    }
  };

  addRows(response.data);

  let nextUrl = response.paging?.next;
  let page = 1;
  while (nextUrl && page < MAX_INSIGHTS_PAGES) {
    page += 1;
    try {
      const next = await fetch(nextUrl);
      if (!next.ok) break;
      response = (await next.json()) as { data?: MetaInsightsRow[]; paging?: { next?: string } };
      addRows(response.data);
      nextUrl = response.paging?.next;
    } catch {
      break;
    }
  }
}

async function fetchCampaignNames(accessToken: string, accountId: string, lookup: MetaAttributionLookup): Promise<void> {
  const response = await fetchFromMeta<{ data?: Array<{ id?: string; name?: string }> }>(
    accessToken,
    `/${accountId}/campaigns`,
    { fields: 'id,name', limit: '300' },
    10_000,
    0
  ).catch(() => ({ data: [] as Array<{ id?: string; name?: string }> }));

  for (const row of response.data || []) {
    addLookupRow(lookup.campaignByName, row.name, row.id);
  }
}

async function buildLookup(storeId: string): Promise<MetaAttributionLookup> {
  const lookup = createLookup();

  // Fast path: most active entities are already in local endpoint snapshots.
  ingestFromSnapshots(storeId, lookup);

  const token = await getMetaToken(storeId);
  if (!token?.accessToken) return lookup;

  const accounts = getStoreAdAccounts(storeId)
    .filter((a) => a.platform === 'meta' && a.is_active === 1)
    .map((a) => a.ad_account_id);
  if (accounts.length === 0) return lookup;

  for (const accountId of accounts) {
    await fetchInsightsPages(token.accessToken, accountId, lookup);
    await fetchCampaignNames(token.accessToken, accountId, lookup);
  }

  return lookup;
}

async function getLookup(storeId: string): Promise<MetaAttributionLookup> {
  const cached = lookupCache.get(storeId);
  if (cached && Date.now() - cached.at < LOOKUP_TTL_MS) {
    return cached.lookup;
  }

  const pending = inFlightLookup.get(storeId);
  if (pending) return pending;

  const next = buildLookup(storeId)
    .then((lookup) => {
      lookupCache.set(storeId, { at: Date.now(), lookup });
      return lookup;
    })
    .finally(() => {
      inFlightLookup.delete(storeId);
    });
  inFlightLookup.set(storeId, next);
  return next;
}

export async function resolveMetaEntityIdsFromUtms(input: ResolveMetaEntityIdsInput): Promise<ResolveMetaEntityIdsResult> {
  const result: ResolveMetaEntityIdsResult = {
    campaignId: input.campaignId || null,
    adSetId: input.adSetId || null,
    adId: input.adId || null,
  };

  const hasNames = Boolean(
    (input.utmCampaign && input.utmCampaign.trim()) ||
      (input.utmMedium && input.utmMedium.trim()) ||
      (input.utmContent && input.utmContent.trim())
  );
  if (!hasNames) return result;
  if (result.campaignId && result.adSetId && result.adId) return result;

  const lookup = await getLookup(input.storeId);

  if (!result.campaignId) result.campaignId = findLookupId(lookup.campaignByName, input.utmCampaign);
  if (!result.adSetId) result.adSetId = findLookupId(lookup.adSetByName, input.utmMedium);
  if (!result.adId) result.adId = findLookupId(lookup.adByName, input.utmContent);

  return result;
}

export function normalizeMetaLookupKey(raw: string): string {
  return normalizeLookupKey(raw);
}
