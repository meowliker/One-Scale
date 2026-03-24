import { subDays } from 'date-fns';
import type { Ad, AdSet, Campaign } from '@/types/campaign';
import { fetchMetaAdSets, fetchMetaAds, fetchMetaCampaigns } from '@/app/api/lib/meta-client';
import { getMetaToken } from '@/app/api/lib/tokens';
import { refreshMetaSetupSnapshots } from '@/app/api/lib/meta-setup-cache';
import { rest } from '@/app/api/lib/supabase-persistence';
import {
  getBatchPersistentMetaEndpointSnapshots,
  getPersistentMetaEndpointSnapshot,
  upsertPersistentMetaEndpointSnapshot,
} from '@/app/api/lib/supabase-tracking';

type SnapshotEndpoint = 'campaigns' | 'adsets' | 'ads' | 'accounts' | 'pages' | 'pixels' | 'instagram';

type CampaignWithContext = Campaign & { ad_account_id?: string };
type AdSetWithContext = AdSet & { ad_account_id?: string; campaign_id?: string };
type AdWithContext = Ad & { ad_account_id?: string; campaign_id?: string; adset_id?: string };

type SetupAccount = {
  id?: string;
  name?: string;
  accountId?: string;
  businessId?: string;
  businessName?: string;
};

type SetupPage = {
  id?: string;
  name?: string;
  instagramId?: string;
  instagramUsername?: string;
  adAccountIds?: string[];
};

type SetupInstagram = {
  id?: string;
  name?: string;
  username?: string;
  linkedPageId?: string;
  adAccountIds?: string[];
};

type SetupPixel = {
  id?: string;
  name?: string;
  adAccountId?: string;
};

type ActiveAccount = {
  ad_account_id: string;
  ad_account_name?: string;
  timezone?: string | null;
};

type EntityEnrichment = {
  adAccountId: string | null;
  adAccountName: string | null;
  businessManagerId: string | null;
  businessManagerName: string | null;
  facebookPageId: string | null;
  facebookPageName: string | null;
  instagramId: string | null;
  instagramUsername: string | null;
  pixelId: string | null;
  pixelName: string | null;
};

type CampaignEntityRow = {
  store_id: string;
  campaign_id: string;
  campaign_name: string;
  ad_account_id: string | null;
  ad_account_name: string | null;
  business_manager_id: string | null;
  business_manager_name: string | null;
  facebook_page_id: string | null;
  facebook_page_name: string | null;
  instagram_id: string | null;
  instagram_username: string | null;
  pixel_id: string | null;
  pixel_name: string | null;
  objective: string | null;
  status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  bid_strategy: string | null;
  start_date: string | null;
  end_date: string | null;
  meta_updated_time: string | null;
  policy_json: Record<string, unknown>;
  metrics_json: Record<string, unknown>;
  raw_json: Record<string, unknown>;
  source_window_start: string | null;
  source_window_end: string | null;
  source_synced_at: string;
  updated_at: string;
};

type AdSetEntityRow = {
  store_id: string;
  adset_id: string;
  campaign_id: string;
  adset_name: string;
  ad_account_id: string | null;
  ad_account_name: string | null;
  business_manager_id: string | null;
  business_manager_name: string | null;
  facebook_page_id: string | null;
  facebook_page_name: string | null;
  instagram_id: string | null;
  instagram_username: string | null;
  pixel_id: string | null;
  pixel_name: string | null;
  status: string | null;
  daily_budget: number | null;
  bid_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  meta_updated_time: string | null;
  targeting_age_min: number | null;
  targeting_age_max: number | null;
  targeting_genders: unknown[];
  targeting_locations: unknown[];
  targeting_interests: unknown[];
  targeting_custom_audiences: unknown[];
  targeting_json: Record<string, unknown>;
  policy_json: Record<string, unknown>;
  metrics_json: Record<string, unknown>;
  raw_json: Record<string, unknown>;
  source_window_start: string | null;
  source_window_end: string | null;
  source_synced_at: string;
  updated_at: string;
};

type AdEntityRow = {
  store_id: string;
  ad_id: string;
  adset_id: string;
  campaign_id: string;
  ad_name: string;
  ad_account_id: string | null;
  ad_account_name: string | null;
  business_manager_id: string | null;
  business_manager_name: string | null;
  facebook_page_id: string | null;
  facebook_page_name: string | null;
  instagram_id: string | null;
  instagram_username: string | null;
  pixel_id: string | null;
  pixel_name: string | null;
  status: string | null;
  creative_id: string | null;
  creative_type: string | null;
  primary_text: string | null;
  headline: string | null;
  cta_type: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  video_id: string | null;
  destination_url: string | null;
  url_tags: string | null;
  policy_json: Record<string, unknown>;
  metrics_json: Record<string, unknown>;
  raw_json: Record<string, unknown>;
  source_window_start: string | null;
  source_window_end: string | null;
  source_synced_at: string;
  updated_at: string;
};

const UPSERT_CHUNK_SIZE = 250;
export const WAREHOUSE_LATEST_VARIANT = 'warehouse:last_30d';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asDateKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function pickArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickFirst<T>(rows: T[]): T | null {
  return rows.length > 0 ? rows[0] : null;
}

export function normalizeMetaAccountId(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/^act_/, '');
}

function buildCampaignScopeId(accountIds: string[]): string {
  const sorted = [...new Set(accountIds)].sort();
  return `accounts:${sorted.join(',')}`;
}

export function buildWarehouseVariantKey(since: string, until: string): string {
  return `warehouse:since:${since}|until:${until}|strict:1`;
}

export function buildWarehouseDateRange(accountTz: string): { since: string; until: string } {
  const until = new Intl.DateTimeFormat('en-CA', { timeZone: accountTz }).format(new Date());
  const start = subDays(new Date(`${until}T00:00:00Z`), 29).toISOString().slice(0, 10);
  return { since: start, until };
}

type EnrichmentLookups = {
  accountNameById: Map<string, string>;
  businessByAccountId: Map<string, { id: string | null; name: string | null }>;
  pagesByAccountId: Map<string, SetupPage[]>;
  pixelsByAccountId: Map<string, SetupPixel[]>;
  instagramByAccountId: Map<string, SetupInstagram[]>;
};

function buildEnrichmentLookups(
  setupAccounts: SetupAccount[],
  setupPages: SetupPage[],
  setupPixels: SetupPixel[],
  setupInstagram: SetupInstagram[],
  activeAccounts: ActiveAccount[]
): EnrichmentLookups {
  const accountNameById = new Map<string, string>();
  const businessByAccountId = new Map<string, { id: string | null; name: string | null }>();
  const pagesByAccountId = new Map<string, SetupPage[]>();
  const pixelsByAccountId = new Map<string, SetupPixel[]>();
  const instagramByAccountId = new Map<string, SetupInstagram[]>();

  for (const account of activeAccounts) {
    const normalized = normalizeMetaAccountId(account.ad_account_id);
    if (normalized) {
      accountNameById.set(normalized, account.ad_account_name || normalized);
    }
  }

  for (const row of setupAccounts) {
    const normalized = normalizeMetaAccountId(asString(row.id) || asString(row.accountId) || '');
    if (!normalized) continue;
    accountNameById.set(normalized, asString(row.name) || accountNameById.get(normalized) || normalized);
    businessByAccountId.set(normalized, {
      id: asString(row.businessId),
      name: asString(row.businessName),
    });
  }

  for (const page of setupPages) {
    for (const id of toArray<string>(page.adAccountIds)) {
      const normalized = normalizeMetaAccountId(id);
      if (!normalized) continue;
      const rows = pagesByAccountId.get(normalized) || [];
      rows.push(page);
      pagesByAccountId.set(normalized, rows);
    }
  }

  for (const pixel of setupPixels) {
    const normalized = normalizeMetaAccountId(asString(pixel.adAccountId) || '');
    if (!normalized) continue;
    const rows = pixelsByAccountId.get(normalized) || [];
    rows.push(pixel);
    pixelsByAccountId.set(normalized, rows);
  }

  for (const ig of setupInstagram) {
    for (const id of toArray<string>(ig.adAccountIds)) {
      const normalized = normalizeMetaAccountId(id);
      if (!normalized) continue;
      const rows = instagramByAccountId.get(normalized) || [];
      rows.push(ig);
      instagramByAccountId.set(normalized, rows);
    }
  }

  return {
    accountNameById,
    businessByAccountId,
    pagesByAccountId,
    pixelsByAccountId,
    instagramByAccountId,
  };
}

function resolveEnrichmentForAccount(
  accountIdRaw: string | null,
  lookups: EnrichmentLookups
): EntityEnrichment {
  const normalized = normalizeMetaAccountId(accountIdRaw);
  const page = pickFirst(lookups.pagesByAccountId.get(normalized) || []);
  const pixel = pickFirst(lookups.pixelsByAccountId.get(normalized) || []);
  const instagram = pickFirst(lookups.instagramByAccountId.get(normalized) || []);
  const business = lookups.businessByAccountId.get(normalized);
  return {
    adAccountId: normalized || null,
    adAccountName: lookups.accountNameById.get(normalized) || null,
    businessManagerId: business?.id || null,
    businessManagerName: business?.name || null,
    facebookPageId: asString(page?.id) || null,
    facebookPageName: asString(page?.name) || null,
    instagramId: asString(page?.instagramId) || asString(instagram?.id) || null,
    instagramUsername: asString(page?.instagramUsername) || asString(instagram?.username) || asString(instagram?.name) || null,
    pixelId: asString(pixel?.id) || null,
    pixelName: asString(pixel?.name) || null,
  };
}

function mergeEnrichment(base: EntityEnrichment, override: Partial<EntityEnrichment>): EntityEnrichment {
  return {
    adAccountId: override.adAccountId ?? base.adAccountId,
    adAccountName: override.adAccountName ?? base.adAccountName,
    businessManagerId: override.businessManagerId ?? base.businessManagerId,
    businessManagerName: override.businessManagerName ?? base.businessManagerName,
    facebookPageId: override.facebookPageId ?? base.facebookPageId,
    facebookPageName: override.facebookPageName ?? base.facebookPageName,
    instagramId: override.instagramId ?? base.instagramId,
    instagramUsername: override.instagramUsername ?? base.instagramUsername,
    pixelId: override.pixelId ?? base.pixelId,
    pixelName: override.pixelName ?? base.pixelName,
  };
}

export const __testUtils = {
  buildEnrichmentLookups,
  resolveEnrichmentForAccount,
  mergeEnrichment,
};

async function upsertRows<T extends Record<string, unknown>>(
  path: string,
  rows: T[]
): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
    await rest(path, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
  }
}

async function getSnapshotData<T>(
  storeId: string,
  endpoint: SnapshotEndpoint,
  scopeId: string,
  preferredVariant: string,
  fallbacks: string[]
): Promise<T[] | null> {
  const variants = [preferredVariant, ...fallbacks];
  for (const variant of variants) {
    const snap = await getPersistentMetaEndpointSnapshot<T[]>(storeId, endpoint, scopeId, variant);
    if (snap?.data && Array.isArray(snap.data) && snap.data.length > 0) {
      return snap.data;
    }
  }
  return null;
}

export async function syncWarehouseSnapshotsForStore(params: {
  storeId: string;
  activeAccounts: ActiveAccount[];
  since: string;
  until: string;
  variantKey: string;
}): Promise<{ campaigns: number; adsets: number; ads: number }> {
  const { storeId, activeAccounts, since, until, variantKey } = params;
  const token = await getMetaToken(storeId);
  if (!token) {
    return { campaigns: 0, adsets: 0, ads: 0 };
  }

  const dateRange = { since, until };

  await refreshMetaSetupSnapshots({
    accessToken: token.accessToken,
    adAccounts: activeAccounts.map((a) => ({
      ad_account_id: a.ad_account_id,
      ad_account_name: a.ad_account_name || a.ad_account_id,
    })),
    writeSnapshot: async (endpoint, scopeId, variant, payload) => {
      await upsertPersistentMetaEndpointSnapshot(storeId, endpoint, scopeId, variant, payload);
    },
  });

  const allCampaigns = await Promise.all(
    activeAccounts.map(async (account) => ({
      accountId: account.ad_account_id,
      campaigns: await fetchMetaCampaigns(token.accessToken, account.ad_account_id, dateRange, {
        disableDateFallback: true,
      }).catch(() => []),
    }))
  );

  const campaignMap = new Map<string, CampaignWithContext>();
  for (const group of allCampaigns) {
    for (const campaign of group.campaigns) {
      if (!campaignMap.has(campaign.id)) {
        campaignMap.set(campaign.id, {
          ...campaign,
          ad_account_id: group.accountId,
        });
      }
    }
  }
  const campaigns = [...campaignMap.values()];
  const campaignScopeId = buildCampaignScopeId(activeAccounts.map((a) => a.ad_account_id));
  await Promise.all([
    upsertPersistentMetaEndpointSnapshot(storeId, 'campaigns', campaignScopeId, variantKey, campaigns),
    upsertPersistentMetaEndpointSnapshot(storeId, 'campaigns', campaignScopeId, WAREHOUSE_LATEST_VARIANT, campaigns),
  ]);

  let adsetCount = 0;
  let adCount = 0;

  for (const campaign of campaigns) {
    const campaignAccountId = asString((campaign as unknown as Record<string, unknown>).ad_account_id) || null;
    const adsets = await fetchMetaAdSets(token.accessToken, campaign.id, dateRange, {
      disableDateFallback: true,
      preferLightweight: true,
      basicOnly: false,
    });
    const adsetsWithContext: AdSetWithContext[] = adsets.map((adset) => ({
      ...adset,
      campaign_id: campaign.id,
      ad_account_id: campaignAccountId || undefined,
    }));

    await Promise.all([
      upsertPersistentMetaEndpointSnapshot(storeId, 'adsets', campaign.id, variantKey, adsetsWithContext),
      upsertPersistentMetaEndpointSnapshot(storeId, 'adsets', campaign.id, WAREHOUSE_LATEST_VARIANT, adsetsWithContext),
    ]);
    adsetCount += adsetsWithContext.length;

    await sleep(120);

    for (const adset of adsetsWithContext) {
      const ads = await fetchMetaAds(token.accessToken, adset.id, dateRange, {
        disableDateFallback: true,
        preferLightweight: true,
        basicOnly: false,
      });
      const adsWithContext: AdWithContext[] = ads.map((ad) => ({
        ...ad,
        adset_id: adset.id,
        campaign_id: campaign.id,
        ad_account_id: campaignAccountId || undefined,
      }));

      await Promise.all([
        upsertPersistentMetaEndpointSnapshot(storeId, 'ads', adset.id, variantKey, adsWithContext),
        upsertPersistentMetaEndpointSnapshot(storeId, 'ads', adset.id, WAREHOUSE_LATEST_VARIANT, adsWithContext),
      ]);
      adCount += adsWithContext.length;
      await sleep(90);
    }
    await sleep(150);
  }

  return {
    campaigns: campaigns.length,
    adsets: adsetCount,
    ads: adCount,
  };
}

export async function materializeStoreMetaEntitiesFromSnapshots(params: {
  storeId: string;
  activeAccounts: ActiveAccount[];
  since: string;
  until: string;
  variantKey: string;
}): Promise<{ campaigns: number; adsets: number; ads: number }> {
  const { storeId, activeAccounts, since, until, variantKey } = params;
  const accountIds = activeAccounts.map((a) => a.ad_account_id).filter(Boolean);
  if (accountIds.length === 0) return { campaigns: 0, adsets: 0, ads: 0 };

  const campaignScopeId = buildCampaignScopeId(accountIds);
  const campaignRows = await getSnapshotData<CampaignWithContext>(
    storeId,
    'campaigns',
    campaignScopeId,
    variantKey,
    [WAREHOUSE_LATEST_VARIANT, 'latest']
  ) || [];

  const [adsetByScopeVariant, adsetByScopeWarehouseLatest, adsetByScopeLatest] = await Promise.all([
    getBatchPersistentMetaEndpointSnapshots<AdSetWithContext[]>(storeId, 'adsets', variantKey),
    getBatchPersistentMetaEndpointSnapshots<AdSetWithContext[]>(storeId, 'adsets', WAREHOUSE_LATEST_VARIANT),
    getBatchPersistentMetaEndpointSnapshots<AdSetWithContext[]>(storeId, 'adsets', 'latest'),
  ]);

  const [adsByScopeVariant, adsByScopeWarehouseLatest, adsByScopeLatest] = await Promise.all([
    getBatchPersistentMetaEndpointSnapshots<AdWithContext[]>(storeId, 'ads', variantKey),
    getBatchPersistentMetaEndpointSnapshots<AdWithContext[]>(storeId, 'ads', WAREHOUSE_LATEST_VARIANT),
    getBatchPersistentMetaEndpointSnapshots<AdWithContext[]>(storeId, 'ads', 'latest'),
  ]);

  const [setupAccountsSnap, setupPagesSnap, setupPixelsSnap, setupInstagramSnap] = await Promise.all([
    getPersistentMetaEndpointSnapshot<SetupAccount[]>(storeId, 'accounts', '', 'latest'),
    getPersistentMetaEndpointSnapshot<SetupPage[]>(storeId, 'pages', '', 'latest'),
    getPersistentMetaEndpointSnapshot<SetupPixel[]>(storeId, 'pixels', '', 'latest'),
    getPersistentMetaEndpointSnapshot<SetupInstagram[]>(storeId, 'instagram', '', 'latest'),
  ]);

  const setupAccounts = toArray<SetupAccount>(setupAccountsSnap?.data);
  const setupPages = toArray<SetupPage>(setupPagesSnap?.data);
  const setupPixels = toArray<SetupPixel>(setupPixelsSnap?.data);
  const setupInstagram = toArray<SetupInstagram>(setupInstagramSnap?.data);

  const lookups = buildEnrichmentLookups(setupAccounts, setupPages, setupPixels, setupInstagram, activeAccounts);

  const adsets: AdSetWithContext[] = [];
  const ads: AdWithContext[] = [];

  for (const campaign of campaignRows) {
    const byVariant = adsetByScopeVariant.get(campaign.id)?.data || [];
    const byWarehouseLatest = adsetByScopeWarehouseLatest.get(campaign.id)?.data || [];
    const byLatest = adsetByScopeLatest.get(campaign.id)?.data || [];
    const campaignAdsets = (byVariant.length > 0 ? byVariant : byWarehouseLatest.length > 0 ? byWarehouseLatest : byLatest)
      .map((adset) => ({
        ...adset,
        campaign_id: adset.campaign_id || campaign.id,
      }));
    adsets.push(...campaignAdsets);

    for (const adset of campaignAdsets) {
      const adsVariant = adsByScopeVariant.get(adset.id)?.data || [];
      const adsWarehouseLatest = adsByScopeWarehouseLatest.get(adset.id)?.data || [];
      const adsLatest = adsByScopeLatest.get(adset.id)?.data || [];
      const adsetAds = (adsVariant.length > 0 ? adsVariant : adsWarehouseLatest.length > 0 ? adsWarehouseLatest : adsLatest)
        .map((ad) => ({
          ...ad,
          adset_id: ad.adset_id || adset.id,
          campaign_id: ad.campaign_id || adset.campaign_id || campaign.id,
        }));
      ads.push(...adsetAds);
    }
  }

  const nowIso = new Date().toISOString();
  const adsetCampaignMap = new Map<string, string>();
  for (const adset of adsets) {
    const cId = adset.campaign_id || adset.campaignId;
    if (cId) adsetCampaignMap.set(adset.id, cId);
  }

  const campaignEnrichmentMap = new Map<string, EntityEnrichment>();
  const adsetEnrichmentMap = new Map<string, EntityEnrichment>();

  const campaignEntityRows: CampaignEntityRow[] = campaignRows.map((campaign) => {
    const cRaw = toRecord(campaign);
    const accountIdRaw = asString(cRaw.ad_account_id) || null;
    const enrichment = resolveEnrichmentForAccount(accountIdRaw, lookups);
    campaignEnrichmentMap.set(campaign.id, enrichment);
    return {
      store_id: storeId,
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      ad_account_id: enrichment.adAccountId,
      ad_account_name: enrichment.adAccountName,
      business_manager_id: enrichment.businessManagerId,
      business_manager_name: enrichment.businessManagerName,
      facebook_page_id: enrichment.facebookPageId,
      facebook_page_name: enrichment.facebookPageName,
      instagram_id: enrichment.instagramId,
      instagram_username: enrichment.instagramUsername,
      pixel_id: enrichment.pixelId,
      pixel_name: enrichment.pixelName,
      objective: asString(campaign.objective),
      status: asString(campaign.status),
      daily_budget: asNumber(campaign.dailyBudget),
      lifetime_budget: asNumber(campaign.lifetimeBudget),
      bid_strategy: asString(campaign.bidStrategy),
      start_date: asString(campaign.startDate),
      end_date: asString(campaign.endDate),
      meta_updated_time: asString(campaign.updatedTime),
      policy_json: toRecord(campaign.policyInfo),
      metrics_json: toRecord(campaign.metrics),
      raw_json: toRecord(campaign),
      source_window_start: asDateKey(since),
      source_window_end: asDateKey(until),
      source_synced_at: nowIso,
      updated_at: nowIso,
    };
  });

  const adsetEntityRows: AdSetEntityRow[] = adsets.map((adset) => {
    const raw = toRecord(adset);
    const campaignId = asString(raw.campaign_id) || adset.campaignId || '';
    const accountIdRaw = asString(raw.ad_account_id) || null;
    const accountEnrichment = resolveEnrichmentForAccount(accountIdRaw, lookups);
    const campaignEnrichment = campaignEnrichmentMap.get(campaignId);
    const enrichment = mergeEnrichment(campaignEnrichment || accountEnrichment, accountEnrichment);
    adsetEnrichmentMap.set(adset.id, enrichment);
    return {
      store_id: storeId,
      adset_id: adset.id,
      campaign_id: campaignId,
      adset_name: adset.name,
      ad_account_id: enrichment.adAccountId,
      ad_account_name: enrichment.adAccountName,
      business_manager_id: enrichment.businessManagerId,
      business_manager_name: enrichment.businessManagerName,
      facebook_page_id: enrichment.facebookPageId,
      facebook_page_name: enrichment.facebookPageName,
      instagram_id: enrichment.instagramId,
      instagram_username: enrichment.instagramUsername,
      pixel_id: enrichment.pixelId,
      pixel_name: enrichment.pixelName,
      status: asString(adset.status),
      daily_budget: asNumber(adset.dailyBudget),
      bid_amount: asNumber(adset.bidAmount),
      start_date: asString(adset.startDate),
      end_date: asString(adset.endDate),
      meta_updated_time: asString(adset.updatedTime),
      targeting_age_min: asNumber(adset.targeting?.ageMin),
      targeting_age_max: asNumber(adset.targeting?.ageMax),
      targeting_genders: pickArray(adset.targeting?.genders),
      targeting_locations: pickArray(adset.targeting?.locations),
      targeting_interests: pickArray(adset.targeting?.interests),
      targeting_custom_audiences: pickArray(adset.targeting?.customAudiences),
      targeting_json: toRecord(adset.targeting),
      policy_json: toRecord(adset.policyInfo),
      metrics_json: toRecord(adset.metrics),
      raw_json: toRecord(adset),
      source_window_start: asDateKey(since),
      source_window_end: asDateKey(until),
      source_synced_at: nowIso,
      updated_at: nowIso,
    };
  });

  const adEntityRows: AdEntityRow[] = ads.map((ad) => {
    const raw = toRecord(ad);
    const adsetId = asString(raw.adset_id) || ad.adSetId || '';
    const campaignId = asString(raw.campaign_id) || adsetCampaignMap.get(adsetId) || '';
    const accountIdRaw = asString(raw.ad_account_id) || null;
    const accountEnrichment = resolveEnrichmentForAccount(accountIdRaw, lookups);
    const adsetEnrichment = adsetEnrichmentMap.get(adsetId);
    const campaignEnrichment = campaignEnrichmentMap.get(campaignId);
    const inherited = adsetEnrichment || campaignEnrichment || accountEnrichment;
    const enrichment = mergeEnrichment(inherited, accountEnrichment);

    const creativeRaw = toRecord(ad.creative);
    return {
      store_id: storeId,
      ad_id: ad.id,
      adset_id: adsetId,
      campaign_id: campaignId,
      ad_name: ad.name,
      ad_account_id: enrichment.adAccountId,
      ad_account_name: enrichment.adAccountName,
      business_manager_id: enrichment.businessManagerId,
      business_manager_name: enrichment.businessManagerName,
      facebook_page_id: enrichment.facebookPageId,
      facebook_page_name: enrichment.facebookPageName,
      instagram_id: enrichment.instagramId,
      instagram_username: enrichment.instagramUsername,
      pixel_id: enrichment.pixelId,
      pixel_name: enrichment.pixelName,
      status: asString(ad.status),
      creative_id: asString(creativeRaw.id),
      creative_type: asString(creativeRaw.type),
      primary_text: asString(creativeRaw.body),
      headline: asString(creativeRaw.headline),
      cta_type: asString(creativeRaw.ctaType),
      media_url: asString(creativeRaw.mediaUrl),
      thumbnail_url: asString(creativeRaw.thumbnailUrl),
      video_id: asString(creativeRaw.videoId),
      destination_url: asString(creativeRaw.destinationUrl),
      url_tags: asString(creativeRaw.urlTags),
      policy_json: toRecord(ad.policyInfo),
      metrics_json: toRecord(ad.metrics),
      raw_json: toRecord(ad),
      source_window_start: asDateKey(since),
      source_window_end: asDateKey(until),
      source_synced_at: nowIso,
      updated_at: nowIso,
    };
  }).filter((row) => row.adset_id.length > 0 && row.campaign_id.length > 0);

  await Promise.all([
    upsertRows('/meta_campaign_entities?on_conflict=store_id,campaign_id', campaignEntityRows),
    upsertRows('/meta_adset_entities?on_conflict=store_id,adset_id', adsetEntityRows),
    upsertRows('/meta_ad_entities?on_conflict=store_id,ad_id', adEntityRows),
  ]);

  return {
    campaigns: campaignEntityRows.length,
    adsets: adsetEntityRows.length,
    ads: adEntityRows.length,
  };
}
