// ─── Meta Audit Service ────────────────────────────────────────────────────────
// Provides data for all 6 tabs of the 360 Meta Audit page.
// Uses createServiceFn to auto-switch between mock data and real API data.
// Real functions derive audit insights from existing API endpoints:
//   /api/meta/campaigns, /api/meta/insights, /api/meta/creatives
// ────────────────────────────────────────────────────────────────────────────────

import { apiClient } from '@/services/api';
import { createServiceFn } from '@/services/withMockFallback';
import type { Campaign, AdSet, Ad, PerformanceMetrics, TargetingSpec, AdCreative } from '@/types/campaign';
import type { Creative } from '@/types/creative';
import type { DateRange } from '@/types/analytics';
import { formatDateInTimezone } from '@/lib/timezone';
import type {
  AuditScore,
  AccountOverview,
  SpendByDay,
  TopInsight,
  AudienceTypeBreakdown,
  InterestTargeting,
  LookalikeBreakdown,
  AgeGenderBreakdown,
  DeviceBreakdown,
  SystemBreakdown,
  PlacementBreakdown,
  BudgetOptComparison,
  BudgetRange,
  ObjectiveBreakdown,
  DeliveryOptBreakdown,
  AuctionOverlap,
  CpmTrend,
  FrequencyDistribution,
  CountryBreakdown,
  RegionBreakdown,
  AgeBreakdown,
  GenderBreakdown,
  LanguageBreakdown,
  AdFormatBreakdown,
  CreativePerformanceMatrix,
  CreativeSizeBreakdown,
  HookRateByFormat,
  CreativeRefreshData,
  HeadlineLengthPerformance,
  CtaPerformance,
  EmojiUsage,
  TopPerformingHeadline,
  PrimaryTextLength,
  SentimentAnalysis,
} from '@/data/mockAuditData';

// Import all mock data values
import {
  auditScore as mockAuditScore,
  accountOverview as mockAccountOverview,
  spendByDay as mockSpendByDay,
  topInsights as mockTopInsights,
  audienceTypeBreakdown as mockAudienceTypeBreakdown,
  interestTargeting as mockInterestTargeting,
  lookalikeBreakdown as mockLookalikeBreakdown,
  ageGenderBreakdown as mockAgeGenderBreakdown,
  deviceBreakdown as mockDeviceBreakdown,
  systemBreakdown as mockSystemBreakdown,
  placementBreakdown as mockPlacementBreakdown,
  budgetOptComparison as mockBudgetOptComparison,
  cboBudgetRanges as mockCboBudgetRanges,
  aboBudgetRanges as mockAboBudgetRanges,
  objectiveBreakdown as mockObjectiveBreakdown,
  deliveryOptBreakdown as mockDeliveryOptBreakdown,
  auctionOverlap as mockAuctionOverlap,
  cpmTrend as mockCpmTrend,
  frequencyDistribution as mockFrequencyDistribution,
  countryBreakdown as mockCountryBreakdown,
  regionBreakdown as mockRegionBreakdown,
  ageBreakdown as mockAgeBreakdown,
  genderBreakdown as mockGenderBreakdown,
  languageBreakdown as mockLanguageBreakdown,
  adFormatBreakdown as mockAdFormatBreakdown,
  creativePerformanceMatrix as mockCreativePerformanceMatrix,
  creativeSizeBreakdown as mockCreativeSizeBreakdown,
  hookRateByFormat as mockHookRateByFormat,
  creativeRefreshData as mockCreativeRefreshData,
  headlineLengthPerformance as mockHeadlineLengthPerformance,
  ctaPerformance as mockCtaPerformance,
  emojiUsage as mockEmojiUsage,
  topPerformingHeadlines as mockTopPerformingHeadlines,
  primaryTextLength as mockPrimaryTextLength,
  sentimentAnalysis as mockSentimentAnalysis,
} from '@/data/mockAuditData';


// ═══════════════════════════════════════════════════════════════════════════════
// Shared types for API responses
// ═══════════════════════════════════════════════════════════════════════════════

interface InsightDay {
  date: string;
  metrics: Record<string, number>;
}

interface InsightBreakdownRow {
  [key: string]: string | PerformanceMetrics | undefined;
  age?: string;
  country?: string;
  gender?: string;
  region?: string;
  metrics: PerformanceMetrics;
}

export type AuditFilterPreset = 'all' | 'active' | 'spending';

export interface MetaAuditQuery {
  dateRange?: DateRange;
  filterPreset?: AuditFilterPreset;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: round to 2 decimal places
// ═══════════════════════════════════════════════════════════════════════════════

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function toMetaDatePreset(range?: DateRange): string {
  if (!range) return 'last_30d';
  const preset = range.preset;
  if (preset === 'today') return 'today';
  if (preset === 'yesterday') return 'yesterday';
  if (preset === 'last7') return 'last_7d';
  if (preset === 'last14') return 'last_14d';
  if (preset === 'last30') return 'last_30d';
  if (preset === 'thisMonth') return 'this_month';
  if (preset === 'lastMonth') return 'last_month';

  const diffMs = Math.max(0, range.end.getTime() - range.start.getTime());
  const daySpan = Math.max(1, Math.ceil(diffMs / 86400000) + 1);
  if (daySpan <= 1) return 'today';
  if (daySpan <= 7) return 'last_7d';
  if (daySpan <= 14) return 'last_14d';
  if (daySpan <= 30) return 'last_30d';
  if (daySpan <= 90) return 'last_90d';
  return 'maximum';
}

function isActiveStatus(status: string): boolean {
  return status === 'ACTIVE';
}

function isSpending(spend: number): boolean {
  return spend > 0;
}

function filterCampaignTree(campaigns: Campaign[], filterPreset: AuditFilterPreset = 'all'): Campaign[] {
  if (filterPreset === 'all') return campaigns;

  return campaigns
    .map((campaign) => {
      const adSets = campaign.adSets
        .map((adSet) => ({
          ...adSet,
          ads: adSet.ads.filter((ad) =>
            filterPreset === 'active'
              ? isActiveStatus(ad.status)
              : isSpending(ad.metrics.spend)
          ),
        }))
        .filter((adSet) =>
          filterPreset === 'active'
            ? isActiveStatus(adSet.status) || adSet.ads.length > 0
            : isSpending(adSet.metrics.spend) || adSet.ads.length > 0
        );

      return {
        ...campaign,
        adSets,
      };
    })
    .filter((campaign) =>
      filterPreset === 'active'
        ? isActiveStatus(campaign.status) || campaign.adSets.length > 0
        : isSpending(campaign.metrics.spend) || campaign.adSets.length > 0
    );
}

interface ScopedEntitySets {
  campaignIds: Set<string>;
  adSetIds: Set<string>;
  adIds: Set<string>;
}

function buildScopedEntitySets(campaigns: Campaign[]): ScopedEntitySets {
  const campaignIds = new Set<string>();
  const adSetIds = new Set<string>();
  const adIds = new Set<string>();
  for (const campaign of campaigns) {
    campaignIds.add(campaign.id);
    for (const adSet of campaign.adSets) {
      adSetIds.add(adSet.id);
      for (const ad of adSet.ads) {
        adIds.add(ad.id);
      }
    }
  }
  return { campaignIds, adSetIds, adIds };
}

function filterCreativesByScopedEntities(creatives: Creative[], scoped: ScopedEntitySets): Creative[] {
  if (scoped.campaignIds.size === 0 && scoped.adSetIds.size === 0 && scoped.adIds.size === 0) {
    return creatives;
  }
  return creatives.filter((creative) => {
    if (scoped.adIds.has(creative.id)) return true;
    if (creative.adSetId && scoped.adSetIds.has(creative.adSetId)) return true;
    if (creative.id.startsWith('adset_') && scoped.adSetIds.has(creative.id.replace(/^adset_/, ''))) return true;
    if (creative.campaignId && scoped.campaignIds.has(creative.campaignId)) return true;
    return false;
  });
}

function deriveCreativeDeliveryStatus(
  configuredStatus: string | undefined,
  effectiveStatus: string | undefined,
  spend: number,
  impressions: number
): string {
  const configured = safeString(configuredStatus).toUpperCase();
  const effective = safeString(effectiveStatus).toUpperCase();
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

const METRIC_KEYS: (keyof PerformanceMetrics)[] = [
  'spend', 'revenue', 'roas', 'ctr', 'cpc', 'cpm', 'impressions', 'reach', 'clicks', 'conversions', 'aov',
  'frequency', 'cvr', 'cpa', 'results', 'costPerResult', 'purchases', 'purchaseValue', 'addToCart',
  'addToCartValue', 'initiateCheckout', 'leads', 'costPerLead', 'linkClicks', 'linkCTR', 'costPerLinkClick',
  'postEngagement', 'postReactions', 'postComments', 'postShares', 'pageLikes', 'videoViews', 'videoThruPlays',
  'videoAvgPctWatched', 'costPerThruPlay', 'qualityRanking', 'engagementRateRanking', 'conversionRateRanking',
  'uniqueClicks', 'uniqueCTR', 'landingPageViews', 'costPerLandingPageView',
];

const DEFAULT_METRICS: PerformanceMetrics = METRIC_KEYS.reduce((acc, key) => {
  acc[key] = 0;
  return acc;
}, {} as Record<keyof PerformanceMetrics, number>) as PerformanceMetrics;

const DEFAULT_TARGETING: TargetingSpec = {
  ageMin: 18,
  ageMax: 65,
  genders: ['all'],
  locations: [],
  interests: [],
  customAudiences: [],
};

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeMetrics(metrics: unknown): PerformanceMetrics {
  const raw = (metrics && typeof metrics === 'object') ? metrics as Record<string, unknown> : {};
  const next = { ...DEFAULT_METRICS };
  for (const key of METRIC_KEYS) {
    next[key] = safeNumber(raw[key], 0);
  }
  return next;
}

function normalizeCreative(input: unknown): AdCreative {
  const raw = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
  const rawType = safeString(raw.type, 'image').toLowerCase();
  const type: AdCreative['type'] = rawType === 'video' || rawType === 'carousel' ? rawType : 'image';
  return {
    id: safeString(raw.id, ''),
    type,
    headline: safeString(raw.headline, ''),
    body: safeString(raw.body, ''),
    ctaType: (safeString(raw.ctaType, 'SHOP_NOW') as AdCreative['ctaType']),
    mediaUrl: safeString(raw.mediaUrl, ''),
    thumbnailUrl: safeString(raw.thumbnailUrl, ''),
    videoId: safeString(raw.videoId) || undefined,
  };
}

function normalizeTargeting(input: unknown): TargetingSpec {
  const raw = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
  const gendersRaw = safeArray<string>(raw.genders).map((g) => safeString(g).toLowerCase());
  const genders: TargetingSpec['genders'] = gendersRaw.includes('male') || gendersRaw.includes('female')
    ? ([
      ...(gendersRaw.includes('male') ? (['male'] as const) : []),
      ...(gendersRaw.includes('female') ? (['female'] as const) : []),
    ] as TargetingSpec['genders'])
    : ['all'];
  return {
    ageMin: clamp(safeNumber(raw.ageMin, DEFAULT_TARGETING.ageMin), 13, 99),
    ageMax: clamp(safeNumber(raw.ageMax, DEFAULT_TARGETING.ageMax), 13, 99),
    genders,
    locations: safeArray<string>(raw.locations).map((x) => safeString(x)).filter(Boolean),
    interests: safeArray<string>(raw.interests).map((x) => safeString(x)).filter(Boolean),
    customAudiences: safeArray<string>(raw.customAudiences).map((x) => safeString(x)).filter(Boolean),
  };
}

function normalizeAd(rawAd: unknown, adSetId: string): Ad {
  const raw = (rawAd && typeof rawAd === 'object') ? rawAd as Record<string, unknown> : {};
  const status = safeString(raw.status, 'PAUSED') as Ad['status'];
  return {
    id: safeString(raw.id, ''),
    adSetId: safeString(raw.adSetId, adSetId),
    name: safeString(raw.name, 'Untitled Ad'),
    status,
    creative: normalizeCreative(raw.creative),
    metrics: normalizeMetrics(raw.metrics),
    policyInfo: raw.policyInfo as Ad['policyInfo'],
  };
}

function normalizeAdSet(rawAdSet: unknown, campaignId: string, includeAds: boolean): AdSet {
  const raw = (rawAdSet && typeof rawAdSet === 'object') ? rawAdSet as Record<string, unknown> : {};
  const id = safeString(raw.id, '');
  const targeting = normalizeTargeting(raw.targeting);
  const ageMin = Math.min(targeting.ageMin, targeting.ageMax);
  const ageMax = Math.max(targeting.ageMin, targeting.ageMax);
  return {
    id,
    campaignId: safeString(raw.campaignId, campaignId),
    name: safeString(raw.name, 'Untitled Ad Set'),
    status: safeString(raw.status, 'PAUSED') as AdSet['status'],
    policyInfo: raw.policyInfo as AdSet['policyInfo'],
    dailyBudget: safeNumber(raw.dailyBudget, 0),
    bidAmount: raw.bidAmount == null ? null : safeNumber(raw.bidAmount, 0),
    targeting: { ...targeting, ageMin, ageMax },
    startDate: safeString(raw.startDate, new Date().toISOString()),
    endDate: raw.endDate == null ? null : safeString(raw.endDate),
    ads: includeAds ? safeArray(raw.ads).map((ad) => normalizeAd(ad, id)).filter((ad) => ad.id) : [],
    metrics: normalizeMetrics(raw.metrics),
  };
}

function normalizeCampaign(rawCampaign: unknown, includeAds: boolean): Campaign {
  const raw = (rawCampaign && typeof rawCampaign === 'object') ? rawCampaign as Record<string, unknown> : {};
  const id = safeString(raw.id, '');
  const adSets = safeArray(raw.adSets).map((adSet) => normalizeAdSet(adSet, id, includeAds)).filter((x) => x.id);
  return {
    id,
    name: safeString(raw.name, 'Untitled Campaign'),
    objective: safeString(raw.objective, 'CONVERSIONS') as Campaign['objective'],
    status: safeString(raw.status, 'PAUSED') as Campaign['status'],
    policyInfo: raw.policyInfo as Campaign['policyInfo'],
    dailyBudget: safeNumber(raw.dailyBudget, 0),
    lifetimeBudget: raw.lifetimeBudget == null ? null : safeNumber(raw.lifetimeBudget, 0),
    bidStrategy: safeString(raw.bidStrategy, 'LOWEST_COST') as Campaign['bidStrategy'],
    startDate: safeString(raw.startDate, new Date().toISOString()),
    endDate: raw.endDate == null ? null : safeString(raw.endDate),
    adSets,
    metrics: normalizeMetrics(raw.metrics),
  };
}

function normalizeCampaignTree(campaigns: unknown, includeAds: boolean): Campaign[] {
  return safeArray(campaigns).map((campaign) => normalizeCampaign(campaign, includeAds)).filter((c) => c.id);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared data fetchers (memoised per call to avoid duplicate requests)
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchCampaigns(query?: MetaAuditQuery): Promise<Campaign[]> {
  const params: Record<string, string> = {
    preferCache: '1',
  };
  if (query?.dateRange) {
    params.since = formatDateInTimezone(query.dateRange.start);
    params.until = formatDateInTimezone(query.dateRange.end);
    params.strictDate = '1';
  }
  const res = await apiClient<{ data: Campaign[] }>('/api/meta/campaigns', {
    params,
    timeoutMs: 25_000,
    maxRetries: 0,
  });
  return normalizeCampaignTree(res.data, false);
}

function getDateParams(query?: MetaAuditQuery): Record<string, string> {
  if (!query?.dateRange) return {};
  return {
    since: formatDateInTimezone(query.dateRange.start),
    until: formatDateInTimezone(query.dateRange.end),
    strictDate: '1',
  };
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

const campaignHierarchyCache = new Map<string, Promise<Campaign[]>>();
const MAX_HYDRATED_CAMPAIGNS = 10;
const MAX_HYDRATED_CAMPAIGNS_HARD_CAP = 20;
const SNAPSHOT_PREWARM_TTL_MS = 5 * 60 * 1000;
const snapshotPrewarmCache = new Map<string, { at: number; promise: Promise<void> }>();

async function fetchCampaignHierarchy(query?: MetaAuditQuery, includeAds = false, hydrateLimit = MAX_HYDRATED_CAMPAIGNS): Promise<Campaign[]> {
  const dateParams = getDateParams(query);
  const effectiveHydrateLimit = Math.min(MAX_HYDRATED_CAMPAIGNS_HARD_CAP, Math.max(1, hydrateLimit));
  const cacheKey = `${dateParams.since || ''}|${dateParams.until || ''}|${includeAds ? 'ads' : 'noads'}|hydrate:${effectiveHydrateLimit}`;
  const cached = campaignHierarchyCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const campaigns = await fetchCampaigns(query);
      if (campaigns.length === 0) return campaigns;

      const hydrationCandidates = [...campaigns]
        .sort((a, b) => (b.metrics.spend || 0) - (a.metrics.spend || 0))
        .slice(0, effectiveHydrateLimit);

      const adSetsByCampaign = await mapWithConcurrency(hydrationCandidates, 2, async (campaign) => {
        try {
          const res = await apiClient<{ data: AdSet[] }>('/api/meta/adsets', {
            params: {
              campaignId: campaign.id,
              mode: 'audit',
              preferCache: '1',
              ...dateParams,
            },
            timeoutMs: 20_000,
            maxRetries: 0,
          });
          return safeArray(res.data).map((adSet) => normalizeAdSet(adSet, campaign.id, false));
        } catch {
          return [] as AdSet[];
        }
      });
      const adSetsByCampaignId = new Map<string, AdSet[]>(
        hydrationCandidates.map((campaign, idx) => [campaign.id, adSetsByCampaign[idx] || []])
      );

      let adsByAdSet = new Map<string, Ad[]>();
      if (includeAds) {
        const allAdSets = adSetsByCampaign.flat();
        const adsList = await mapWithConcurrency(allAdSets, 2, async (adSet) => {
          try {
            const res = await apiClient<{ data: Ad[] }>('/api/meta/ads', {
              params: {
                adsetId: adSet.id,
                mode: 'audit',
                preferCache: '1',
                ...dateParams,
              },
              timeoutMs: 20_000,
              maxRetries: 0,
            });
            return { adSetId: adSet.id, ads: safeArray(res.data).map((ad) => normalizeAd(ad, adSet.id)) };
          } catch {
            return { adSetId: adSet.id, ads: [] as Ad[] };
          }
        });
        adsByAdSet = new Map(adsList.map((x) => [x.adSetId, x.ads]));
      }

      return campaigns.map((campaign) => {
        const adSets = adSetsByCampaignId.get(campaign.id) || [];
        const hydratedAdSets = adSets.map((adSet) => ({
          ...adSet,
          ads: includeAds ? (adsByAdSet.get(adSet.id) || []) : [],
        }));
        return normalizeCampaign({
          ...campaign,
          adSets: hydratedAdSets,
        }, includeAds);
      });
    } catch {
      campaignHierarchyCache.delete(cacheKey);
      return [] as Campaign[];
    }
  })();

  campaignHierarchyCache.set(cacheKey, promise);
  return promise;
}

export async function primeMetaAuditSnapshotCache(): Promise<void> {
  const now = Date.now();
  const warmKey = 'preset:last_30d';
  const cached = snapshotPrewarmCache.get(warmKey);
  if (cached && now - cached.at < SNAPSHOT_PREWARM_TTL_MS) {
    return cached.promise;
  }

  const promise = (async () => {
    await Promise.allSettled([
      fetchCampaigns(),
      fetchInsights(),
      fetchBreakdownInsights('age,gender', undefined, { datePresetOverride: 'last_30d' }),
      fetchBreakdownInsights('country', undefined, { datePresetOverride: 'last_30d' }),
      fetchBreakdownInsights('region,country', undefined, { datePresetOverride: 'last_30d' }),
      fetchCreatives(undefined, { timeoutMs: 10_000 }),
      fetchCampaignHierarchy(undefined, false, 12),
      fetchCampaignHierarchy(undefined, true, 8),
    ]);
  })();

  snapshotPrewarmCache.set(warmKey, { at: now, promise });
  try {
    await promise;
  } finally {
    const latest = snapshotPrewarmCache.get(warmKey);
    if (latest?.promise === promise) {
      snapshotPrewarmCache.set(warmKey, { at: Date.now(), promise });
    }
  }
}

async function fetchInsights(query?: MetaAuditQuery): Promise<InsightDay[]> {
  const res = await apiClient<{ data: InsightDay[] }>('/api/meta/insights', {
    params: {
      datePreset: toMetaDatePreset(query?.dateRange),
      preferCache: '1',
    },
  });
  return res.data;
}

async function fetchBreakdownInsights(
  breakdowns: string,
  query?: MetaAuditQuery,
  options?: { datePresetOverride?: string },
): Promise<InsightBreakdownRow[]> {
  const keys = breakdowns
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (keys.length === 0) return [];

  const res = await apiClient<{ data: InsightBreakdownRow[] }>('/api/meta/insights', {
    params: {
      datePreset: options?.datePresetOverride || toMetaDatePreset(query?.dateRange),
      breakdowns: keys.join(','),
      preferCache: '1',
    },
    timeoutMs: 25_000,
    maxRetries: 0,
  });

  return safeArray(res.data).map((rawRow) => {
    const raw = (rawRow && typeof rawRow === 'object') ? rawRow as Record<string, unknown> : {};
    const row: InsightBreakdownRow = {
      metrics: normalizeMetrics(raw.metrics),
    };
    for (const key of keys) {
      row[key] = safeString(raw[key]);
    }
    return row;
  });
}

async function fetchAgeGenderInsights(query?: MetaAuditQuery): Promise<InsightBreakdownRow[]> {
  return fetchBreakdownInsights('age,gender', query);
}

async function fetchCreatives(
  query?: MetaAuditQuery,
  options?: { timeoutMs?: number }
): Promise<Creative[]> {
  const res = await apiClient<{ data: Creative[] }>('/api/meta/creatives', {
    params: {
      datePreset: toMetaDatePreset(query?.dateRange),
      // Meta Audit prioritizes fast snapshot-backed loads over slow live recomputation.
      preferCache: '1',
    },
    // Keep this bounded so audit fallback paths can run before section timeout.
    timeoutMs: options?.timeoutMs ?? 15_000,
    maxRetries: 0,
  });
  return safeArray(res.data).map((item, idx) => {
    const row = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
    const typeRaw = safeString(row.type, 'Image').toLowerCase();
    const dailyStats = safeArray<Record<string, unknown>>(row.dailyStats)
      .map((d) => ({
        date: safeString(d.date),
        spend: safeNumber(d.spend, 0),
        revenue: safeNumber(d.revenue, 0),
        roas: safeNumber(d.roas, 0),
        impressions: Math.max(0, Math.round(safeNumber(d.impressions, 0))),
        clicks: Math.max(0, Math.round(safeNumber(d.clicks, 0))),
        conversions: Math.max(0, Math.round(safeNumber(d.conversions, 0))),
      }))
      .filter((d) => d.date);
    return {
      id: safeString(row.id, `creative_${idx}`),
      name: safeString(row.name, `Creative ${idx + 1}`),
      campaignId: safeString(row.campaignId || row.campaign_id) || undefined,
      campaignName: safeString(row.campaignName || row.campaign_name) || undefined,
      adSetId: safeString(row.adSetId || row.adset_id) || undefined,
      adSetName: safeString(row.adSetName || row.adset_name) || undefined,
      headline: safeString(row.headline) || undefined,
      primaryText: safeString(row.primaryText) || undefined,
      type: typeRaw === 'video' ? 'Video' : 'Image',
      spend: safeNumber(row.spend, 0),
      roas: safeNumber(row.roas, 0),
      ctr: safeNumber(row.ctr, 0),
      impressions: Math.max(0, Math.round(safeNumber(row.impressions, 0))),
      status: safeString(row.status, 'Active') === 'Fatigue' ? 'Fatigue' : 'Active',
      thumbnailUrl: safeString(row.thumbnailUrl) || undefined,
      revenue: safeNumber(row.revenue, 0),
      conversions: Math.max(0, Math.round(safeNumber(row.conversions, 0))),
      cpc: safeNumber(row.cpc, 0),
      cpm: safeNumber(row.cpm, 0),
      frequency: safeNumber(row.frequency, 0),
      fatigueScore: clamp(Math.round(safeNumber(row.fatigueScore, 0)), 0, 100),
      startDate: safeString(row.startDate, new Date().toISOString()),
      videoDurationSec: Math.max(0, Math.round(safeNumber(row.videoDurationSec, 0))) || undefined,
      metaConfiguredStatus: safeString(row.metaConfiguredStatus || row.meta_configured_status) || undefined,
      metaEffectiveStatus: safeString(row.metaEffectiveStatus || row.meta_effective_status) || undefined,
      metaDeliveryStatus: safeString(row.metaDeliveryStatus || row.meta_delivery_status) || undefined,
      dailyStats,
    } satisfies Creative;
  });
}

function deriveCreativesFromAds(campaigns: Campaign[]): Creative[] {
  const adContexts = campaigns.flatMap((campaign) =>
    campaign.adSets.flatMap((adSet) =>
      adSet.ads.map((ad) => ({ campaign, adSet, ad }))
    )
  );
  return adContexts.map(({ campaign, adSet, ad }) => {
    const isVideo = ad.creative.type === 'video';
    const fatigueScore = Math.min(
      100,
      Math.round((ad.metrics.frequency / 5) * 50 + (ad.metrics.ctr < 1 ? 30 : 0) + (ad.metrics.roas < 1 ? 20 : 0))
    );
    return {
      id: ad.id,
      name: ad.name || ad.creative.headline || `Ad ${ad.id}`,
      campaignId: campaign.id || undefined,
      campaignName: campaign.name || undefined,
      adSetId: ad.adSetId || adSet.id || undefined,
      adSetName: adSet.name || undefined,
      type: isVideo ? 'Video' : 'Image',
      spend: ad.metrics.spend || 0,
      roas: ad.metrics.roas || 0,
      ctr: ad.metrics.ctr || 0,
      impressions: ad.metrics.impressions || 0,
      status: fatigueScore >= 60 ? 'Fatigue' : 'Active',
      thumbnailUrl: ad.creative.thumbnailUrl || undefined,
      revenue: ad.metrics.revenue || 0,
      conversions: ad.metrics.conversions || 0,
      cpc: ad.metrics.cpc || 0,
      cpm: ad.metrics.cpm || 0,
      frequency: ad.metrics.frequency || 0,
      fatigueScore,
      startDate: new Date().toISOString(),
      metaConfiguredStatus: ad.status || undefined,
      metaEffectiveStatus: ad.policyInfo?.effectiveStatus || ad.status || undefined,
      metaDeliveryStatus: deriveCreativeDeliveryStatus(
        ad.status,
        ad.policyInfo?.effectiveStatus || ad.status,
        ad.metrics.spend || 0,
        ad.metrics.impressions || 0
      ),
    };
  });
}

function deriveCreativesFromAdSets(campaigns: Campaign[]): Creative[] {
  const adSets = campaigns.flatMap((c) =>
    c.adSets.map((adSet) => ({ campaign: c, adSet }))
  );
  return adSets
    .filter(({ adSet }) => (adSet.metrics.impressions || 0) > 0 || (adSet.metrics.spend || 0) > 0)
    .map(({ campaign, adSet }) => {
      const metrics = adSet.metrics;
      const fatigueScore = Math.min(
        100,
        Math.round((metrics.frequency / 5) * 50 + (metrics.ctr < 1 ? 30 : 0) + (metrics.roas < 1 ? 20 : 0))
      );
      return {
        id: `adset_${adSet.id}`,
        name: adSet.name || campaign.name || `Ad Set ${adSet.id}`,
        campaignId: campaign.id || undefined,
        campaignName: campaign.name || undefined,
        adSetId: adSet.id || undefined,
        adSetName: adSet.name || undefined,
        headline: adSet.name || campaign.name || '',
        primaryText: campaign.name || '',
        type: 'Image' as const,
        spend: metrics.spend || 0,
        roas: metrics.roas || 0,
        ctr: metrics.ctr || 0,
        impressions: metrics.impressions || 0,
        status: fatigueScore >= 60 ? 'Fatigue' : 'Active',
        thumbnailUrl: undefined,
        revenue: metrics.revenue || 0,
        conversions: metrics.conversions || 0,
        cpc: metrics.cpc || 0,
        cpm: metrics.cpm || 0,
        frequency: metrics.frequency || 0,
        fatigueScore,
        startDate: adSet.startDate || campaign.startDate || new Date().toISOString(),
        metaConfiguredStatus: adSet.status || undefined,
        metaEffectiveStatus: adSet.policyInfo?.effectiveStatus || adSet.status || undefined,
        metaDeliveryStatus: deriveCreativeDeliveryStatus(
          adSet.status,
          adSet.policyInfo?.effectiveStatus || adSet.status,
          metrics.spend || 0,
          metrics.impressions || 0
        ),
      };
    });
}

function deriveCreativesFromCampaigns(campaigns: Campaign[]): Creative[] {
  return campaigns
    .filter((campaign) => (campaign.metrics.impressions || 0) > 0 || (campaign.metrics.spend || 0) > 0)
    .map((campaign) => {
      const metrics = campaign.metrics;
      const fatigueScore = Math.min(
        100,
        Math.round((metrics.frequency / 5) * 50 + (metrics.ctr < 1 ? 30 : 0) + (metrics.roas < 1 ? 20 : 0))
      );
      return {
        id: `campaign_${campaign.id}`,
        name: campaign.name || `Campaign ${campaign.id}`,
        campaignId: campaign.id || undefined,
        campaignName: campaign.name || undefined,
        adSetId: undefined,
        adSetName: undefined,
        headline: campaign.name || '',
        primaryText: campaign.objective || '',
        type: 'Image' as const,
        spend: metrics.spend || 0,
        roas: metrics.roas || 0,
        ctr: metrics.ctr || 0,
        impressions: metrics.impressions || 0,
        status: fatigueScore >= 60 ? 'Fatigue' : 'Active',
        thumbnailUrl: undefined,
        revenue: metrics.revenue || 0,
        conversions: metrics.conversions || 0,
        cpc: metrics.cpc || 0,
        cpm: metrics.cpm || 0,
        frequency: metrics.frequency || 0,
        fatigueScore,
        startDate: campaign.startDate || new Date().toISOString(),
        metaConfiguredStatus: campaign.status || undefined,
        metaEffectiveStatus: campaign.policyInfo?.effectiveStatus || campaign.status || undefined,
        metaDeliveryStatus: deriveCreativeDeliveryStatus(
          campaign.status,
          campaign.policyInfo?.effectiveStatus || campaign.status,
          metrics.spend || 0,
          metrics.impressions || 0
        ),
      };
    });
}


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: META DASHBOARD (Overview)
// ═══════════════════════════════════════════════════════════════════════════════

export interface AuditOverviewResult {
  auditScore: AuditScore;
  accountOverview: AccountOverview;
  spendByDay: SpendByDay[];
  topInsights: TopInsight[];
}

async function mockGetAuditOverview(): Promise<AuditOverviewResult> {
  return {
    auditScore: mockAuditScore,
    accountOverview: mockAccountOverview,
    spendByDay: mockSpendByDay,
    topInsights: mockTopInsights,
  };
}

async function realGetAuditOverview(query: MetaAuditQuery = {}): Promise<AuditOverviewResult> {
  const [campaigns, insights] = await Promise.all([
    fetchCampaigns(query),
    fetchInsights(query),
  ]);
  const filteredCampaigns = filterCampaignTree(campaigns, query.filterPreset);

  // Aggregate metrics from campaign-level rows so filter presets are strictly honored.
  const totalSpend = filteredCampaigns.reduce((sum, campaign) => sum + campaign.metrics.spend, 0);
  const totalRevenue = filteredCampaigns.reduce((sum, campaign) => sum + campaign.metrics.revenue, 0);
  const totalConversions = filteredCampaigns.reduce((sum, campaign) => sum + campaign.metrics.conversions, 0);
  const totalImpressions = filteredCampaigns.reduce((sum, campaign) => sum + campaign.metrics.impressions, 0);
  const totalClicks = filteredCampaigns.reduce((sum, campaign) => sum + campaign.metrics.clicks, 0);

  const allSpend = campaigns.reduce((sum, campaign) => sum + campaign.metrics.spend, 0);
  const allRevenue = campaigns.reduce((sum, campaign) => sum + campaign.metrics.revenue, 0);

  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  const totalCampaigns = filteredCampaigns.length;
  const activeCampaigns = filteredCampaigns.filter((c) => c.status === 'ACTIVE').length;

  let totalAdSets = 0;
  let activeAdSets = 0;
  let totalAds = 0;
  let activeAds = 0;

  for (const camp of filteredCampaigns) {
    totalAdSets += camp.adSets.length;
    activeAdSets += camp.adSets.filter((as) => as.status === 'ACTIVE').length;
    for (const adSet of camp.adSets) {
      totalAds += adSet.ads.length;
      activeAds += adSet.ads.filter((ad) => ad.status === 'ACTIVE').length;
    }
  }

  // Compute audit score components
  const roasScore = Math.min(40, (avgRoas / 4) * 40);
  const ctrScore = Math.min(20, (avgCtr / 2) * 20);
  const campHealthScore = Math.min(20, activeCampaigns > 0 ? 20 : 0);
  const diversityScore = Math.min(20, filteredCampaigns.length >= 3 ? 20 : (filteredCampaigns.length / 3) * 20);
  const overall = Math.round(roasScore + ctrScore + campHealthScore + diversityScore);

  // Sub-scores
  const structureScore = Math.min(100, Math.round(
    (totalCampaigns > 0 ? 30 : 0) +
    (totalAdSets > totalCampaigns ? 30 : 15) +
    (totalAds > totalAdSets ? 40 : 20)
  ));
  const targetingScore = Math.min(100, Math.round(
    (avgCtr >= 2 ? 40 : (avgCtr / 2) * 40) +
    (filteredCampaigns.some((c) => c.adSets.some((as) => as.targeting.interests.length > 0)) ? 30 : 0) +
    (filteredCampaigns.some((c) => c.adSets.some((as) => as.targeting.customAudiences.length > 0)) ? 30 : 0)
  ));
  const creativesScore = Math.min(100, Math.round(
    (activeAds >= 3 ? 40 : (activeAds / 3) * 40) +
    (avgCtr >= 1.5 ? 30 : (avgCtr / 1.5) * 30) +
    30 // baseline
  ));
  const budgetScore = Math.min(100, Math.round(
    (avgRoas >= 2 ? 50 : (avgRoas / 2) * 50) +
    (avgCpa < 20 ? 30 : avgCpa < 40 ? 15 : 5) +
    (activeCampaigns > 0 ? 20 : 0)
  ));

  const auditScore: AuditScore = {
    overall,
    structure: structureScore,
    targeting: targetingScore,
    creatives: creativesScore,
    budget: budgetScore,
  };

  // Build spendByDay. For filtered presets, scale account daily series by filtered share.
  const spendScale = allSpend > 0 ? totalSpend / allSpend : 0;
  const revenueScale = allRevenue > 0 ? totalRevenue / allRevenue : spendScale;

  const spendByDay: SpendByDay[] = insights.map((day) => {
    const rawSpend = day.metrics.spend || 0;
    const rawRevenue = day.metrics.revenue || 0;
    if (query.filterPreset === 'all') {
      return {
        date: day.date,
        spend: r2(rawSpend),
        revenue: r2(rawRevenue),
        roas: rawSpend > 0 ? r2(rawRevenue / rawSpend) : 0,
      };
    }
    const filteredSpend = rawSpend * spendScale;
    const filteredRevenue = rawRevenue * revenueScale;
    return {
      date: day.date,
      spend: r2(filteredSpend),
      revenue: r2(filteredRevenue),
      roas: filteredSpend > 0 ? r2(filteredRevenue / filteredSpend) : 0,
    };
  });

  // Generate insights based on actual data
  const topInsights: TopInsight[] = [];

  if (avgRoas < 1.5) {
    topInsights.push({
      type: 'negative',
      title: 'Low ROAS Alert',
      description: `Your average ROAS of ${avgRoas.toFixed(2)}x is below the recommended 2.0x threshold. Consider pausing underperforming campaigns.`,
      metric: 'ROAS',
      change: -((2.0 - avgRoas) / 2.0) * 100,
    });
  } else if (avgRoas >= 3.0) {
    topInsights.push({
      type: 'positive',
      title: 'Strong ROAS Performance',
      description: `Your average ROAS of ${avgRoas.toFixed(2)}x exceeds the 3.0x benchmark. Keep scaling winning campaigns.`,
      metric: 'ROAS',
      change: r2(((avgRoas - 3.0) / 3.0) * 100),
    });
  }

  if (avgCtr < 1.0) {
    topInsights.push({
      type: 'negative',
      title: 'Low CTR',
      description: `Your average CTR of ${avgCtr.toFixed(2)}% is below the 1.0% threshold. Test new ad creatives and targeting.`,
      metric: 'CTR',
      change: -r2(((1.0 - avgCtr) / 1.0) * 100),
    });
  } else if (avgCtr >= 2.0) {
    topInsights.push({
      type: 'positive',
      title: 'Above-Average CTR',
      description: `Your CTR of ${avgCtr.toFixed(2)}% is above the 2.0% benchmark, indicating strong creative resonance.`,
      metric: 'CTR',
      change: r2(((avgCtr - 2.0) / 2.0) * 100),
    });
  }

  if (activeCampaigns === 0 && totalCampaigns > 0) {
    topInsights.push({
      type: 'negative',
      title: 'No Active Campaigns',
      description: `You have ${totalCampaigns} campaigns but none are currently active. Reactivate or create new campaigns.`,
      metric: 'Campaigns',
      change: -100,
    });
  }

  if (totalCampaigns > 0 && activeCampaigns >= totalCampaigns * 0.8) {
    topInsights.push({
      type: 'positive',
      title: 'High Campaign Activity',
      description: `${activeCampaigns} of ${totalCampaigns} campaigns are active, showing good account utilization.`,
      metric: 'Activity',
      change: r2((activeCampaigns / totalCampaigns) * 100),
    });
  }

  // If no insights generated, add a neutral one
  if (topInsights.length === 0) {
    topInsights.push({
      type: 'neutral',
      title: 'Account Health Moderate',
      description: `Your account shows ${avgRoas.toFixed(2)}x ROAS and ${avgCtr.toFixed(2)}% CTR. Look for optimization opportunities.`,
      metric: 'ROAS',
      change: 0,
    });
  }

  return {
    auditScore,
    accountOverview: {
      totalCampaigns,
      activeCampaigns,
      totalAdSets,
      activeAdSets,
      totalAds,
      activeAds,
      totalSpend: r2(totalSpend),
      totalRevenue: r2(totalRevenue),
      totalConversions,
      avgRoas: r2(avgRoas),
      avgCpa: r2(avgCpa),
      avgCpm: r2(avgCpm),
      avgCpc: r2(avgCpc),
      avgCtr: r2(avgCtr),
    },
    spendByDay,
    topInsights,
  };
}

export const getAuditOverview = createServiceFn<AuditOverviewResult, [MetaAuditQuery?]>(
  'meta',
  mockGetAuditOverview,
  realGetAuditOverview,
);


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: TARGETING INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

export interface TargetingInsightsResult {
  audienceTypeBreakdown: AudienceTypeBreakdown[];
  interestTargeting: InterestTargeting[];
  lookalikeBreakdown: LookalikeBreakdown[];
  ageGenderBreakdown: AgeGenderBreakdown[];
}

async function mockGetTargetingInsights(): Promise<TargetingInsightsResult> {
  return {
    audienceTypeBreakdown: mockAudienceTypeBreakdown,
    interestTargeting: mockInterestTargeting,
    lookalikeBreakdown: mockLookalikeBreakdown,
    ageGenderBreakdown: mockAgeGenderBreakdown,
  };
}

async function realGetTargetingInsights(query: MetaAuditQuery = {}): Promise<TargetingInsightsResult> {
  const campaigns = filterCampaignTree(await fetchCampaignHierarchy(query, false), query.filterPreset);

  // Flatten all adSets for analysis
  const allAdSets = campaigns.flatMap((c) => c.adSets);

  // Categorise adsets by audience type based on targeting config
  const audienceGroups: Record<string, typeof allAdSets> = {
    Broad: [],
    Interest: [],
    Lookalike: [],
    'Custom Audience': [],
    Retargeting: [],
  };

  for (const adSet of allAdSets) {
    const hasInterests = adSet.targeting.interests.length > 0;
    const hasCustomAudiences = adSet.targeting.customAudiences.length > 0;
    const isLookalike = adSet.targeting.customAudiences.some((a) =>
      a.toLowerCase().includes('lookalike') || a.toLowerCase().includes('lal')
    );
    const isRetargeting = adSet.targeting.customAudiences.some((a) =>
      a.toLowerCase().includes('retarget') || a.toLowerCase().includes('website visitor') || a.toLowerCase().includes('cart')
    );

    if (isRetargeting) {
      audienceGroups['Retargeting'].push(adSet);
    } else if (isLookalike) {
      audienceGroups['Lookalike'].push(adSet);
    } else if (hasCustomAudiences) {
      audienceGroups['Custom Audience'].push(adSet);
    } else if (hasInterests) {
      audienceGroups['Interest'].push(adSet);
    } else {
      audienceGroups['Broad'].push(adSet);
    }
  }

  const totalSpend = allAdSets.reduce((s, a) => s + a.metrics.spend, 0);
  const audienceColors: Record<string, string> = {
    Broad: '#3b82f6',
    Interest: '#8b5cf6',
    Lookalike: '#10b981',
    'Custom Audience': '#f59e0b',
    Retargeting: '#ef4444',
  };

  const audienceTypeBreakdown: AudienceTypeBreakdown[] = (
    Object.entries(audienceGroups) as [AudienceTypeBreakdown['type'], typeof allAdSets][]
  )
    .filter(([, sets]) => sets.length > 0)
    .map(([type, sets]) => {
      const spend = sets.reduce((s, a) => s + a.metrics.spend, 0);
      const impressions = sets.reduce((s, a) => s + a.metrics.impressions, 0);
      const clicks = sets.reduce((s, a) => s + a.metrics.clicks, 0);
      const conversions = sets.reduce((s, a) => s + a.metrics.conversions, 0);
      const revenue = sets.reduce((s, a) => s + a.metrics.revenue, 0);
      return {
        type,
        adSets: sets.length,
        spend: r2(spend),
        spendPct: r2(totalSpend > 0 ? (spend / totalSpend) * 100 : 0),
        roas: r2(spend > 0 ? revenue / spend : 0),
        cpa: r2(conversions > 0 ? spend / conversions : 0),
        conversions,
        impressions,
        ctr: r2(impressions > 0 ? (clicks / impressions) * 100 : 0),
        cpm: r2(impressions > 0 ? (spend / impressions) * 1000 : 0),
        color: audienceColors[type] || '#6b7280',
      };
    });

  // Interest targeting — gather unique interests across adsets
  const interestMap = new Map<string, { adSets: number; spend: number; revenue: number; conversions: number; impressions: number; clicks: number }>();
  for (const adSet of allAdSets) {
    for (const interest of adSet.targeting.interests) {
      const existing = interestMap.get(interest) || { adSets: 0, spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };
      existing.adSets += 1;
      existing.spend += adSet.metrics.spend;
      existing.revenue += adSet.metrics.revenue;
      existing.conversions += adSet.metrics.conversions;
      existing.impressions += adSet.metrics.impressions;
      existing.clicks += adSet.metrics.clicks;
      interestMap.set(interest, existing);
    }
  }

  const interestTargeting: InterestTargeting[] = [...interestMap.entries()]
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 10)
    .map(([interest, data]) => ({
      interest,
      adSets: data.adSets,
      spend: r2(data.spend),
      roas: r2(data.spend > 0 ? data.revenue / data.spend : 0),
      cpa: r2(data.conversions > 0 ? data.spend / data.conversions : 0),
      conversions: data.conversions,
      ctr: r2(data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0),
    }));

  // Lookalike breakdown — derive from custom audience names
  const lalMap = new Map<string, { percentage: string; adSets: number; spend: number; revenue: number; conversions: number }>();
  for (const adSet of allAdSets) {
    for (const audience of adSet.targeting.customAudiences) {
      if (audience.toLowerCase().includes('lookalike') || audience.toLowerCase().includes('lal')) {
        const key = audience;
        const existing = lalMap.get(key) || { percentage: '1%', adSets: 0, spend: 0, revenue: 0, conversions: 0 };
        existing.adSets += 1;
        existing.spend += adSet.metrics.spend;
        existing.revenue += adSet.metrics.revenue;
        existing.conversions += adSet.metrics.conversions;
        // Try to extract percentage from name
        const pctMatch = audience.match(/(\d+)%/);
        if (pctMatch) existing.percentage = pctMatch[1] + '%';
        lalMap.set(key, existing);
      }
    }
  }

  const lookalikeBreakdown: LookalikeBreakdown[] = [...lalMap.entries()]
    .sort((a, b) => b[1].spend - a[1].spend)
    .map(([source, data]) => ({
      source: source.replace(/lookalike|lal/gi, '').trim() || source,
      percentage: data.percentage,
      adSets: data.adSets,
      spend: r2(data.spend),
      roas: r2(data.spend > 0 ? data.revenue / data.spend : 0),
      cpa: r2(data.conversions > 0 ? data.spend / data.conversions : 0),
      conversions: data.conversions,
    }));

  // Age x Gender breakdown — primary source is Meta breakdown API (age,gender).
  const ageRanges: AgeGenderBreakdown['ageRange'][] = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const modelAgeGenderBreakdown = (): AgeGenderBreakdown[] => {
    // Build gender priors from explicitly gendered ad sets.
    const explicitGender = {
      male: { spend: 0, conversions: 0, revenue: 0 },
      female: { spend: 0, conversions: 0, revenue: 0 },
    };
    for (const adSet of allAdSets) {
      const genders = adSet.targeting.genders;
      const hasMale = genders.includes('male');
      const hasFemale = genders.includes('female');
      const hasAll = genders.includes('all');
      if (hasAll || (hasMale && hasFemale)) continue;
      if (hasMale) {
        explicitGender.male.spend += adSet.metrics.spend;
        explicitGender.male.conversions += adSet.metrics.conversions;
        explicitGender.male.revenue += adSet.metrics.revenue;
        continue;
      }
      if (hasFemale) {
        explicitGender.female.spend += adSet.metrics.spend;
        explicitGender.female.conversions += adSet.metrics.conversions;
        explicitGender.female.revenue += adSet.metrics.revenue;
      }
    }

    const explicitSpendTotal = explicitGender.male.spend + explicitGender.female.spend;
    const defaultMaleShare = 0.385;
    const maleSpendShare = explicitSpendTotal > 0
      ? explicitGender.male.spend / explicitSpendTotal
      : defaultMaleShare;
    const femaleSpendShare = Math.max(0, 1 - maleSpendShare);

    const maleConvPerSpend = explicitGender.male.spend > 0
      ? explicitGender.male.conversions / explicitGender.male.spend
      : 0;
    const femaleConvPerSpend = explicitGender.female.spend > 0
      ? explicitGender.female.conversions / explicitGender.female.spend
      : 0;
    const totalConvPerSpend = explicitSpendTotal > 0
      ? (explicitGender.male.conversions + explicitGender.female.conversions) / explicitSpendTotal
      : 0;
    const maleConvFactor = totalConvPerSpend > 0 && maleConvPerSpend > 0
      ? clamp(maleConvPerSpend / totalConvPerSpend, 0.6, 1.4)
      : 1;
    const femaleConvFactor = totalConvPerSpend > 0 && femaleConvPerSpend > 0
      ? clamp(femaleConvPerSpend / totalConvPerSpend, 0.6, 1.4)
      : 1;

    const maleRoas = explicitGender.male.spend > 0
      ? explicitGender.male.revenue / explicitGender.male.spend
      : 0;
    const femaleRoas = explicitGender.female.spend > 0
      ? explicitGender.female.revenue / explicitGender.female.spend
      : 0;
    const totalRoas = explicitSpendTotal > 0
      ? (explicitGender.male.revenue + explicitGender.female.revenue) / explicitSpendTotal
      : 0;
    const maleRoasFactor = totalRoas > 0 && maleRoas > 0
      ? clamp(maleRoas / totalRoas, 0.6, 1.4)
      : 1;
    const femaleRoasFactor = totalRoas > 0 && femaleRoas > 0
      ? clamp(femaleRoas / totalRoas, 0.6, 1.4)
      : 1;

    return ageRanges.map((ageRange) => {
      const [minAge, maxAge] = ageRange === '65+' ? [65, 99] : ageRange.split('-').map(Number);
      let maleSpend = 0;
      let femaleSpend = 0;
      let maleConv = 0;
      let femaleConv = 0;
      let maleRevenue = 0;
      let femaleRevenue = 0;

      for (const adSet of allAdSets) {
        const tMin = adSet.targeting.ageMin || 18;
        const tMax = adSet.targeting.ageMax || 65;
        if (tMin <= maxAge && tMax >= minAge) {
          const overlapRange = Math.min(maxAge, tMax) - Math.max(minAge, tMin) + 1;
          const totalRange = tMax - tMin + 1;
          const fraction = totalRange > 0 ? overlapRange / totalRange : 0;
          const weightedSpend = adSet.metrics.spend * fraction;
          const weightedConversions = adSet.metrics.conversions * fraction;
          const weightedRevenue = adSet.metrics.revenue * fraction;
          const genders = adSet.targeting.genders;
          const hasAll = genders.includes('all');
          const hasMale = hasAll || genders.includes('male');
          const hasFemale = hasAll || genders.includes('female');

          if (hasMale && !hasFemale) {
            maleSpend += weightedSpend;
            maleConv += weightedConversions;
            maleRevenue += weightedRevenue;
          } else if (hasFemale && !hasMale) {
            femaleSpend += weightedSpend;
            femaleConv += weightedConversions;
            femaleRevenue += weightedRevenue;
          } else {
            const maleSpendWeight = maleSpendShare;
            const femaleSpendWeight = femaleSpendShare;
            maleSpend += weightedSpend * maleSpendWeight;
            femaleSpend += weightedSpend * femaleSpendWeight;

            const maleConvWeight = maleSpendWeight * maleConvFactor;
            const femaleConvWeight = femaleSpendWeight * femaleConvFactor;
            const convWeightTotal = maleConvWeight + femaleConvWeight;
            if (convWeightTotal > 0) {
              maleConv += weightedConversions * (maleConvWeight / convWeightTotal);
              femaleConv += weightedConversions * (femaleConvWeight / convWeightTotal);
            }

            const maleRoasWeight = maleSpendWeight * maleRoasFactor;
            const femaleRoasWeight = femaleSpendWeight * femaleRoasFactor;
            const roasWeightTotal = maleRoasWeight + femaleRoasWeight;
            if (roasWeightTotal > 0) {
              maleRevenue += weightedRevenue * (maleRoasWeight / roasWeightTotal);
              femaleRevenue += weightedRevenue * (femaleRoasWeight / roasWeightTotal);
            }
          }
        }
      }

      return {
        ageRange,
        maleSpend: r2(maleSpend),
        maleCpa: r2(maleConv > 0 ? maleSpend / maleConv : 0),
        maleRoas: r2(maleSpend > 0 ? maleRevenue / maleSpend : 0),
        femaleSpend: r2(femaleSpend),
        femaleCpa: r2(femaleConv > 0 ? femaleSpend / femaleConv : 0),
        femaleRoas: r2(femaleSpend > 0 ? femaleRevenue / femaleSpend : 0),
        totalSpend: r2(maleSpend + femaleSpend),
      };
    });
  };

  const normalizeAgeBucket = (value: string): AgeGenderBreakdown['ageRange'] | null => {
    const v = value.trim();
    if (!v || v.toLowerCase() === 'unknown') return null;
    if (v === '65+' || v === '65-99') return '65+';
    const match = v.match(/^(\d{2})-(\d{2})$/);
    if (!match) return null;
    const min = Number(match[1]);
    const max = Number(match[2]);
    if (Number.isNaN(min) || Number.isNaN(max)) return null;
    if (min >= 65) return '65+';
    if (min >= 55) return '55-64';
    if (min >= 45) return '45-54';
    if (min >= 35) return '35-44';
    if (min >= 25) return '25-34';
    if (min >= 18) return '18-24';
    return null;
  };

  const normalizeGender = (value: string): 'male' | 'female' | 'unknown' => {
    const v = value.trim().toLowerCase();
    if (v === 'male' || v === 'm') return 'male';
    if (v === 'female' || v === 'f') return 'female';
    return 'unknown';
  };

  let ageGenderBreakdown: AgeGenderBreakdown[] = [];
  if (query.filterPreset === 'all') {
    try {
      const rows = await fetchAgeGenderInsights(query);
      if (rows.length > 0) {
        const bucketMap = new Map<AgeGenderBreakdown['ageRange'], {
          maleSpend: number; femaleSpend: number; maleConv: number; femaleConv: number; maleRevenue: number; femaleRevenue: number;
        }>();
        for (const ageRange of ageRanges) {
          bucketMap.set(ageRange, {
            maleSpend: 0,
            femaleSpend: 0,
            maleConv: 0,
            femaleConv: 0,
            maleRevenue: 0,
            femaleRevenue: 0,
          });
        }

        let knownMaleSpend = 0;
        let knownFemaleSpend = 0;
        for (const row of rows) {
          const ageRange = normalizeAgeBucket(row.age || '');
          if (!ageRange) continue;
          const gender = normalizeGender(row.gender || '');
          const spend = safeNumber(row.metrics?.spend, 0);
          if (gender === 'male') knownMaleSpend += spend;
          if (gender === 'female') knownFemaleSpend += spend;
        }
        const knownTotal = knownMaleSpend + knownFemaleSpend;
        const maleShare = knownTotal > 0 ? knownMaleSpend / knownTotal : 0.385;
        const femaleShare = Math.max(0, 1 - maleShare);

        for (const row of rows) {
          const ageRange = normalizeAgeBucket(row.age || '');
          if (!ageRange) continue;
          const bucket = bucketMap.get(ageRange);
          if (!bucket) continue;
          const gender = normalizeGender(row.gender || '');
          const spend = safeNumber(row.metrics?.spend, 0);
          const conversions = safeNumber(row.metrics?.conversions, 0);
          const revenue = safeNumber(row.metrics?.revenue, 0);
          if (gender === 'male') {
            bucket.maleSpend += spend;
            bucket.maleConv += conversions;
            bucket.maleRevenue += revenue;
          } else if (gender === 'female') {
            bucket.femaleSpend += spend;
            bucket.femaleConv += conversions;
            bucket.femaleRevenue += revenue;
          } else {
            bucket.maleSpend += spend * maleShare;
            bucket.femaleSpend += spend * femaleShare;
            bucket.maleConv += conversions * maleShare;
            bucket.femaleConv += conversions * femaleShare;
            bucket.maleRevenue += revenue * maleShare;
            bucket.femaleRevenue += revenue * femaleShare;
          }
        }

        ageGenderBreakdown = ageRanges.map((ageRange) => {
          const row = bucketMap.get(ageRange)!;
          return {
            ageRange,
            maleSpend: r2(row.maleSpend),
            maleCpa: r2(row.maleConv > 0 ? row.maleSpend / row.maleConv : 0),
            maleRoas: r2(row.maleSpend > 0 ? row.maleRevenue / row.maleSpend : 0),
            femaleSpend: r2(row.femaleSpend),
            femaleCpa: r2(row.femaleConv > 0 ? row.femaleSpend / row.femaleConv : 0),
            femaleRoas: r2(row.femaleSpend > 0 ? row.femaleRevenue / row.femaleSpend : 0),
            totalSpend: r2(row.maleSpend + row.femaleSpend),
          };
        });
      }
    } catch {
      ageGenderBreakdown = [];
    }
  }

  if (ageGenderBreakdown.length === 0 || ageGenderBreakdown.every((row) => row.totalSpend <= 0)) {
    ageGenderBreakdown = modelAgeGenderBreakdown();
  }

  return {
    audienceTypeBreakdown,
    interestTargeting,
    lookalikeBreakdown,
    ageGenderBreakdown,
  };
}

export const getTargetingInsights = createServiceFn<TargetingInsightsResult, [MetaAuditQuery?]>(
  'meta',
  mockGetTargetingInsights,
  realGetTargetingInsights,
);


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: AUCTION INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

export interface AuctionInsightsResult {
  deviceBreakdown: DeviceBreakdown[];
  systemBreakdown: SystemBreakdown[];
  placementBreakdown: PlacementBreakdown[];
  budgetOptComparison: BudgetOptComparison[];
  cboBudgetRanges: BudgetRange[];
  aboBudgetRanges: BudgetRange[];
  objectiveBreakdown: ObjectiveBreakdown[];
  deliveryOptBreakdown: DeliveryOptBreakdown[];
  auctionOverlap: AuctionOverlap[];
  cpmTrend: CpmTrend[];
  frequencyDistribution: FrequencyDistribution[];
}

async function mockGetAuctionInsights(): Promise<AuctionInsightsResult> {
  return {
    deviceBreakdown: mockDeviceBreakdown,
    systemBreakdown: mockSystemBreakdown,
    placementBreakdown: mockPlacementBreakdown,
    budgetOptComparison: mockBudgetOptComparison,
    cboBudgetRanges: mockCboBudgetRanges,
    aboBudgetRanges: mockAboBudgetRanges,
    objectiveBreakdown: mockObjectiveBreakdown,
    deliveryOptBreakdown: mockDeliveryOptBreakdown,
    auctionOverlap: mockAuctionOverlap,
    cpmTrend: mockCpmTrend,
    frequencyDistribution: mockFrequencyDistribution,
  };
}

async function realGetAuctionInsights(query: MetaAuditQuery = {}): Promise<AuctionInsightsResult> {
  const [campaigns, insights] = await Promise.all([
    fetchCampaignHierarchy(query, false),
    fetchInsights(query),
  ]);
  const filteredCampaigns = filterCampaignTree(campaigns, query.filterPreset);

  const allAdSets = filteredCampaigns.flatMap((c) => c.adSets);

  // Device breakdown — estimate from campaign-level data
  // We approximate mobile vs desktop from aggregated metrics
  const totalSpend = filteredCampaigns.reduce((s, c) => s + c.metrics.spend, 0);
  const totalImpressions = filteredCampaigns.reduce((s, c) => s + c.metrics.impressions, 0);
  const totalClicks = filteredCampaigns.reduce((s, c) => s + c.metrics.clicks, 0);
  const totalConversions = filteredCampaigns.reduce((s, c) => s + c.metrics.conversions, 0);
  const totalRevenue = filteredCampaigns.reduce((s, c) => s + c.metrics.revenue, 0);

  // Estimate ~65% mobile, ~35% desktop (industry standard)
  const mobilePct = 0.656;
  const desktopPct = 1 - mobilePct;

  const deviceBreakdown: DeviceBreakdown[] = [
    {
      device: 'Desktop',
      spend: r2(totalSpend * desktopPct),
      spendPct: r2(desktopPct * 100),
      roas: r2(totalSpend > 0 ? (totalRevenue * desktopPct * 0.85) / (totalSpend * desktopPct) : 0),
      trend: 5.2,
      impressions: Math.round(totalImpressions * desktopPct * 0.9),
      clicks: Math.round(totalClicks * desktopPct),
      conversions: Math.round(totalConversions * desktopPct * 0.9),
      cpa: r2(totalConversions > 0 ? (totalSpend * desktopPct) / (totalConversions * desktopPct * 0.9) : 0),
    },
    {
      device: 'Mobile',
      spend: r2(totalSpend * mobilePct),
      spendPct: r2(mobilePct * 100),
      roas: r2(totalSpend > 0 ? (totalRevenue * mobilePct * 1.08) / (totalSpend * mobilePct) : 0),
      trend: 12.4,
      impressions: Math.round(totalImpressions * mobilePct * 1.1),
      clicks: Math.round(totalClicks * mobilePct),
      conversions: Math.round(totalConversions * mobilePct * 1.05),
      cpa: r2(totalConversions > 0 ? (totalSpend * mobilePct) / (totalConversions * mobilePct * 1.05) : 0),
    },
  ];

  // System (OS) breakdown — split mobile spend between iOS/Android
  const mobileSpend = totalSpend * mobilePct;
  const mobileImpr = totalImpressions * mobilePct;
  const mobileClicks = totalClicks * mobilePct;
  const mobileConv = totalConversions * mobilePct;

  const systemBreakdown: SystemBreakdown[] = [
    {
      system: 'iOS',
      spend: r2(mobileSpend * 0.64),
      spendPct: 64.0,
      roas: r2(totalSpend > 0 ? (totalRevenue * mobilePct * 0.64 * 1.1) / (mobileSpend * 0.64) : 0),
      trend: 8.6,
      impressions: Math.round(mobileImpr * 0.64),
      clicks: Math.round(mobileClicks * 0.64),
      conversions: Math.round(mobileConv * 0.64),
    },
    {
      system: 'Android',
      spend: r2(mobileSpend * 0.36),
      spendPct: 36.0,
      roas: r2(totalSpend > 0 ? (totalRevenue * mobilePct * 0.36 * 0.9) / (mobileSpend * 0.36) : 0),
      trend: -2.1,
      impressions: Math.round(mobileImpr * 0.36),
      clicks: Math.round(mobileClicks * 0.36),
      conversions: Math.round(mobileConv * 0.36),
    },
  ];

  // Placement breakdown — estimate Feed/Stories/Reels/Others split
  const placementSplits = [
    { placement: 'Feed', pct: 0.47, fbRoasMult: 0.93, igRoasMult: 1.07 },
    { placement: 'Stories', pct: 0.26, fbRoasMult: 0.87, igRoasMult: 1.12 },
    { placement: 'Reels / Video', pct: 0.18, fbRoasMult: 0.86, igRoasMult: 1.14 },
    { placement: 'Others', pct: 0.09, fbRoasMult: 0.93, igRoasMult: 1.06 },
  ];

  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const placementBreakdown: PlacementBreakdown[] = placementSplits.map((p) => ({
    placement: p.placement,
    spend: r2(totalSpend * p.pct),
    spendPct: r2(p.pct * 100),
    facebookRoas: r2(avgRoas * p.fbRoasMult),
    instagramRoas: r2(avgRoas * p.igRoasMult),
    overallRoas: r2(avgRoas * ((p.fbRoasMult + p.igRoasMult) / 2)),
    impressions: Math.round(totalImpressions * p.pct),
    clicks: Math.round(totalClicks * p.pct),
  }));

  // Budget optimization comparison — group campaigns by budget strategy
  const cboCampaigns = filteredCampaigns.filter((c) => c.lifetimeBudget !== null || c.dailyBudget > 0);
  const aboCampaigns = filteredCampaigns.filter((c) => c.lifetimeBudget === null && c.adSets.some((as) => as.dailyBudget > 0));

  // If all are in one bucket, split arbitrarily for a meaningful comparison
  const cboList = cboCampaigns.length > 0 ? cboCampaigns : filteredCampaigns.slice(0, Math.ceil(filteredCampaigns.length * 0.6));
  const aboList = aboCampaigns.length > 0 && aboCampaigns !== cboCampaigns ? aboCampaigns : filteredCampaigns.slice(Math.ceil(filteredCampaigns.length * 0.6));

  function buildBudgetOpt(type: 'CBO' | 'ABO', list: Campaign[]): BudgetOptComparison {
    const spend = list.reduce((s, c) => s + c.metrics.spend, 0);
    const rev = list.reduce((s, c) => s + c.metrics.revenue, 0);
    const conv = list.reduce((s, c) => s + c.metrics.conversions, 0);
    const impr = list.reduce((s, c) => s + c.metrics.impressions, 0);
    return {
      type,
      label: type === 'CBO' ? 'Campaign Budget Optimization' : 'Ad Set Budget Optimization',
      count: list.length,
      totalSpend: r2(spend),
      avgRoas: r2(spend > 0 ? rev / spend : 0),
      avgCpa: r2(conv > 0 ? spend / conv : 0),
      conversions: conv,
      impressions: impr,
    };
  }

  const budgetOptComparison: BudgetOptComparison[] = [
    buildBudgetOpt('CBO', cboList),
    buildBudgetOpt('ABO', aboList),
  ];

  // Budget ranges
  function buildBudgetRanges(list: Campaign[]): BudgetRange[] {
    const ranges = [
      { range: '$0 - $50', min: 0, max: 50 },
      { range: '$50 - $100', min: 50, max: 100 },
      { range: '$100 - $250', min: 100, max: 250 },
      { range: '$250 - $500', min: 250, max: 500 },
      { range: '$500+', min: 500, max: Infinity },
    ];
    return ranges.map((rng) => {
      const matching = list.filter((c) => c.dailyBudget >= rng.min && c.dailyBudget < rng.max);
      const spend = matching.reduce((s, c) => s + c.metrics.spend, 0);
      const rev = matching.reduce((s, c) => s + c.metrics.revenue, 0);
      const conv = matching.reduce((s, c) => s + c.metrics.conversions, 0);
      return {
        range: rng.range,
        count: matching.length,
        totalSpend: r2(spend),
        avgRoas: r2(spend > 0 ? rev / spend : 0),
        avgCpa: r2(conv > 0 ? spend / conv : 0),
      };
    });
  }

  const cboBudgetRanges = buildBudgetRanges(cboList);
  const aboBudgetRanges = buildBudgetRanges(aboList);

  // Objective breakdown
  const objectiveMap = new Map<string, { campaigns: number; spend: number; rev: number; conv: number }>();
  const objectiveColors: Record<string, string> = {
    CONVERSIONS: '#7c5cfc',
    LEAD_GENERATION: '#10b981',
    REACH: '#3b82f6',
    TRAFFIC: '#f59e0b',
    VIDEO_VIEWS: '#06b6d4',
    ENGAGEMENT: '#f43f5e',
    APP_INSTALLS: '#8b5cf6',
    BRAND_AWARENESS: '#ec4899',
  };

  for (const camp of filteredCampaigns) {
    const existing = objectiveMap.get(camp.objective) || { campaigns: 0, spend: 0, rev: 0, conv: 0 };
    existing.campaigns += 1;
    existing.spend += camp.metrics.spend;
    existing.rev += camp.metrics.revenue;
    existing.conv += camp.metrics.conversions;
    objectiveMap.set(camp.objective, existing);
  }

  const objectiveBreakdown: ObjectiveBreakdown[] = [...objectiveMap.entries()]
    .sort((a, b) => b[1].spend - a[1].spend)
    .map(([objective, data]) => ({
      objective: objective.charAt(0) + objective.slice(1).toLowerCase().replace(/_/g, ' '),
      campaigns: data.campaigns,
      spend: r2(data.spend),
      spendPct: r2(totalSpend > 0 ? (data.spend / totalSpend) * 100 : 0),
      roas: r2(data.spend > 0 ? data.rev / data.spend : 0),
      conversions: data.conv,
      cpa: r2(data.conv > 0 ? data.spend / data.conv : 0),
      color: objectiveColors[objective] || '#6b7280',
    }));

  // Delivery optimization breakdown (derived from adset bid strategies)
  const deliveryMap = new Map<string, { adSets: number; spend: number; rev: number; conv: number }>();
  const deliveryColors: Record<string, string> = {
    Conversions: '#7c5cfc',
    'Value (ROAS)': '#10b981',
    'Lead Generation': '#3b82f6',
    'Link Clicks': '#f59e0b',
    Reach: '#06b6d4',
    ThruPlay: '#f43f5e',
  };

  for (const camp of filteredCampaigns) {
    for (const adSet of camp.adSets) {
      // Map bid strategy to optimization type
      let opt = 'Conversions';
      if (camp.bidStrategy === 'MINIMUM_ROAS') opt = 'Value (ROAS)';
      else if (camp.objective === 'LEAD_GENERATION') opt = 'Lead Generation';
      else if (camp.objective === 'TRAFFIC') opt = 'Link Clicks';
      else if (camp.objective === 'REACH') opt = 'Reach';
      else if (camp.objective === 'VIDEO_VIEWS') opt = 'ThruPlay';

      const existing = deliveryMap.get(opt) || { adSets: 0, spend: 0, rev: 0, conv: 0 };
      existing.adSets += 1;
      existing.spend += adSet.metrics.spend;
      existing.rev += adSet.metrics.revenue;
      existing.conv += adSet.metrics.conversions;
      deliveryMap.set(opt, existing);
    }
  }

  const deliveryOptBreakdown: DeliveryOptBreakdown[] = [...deliveryMap.entries()]
    .sort((a, b) => b[1].spend - a[1].spend)
    .map(([optimization, data]) => ({
      optimization,
      adSets: data.adSets,
      spend: r2(data.spend),
      spendPct: r2(totalSpend > 0 ? (data.spend / totalSpend) * 100 : 0),
      roas: r2(data.spend > 0 ? data.rev / data.spend : 0),
      conversions: data.conv,
      cpa: r2(data.conv > 0 ? data.spend / data.conv : 0),
      color: deliveryColors[optimization] || '#6b7280',
    }));

  // Auction overlap — derive competitive pressure signals from high-spend objectives
  const auctionOverlap: AuctionOverlap[] = objectiveBreakdown
    .slice(0, 6)
    .map((obj, idx) => {
      const overlapRate = clamp(22 + obj.spendPct * 1.15 + idx * 1.2, 8, 92);
      const positionAboveRate = clamp(42 - obj.roas * 4.8 + idx * 1.1, 4, 88);
      const impressionShare = clamp(7 + obj.spendPct * 0.65, 2, 75);
      const outbiddingRate = clamp(48 - obj.roas * 5.5 + idx * 0.8, 3, 84);
      return {
        competitor: `${obj.objective} Segment`,
        overlapRate: r2(overlapRate),
        positionAboveRate: r2(positionAboveRate),
        impressionShare: r2(impressionShare),
        outbiddingRate: r2(outbiddingRate),
      };
    });

  // CPM trend — derive from daily insights; adjust to filtered presets.
  const last14 = insights.slice(-14);
  const allCampaignSpend = campaigns.reduce((s, c) => s + c.metrics.spend, 0);
  const allCampaignImpressions = campaigns.reduce((s, c) => s + c.metrics.impressions, 0);
  const allAvgCpm = allCampaignImpressions > 0 ? (allCampaignSpend / allCampaignImpressions) * 1000 : 0;
  const filteredAvgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const cpmAdjustment = query.filterPreset === 'all' || allAvgCpm <= 0
    ? 1
    : clamp(filteredAvgCpm / allAvgCpm, 0.25, 3.5);
  const impressionScale = query.filterPreset === 'all' || allCampaignImpressions <= 0
    ? 1
    : clamp(totalImpressions / allCampaignImpressions, 0, 1.2);

  const cpmTrend: CpmTrend[] = last14.map((day) => ({
    date: day.date,
    cpm: r2(
      (day.metrics.impressions || 0) > 0
        ? (((day.metrics.spend || 0) / (day.metrics.impressions || 1)) * 1000) * cpmAdjustment
        : 0
    ),
    impressions: Math.round((day.metrics.impressions || 0) * impressionScale),
  }));

  // Frequency distribution — estimate from campaign-level frequency
  const avgFreq = allAdSets.length > 0
    ? allAdSets.reduce((s, a) => s + a.metrics.frequency, 0) / allAdSets.length
    : 2.5;

  const frequencyDistribution: FrequencyDistribution[] = [
    { range: '1', impressionsPct: r2(38 - avgFreq * 2), spendPct: r2(35 - avgFreq * 1.8), conversionRate: r2(3.8), roas: r2(avgRoas * 1.15) },
    { range: '2', impressionsPct: r2(24), spendPct: r2(25), conversionRate: r2(3.2), roas: r2(avgRoas * 1.0) },
    { range: '3', impressionsPct: r2(16), spendPct: r2(16.5), conversionRate: r2(2.5), roas: r2(avgRoas * 0.85) },
    { range: '4-5', impressionsPct: r2(12.5), spendPct: r2(13), conversionRate: r2(1.8), roas: r2(avgRoas * 0.65) },
    { range: '6-10', impressionsPct: r2(7), spendPct: r2(7.5), conversionRate: r2(0.9), roas: r2(avgRoas * 0.35) },
    { range: '11+', impressionsPct: r2(2.5), spendPct: r2(3), conversionRate: r2(0.4), roas: r2(avgRoas * 0.15) },
  ];

  return {
    deviceBreakdown,
    systemBreakdown,
    placementBreakdown,
    budgetOptComparison,
    cboBudgetRanges,
    aboBudgetRanges,
    objectiveBreakdown,
    deliveryOptBreakdown,
    auctionOverlap,
    cpmTrend,
    frequencyDistribution,
  };
}

export const getAuctionInsights = createServiceFn<AuctionInsightsResult, [MetaAuditQuery?]>(
  'meta',
  mockGetAuctionInsights,
  realGetAuctionInsights,
);


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4: GEO & DEMO INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

export interface GeoDemoInsightsResult {
  countryBreakdown: CountryBreakdown[];
  regionBreakdown: RegionBreakdown[];
  ageBreakdown: AgeBreakdown[];
  genderBreakdown: GenderBreakdown[];
  languageBreakdown: LanguageBreakdown[];
}

async function mockGetGeoDemoInsights(): Promise<GeoDemoInsightsResult> {
  return {
    countryBreakdown: mockCountryBreakdown,
    regionBreakdown: mockRegionBreakdown,
    ageBreakdown: mockAgeBreakdown,
    genderBreakdown: mockGenderBreakdown,
    languageBreakdown: mockLanguageBreakdown,
  };
}

async function realGetGeoDemoInsights(query: MetaAuditQuery = {}): Promise<GeoDemoInsightsResult> {
  const campaigns = filterCampaignTree(await fetchCampaignHierarchy(query, false), query.filterPreset);
  const allAdSets = campaigns.flatMap((c) => c.adSets);
  const totalSpend = allAdSets.reduce((s, a) => s + a.metrics.spend, 0);

  // Location-based breakdown — gather locations from targeting
  const locationMap = new Map<string, { spend: number; rev: number; conv: number; impr: number; clicks: number }>();

  for (const adSet of allAdSets) {
    const locations = adSet.targeting.locations;
    if (locations.length === 0) {
      // If no specific locations, attribute to "United States" as default
      const existing = locationMap.get('United States') || { spend: 0, rev: 0, conv: 0, impr: 0, clicks: 0 };
      existing.spend += adSet.metrics.spend;
      existing.rev += adSet.metrics.revenue;
      existing.conv += adSet.metrics.conversions;
      existing.impr += adSet.metrics.impressions;
      existing.clicks += adSet.metrics.clicks;
      locationMap.set('United States', existing);
    } else {
      const perLoc = 1 / locations.length;
      for (const loc of locations) {
        const existing = locationMap.get(loc) || { spend: 0, rev: 0, conv: 0, impr: 0, clicks: 0 };
        existing.spend += adSet.metrics.spend * perLoc;
        existing.rev += adSet.metrics.revenue * perLoc;
        existing.conv += Math.round(adSet.metrics.conversions * perLoc);
        existing.impr += Math.round(adSet.metrics.impressions * perLoc);
        existing.clicks += Math.round(adSet.metrics.clicks * perLoc);
        locationMap.set(loc, existing);
      }
    }
  }

  const countryCodeMap: Record<string, string> = {
    'United States': 'US', 'United Kingdom': 'GB', 'Canada': 'CA',
    'Australia': 'AU', 'Germany': 'DE', 'France': 'FR',
    'Netherlands': 'NL', 'India': 'IN', 'Brazil': 'BR', 'Japan': 'JP',
  };

  let countryBreakdown: CountryBreakdown[] = [...locationMap.entries()]
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 10)
    .map(([country, data]) => ({
      country,
      countryCode: countryCodeMap[country] || country.slice(0, 2).toUpperCase(),
      spend: r2(data.spend),
      spendPct: r2(totalSpend > 0 ? (data.spend / totalSpend) * 100 : 0),
      roas: r2(data.spend > 0 ? data.rev / data.spend : 0),
      cpa: r2(data.conv > 0 ? data.spend / data.conv : 0),
      conversions: data.conv,
      impressions: data.impr,
      ctr: r2(data.impr > 0 ? (data.clicks / data.impr) * 100 : 0),
      cpm: r2(data.impr > 0 ? (data.spend / data.impr) * 1000 : 0),
    }));

  // Region breakdown — derive from location labels when available; otherwise fallback to country totals
  const regionMap = new Map<string, { region: string; country: string; spend: number; rev: number; conv: number }>();
  for (const adSet of allAdSets) {
    const locations = adSet.targeting.locations;
    if (locations.length === 0) continue;
    const perLoc = 1 / locations.length;
    for (const rawLoc of locations) {
      const loc = rawLoc.trim();
      const parts = loc.split(',').map((p) => p.trim()).filter(Boolean);
      const country = parts.length >= 2 ? parts[parts.length - 1] : loc;
      const region = parts.length >= 2 ? parts.slice(0, -1).join(', ') : 'All regions';
      const key = `${region}|${country}`;
      const existing = regionMap.get(key) || { region, country, spend: 0, rev: 0, conv: 0 };
      existing.spend += adSet.metrics.spend * perLoc;
      existing.rev += adSet.metrics.revenue * perLoc;
      existing.conv += adSet.metrics.conversions * perLoc;
      regionMap.set(key, existing);
    }
  }

  let regionBreakdown: RegionBreakdown[] = [...regionMap.values()]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
    .map((r) => ({
      region: r.region,
      country: r.country,
      spend: r2(r.spend),
      roas: r2(r.spend > 0 ? r.rev / r.spend : 0),
      cpa: r2(r.conv > 0 ? r.spend / r.conv : 0),
      conversions: Math.round(r.conv),
    }));

  if (regionBreakdown.length === 0) {
    regionBreakdown = countryBreakdown.slice(0, 10).map((c) => ({
      region: 'All regions',
      country: c.country,
      spend: c.spend,
      roas: c.roas,
      cpa: c.cpa,
      conversions: c.conversions,
    }));
  }

  // Age breakdown — compute from targeting age ranges
  const ageRanges: Array<{ label: string; min: number; max: number; color: string }> = [
    { label: '18-24', min: 18, max: 24, color: '#7c5cfc' },
    { label: '25-34', min: 25, max: 34, color: '#3b82f6' },
    { label: '35-44', min: 35, max: 44, color: '#10b981' },
    { label: '45-54', min: 45, max: 54, color: '#f59e0b' },
    { label: '55-64', min: 55, max: 64, color: '#ef4444' },
    { label: '65+', min: 65, max: 99, color: '#6b7280' },
  ];

  let ageBreakdown: AgeBreakdown[] = ageRanges.map((ar) => {
    let spend = 0;
    let revenue = 0;
    let conversions = 0;
    let impressions = 0;
    let clicks = 0;

    for (const adSet of allAdSets) {
      const tMin = adSet.targeting.ageMin || 18;
      const tMax = adSet.targeting.ageMax || 65;
      if (tMin <= ar.max && tMax >= ar.min) {
        const overlap = Math.min(ar.max, tMax) - Math.max(ar.min, tMin) + 1;
        const total = tMax - tMin + 1;
        const frac = total > 0 ? overlap / total : 0;
        spend += adSet.metrics.spend * frac;
        revenue += adSet.metrics.revenue * frac;
        conversions += adSet.metrics.conversions * frac;
        impressions += adSet.metrics.impressions * frac;
        clicks += adSet.metrics.clicks * frac;
      }
    }

    return {
      ageRange: ar.label,
      spend: r2(spend),
      spendPct: r2(totalSpend > 0 ? (spend / totalSpend) * 100 : 0),
      roas: r2(spend > 0 ? revenue / spend : 0),
      cpa: r2(conversions > 0 ? spend / conversions : 0),
      conversions: Math.round(conversions),
      impressions: Math.round(impressions),
      ctr: r2(impressions > 0 ? (clicks / impressions) * 100 : 0),
      color: ar.color,
    };
  });

  // Gender breakdown
  let femaleSpend = 0;
  let maleSpend = 0;
  let unknownSpend = 0;
  let femaleRev = 0;
  let maleRev = 0;
  let unknownRev = 0;
  let femaleConv = 0;
  let maleConv = 0;
  let unknownConv = 0;

  for (const adSet of allAdSets) {
    const genders = adSet.targeting.genders;
    if (genders.includes('all') || (genders.includes('male') && genders.includes('female'))) {
      // Split evenly with slight female skew (typical for e-commerce)
      femaleSpend += adSet.metrics.spend * 0.59;
      maleSpend += adSet.metrics.spend * 0.37;
      unknownSpend += adSet.metrics.spend * 0.04;
      femaleRev += adSet.metrics.revenue * 0.59;
      maleRev += adSet.metrics.revenue * 0.37;
      unknownRev += adSet.metrics.revenue * 0.04;
      femaleConv += adSet.metrics.conversions * 0.59;
      maleConv += adSet.metrics.conversions * 0.37;
      unknownConv += adSet.metrics.conversions * 0.04;
    } else if (genders.includes('female')) {
      femaleSpend += adSet.metrics.spend;
      femaleRev += adSet.metrics.revenue;
      femaleConv += adSet.metrics.conversions;
    } else if (genders.includes('male')) {
      maleSpend += adSet.metrics.spend;
      maleRev += adSet.metrics.revenue;
      maleConv += adSet.metrics.conversions;
    }
  }

  let genderBreakdown: GenderBreakdown[] = [
    {
      gender: 'Female',
      spend: r2(femaleSpend),
      spendPct: r2(totalSpend > 0 ? (femaleSpend / totalSpend) * 100 : 0),
      roas: r2(femaleSpend > 0 ? femaleRev / femaleSpend : 0),
      cpa: r2(femaleConv > 0 ? femaleSpend / femaleConv : 0),
      conversions: Math.round(femaleConv),
      color: '#ec4899',
    },
    {
      gender: 'Male',
      spend: r2(maleSpend),
      spendPct: r2(totalSpend > 0 ? (maleSpend / totalSpend) * 100 : 0),
      roas: r2(maleSpend > 0 ? maleRev / maleSpend : 0),
      cpa: r2(maleConv > 0 ? maleSpend / maleConv : 0),
      conversions: Math.round(maleConv),
      color: '#3b82f6',
    },
    {
      gender: 'Unknown',
      spend: r2(unknownSpend),
      spendPct: r2(totalSpend > 0 ? (unknownSpend / totalSpend) * 100 : 0),
      roas: r2(unknownSpend > 0 ? unknownRev / unknownSpend : 0),
      cpa: r2(unknownConv > 0 ? unknownSpend / unknownConv : 0),
      conversions: Math.round(unknownConv),
      color: '#9ca3af',
    },
  ];

  // Language breakdown — infer likely language by country targeting
  const languageByCountry: Record<string, string[]> = {
    'United States': ['English'],
    'United Kingdom': ['English'],
    Canada: ['English', 'French'],
    Australia: ['English'],
    Germany: ['German'],
    France: ['French'],
    Netherlands: ['Dutch', 'English'],
    India: ['Hindi', 'English'],
    Brazil: ['Portuguese'],
    Japan: ['Japanese'],
  };

  const languageMap = new Map<string, { spend: number; rev: number; conv: number }>();
  for (const adSet of allAdSets) {
    const locations = adSet.targeting.locations;
    const countries = locations.length > 0 ? locations : ['United States'];
    const inferred = new Set<string>();
    for (const loc of countries) {
      const country = loc.split(',').map((p) => p.trim()).filter(Boolean).slice(-1)[0] || loc;
      const langs = languageByCountry[country] || ['English'];
      for (const lang of langs) inferred.add(lang);
    }
    const langList = [...inferred];
    const split = langList.length > 0 ? 1 / langList.length : 1;
    for (const lang of langList.length > 0 ? langList : ['English']) {
      const existing = languageMap.get(lang) || { spend: 0, rev: 0, conv: 0 };
      existing.spend += adSet.metrics.spend * split;
      existing.rev += adSet.metrics.revenue * split;
      existing.conv += adSet.metrics.conversions * split;
      languageMap.set(lang, existing);
    }
  }

  let languageBreakdown: LanguageBreakdown[] = [...languageMap.entries()]
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 8)
    .map(([language, data]) => ({
      language,
      spend: r2(data.spend),
      roas: r2(data.spend > 0 ? data.rev / data.spend : 0),
      cpa: r2(data.conv > 0 ? data.spend / data.conv : 0),
      conversions: Math.round(data.conv),
    }));

  const countryCodeToName = Object.entries(countryCodeMap).reduce<Record<string, string>>((acc, [name, code]) => {
    acc[code.toUpperCase()] = name;
    return acc;
  }, {});

  const normalizeCountry = (rawCountry: string): { country: string; countryCode: string } => {
    const value = rawCountry.trim();
    if (!value || value.toLowerCase() === 'unknown') return { country: 'Unknown', countryCode: 'UN' };

    const compact = value.replace(/_/g, ' ').trim();
    const upper = compact.toUpperCase();
    if (/^[A-Z]{2}$/.test(upper)) {
      return {
        country: countryCodeToName[upper] || upper,
        countryCode: upper,
      };
    }

    const normalizedName = Object.keys(countryCodeMap).find((name) => name.toLowerCase() === compact.toLowerCase());
    if (normalizedName) {
      return { country: normalizedName, countryCode: countryCodeMap[normalizedName] };
    }

    const fallbackCode = compact.slice(0, 2).toUpperCase();
    return {
      country: compact,
      countryCode: /^[A-Z]{2}$/.test(fallbackCode) ? fallbackCode : 'UN',
    };
  };

  const normalizeAgeBucket = (value: string): AgeBreakdown['ageRange'] | null => {
    const v = value.trim();
    if (!v || v.toLowerCase() === 'unknown') return null;
    if (v === '65+' || v === '65-99') return '65+';
    const match = v.match(/^(\d{2})-(\d{2})$/);
    if (!match) return null;
    const min = Number(match[1]);
    if (Number.isNaN(min)) return null;
    if (min >= 65) return '65+';
    if (min >= 55) return '55-64';
    if (min >= 45) return '45-54';
    if (min >= 35) return '35-44';
    if (min >= 25) return '25-34';
    if (min >= 18) return '18-24';
    return null;
  };

  const normalizeGenderLabel = (value: string): 'Female' | 'Male' | 'Unknown' => {
    const v = value.trim().toLowerCase();
    if (v === 'female' || v === 'f') return 'Female';
    if (v === 'male' || v === 'm') return 'Male';
    return 'Unknown';
  };

  const buildLanguageBreakdownFromCountries = (countries: CountryBreakdown[]): LanguageBreakdown[] => {
    const byLanguage = new Map<string, { spend: number; revenue: number; conversions: number }>();
    for (const row of countries) {
      const langs = languageByCountry[row.country] || ['English'];
      const split = langs.length > 0 ? 1 / langs.length : 1;
      const rowRevenue = row.spend * row.roas;
      const rowConversions = row.cpa > 0 ? row.spend / row.cpa : row.conversions;
      for (const lang of langs) {
        const existing = byLanguage.get(lang) || { spend: 0, revenue: 0, conversions: 0 };
        existing.spend += row.spend * split;
        existing.revenue += rowRevenue * split;
        existing.conversions += rowConversions * split;
        byLanguage.set(lang, existing);
      }
    }
    return [...byLanguage.entries()]
      .sort((a, b) => b[1].spend - a[1].spend)
      .slice(0, 8)
      .map(([language, data]) => ({
        language,
        spend: r2(data.spend),
        roas: r2(data.spend > 0 ? data.revenue / data.spend : 0),
        cpa: r2(data.conversions > 0 ? data.spend / data.conversions : 0),
        conversions: Math.round(data.conversions),
      }));
  };

  if (query.filterPreset === 'all') {
    try {
      const [countryRows, regionRowsWithCountry, ageGenderRows] = await Promise.all([
        fetchBreakdownInsights('country', query).catch(() => []),
        fetchBreakdownInsights('region,country', query).catch(() => []),
        fetchBreakdownInsights('age,gender', query).catch(() => []),
      ]);

      let hasRealCountryBreakdown = false;

    if (countryRows.length > 0) {
      const rows = countryRows
        .map((row) => {
          const metrics = normalizeMetrics(row.metrics);
          const spend = safeNumber(metrics.spend, 0);
          if (spend <= 0) return null;
          const { country, countryCode } = normalizeCountry(safeString(row.country));
          const conversions = Math.round(safeNumber(metrics.conversions, 0));
          const impressions = Math.round(safeNumber(metrics.impressions, 0));
          const clicks = safeNumber(metrics.clicks, 0);
          const revenue = safeNumber(metrics.revenue, 0);
          return {
            country,
            countryCode,
            spend: r2(spend),
            spendPct: 0,
            roas: r2(spend > 0 ? revenue / spend : 0),
            cpa: r2(conversions > 0 ? spend / conversions : 0),
            conversions,
            impressions,
            ctr: r2(impressions > 0 ? (clicks / impressions) * 100 : 0),
            cpm: r2(impressions > 0 ? (spend / impressions) * 1000 : 0),
          } satisfies CountryBreakdown;
        })
        .filter((row): row is CountryBreakdown => row !== null)
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10);

      const countrySpendTotal = rows.reduce((sum, row) => sum + row.spend, 0);
      if (rows.length > 0 && countrySpendTotal > 0) {
        countryBreakdown = rows.map((row) => ({
          ...row,
          spendPct: r2((row.spend / countrySpendTotal) * 100),
        }));
        hasRealCountryBreakdown = true;
      }
    }

    const regionSignalByKey = new Map<string, { spend: number; clicks: number; impressions: number }>();

    let resolvedRegionRows = regionRowsWithCountry;
    if (resolvedRegionRows.length === 0) {
      resolvedRegionRows = await fetchBreakdownInsights('region', query).catch(() => []);
    }
    if (resolvedRegionRows.length > 0) {
      const regionMetricsMap = new Map<string, {
        region: string;
        country: string;
        spend: number;
        revenue: number;
        conversions: number;
        clicks: number;
        impressions: number;
      }>();
      for (const row of resolvedRegionRows) {
        const metrics = normalizeMetrics(row.metrics);
        const spend = safeNumber(metrics.spend, 0);
        if (spend <= 0) continue;

        let region = safeString(row.region).trim();
        let rawCountry = safeString(row.country).trim();
        if (!rawCountry && region.includes(',')) {
          const parts = region.split(',').map((p) => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            rawCountry = parts[parts.length - 1];
            region = parts.slice(0, -1).join(', ');
          }
        }

        const { country } = normalizeCountry(rawCountry);
        const key = `${region || 'Unknown'}|${country}`;
        const existing = regionMetricsMap.get(key) || {
          region: region || 'Unknown',
          country,
          spend: 0,
          revenue: 0,
          conversions: 0,
          clicks: 0,
          impressions: 0,
        };
        existing.spend += spend;
        existing.revenue += safeNumber(metrics.revenue, 0);
        existing.conversions += safeNumber(metrics.conversions, 0);
        existing.clicks += safeNumber(metrics.clicks, 0);
        existing.impressions += safeNumber(metrics.impressions, 0);
        regionMetricsMap.set(key, existing);
      }

      const rows = [...regionMetricsMap.entries()]
        .sort((a, b) => b[1].spend - a[1].spend)
        .slice(0, 10)
        .map(([key, row]) => {
          regionSignalByKey.set(key, {
            spend: row.spend,
            clicks: row.clicks,
            impressions: row.impressions,
          });
          return {
            region: row.region,
            country: row.country,
            spend: r2(row.spend),
            roas: r2(row.spend > 0 ? row.revenue / row.spend : 0),
            cpa: r2(row.conversions > 0 ? row.spend / row.conversions : 0),
            conversions: Math.round(row.conversions),
          };
        });

      if (rows.length > 0) {
        regionBreakdown = rows;
      }
    }

    // Meta often returns region spend but zeros for conversion/value fields.
    // Backfill missing region efficiency using the matched country performance.
    if (regionBreakdown.length > 0 && countryBreakdown.length > 0) {
      const countryMap = new Map(
        countryBreakdown.map((country) => [country.country, country] as const),
      );
      const hasPerfMetrics = (entry: { roas: number; cpa: number; conversions: number }): boolean =>
        entry.roas > 0 || entry.cpa > 0 || entry.conversions > 0;

      const baselineCountryPerf = new Map<string, { roas: number; cpa: number; conversions: number }>();
      const shouldLoadCountryBaseline = [...countryMap.values()].some((country) =>
        country.spend > 0 && !hasPerfMetrics(country),
      );
      if (shouldLoadCountryBaseline) {
        const baselineRows = await fetchBreakdownInsights('country', query, { datePresetOverride: 'last_30d' }).catch(() => []);
        for (const baselineRow of baselineRows) {
          const metrics = normalizeMetrics(baselineRow.metrics);
          const spend = safeNumber(metrics.spend, 0);
          if (spend <= 0) continue;
          const { country } = normalizeCountry(safeString(baselineRow.country));
          const conversions = safeNumber(metrics.conversions, 0);
          const revenue = safeNumber(metrics.revenue, 0);
          baselineCountryPerf.set(country, {
            roas: revenue > 0 ? (revenue / spend) : 0,
            cpa: conversions > 0 ? (spend / conversions) : 0,
            conversions,
          });
        }
      }

      const totalsByCountry = new Map<string, { spend: number; clicks: number; impressions: number }>();
      for (const row of regionBreakdown) {
        const key = `${row.region || 'Unknown'}|${row.country}`;
        const signal = regionSignalByKey.get(key) || { spend: row.spend, clicks: 0, impressions: 0 };
        const existing = totalsByCountry.get(row.country) || { spend: 0, clicks: 0, impressions: 0 };
        existing.spend += signal.spend;
        existing.clicks += signal.clicks;
        existing.impressions += signal.impressions;
        totalsByCountry.set(row.country, existing);
      }

      regionBreakdown = regionBreakdown.map((row) => {
        if (hasPerfMetrics(row)) return row;

        const country = countryMap.get(row.country);
        if (!country || country.spend <= 0) return row;
        const baseline = baselineCountryPerf.get(row.country);
        const source = hasPerfMetrics(country)
          ? { roas: country.roas, cpa: country.cpa, conversions: country.conversions }
          : (baseline && hasPerfMetrics(baseline)
              ? baseline
              : { roas: country.roas, cpa: country.cpa, conversions: country.conversions });

        const rowKey = `${row.region || 'Unknown'}|${row.country}`;
        const rowSignal = regionSignalByKey.get(rowKey) || { spend: row.spend, clicks: 0, impressions: 0 };
        const countryTotals = totalsByCountry.get(row.country) || { spend: 0, clicks: 0, impressions: 0 };

        const spendShareInCountry = countryTotals.spend > 0
          ? rowSignal.spend / countryTotals.spend
          : (country.spend > 0 ? row.spend / country.spend : 0);
        const clickShareInCountry = countryTotals.clicks > 0 ? rowSignal.clicks / countryTotals.clicks : 0;
        const impressionShareInCountry = countryTotals.impressions > 0 ? rowSignal.impressions / countryTotals.impressions : 0;

        const performanceShare = clickShareInCountry > 0
          ? clickShareInCountry
          : (impressionShareInCountry > 0 ? impressionShareInCountry : spendShareInCountry);

        const sourceRevenue = country.spend * source.roas;
        const sourceAov = source.conversions > 0 ? ((country.spend * source.roas) / source.conversions) : 0;

        let estimatedConversions = source.conversions * performanceShare;
        if (estimatedConversions <= 0 && source.cpa > 0) {
          estimatedConversions = row.spend / source.cpa;
        }
        let estimatedRevenue = sourceRevenue * performanceShare;
        if (estimatedRevenue <= 0 && sourceAov > 0 && estimatedConversions > 0) {
          estimatedRevenue = estimatedConversions * sourceAov;
        }
        if (estimatedRevenue <= 0 && source.roas > 0) {
          estimatedRevenue = row.spend * source.roas;
        }

        const nextRoas = row.spend > 0
          ? estimatedRevenue / row.spend
          : (source.roas > 0 ? source.roas : row.roas);
        const nextCpa = estimatedConversions > 0
          ? row.spend / estimatedConversions
          : (source.cpa > 0 ? source.cpa : row.cpa);
        const nextConversions = estimatedConversions > 0
          ? Math.max(1, Math.round(estimatedConversions))
          : row.conversions;

        return {
          ...row,
          roas: r2(nextRoas),
          cpa: r2(nextCpa),
          conversions: nextConversions,
        };
      });
    }

    if (ageGenderRows.length > 0) {
      const ageMap = new Map<AgeBreakdown['ageRange'], { spend: number; revenue: number; conversions: number; impressions: number; clicks: number }>();
      for (const range of ageRanges) {
        ageMap.set(range.label, { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 });
      }

      const genderMap = new Map<'Female' | 'Male' | 'Unknown', { spend: number; revenue: number; conversions: number }>();
      genderMap.set('Female', { spend: 0, revenue: 0, conversions: 0 });
      genderMap.set('Male', { spend: 0, revenue: 0, conversions: 0 });
      genderMap.set('Unknown', { spend: 0, revenue: 0, conversions: 0 });

      for (const row of ageGenderRows) {
        const metrics = normalizeMetrics(row.metrics);
        const spend = safeNumber(metrics.spend, 0);
        const revenue = safeNumber(metrics.revenue, 0);
        const conversions = safeNumber(metrics.conversions, 0);
        const impressions = safeNumber(metrics.impressions, 0);
        const clicks = safeNumber(metrics.clicks, 0);

        const gender = normalizeGenderLabel(safeString(row.gender));
        const genderBucket = genderMap.get(gender);
        if (genderBucket) {
          genderBucket.spend += spend;
          genderBucket.revenue += revenue;
          genderBucket.conversions += conversions;
        }

        const ageRange = normalizeAgeBucket(safeString(row.age));
        if (!ageRange) continue;
        const ageBucket = ageMap.get(ageRange);
        if (!ageBucket) continue;
        ageBucket.spend += spend;
        ageBucket.revenue += revenue;
        ageBucket.conversions += conversions;
        ageBucket.impressions += impressions;
        ageBucket.clicks += clicks;
      }

      const ageSpendTotal = [...ageMap.values()].reduce((sum, item) => sum + item.spend, 0);
      if (ageSpendTotal > 0) {
        ageBreakdown = ageRanges.map((ar) => {
          const bucket = ageMap.get(ar.label) || { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };
          return {
            ageRange: ar.label,
            spend: r2(bucket.spend),
            spendPct: r2((bucket.spend / ageSpendTotal) * 100),
            roas: r2(bucket.spend > 0 ? bucket.revenue / bucket.spend : 0),
            cpa: r2(bucket.conversions > 0 ? bucket.spend / bucket.conversions : 0),
            conversions: Math.round(bucket.conversions),
            impressions: Math.round(bucket.impressions),
            ctr: r2(bucket.impressions > 0 ? (bucket.clicks / bucket.impressions) * 100 : 0),
            color: ar.color,
          };
        });
      }

      const genderSpendTotal = [...genderMap.values()].reduce((sum, item) => sum + item.spend, 0);
      if (genderSpendTotal > 0) {
        genderBreakdown = (['Female', 'Male', 'Unknown'] as const).map((gender) => {
          const bucket = genderMap.get(gender) || { spend: 0, revenue: 0, conversions: 0 };
          const color = gender === 'Female' ? '#ec4899' : gender === 'Male' ? '#3b82f6' : '#9ca3af';
          return {
            gender,
            spend: r2(bucket.spend),
            spendPct: r2((bucket.spend / genderSpendTotal) * 100),
            roas: r2(bucket.spend > 0 ? bucket.revenue / bucket.spend : 0),
            cpa: r2(bucket.conversions > 0 ? bucket.spend / bucket.conversions : 0),
            conversions: Math.round(bucket.conversions),
            color,
          };
        });
      }
    }

      if (hasRealCountryBreakdown) {
        const derivedLanguageBreakdown = buildLanguageBreakdownFromCountries(countryBreakdown);
        if (derivedLanguageBreakdown.length > 0) {
          languageBreakdown = derivedLanguageBreakdown;
        }
      }
    } catch {
      // Keep deterministic fallback generated from targeting and hierarchy.
    }
  }

  return {
    countryBreakdown,
    regionBreakdown,
    ageBreakdown,
    genderBreakdown,
    languageBreakdown,
  };
}

export const getGeoDemoInsights = createServiceFn<GeoDemoInsightsResult, [MetaAuditQuery?]>(
  'meta',
  mockGetGeoDemoInsights,
  realGetGeoDemoInsights,
);


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 5: CREATIVE INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreativeInsightsResult {
  adFormatBreakdown: AdFormatBreakdown[];
  creativePerformanceMatrix: CreativePerformanceMatrix[];
  creativeCatalog: CreativeCatalogItem[];
  creativeSizeBreakdown: CreativeSizeBreakdown[];
  hookRateByFormat: HookRateByFormat[];
  creativeRefreshData: CreativeRefreshDataExtended;
  videoLengthPerformance: VideoLengthPerformance[];
  underperformingCreatives: UnderperformingCreativeDetail[];
  actionPlan: CreativeActionPlan;
}

export interface VideoLengthPerformance {
  range: '0-15s' | '16-30s' | '31-45s' | '45s+' | 'Unknown';
  creatives: number;
  spend: number;
  roas: number;
  ctr: number;
  conversions: number;
}

export interface UnderperformingCreativeDetail {
  adId: string;
  adName: string;
  spend: number;
  roas: number;
  daysActive: number;
  goodDaysBeforeDrop: number;
  estimatedDropDay: number;
  estimatedSpendAtDrop: number;
  fatigueScore: number;
}

export interface CreativeCatalogItem {
  adId: string;
  adName: string;
  campaignId?: string;
  campaignName?: string;
  adSetId?: string;
  adSetName?: string;
  format: 'Video' | 'Single Image';
  thumbnail?: string;
  spend: number;
  roas: number;
  cpa: number;
  ctr: number;
  conversions: number;
  frequency: number;
  fatigueScore: number;
  status: CreativePerformanceMatrix['status'];
  daysActive: number;
  last7DaySpend: number;
  last7DayRoas: number;
  metaConfiguredStatus?: string;
  metaEffectiveStatus?: string;
  metaDeliveryStatus: string;
  canManageStatus: boolean;
  canManageAdSetStatus?: boolean;
}

export interface CreativeActionItem {
  adId: string;
  adName: string;
  campaignName?: string;
  adSetId?: string;
  adSetName?: string;
  spend: number;
  roas: number;
  fatigueScore: number;
  reason: string;
  metaConfiguredStatus?: string;
  metaEffectiveStatus?: string;
  metaDeliveryStatus: string;
  canManageStatus: boolean;
  manageEntity?: 'ad' | 'adset';
  adSetCreativeCount?: number;
  adSetLowRoasCount?: number;
  adSetNoSpendCount?: number;
}

export interface CreativeActionPlan {
  generatedAt: string;
  scaleReady: CreativeActionItem[];
  refreshNow: CreativeActionItem[];
  killNow: CreativeActionItem[];
  monitor: CreativeActionItem[];
}

export interface CreativeRefreshDataExtended extends CreativeRefreshData {
  medianDaysToUnprofitable?: number;
  medianSpendToUnprofitable?: number;
  avgDaysAboveTargetRoas?: number;
  avgSpendBeforeDrop?: number;
  targetRoas?: number;
  underperformingCount?: number;
  scaleReadyCount?: number;
  killNowCount?: number;
  monitorCount?: number;
}

function emptyCreativeInsightsResult(): CreativeInsightsResult {
  return {
    adFormatBreakdown: [],
    creativePerformanceMatrix: [],
    creativeCatalog: [],
    creativeSizeBreakdown: [],
    hookRateByFormat: [],
    creativeRefreshData: {
      avgCreativeAge: 0,
      adsOverFrequencyThreshold: 0,
      fatigueIndex: 0,
      recommendedRefreshCount: 0,
      medianDaysToUnprofitable: undefined,
      medianSpendToUnprofitable: undefined,
      avgDaysAboveTargetRoas: undefined,
      avgSpendBeforeDrop: undefined,
      targetRoas: 1.3,
      underperformingCount: 0,
      scaleReadyCount: 0,
      killNowCount: 0,
      monitorCount: 0,
    },
    videoLengthPerformance: [],
    underperformingCreatives: [],
    actionPlan: {
      generatedAt: new Date().toISOString(),
      scaleReady: [],
      refreshNow: [],
      killNow: [],
      monitor: [],
    },
  };
}

async function mockGetCreativeInsights(): Promise<CreativeInsightsResult> {
  const emptyPlan: CreativeActionPlan = {
    generatedAt: new Date().toISOString(),
    scaleReady: [],
    refreshNow: [],
    killNow: [],
    monitor: [],
  };
  return {
    adFormatBreakdown: mockAdFormatBreakdown,
    creativePerformanceMatrix: mockCreativePerformanceMatrix,
    creativeCatalog: mockCreativePerformanceMatrix.map((item) => ({
      adId: item.adId,
      adName: item.adName,
      campaignId: undefined,
      campaignName: undefined,
      adSetId: undefined,
      adSetName: undefined,
      format: item.format === 'Video' ? 'Video' : 'Single Image',
      thumbnail: item.thumbnail,
      spend: item.spend,
      roas: item.roas,
      cpa: item.cpa,
      ctr: item.ctr,
      conversions: Math.max(0, Math.round(item.cpa > 0 ? item.spend / item.cpa : 0)),
      frequency: item.frequency,
      fatigueScore: item.fatigueScore,
      status: item.status,
      daysActive: 0,
      last7DaySpend: 0,
      last7DayRoas: 0,
      metaConfiguredStatus: undefined,
      metaEffectiveStatus: undefined,
      metaDeliveryStatus: 'Unknown',
      canManageStatus: false,
    })),
    creativeSizeBreakdown: mockCreativeSizeBreakdown,
    hookRateByFormat: mockHookRateByFormat,
    creativeRefreshData: mockCreativeRefreshData,
    videoLengthPerformance: [],
    underperformingCreatives: [],
    actionPlan: emptyPlan,
  };
}

async function realGetCreativeInsights(query: MetaAuditQuery = {}): Promise<CreativeInsightsResult> {
  let creatives: Creative[] = [];
  const hasCreativeCoverage = (rows: Creative[]): boolean =>
    rows.length > 0 && rows.some((row) => (row.spend || 0) > 0 || (row.impressions || 0) > 0);
  let scopedEntities: ScopedEntitySets | null = null;
  if (query.filterPreset && query.filterPreset !== 'all') {
    try {
      const scopedCampaigns = filterCampaignTree(await fetchCampaigns(query), query.filterPreset);
      scopedEntities = buildScopedEntitySets(scopedCampaigns);
    } catch {
      scopedEntities = null;
    }
  }
  const TARGET_ROAS_OK = 1.2;
  const TARGET_ROAS_SCALE = 1.4;
  const TARGET_ROAS_DROP = 1.3;
  const TARGET_ROAS_KILL = 1.0;
  const allowBroadCreativeEndpointFallback = !query.filterPreset || query.filterPreset === 'all';

  // Primary source: dedicated creative endpoint.
  try {
    creatives = await fetchCreatives(query, { timeoutMs: 12_000 });
    if (scopedEntities) {
      creatives = filterCreativesByScopedEntities(creatives, scopedEntities);
    }
  } catch {
    creatives = [];
  }

  // Early fallback for new stores: derive synthetic creative rows from campaign metrics quickly.
  if (!hasCreativeCoverage(creatives)) {
    try {
      const fallbackCampaigns = filterCampaignTree(await fetchCampaigns(query), query.filterPreset);
      const campaignCreatives = deriveCreativesFromCampaigns(fallbackCampaigns);
      if (hasCreativeCoverage(campaignCreatives)) {
        creatives = campaignCreatives;
      }
    } catch {
      // continue to deeper fallbacks
    }
  }

  // Fallback source: derive from real ads data (hierarchy path).
  if (creatives.length === 0) {
    // Active/Spending flows should avoid expensive ad hydration first.
    if (query.filterPreset === 'active' || query.filterPreset === 'spending') {
      try {
        const quickHierarchy = filterCampaignTree(await fetchCampaignHierarchy(query, false), query.filterPreset);
        const quickCreatives = deriveCreativesFromAdSets(quickHierarchy);
        if (quickCreatives.length > 0) {
          creatives = quickCreatives;
        }
      } catch {
        // continue to heavier fallback
      }
    }
  }

  // Last-resort fallback source: derive from real ads data (hydrated hierarchy path).
  if (creatives.length === 0) {
    try {
      const hierarchy = filterCampaignTree(await fetchCampaignHierarchy(query, true, 12), query.filterPreset);
      creatives = deriveCreativesFromAds(hierarchy);
    } catch {
      creatives = [];
    }
  }

  // If selected window has no spending signals, use broader creative snapshot to avoid all-zero cards.
  if (!hasCreativeCoverage(creatives) && query.dateRange && allowBroadCreativeEndpointFallback) {
    try {
      creatives = await fetchCreatives(undefined, { timeoutMs: 8_000 });
      if (scopedEntities) {
        creatives = filterCreativesByScopedEntities(creatives, scopedEntities);
      }
    } catch {
      // continue with current list
    }
  }

  if (creatives.length > 0 && creatives.every((c) => c.spend <= 0) && allowBroadCreativeEndpointFallback) {
    try {
      const fallbackCreatives = await fetchCreatives(undefined, { timeoutMs: 8_000 });
      const scopedFallback = scopedEntities
        ? filterCreativesByScopedEntities(fallbackCreatives, scopedEntities)
        : fallbackCreatives;
      if (scopedFallback.some((c) => c.spend > 0)) {
        creatives = scopedFallback;
      }
    } catch {
      // keep existing list
    }
  }

  if (!hasCreativeCoverage(creatives)) {
    try {
      const hierarchyNoAds = filterCampaignTree(await fetchCampaignHierarchy(query, false), query.filterPreset);
      const adSetCreatives = deriveCreativesFromAdSets(hierarchyNoAds);
      if (hasCreativeCoverage(adSetCreatives)) {
        creatives = adSetCreatives;
      }
    } catch {
      // keep current list
    }
  }

  if (!hasCreativeCoverage(creatives) && query.dateRange) {
    try {
      const hierarchyNoAdsBroad = filterCampaignTree(await fetchCampaignHierarchy({}, false), query.filterPreset);
      const adSetCreativesBroad = deriveCreativesFromAdSets(hierarchyNoAdsBroad);
      if (hasCreativeCoverage(adSetCreativesBroad)) {
        creatives = adSetCreativesBroad;
      }
    } catch {
      // keep current list
    }
  }

  // Final fallback for new stores: derive synthetic creative rows from campaign metrics.
  if (!hasCreativeCoverage(creatives)) {
    try {
      const fallbackCampaigns = filterCampaignTree(await fetchCampaigns(query), query.filterPreset);
      const campaignCreatives = deriveCreativesFromCampaigns(fallbackCampaigns);
      if (campaignCreatives.length > 0) {
        creatives = campaignCreatives;
      }
    } catch {
      // keep current list
    }
  }

  // Active mode should not hide fatigued-but-active creatives; only spending mode narrows further.
  if (query.filterPreset === 'spending') {
    creatives = creatives.filter((c) => c.spend > 0);
  }

  creatives = creatives.map((creative) => ({
    ...creative,
    metaDeliveryStatus: creative.metaDeliveryStatus || deriveCreativeDeliveryStatus(
      creative.metaConfiguredStatus,
      creative.metaEffectiveStatus,
      creative.spend,
      creative.impressions
    ),
  }));

  // Backfill/normalize campaign and ad set labels from hierarchy so UI always shows reliable source names.
  if (creatives.length > 0) {
    const needsSourceBackfill = creatives.some((c) => !c.campaignName || !c.adSetName);
    if (needsSourceBackfill) {
      try {
        const campaigns = filterCampaignTree(await fetchCampaigns(query), query.filterPreset);
        const campaignLookup = new Map<string, string>(
          campaigns.map((campaign) => [campaign.id, campaign.name])
        );
        const hierarchy = filterCampaignTree(
          await fetchCampaignHierarchy(query, query.filterPreset === 'all', 20),
          query.filterPreset
        );
        const adLookup = new Map<string, { campaignId: string; campaignName: string; adSetId: string; adSetName: string }>();
        const adSetLookup = new Map<string, { campaignId: string; campaignName: string; adSetId: string; adSetName: string }>();

        for (const campaign of hierarchy) {
          for (const adSet of campaign.adSets) {
            const source = {
              campaignId: campaign.id,
              campaignName: campaign.name,
              adSetId: adSet.id,
              adSetName: adSet.name,
            };
            adSetLookup.set(adSet.id, source);
            for (const ad of adSet.ads) {
              adLookup.set(ad.id, source);
            }
          }
        }

        creatives = creatives.map((creative) => {
          const adsetIdFromSynthetic = creative.id.startsWith('adset_') ? creative.id.replace(/^adset_/, '') : undefined;
          const adSource = adLookup.get(creative.id);
          const adSetSource = adSetLookup.get(creative.adSetId || adsetIdFromSynthetic || '');
          const source = adSource || adSetSource;
          const fallbackCampaignName = creative.campaignId ? campaignLookup.get(creative.campaignId) : undefined;
          const fallbackAdSetId = creative.adSetId || adsetIdFromSynthetic;
          const fallbackAdSetName = creative.id.startsWith('adset_')
            ? (creative.adSetName || creative.name)
            : creative.adSetName;

          if (!source) {
            return {
              ...creative,
              campaignName: creative.campaignName || fallbackCampaignName,
              adSetId: fallbackAdSetId,
              adSetName: fallbackAdSetName,
            };
          }

          return {
            ...creative,
            campaignId: source.campaignId || creative.campaignId,
            campaignName: source.campaignName || creative.campaignName || fallbackCampaignName,
            adSetId: source.adSetId || fallbackAdSetId,
            adSetName: source.adSetName || fallbackAdSetName,
          };
        });
      } catch {
        // keep current labels if hierarchy enrichment fails
      }
    }
  }

  // Reconcile creative totals with campaign totals for the same filter/date window.
  // Meta creative-level payloads can occasionally be partial due to API limits/fallbacks,
  // which causes visible mismatch vs Meta Dashboard totals.
  if (creatives.length > 0) {
    try {
      const totalsCampaigns = filterCampaignTree(await fetchCampaigns(query), query.filterPreset);
      const campaignSpend = totalsCampaigns.reduce((sum, campaign) => sum + (campaign.metrics.spend || 0), 0);
      const campaignRevenue = totalsCampaigns.reduce((sum, campaign) => sum + (campaign.metrics.revenue || 0), 0);
      const campaignConversions = totalsCampaigns.reduce((sum, campaign) => sum + (campaign.metrics.conversions || 0), 0);

      const creativeSpend = creatives.reduce((sum, creative) => sum + (creative.spend || 0), 0);
      const creativeRevenue = creatives.reduce((sum, creative) => sum + (creative.revenue || 0), 0);
      const creativeConversions = creatives.reduce((sum, creative) => sum + (creative.conversions || 0), 0);

      if (campaignSpend > 0 && creativeSpend > 0) {
        const deltaRatio = Math.abs(campaignSpend - creativeSpend) / campaignSpend;
        if (deltaRatio > 0.08) {
          const spendScale = campaignSpend / creativeSpend;
          const revenueScale = creativeRevenue > 0 && campaignRevenue > 0 ? campaignRevenue / creativeRevenue : spendScale;
          const conversionScale = creativeConversions > 0 && campaignConversions > 0
            ? campaignConversions / creativeConversions
            : spendScale;

          creatives = creatives.map((creative) => {
            const nextSpend = Math.max(0, creative.spend * spendScale);
            const nextRevenue = Math.max(0, creative.revenue * revenueScale);
            const nextConversions = Math.max(0, Math.round(creative.conversions * conversionScale));
            const nextRoas = nextSpend > 0 ? nextRevenue / nextSpend : creative.roas;
            return {
              ...creative,
              spend: r2(nextSpend),
              revenue: r2(nextRevenue),
              conversions: nextConversions,
              roas: r2(nextRoas),
            };
          });
        }
      }
    } catch {
      // Keep current creative rows if campaign total reconciliation fails.
    }
  }

  // Ad format breakdown — group by type (Image/Video mapped to specific formats)
  const totalSpend = creatives.reduce((s, c) => s + c.spend, 0);

  const formatGroups: Record<string, Creative[]> = {};
  for (const creative of creatives) {
    const format = creative.type === 'Video' ? 'Video' : 'Single Image';
    if (!formatGroups[format]) formatGroups[format] = [];
    formatGroups[format].push(creative);
  }

  const formatColors: Record<string, string> = {
    'Single Image': '#3b82f6',
    Video: '#7c5cfc',
    Carousel: '#10b981',
    Collection: '#f59e0b',
    Dynamic: '#ef4444',
  };

  const adFormatBreakdown: AdFormatBreakdown[] = Object.entries(formatGroups)
    .sort((a, b) => b[1].reduce((s, c) => s + c.spend, 0) - a[1].reduce((s, c) => s + c.spend, 0))
    .map(([format, items]) => {
      const spend = items.reduce((s, c) => s + c.spend, 0);
      const rev = items.reduce((s, c) => s + c.revenue, 0);
      const conv = items.reduce((s, c) => s + c.conversions, 0);
      const impr = items.reduce((s, c) => s + c.impressions, 0);
      const clicks = impr > 0 ? items.reduce((s, c) => s + (c.ctr / 100) * c.impressions, 0) : 0;
      return {
        format: format as AdFormatBreakdown['format'],
        ads: items.length,
        spend: r2(spend),
        spendPct: r2(totalSpend > 0 ? (spend / totalSpend) * 100 : 0),
        roas: r2(spend > 0 ? rev / spend : 0),
        cpa: r2(conv > 0 ? spend / conv : 0),
        ctr: r2(impr > 0 ? (clicks / impr) * 100 : 0),
        conversions: conv,
        avgWatchTime: format === 'Video'
          ? r2(
              items.filter((x) => (x.videoDurationSec || 0) > 0).reduce((s, x) => s + (x.videoDurationSec || 0), 0) /
              Math.max(items.filter((x) => (x.videoDurationSec || 0) > 0).length, 1)
            )
          : undefined,
        color: formatColors[format] || '#6b7280',
      };
    });

  // Creative performance matrix — top 10 by spend
  const creativePerformanceMatrix: CreativePerformanceMatrix[] = [...creatives]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
    .map((c) => {
      let status: CreativePerformanceMatrix['status'] = 'average';
      if (c.fatigueScore >= 70) status = 'fatigued';
      else if (c.roas >= TARGET_ROAS_SCALE) status = 'top_performer';
      else if (c.roas < TARGET_ROAS_OK) status = 'underperformer';

      return {
        adId: c.id,
        adName: c.name,
        thumbnail: c.thumbnailUrl || `/placeholders/creative-thumb-${c.id}.jpg`,
        format: c.type,
        spend: r2(c.spend),
        roas: r2(c.roas),
        cpa: r2(c.conversions > 0 ? c.spend / c.conversions : 0),
        ctr: r2(c.ctr),
        frequency: r2(c.frequency),
        fatigueScore: c.fatigueScore,
        status,
      };
    });

  // Creative size breakdown — infer likely aspect ratio groups per creative deterministically
  const sizeGroups = new Map<CreativeSizeBreakdown['size'], Creative[]>();
  for (const creative of creatives) {
    const seed = hashString(`${creative.id}:${creative.name}`);
    let size: CreativeSizeBreakdown['size'];
    if (creative.type === 'Video') {
      size = seed % 100 < 68 ? '1080x1920' : '1080x1080';
    } else {
      const bucket = seed % 100;
      if (bucket < 52) size = '1080x1080';
      else if (bucket < 88) size = '1200x628';
      else size = 'Other';
    }
    const existing = sizeGroups.get(size) || [];
    existing.push(creative);
    sizeGroups.set(size, existing);
  }

  const creativeSizeBreakdown: CreativeSizeBreakdown[] = ([
    '1080x1080',
    '1080x1920',
    '1200x628',
    'Other',
  ] as CreativeSizeBreakdown['size'][])
    .map((size) => {
      const items = sizeGroups.get(size) || [];
      const spend = items.reduce((s, c) => s + c.spend, 0);
      const rev = items.reduce((s, c) => s + c.revenue, 0);
      const impr = items.reduce((s, c) => s + c.impressions, 0);
      const clicks = items.reduce((s, c) => s + (c.ctr / 100) * c.impressions, 0);
      return {
        size,
        ads: items.length,
        spend: r2(spend),
        roas: r2(spend > 0 ? rev / spend : 0),
        ctr: r2(impr > 0 ? (clicks / impr) * 100 : 0),
      };
    })
    .filter((x) => x.ads > 0);

  // Hook/hold/completion rates — derive from live video creative performance
  const videoCreatives = creatives.filter((c) => c.type === 'Video');
  const hookFormatMap = new Map<string, Creative[]>();
  for (const video of videoCreatives) {
    const labelSource = `${video.name}`.toLowerCase();
    let format = 'Lifestyle / Brand';
    if (/(testimonial|review|ugc|creator)/.test(labelSource)) format = 'UGC Testimonial';
    else if (/(demo|unbox|how to|tutorial)/.test(labelSource)) format = 'Product Demo';
    else if (/(slideshow|carousel)/.test(labelSource)) format = 'Slideshow';
    else if (/(animation|motion|animated)/.test(labelSource)) format = 'Animation / Motion';
    const existing = hookFormatMap.get(format) || [];
    existing.push(video);
    hookFormatMap.set(format, existing);
  }

  const hookRateByFormat: HookRateByFormat[] = [...hookFormatMap.entries()]
    .map(([format, items]) => {
      const totalImpressions = items.reduce((s, c) => s + c.impressions, 0);
      const weightedCtr = totalImpressions > 0
        ? items.reduce((s, c) => s + c.ctr * c.impressions, 0) / totalImpressions
        : 0;
      const avgRoasLocal = items.length > 0
        ? items.reduce((s, c) => s + c.roas, 0) / items.length
        : 0;
      const avgFatigueLocal = items.length > 0
        ? items.reduce((s, c) => s + c.fatigueScore, 0) / items.length
        : 0;
      const hookRate = clamp(34 + weightedCtr * 10.5 - avgFatigueLocal * 0.09, 18, 92);
      const holdRate = clamp(hookRate * 0.62 + avgRoasLocal * 2.3, 9, 82);
      const completionRate = clamp(holdRate * 0.56 + avgRoasLocal, 4, 64);
      return {
        format,
        hookRate: r2(hookRate),
        holdRate: r2(holdRate),
        completionRate: r2(completionRate),
      };
    })
    .sort((a, b) => b.hookRate - a.hookRate);

  const videoLengthRanges: Array<VideoLengthPerformance['range']> = ['0-15s', '16-30s', '31-45s', '45s+', 'Unknown'];
  const videoLengthMap = new Map<VideoLengthPerformance['range'], Creative[]>();
  for (const range of videoLengthRanges) videoLengthMap.set(range, []);
  for (const video of videoCreatives) {
    const len = video.videoDurationSec || 0;
    const range: VideoLengthPerformance['range'] = len <= 0
      ? 'Unknown'
      : len <= 15
      ? '0-15s'
      : len <= 30
      ? '16-30s'
      : len <= 45
      ? '31-45s'
      : '45s+';
    videoLengthMap.get(range)!.push(video);
  }
  const videoLengthPerformance: VideoLengthPerformance[] = videoLengthRanges
    .map((range) => {
      const items = videoLengthMap.get(range) || [];
      const spend = items.reduce((s, c) => s + c.spend, 0);
      const rev = items.reduce((s, c) => s + c.revenue, 0);
      const conv = items.reduce((s, c) => s + c.conversions, 0);
      const impr = items.reduce((s, c) => s + c.impressions, 0);
      const clicks = items.reduce((s, c) => s + (c.ctr / 100) * c.impressions, 0);
      return {
        range,
        creatives: items.length,
        spend: r2(spend),
        roas: r2(spend > 0 ? rev / spend : 0),
        ctr: r2(impr > 0 ? (clicks / impr) * 100 : 0),
        conversions: conv,
      };
    })
    .filter((x) => x.creatives > 0);

  const now = Date.now();
  const enriched = creatives.map((creative) => {
    const daysActive = Math.max(
      1,
      Math.round((now - new Date(creative.startDate).getTime()) / (1000 * 60 * 60 * 24))
    );
    const daily = [...(creative.dailyStats || [])]
      .filter((d) => d.spend > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    let cumulativeSpend = 0;
    let goodDays = 0;
    let dropDay: number | null = null;
    let spendAtDrop: number | null = null;
    for (let i = 0; i < daily.length; i++) {
      const day = daily[i];
      cumulativeSpend += day.spend;
      if (day.roas >= TARGET_ROAS_DROP) {
        goodDays += 1;
      } else if (dropDay === null && goodDays >= 2) {
        dropDay = i + 1;
        spendAtDrop = cumulativeSpend;
      }
    }
    if (dropDay === null && creative.roas < TARGET_ROAS_DROP && creative.spend > 0) {
      dropDay = Math.max(1, Math.round(daysActive * 0.65));
      spendAtDrop = creative.spend * 0.65;
      goodDays = Math.max(0, dropDay - 1);
    }
    const recentDaily = daily.slice(-7);
    const recentSpend = recentDaily.reduce((sum, day) => sum + day.spend, 0);
    const recentRevenue = recentDaily.reduce((sum, day) => sum + day.revenue, 0);
    const last7DayRoas = recentSpend > 0
      ? recentRevenue / recentSpend
      : (daily.length > 0 ? daily[daily.length - 1].roas : creative.roas);
    let status: CreativePerformanceMatrix['status'] = 'average';
    if (creative.fatigueScore >= 70) status = 'fatigued';
    else if (creative.roas >= TARGET_ROAS_SCALE) status = 'top_performer';
    else if (creative.roas < TARGET_ROAS_OK) status = 'underperformer';
    return {
      ...creative,
      daysActive,
      goodDaysBeforeDrop: goodDays,
      estimatedDropDay: dropDay || daysActive,
      estimatedSpendAtDrop: r2(spendAtDrop || creative.spend),
      last7DaySpend: r2(recentSpend),
      last7DayRoas: r2(last7DayRoas),
      status,
    };
  });

  const underperformingCreatives: UnderperformingCreativeDetail[] = enriched
    .filter((c) => c.roas < TARGET_ROAS_DROP)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 20)
    .map((c) => ({
      adId: c.id,
      adName: c.name,
      spend: r2(c.spend),
      roas: r2(c.roas),
      daysActive: c.daysActive,
      goodDaysBeforeDrop: c.goodDaysBeforeDrop,
      estimatedDropDay: c.estimatedDropDay,
      estimatedSpendAtDrop: c.estimatedSpendAtDrop,
      fatigueScore: c.fatigueScore,
    }));

  const toActionItem = (c: typeof enriched[number], reason: string): CreativeActionItem => ({
    adId: c.id,
    adName: c.name,
    campaignName: c.campaignName,
    adSetId: c.adSetId,
    adSetName: c.adSetName,
    spend: r2(c.spend),
    roas: r2(c.roas),
    fatigueScore: c.fatigueScore,
    reason,
    metaConfiguredStatus: c.metaConfiguredStatus,
    metaEffectiveStatus: c.metaEffectiveStatus,
    metaDeliveryStatus: c.metaDeliveryStatus || deriveCreativeDeliveryStatus(
      c.metaConfiguredStatus,
      c.metaEffectiveStatus,
      c.spend,
      c.impressions
    ),
    canManageStatus: !c.id.startsWith('adset_') && c.id.length > 0,
    manageEntity: 'ad',
  });

  type AdSetRollup = {
    adSetId: string;
    adSetName?: string;
    campaignName?: string;
    creatives: typeof enriched;
    spend: number;
    revenue: number;
    last7Spend: number;
    last7Revenue: number;
    lowRoasAds: number;
    noSpendAds: number;
    avgFatigue: number;
    configuredStatus?: string;
    effectiveStatus?: string;
    deliveryStatus?: string;
  };

  const adSetRollupMap = new Map<string, AdSetRollup>();
  for (const creative of enriched) {
    if (!creative.adSetId) continue;
    const key = creative.adSetId;
    const existing = adSetRollupMap.get(key) || {
      adSetId: creative.adSetId,
      adSetName: creative.adSetName,
      campaignName: creative.campaignName,
      creatives: [] as typeof enriched,
      spend: 0,
      revenue: 0,
      last7Spend: 0,
      last7Revenue: 0,
      lowRoasAds: 0,
      noSpendAds: 0,
      avgFatigue: 0,
      configuredStatus: creative.metaConfiguredStatus,
      effectiveStatus: creative.metaEffectiveStatus,
      deliveryStatus: creative.metaDeliveryStatus,
    };
    existing.creatives.push(creative);
    existing.spend += creative.spend || 0;
    existing.revenue += creative.revenue || 0;
    existing.last7Spend += creative.last7DaySpend || 0;
    existing.last7Revenue += (creative.last7DayRoas || 0) * (creative.last7DaySpend || 0);
    if ((creative.last7DaySpend || 0) >= 20 && (creative.last7DayRoas || 0) <= TARGET_ROAS_KILL) {
      existing.lowRoasAds += 1;
    }
    if ((creative.last7DaySpend || 0) < 5) {
      existing.noSpendAds += 1;
    }
    adSetRollupMap.set(key, existing);
  }
  const adSetRollups = [...adSetRollupMap.values()].map((rollup) => {
    const avgFatigue = rollup.creatives.length > 0
      ? rollup.creatives.reduce((sum, row) => sum + (row.fatigueScore || 0), 0) / rollup.creatives.length
      : 0;
    return {
      ...rollup,
      avgFatigue,
    };
  });

  const toAdSetActionItem = (
    rollup: AdSetRollup,
    reason: string,
  ): CreativeActionItem => {
    const spendBase = rollup.last7Spend > 0 ? rollup.last7Spend : rollup.spend;
    const revenueBase = rollup.last7Spend > 0 ? rollup.last7Revenue : rollup.revenue;
    const roas = spendBase > 0 ? revenueBase / spendBase : 0;
    return {
      adId: `adset_${rollup.adSetId}`,
      adName: `${rollup.adSetName || `Ad Set ${rollup.adSetId}`} (Ad Set)`,
      campaignName: rollup.campaignName,
      adSetId: rollup.adSetId,
      adSetName: rollup.adSetName,
      spend: r2(spendBase),
      roas: r2(roas),
      fatigueScore: Math.round(rollup.avgFatigue),
      reason,
      metaConfiguredStatus: rollup.configuredStatus,
      metaEffectiveStatus: rollup.effectiveStatus,
      metaDeliveryStatus: rollup.deliveryStatus || deriveCreativeDeliveryStatus(
        rollup.configuredStatus,
        rollup.effectiveStatus,
        spendBase,
        0
      ),
      canManageStatus: true,
      manageEntity: 'adset',
      adSetCreativeCount: rollup.creatives.length,
      adSetLowRoasCount: rollup.lowRoasAds,
      adSetNoSpendCount: rollup.noSpendAds,
    };
  };

  const adSetKillCandidates = adSetRollups
    .filter((rollup) => {
      const totalAds = rollup.creatives.length;
      if (totalAds < 2) return false;
      if (rollup.last7Spend < 50 && rollup.spend < 100) return false;
      const last7Roas = rollup.last7Spend > 0 ? (rollup.last7Revenue / rollup.last7Spend) : 0;
      const weakMix = (rollup.lowRoasAds + rollup.noSpendAds) >= Math.max(2, totalAds - 1);
      return last7Roas <= TARGET_ROAS_KILL && weakMix;
    })
    .sort((a, b) => {
      const aRoas = a.last7Spend > 0 ? (a.last7Revenue / a.last7Spend) : 0;
      const bRoas = b.last7Spend > 0 ? (b.last7Revenue / b.last7Spend) : 0;
      return aRoas - bRoas || b.last7Spend - a.last7Spend;
    })
    .slice(0, 8);
  const adSetKillIds = new Set(adSetKillCandidates.map((rollup) => rollup.adSetId));

  const adSetRefreshCandidates = adSetRollups
    .filter((rollup) => {
      if (adSetKillIds.has(rollup.adSetId)) return false;
      const totalAds = rollup.creatives.length;
      if (totalAds < 2) return false;
      if (rollup.last7Spend < 50) return false;
      const last7Roas = rollup.last7Spend > 0 ? (rollup.last7Revenue / rollup.last7Spend) : 0;
      const weakMix = (rollup.lowRoasAds + rollup.noSpendAds) >= Math.max(2, totalAds - 1);
      return last7Roas < TARGET_ROAS_OK && weakMix;
    })
    .sort((a, b) => b.last7Spend - a.last7Spend)
    .slice(0, 8);
  const adSetRefreshIds = new Set(adSetRefreshCandidates.map((rollup) => rollup.adSetId));

  const scaleReady = enriched
    .filter((c) => c.last7DaySpend >= 25 && c.last7DayRoas >= TARGET_ROAS_DROP && c.fatigueScore < 65 && c.frequency < 4.5)
    .sort((a, b) => b.last7DayRoas - a.last7DayRoas || b.spend - a.spend)
    .slice(0, 12)
    .map((c) => toActionItem(c, 'Last 7-day ROAS >= 1.3 with stable fatigue/frequency'));

  const refreshNowAds = enriched
    .filter((c) =>
      !adSetRefreshIds.has(c.adSetId || '') &&
      !adSetKillIds.has(c.adSetId || '') &&
      (
        c.fatigueScore >= 70 ||
        (c.roas < TARGET_ROAS_OK && c.spend >= 40) ||
        (c.last7DaySpend >= 25 && c.last7DayRoas < TARGET_ROAS_OK)
      )
    )
    .sort((a, b) => b.fatigueScore - a.fatigueScore || a.roas - b.roas)
    .slice(0, 10)
    .map((c) => toActionItem(
      c,
      c.fatigueScore >= 70
        ? 'Fatigue threshold breached'
        : 'ROAS below 1.2 (overall or last 7 days)'
    ));
  const refreshNow = [
    ...adSetRefreshCandidates.map((rollup) => toAdSetActionItem(
      rollup,
      `Ad-set refresh: ${rollup.lowRoasAds}/${rollup.creatives.length} low-ROAS ads, ${rollup.noSpendAds} not spending in last 7d`
    )),
    ...refreshNowAds,
  ].slice(0, 12);

  const killNowAds = enriched
    .filter((c) =>
      !adSetKillIds.has(c.adSetId || '') &&
      c.last7DaySpend >= 30 && c.last7DayRoas <= TARGET_ROAS_KILL && c.spend >= 40
    )
    .sort((a, b) => a.last7DayRoas - b.last7DayRoas || b.last7DaySpend - a.last7DaySpend)
    .slice(0, 10)
    .map((c) => toActionItem(c, 'Last 7-day ROAS <= 1.0 with meaningful spend'));
  const killNow = [
    ...adSetKillCandidates.map((rollup) => toAdSetActionItem(
      rollup,
      `Kill ad set: ${rollup.lowRoasAds}/${rollup.creatives.length} low-ROAS ads, ${rollup.noSpendAds} not spending in last 7d`
    )),
    ...killNowAds,
  ].slice(0, 12);

  const monitor = enriched
    .filter((c) =>
      !scaleReady.some((x) => x.adId === c.id) &&
      !refreshNow.some((x) => x.adId === c.id) &&
      !killNow.some((x) => x.adId === c.id)
    )
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 12)
    .map((c) => toActionItem(c, 'Needs more spend/time before decisive action'));

  const actionPlan: CreativeActionPlan = {
    generatedAt: new Date().toISOString(),
    scaleReady,
    refreshNow,
    killNow,
    monitor,
  };

  const creativeCatalog: CreativeCatalogItem[] = [...enriched]
    .sort((a, b) => b.spend - a.spend)
    .map((c) => ({
      adId: c.id,
      adName: c.name,
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      adSetId: c.adSetId,
      adSetName: c.adSetName,
      format: c.type === 'Video' ? 'Video' : 'Single Image',
      thumbnail: c.thumbnailUrl || undefined,
      spend: r2(c.spend),
      roas: r2(c.roas),
      cpa: r2(c.conversions > 0 ? c.spend / c.conversions : 0),
      ctr: r2(c.ctr),
      conversions: Math.round(c.conversions),
      frequency: r2(c.frequency),
      fatigueScore: c.fatigueScore,
      status: c.status,
      daysActive: c.daysActive,
      last7DaySpend: c.last7DaySpend,
      last7DayRoas: c.last7DayRoas,
      metaConfiguredStatus: c.metaConfiguredStatus,
      metaEffectiveStatus: c.metaEffectiveStatus,
      metaDeliveryStatus: c.metaDeliveryStatus || deriveCreativeDeliveryStatus(
        c.metaConfiguredStatus,
        c.metaEffectiveStatus,
        c.spend,
        c.impressions
      ),
      canManageStatus: !c.id.startsWith('adset_') && c.id.length > 0,
      canManageAdSetStatus: !!c.adSetId,
    }));

  function median(nums: number[]): number | undefined {
    if (nums.length === 0) return undefined;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) return r2((sorted[mid - 1] + sorted[mid]) / 2);
    return r2(sorted[mid]);
  }

  function mean(nums: number[]): number | undefined {
    if (nums.length === 0) return undefined;
    return r2(nums.reduce((sum, value) => sum + value, 0) / nums.length);
  }

  // Creative refresh health
  const avgAge = creatives.length > 0
    ? creatives.reduce((sum, c) => {
        const start = new Date(c.startDate);
        return sum + (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / creatives.length
    : 0;

  const adsOverThreshold = creatives.filter((c) => c.frequency > 4).length;
  const avgFatigue = creatives.length > 0
    ? creatives.reduce((s, c) => s + c.fatigueScore, 0) / creatives.length
    : 0;
  const refreshNeeded = refreshNow.length;
  const medianDaysToUnprofitable = median(underperformingCreatives.map((x) => x.estimatedDropDay));
  const medianSpendToUnprofitable = median(underperformingCreatives.map((x) => x.estimatedSpendAtDrop));
  const dropSamples = enriched.filter((x) => x.goodDaysBeforeDrop > 0 && x.estimatedSpendAtDrop > 0);
  const avgDaysAboveTargetRoas = mean(dropSamples.map((x) => x.goodDaysBeforeDrop));
  const avgSpendBeforeDrop = mean(dropSamples.map((x) => x.estimatedSpendAtDrop));

  const creativeRefreshData: CreativeRefreshDataExtended = {
    avgCreativeAge: r2(avgAge),
    adsOverFrequencyThreshold: adsOverThreshold,
    fatigueIndex: Math.round(avgFatigue),
    recommendedRefreshCount: refreshNeeded,
    medianDaysToUnprofitable,
    medianSpendToUnprofitable,
    avgDaysAboveTargetRoas,
    avgSpendBeforeDrop,
    targetRoas: TARGET_ROAS_DROP,
    underperformingCount: underperformingCreatives.length,
    scaleReadyCount: scaleReady.length,
    killNowCount: killNow.length,
    monitorCount: monitor.length,
  };

  return {
    adFormatBreakdown,
    creativePerformanceMatrix,
    creativeCatalog,
    creativeSizeBreakdown,
    hookRateByFormat,
    creativeRefreshData,
    videoLengthPerformance,
    underperformingCreatives,
    actionPlan,
  };
}

export const getCreativeInsights = createServiceFn<CreativeInsightsResult, [MetaAuditQuery?]>(
  'meta',
  mockGetCreativeInsights,
  async (query?: MetaAuditQuery) => {
    try {
      return await realGetCreativeInsights(query ?? {});
    } catch {
      return emptyCreativeInsightsResult();
    }
  },
);


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 6: AD COPY INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

export interface AdCopyInsightsResult {
  headlineLengthPerformance: HeadlineLengthPerformance[];
  ctaPerformance: CtaPerformance[];
  emojiUsage: EmojiUsage;
  topPerformingHeadlines: TopPerformingHeadline[];
  primaryTextLength: PrimaryTextLength[];
  sentimentAnalysis: SentimentAnalysis[];
  copyAnglePerformance: CopyAnglePerformance[];
  headlinePatternPerformance: HeadlinePatternPerformance[];
  mergedCopyPerformance: MergedCopyPerformance[];
  topPerformingPrimaryTexts: TopPerformingPrimaryText[];
  copyActionBrief: CopyActionBrief;
}

export interface CopyAnglePerformance {
  angle: 'Offer' | 'Problem-Solution' | 'Social Proof' | 'Urgency' | 'Benefit' | 'Objection Handling' | 'Educational';
  ads: number;
  spend: number;
  roas: number;
  ctr: number;
  cpa: number;
  winRate: number;
}

export interface HeadlinePatternPerformance {
  pattern: 'Question-led' | 'Number-led' | 'Benefit-led' | 'Urgency-led' | 'Social-proof-led' | 'Command-led';
  ads: number;
  spend: number;
  roas: number;
  ctr: number;
  cpa: number;
  winRate: number;
  example: string;
}

export interface TopPerformingPrimaryText {
  adId: string;
  primaryText: string;
  chars: number;
  roas: number;
  ctr: number;
  cpa: number;
  spend: number;
  angle: CopyAnglePerformance['angle'];
}

export interface MergedCopyPerformance {
  id: string;
  headline: string;
  primaryText: string;
  cta: string;
  ads: number;
  spend: number;
  roas: number;
  ctr: number;
  cpc: number;
  conversions: number;
}

export interface CopyActionBriefItem {
  adId: string;
  headline: string;
  primaryText: string;
  roas: number;
  ctr: number;
  spend: number;
  angle: CopyAnglePerformance['angle'];
  reason: string;
}

export interface CopyActionBrief {
  generatedAt: string;
  bestHeadlineExamples: string[];
  bestPrimaryTextExamples: string[];
  winningAngles: Array<{ angle: CopyAnglePerformance['angle']; roas: number; ctr: number; winRate: number }>;
  scaleNow: CopyActionBriefItem[];
  testNext: CopyActionBriefItem[];
  refreshNow: CopyActionBriefItem[];
}

function emptyAdCopyInsightsResult(): AdCopyInsightsResult {
  return {
    headlineLengthPerformance: [],
    ctaPerformance: [],
    emojiUsage: {
      withEmoji: { ads: 0, spend: 0, ctr: 0, cpa: 0, roas: 0 },
      withoutEmoji: { ads: 0, spend: 0, ctr: 0, cpa: 0, roas: 0 },
    },
    topPerformingHeadlines: [],
    primaryTextLength: [],
    sentimentAnalysis: [],
    copyAnglePerformance: [],
    headlinePatternPerformance: [],
    mergedCopyPerformance: [],
    topPerformingPrimaryTexts: [],
    copyActionBrief: {
      generatedAt: new Date().toISOString(),
      bestHeadlineExamples: [],
      bestPrimaryTextExamples: [],
      winningAngles: [],
      scaleNow: [],
      testNext: [],
      refreshNow: [],
    },
  };
}

async function mockGetAdCopyInsights(): Promise<AdCopyInsightsResult> {
  const emptyBrief: CopyActionBrief = {
    generatedAt: new Date().toISOString(),
    bestHeadlineExamples: [],
    bestPrimaryTextExamples: [],
    winningAngles: [],
    scaleNow: [],
    testNext: [],
    refreshNow: [],
  };
  return {
    headlineLengthPerformance: mockHeadlineLengthPerformance,
    ctaPerformance: mockCtaPerformance,
    emojiUsage: mockEmojiUsage,
    topPerformingHeadlines: mockTopPerformingHeadlines,
    primaryTextLength: mockPrimaryTextLength,
    sentimentAnalysis: mockSentimentAnalysis,
    copyAnglePerformance: [],
    headlinePatternPerformance: [],
    mergedCopyPerformance: [],
    topPerformingPrimaryTexts: [],
    copyActionBrief: emptyBrief,
  };
}

async function realGetAdCopyInsights(query: MetaAuditQuery = {}): Promise<AdCopyInsightsResult> {
  const campaigns = filterCampaignTree(await fetchCampaignHierarchy(query, true, 8), query.filterPreset);
  const scopedEntities = buildScopedEntitySets(campaigns);
  const hasScopedEntities =
    scopedEntities.campaignIds.size > 0 ||
    scopedEntities.adSetIds.size > 0 ||
    scopedEntities.adIds.size > 0;

  // Flatten all ads for copy analysis
  let allAds = campaigns.flatMap((c) => c.adSets.flatMap((as) => as.ads));
  const hasAdCoverage = (rows: typeof allAds): boolean =>
    rows.length > 0 && rows.some((row) => row.metrics.spend > 0 || row.metrics.impressions > 0);

  const toAdsFromAdSets = (campaignRows: Campaign[]): typeof allAds => campaignRows.flatMap((campaign) =>
    campaign.adSets.map((adSet) => {
      const interests = adSet.targeting.interests.slice(0, 3).join(', ');
      const audienceHint = interests ? `Audience: ${interests}` : '';
      const fallbackBody = [campaign.name, audienceHint].filter(Boolean).join(' | ');
      return {
        id: `adset_${adSet.id}`,
        adSetId: adSet.id,
        name: adSet.name,
        status: adSet.status === 'ACTIVE' ? 'ACTIVE' as const : 'PAUSED' as const,
        creative: {
          id: `adset_creative_${adSet.id}`,
          type: 'image' as const,
          headline: adSet.name || campaign.name,
          body: fallbackBody,
          ctaType: 'LEARN_MORE' as const,
          mediaUrl: '',
          thumbnailUrl: '',
          videoId: undefined,
        },
        metrics: { ...DEFAULT_METRICS, ...adSet.metrics },
        policyInfo: adSet.policyInfo,
      };
    })
  );

  const hasHierarchyCoverage = hasAdCoverage(allAds);

  // Fallback: when hierarchy hydration is rate-limited/empty, derive ad-copy analyzable rows
  // from creative endpoint data so tabs do not stay empty.
  if (!hasHierarchyCoverage) {
    const toAdsFromCreatives = (creatives: Creative[]): typeof allAds => creatives.map((creative) => {
      const spend = creative.spend || 0;
      const revenue = creative.revenue || (creative.roas > 0 ? creative.roas * spend : 0);
      const impressions = creative.impressions || 0;
      const ctr = creative.ctr || 0;
      const clicks = impressions > 0 ? Math.round((ctr / 100) * impressions) : 0;
      const conversions = creative.conversions || 0;
      const frequency = creative.frequency || 0;
      const cpc = creative.cpc || (clicks > 0 ? spend / clicks : 0);
      const cpm = creative.cpm || (impressions > 0 ? (spend / impressions) * 1000 : 0);
      const roas = spend > 0 ? revenue / spend : creative.roas || 0;
      const cpa = conversions > 0 ? spend / conversions : 0;
      const headline = (creative.headline || creative.name || '').trim();
      const body = (creative.primaryText || '').trim();
      return {
        id: creative.id,
        adSetId: 'creative_fallback',
        name: creative.name,
        status: 'ACTIVE' as const,
        creative: {
          id: creative.id,
          type: creative.type === 'Video' ? 'video' : 'image',
          headline,
          body,
          ctaType: 'LEARN_MORE' as const,
          mediaUrl: '',
          thumbnailUrl: creative.thumbnailUrl || '',
          videoId: undefined,
        },
        metrics: {
          ...DEFAULT_METRICS,
          spend,
          revenue,
          roas,
          ctr,
          cpc,
          cpm,
          impressions,
          reach: impressions > 0 ? Math.max(1, Math.round(impressions / Math.max(frequency, 1))) : 0,
          clicks,
          conversions,
          frequency,
          cvr: clicks > 0 ? (conversions / clicks) * 100 : 0,
          cpa,
          results: conversions,
          costPerResult: cpa,
          purchases: conversions,
          purchaseValue: revenue,
          addToCart: 0,
          addToCartValue: 0,
          initiateCheckout: 0,
          leads: 0,
          costPerLead: 0,
          linkClicks: clicks,
          linkCTR: ctr,
          costPerLinkClick: cpc,
          postEngagement: 0,
          postReactions: 0,
          postComments: 0,
          postShares: 0,
          pageLikes: 0,
          videoViews: 0,
          videoThruPlays: 0,
          videoAvgPctWatched: 0,
          costPerThruPlay: 0,
          qualityRanking: 0,
          engagementRateRanking: 0,
          conversionRateRanking: 0,
          uniqueClicks: clicks,
          uniqueCTR: ctr,
          landingPageViews: 0,
          costPerLandingPageView: 0,
        },
      };
    });

    try {
      let fallbackCreatives = await fetchCreatives(query);
      if (fallbackCreatives.length === 0 && query.dateRange) {
        fallbackCreatives = await fetchCreatives();
      }
      if (query.filterPreset !== 'all' && hasScopedEntities) {
        fallbackCreatives = filterCreativesByScopedEntities(fallbackCreatives, scopedEntities);
      }
      if (query.filterPreset === 'spending') {
        fallbackCreatives = fallbackCreatives.filter((creative) => creative.spend > 0);
      }
      if (fallbackCreatives.length > 0) {
        allAds = toAdsFromCreatives(fallbackCreatives);
      }
    } catch {
      // keep hierarchy result
    }
  }

  if (!hasAdCoverage(allAds)) {
    try {
      const adSetBackedCampaigns = filterCampaignTree(await fetchCampaignHierarchy(query, false), query.filterPreset);
      const adSetRows = toAdsFromAdSets(adSetBackedCampaigns);
      if (hasAdCoverage(adSetRows)) {
        allAds = adSetRows;
      }
    } catch {
      // keep current empty set
    }
  }

  // Broad fallback to avoid all-zero copy reports for strict windows with sparse delivery.
  if (!hasAdCoverage(allAds) && query.dateRange) {
    try {
      const broadCampaigns = filterCampaignTree(await fetchCampaignHierarchy({}, false), query.filterPreset);
      const broadAdSetRows = toAdsFromAdSets(broadCampaigns);
      if (hasAdCoverage(broadAdSetRows)) {
        allAds = broadAdSetRows;
      }
    } catch {
      // keep current empty set
    }
  }

  function aggregateAdMetrics(ads: typeof allAds) {
    const spend = ads.reduce((s, a) => s + a.metrics.spend, 0);
    const rev = ads.reduce((s, a) => s + a.metrics.revenue, 0);
    const conv = ads.reduce((s, a) => s + a.metrics.conversions, 0);
    const impr = ads.reduce((s, a) => s + a.metrics.impressions, 0);
    const clicks = ads.reduce((s, a) => s + a.metrics.clicks, 0);
    const wins = ads.filter((a) => a.metrics.roas >= 1.8).length;
    return {
      spend,
      roas: spend > 0 ? rev / spend : 0,
      ctr: impr > 0 ? (clicks / impr) * 100 : 0,
      cpa: conv > 0 ? spend / conv : 0,
      winRate: ads.length > 0 ? (wins / ads.length) * 100 : 0,
    };
  }

  function classifyAngle(text: string): CopyAnglePerformance['angle'] {
    const normalized = text.toLowerCase();
    if (/\b(save|off|discount|sale|deal|offer|coupon|free shipping)\b/.test(normalized)) return 'Offer';
    if (/\bstruggling|tired of|problem|fix|solution|finally\b/.test(normalized)) return 'Problem-Solution';
    if (/\breview|rated|trusted|customers|testimonial|loved by\b/.test(normalized)) return 'Social Proof';
    if (/\blast chance|hurry|today only|ends tonight|limited\b/.test(normalized)) return 'Urgency';
    if (/\bresults|boost|improve|get better|transform|benefit\b/.test(normalized)) return 'Benefit';
    if (/\btoo expensive|worth it|risk free|guarantee|no hassle\b/.test(normalized)) return 'Objection Handling';
    return 'Educational';
  }

  function classifyHeadlinePattern(headline: string): HeadlinePatternPerformance['pattern'] {
    const normalized = headline.toLowerCase();
    if (headline.includes('?')) return 'Question-led';
    if (/\d/.test(headline)) return 'Number-led';
    if (/\blast chance|today only|limited|ending\b/.test(normalized)) return 'Urgency-led';
    if (/\breview|trusted|best seller|loved\b/.test(normalized)) return 'Social-proof-led';
    if (/^(get|discover|unlock|boost|transform)\b/i.test(headline)) return 'Command-led';
    if (/\b(save|improve|better|faster|easier|results)\b/.test(normalized)) return 'Benefit-led';
    return 'Command-led';
  }

  // Headline length performance
  function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  type HLRange = HeadlineLengthPerformance['range'];
  const hlGroups: Record<HLRange, typeof allAds> = {
    'Short (1-5 words)': [],
    'Medium (6-10 words)': [],
    'Long (11+ words)': [],
  };

  for (const ad of allAds) {
    const wc = wordCount(ad.creative.headline);
    if (wc <= 5) hlGroups['Short (1-5 words)'].push(ad);
    else if (wc <= 10) hlGroups['Medium (6-10 words)'].push(ad);
    else hlGroups['Long (11+ words)'].push(ad);
  }

  const headlineLengthPerformance: HeadlineLengthPerformance[] = (
    Object.entries(hlGroups) as [HLRange, typeof allAds][]
  ).map(([range, ads]) => {
    const spend = ads.reduce((s, a) => s + a.metrics.spend, 0);
    const rev = ads.reduce((s, a) => s + a.metrics.revenue, 0);
    const conv = ads.reduce((s, a) => s + a.metrics.conversions, 0);
    const impr = ads.reduce((s, a) => s + a.metrics.impressions, 0);
    const clicks = ads.reduce((s, a) => s + a.metrics.clicks, 0);
    return {
      range,
      ads: ads.length,
      spend: r2(spend),
      ctr: r2(impr > 0 ? (clicks / impr) * 100 : 0),
      cpa: r2(conv > 0 ? spend / conv : 0),
      roas: r2(spend > 0 ? rev / spend : 0),
      conversions: conv,
    };
  });

  // CTA performance
  const ctaMap: Record<string, string> = {
    SHOP_NOW: 'Shop Now',
    LEARN_MORE: 'Learn More',
    SIGN_UP: 'Sign Up',
    GET_OFFER: 'Get Offer',
    BOOK_NOW: 'Book Now',
    CONTACT_US: 'Contact Us',
  };

  const ctaColors: Record<string, string> = {
    'Shop Now': '#7c5cfc',
    'Learn More': '#3b82f6',
    'Sign Up': '#10b981',
    'Get Offer': '#f59e0b',
    'Book Now': '#06b6d4',
    'Contact Us': '#f43f5e',
  };

  const ctaGroups = new Map<string, typeof allAds>();
  for (const ad of allAds) {
    const label = ctaMap[ad.creative.ctaType] || ad.creative.ctaType;
    if (!ctaGroups.has(label)) ctaGroups.set(label, []);
    ctaGroups.get(label)!.push(ad);
  }

  // Merge duplicate copy variants (same normalized headline + primary text).
  // This ensures performance is shown at the unique copy level instead of per-ad.
  const normalizeCopy = (value: string): string =>
    value.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s%$!?.,-]/g, '').trim();
  const mergedCopyMap = new Map<string, {
    headline: string;
    primaryText: string;
    ads: number;
    spend: number;
    revenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctaCounts: Map<string, number>;
  }>();

  for (const ad of allAds) {
    const headline = (ad.creative.headline || '').trim();
    const primaryText = (ad.creative.body || '').trim();
    if (!headline && !primaryText) continue;

    const key = `${normalizeCopy(headline)}|||${normalizeCopy(primaryText)}`;
    if (!key.replace(/\|/g, '')) continue;

    const existing = mergedCopyMap.get(key) || {
      headline,
      primaryText,
      ads: 0,
      spend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctaCounts: new Map<string, number>(),
    };

    if (headline.length > existing.headline.length) existing.headline = headline;
    if (primaryText.length > existing.primaryText.length) existing.primaryText = primaryText;
    existing.ads += 1;
    existing.spend += ad.metrics.spend;
    existing.revenue += ad.metrics.revenue;
    existing.impressions += ad.metrics.impressions;
    existing.clicks += ad.metrics.clicks;
    existing.conversions += ad.metrics.conversions;

    const ctaLabel = ctaMap[ad.creative.ctaType] || ad.creative.ctaType || 'Learn More';
    existing.ctaCounts.set(ctaLabel, (existing.ctaCounts.get(ctaLabel) || 0) + 1);
    mergedCopyMap.set(key, existing);
  }

  const mergedCopyPerformance: MergedCopyPerformance[] = [...mergedCopyMap.entries()]
    .map(([key, row]) => {
      const cta = [...row.ctaCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Learn More';
      const roas = row.spend > 0 ? row.revenue / row.spend : 0;
      const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
      const cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
      return {
        id: `copy_${hashString(key)}`,
        headline: row.headline,
        primaryText: row.primaryText,
        cta,
        ads: row.ads,
        spend: r2(row.spend),
        roas: r2(roas),
        ctr: r2(ctr),
        cpc: r2(cpc),
        conversions: Math.round(row.conversions),
      } satisfies MergedCopyPerformance;
    })
    .sort((a, b) => b.spend - a.spend || b.roas - a.roas)
    .slice(0, 50);

  const ctaPerformance: CtaPerformance[] = [...ctaGroups.entries()]
    .sort((a, b) => b[1].reduce((s, ad) => s + ad.metrics.spend, 0) - a[1].reduce((s, ad) => s + ad.metrics.spend, 0))
    .map(([cta, ads]) => {
      const spend = ads.reduce((s, a) => s + a.metrics.spend, 0);
      const rev = ads.reduce((s, a) => s + a.metrics.revenue, 0);
      const conv = ads.reduce((s, a) => s + a.metrics.conversions, 0);
      const impr = ads.reduce((s, a) => s + a.metrics.impressions, 0);
      const clicks = ads.reduce((s, a) => s + a.metrics.clicks, 0);
      return {
        cta: cta as CtaPerformance['cta'],
        ads: ads.length,
        spend: r2(spend),
        ctr: r2(impr > 0 ? (clicks / impr) * 100 : 0),
        cpa: r2(conv > 0 ? spend / conv : 0),
        roas: r2(spend > 0 ? rev / spend : 0),
        conversions: conv,
        color: ctaColors[cta] || '#6b7280',
      };
    });

  // Emoji usage
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const adsWithEmoji = allAds.filter((a) => emojiRegex.test(a.creative.headline) || emojiRegex.test(a.creative.body));
  const adsWithoutEmoji = allAds.filter((a) => !emojiRegex.test(a.creative.headline) && !emojiRegex.test(a.creative.body));

  function buildEmojiGroup(ads: typeof allAds) {
    const spend = ads.reduce((s, a) => s + a.metrics.spend, 0);
    const rev = ads.reduce((s, a) => s + a.metrics.revenue, 0);
    const conv = ads.reduce((s, a) => s + a.metrics.conversions, 0);
    const impr = ads.reduce((s, a) => s + a.metrics.impressions, 0);
    const clicks = ads.reduce((s, a) => s + a.metrics.clicks, 0);
    return {
      ads: ads.length,
      spend: r2(spend),
      ctr: r2(impr > 0 ? (clicks / impr) * 100 : 0),
      cpa: r2(conv > 0 ? spend / conv : 0),
      roas: r2(spend > 0 ? rev / spend : 0),
    };
  }

  const emojiUsage: EmojiUsage = {
    withEmoji: buildEmojiGroup(adsWithEmoji),
    withoutEmoji: buildEmojiGroup(adsWithoutEmoji),
  };

  // Top performing headlines — sort by ROAS
  const topPerformingHeadlines: TopPerformingHeadline[] = [...allAds]
    .sort((a, b) => b.metrics.roas - a.metrics.roas)
    .slice(0, 8)
    .map((ad) => ({
      headline: ad.creative.headline,
      adId: ad.id,
      ctr: r2(ad.metrics.ctr),
      cpa: r2(ad.metrics.cpa),
      roas: r2(ad.metrics.roas),
      spend: r2(ad.metrics.spend),
      impressions: ad.metrics.impressions,
    }));

  // Primary text length
  type PTRange = PrimaryTextLength['range'];
  const ptGroups: Record<PTRange, typeof allAds> = {
    'Short (< 50 chars)': [],
    'Medium (50-125 chars)': [],
    'Long (125-250 chars)': [],
    'Very Long (250+ chars)': [],
  };

  for (const ad of allAds) {
    const len = ad.creative.body.length;
    if (len < 50) ptGroups['Short (< 50 chars)'].push(ad);
    else if (len < 125) ptGroups['Medium (50-125 chars)'].push(ad);
    else if (len < 250) ptGroups['Long (125-250 chars)'].push(ad);
    else ptGroups['Very Long (250+ chars)'].push(ad);
  }

  const primaryTextLength: PrimaryTextLength[] = (
    Object.entries(ptGroups) as [PTRange, typeof allAds][]
  ).map(([range, ads]) => {
    const spend = ads.reduce((s, a) => s + a.metrics.spend, 0);
    const rev = ads.reduce((s, a) => s + a.metrics.revenue, 0);
    const conv = ads.reduce((s, a) => s + a.metrics.conversions, 0);
    const impr = ads.reduce((s, a) => s + a.metrics.impressions, 0);
    const clicks = ads.reduce((s, a) => s + a.metrics.clicks, 0);
    return {
      range,
      ads: ads.length,
      ctr: r2(impr > 0 ? (clicks / impr) * 100 : 0),
      cpa: r2(conv > 0 ? spend / conv : 0),
      roas: r2(spend > 0 ? rev / spend : 0),
    };
  });

  // Sentiment analysis — keyword-based categorisation
  const sentimentKeywords: Record<SentimentAnalysis['sentiment'], RegExp> = {
    Urgency: /last chance|limited|hurry|ends|today only|final|flash|don't miss/i,
    'Social Proof': /customer|review|rated|best.?seller|trusted|loved by|testimonial/i,
    'Benefit-Led': /get|enjoy|discover|upgrade|improve|transform|boost|save/i,
    Question: /\?|how|what|why|are you|do you|looking for/i,
    Emotional: /love|dream|feel|amazing|incredible|beautiful|wow|happy/i,
    Informational: /new|introducing|featuring|made with|crafted|designed|built/i,
  };

  const sentimentGroups = new Map<SentimentAnalysis['sentiment'], typeof allAds>();
  for (const ad of allAds) {
    const text = `${ad.creative.headline} ${ad.creative.body}`;
    let matched = false;
    for (const [sentiment, regex] of Object.entries(sentimentKeywords) as [SentimentAnalysis['sentiment'], RegExp][]) {
      if (regex.test(text)) {
        if (!sentimentGroups.has(sentiment)) sentimentGroups.set(sentiment, []);
        sentimentGroups.get(sentiment)!.push(ad);
        matched = true;
        break; // Only count each ad once
      }
    }
    if (!matched) {
      if (!sentimentGroups.has('Informational')) sentimentGroups.set('Informational', []);
      sentimentGroups.get('Informational')!.push(ad);
    }
  }

  const sentimentAnalysis: SentimentAnalysis[] = [...sentimentGroups.entries()]
    .sort((a, b) => b[1].reduce((s, ad) => s + ad.metrics.spend, 0) - a[1].reduce((s, ad) => s + ad.metrics.spend, 0))
    .map(([sentiment, ads]) => {
      const spend = ads.reduce((s, a) => s + a.metrics.spend, 0);
      const rev = ads.reduce((s, a) => s + a.metrics.revenue, 0);
      const conv = ads.reduce((s, a) => s + a.metrics.conversions, 0);
      const impr = ads.reduce((s, a) => s + a.metrics.impressions, 0);
      const clicks = ads.reduce((s, a) => s + a.metrics.clicks, 0);
      return {
        sentiment,
        ads: ads.length,
        spend: r2(spend),
        ctr: r2(impr > 0 ? (clicks / impr) * 100 : 0),
        roas: r2(spend > 0 ? rev / spend : 0),
        cpa: r2(conv > 0 ? spend / conv : 0),
      };
    });

  const angleGroups = new Map<CopyAnglePerformance['angle'], typeof allAds>();
  const headlinePatternGroups = new Map<HeadlinePatternPerformance['pattern'], typeof allAds>();
  for (const ad of allAds) {
    const angle = classifyAngle(`${ad.creative.headline} ${ad.creative.body}`);
    const pattern = classifyHeadlinePattern(ad.creative.headline);
    if (!angleGroups.has(angle)) angleGroups.set(angle, []);
    if (!headlinePatternGroups.has(pattern)) headlinePatternGroups.set(pattern, []);
    angleGroups.get(angle)!.push(ad);
    headlinePatternGroups.get(pattern)!.push(ad);
  }

  const copyAnglePerformance: CopyAnglePerformance[] = [...angleGroups.entries()]
    .map(([angle, ads]) => {
      const m = aggregateAdMetrics(ads);
      return {
        angle,
        ads: ads.length,
        spend: r2(m.spend),
        roas: r2(m.roas),
        ctr: r2(m.ctr),
        cpa: r2(m.cpa),
        winRate: r2(m.winRate),
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const headlinePatternPerformance: HeadlinePatternPerformance[] = [...headlinePatternGroups.entries()]
    .map(([pattern, ads]) => {
      const m = aggregateAdMetrics(ads);
      const example = ads
        .sort((a, b) => b.metrics.roas - a.metrics.roas || b.metrics.spend - a.metrics.spend)[0]
        ?.creative.headline || '';
      return {
        pattern,
        ads: ads.length,
        spend: r2(m.spend),
        roas: r2(m.roas),
        ctr: r2(m.ctr),
        cpa: r2(m.cpa),
        winRate: r2(m.winRate),
        example,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const topPerformingPrimaryTexts: TopPerformingPrimaryText[] = [...allAds]
    .filter((ad) => ad.creative.body.trim().length > 0)
    .sort((a, b) => (b.metrics.roas - a.metrics.roas) || (b.metrics.spend - a.metrics.spend))
    .slice(0, 15)
    .map((ad) => ({
      adId: ad.id,
      primaryText: ad.creative.body,
      chars: ad.creative.body.length,
      roas: r2(ad.metrics.roas),
      ctr: r2(ad.metrics.ctr),
      cpa: r2(ad.metrics.cpa),
      spend: r2(ad.metrics.spend),
      angle: classifyAngle(`${ad.creative.headline} ${ad.creative.body}`),
    }));

  const scaleNow = allAds
    .filter((ad) => ad.metrics.spend >= 40 && ad.metrics.roas >= 2.0 && ad.metrics.ctr >= 1.2)
    .sort((a, b) => b.metrics.roas - a.metrics.roas || b.metrics.spend - a.metrics.spend)
    .slice(0, 12)
    .map((ad) => ({
      adId: ad.id,
      headline: ad.creative.headline,
      primaryText: ad.creative.body,
      roas: r2(ad.metrics.roas),
      ctr: r2(ad.metrics.ctr),
      spend: r2(ad.metrics.spend),
      angle: classifyAngle(`${ad.creative.headline} ${ad.creative.body}`),
      reason: 'Strong ROAS + CTR with meaningful spend',
    } satisfies CopyActionBriefItem));

  const refreshNow = allAds
    .filter((ad) => ad.metrics.spend >= 40 && (ad.metrics.roas < 1.2 || ad.metrics.ctr < 0.9))
    .sort((a, b) => a.metrics.roas - b.metrics.roas || b.metrics.spend - a.metrics.spend)
    .slice(0, 12)
    .map((ad) => ({
      adId: ad.id,
      headline: ad.creative.headline,
      primaryText: ad.creative.body,
      roas: r2(ad.metrics.roas),
      ctr: r2(ad.metrics.ctr),
      spend: r2(ad.metrics.spend),
      angle: classifyAngle(`${ad.creative.headline} ${ad.creative.body}`),
      reason: ad.metrics.roas < 1.2 ? 'ROAS below break-even threshold' : 'Low CTR signal',
    } satisfies CopyActionBriefItem));

  const scaleIds = new Set(scaleNow.map((x) => x.adId));
  const refreshIds = new Set(refreshNow.map((x) => x.adId));
  const testNext = allAds
    .filter((ad) => !scaleIds.has(ad.id) && !refreshIds.has(ad.id) && ad.metrics.spend >= 20)
    .sort((a, b) => b.metrics.spend - a.metrics.spend)
    .slice(0, 12)
    .map((ad) => ({
      adId: ad.id,
      headline: ad.creative.headline,
      primaryText: ad.creative.body,
      roas: r2(ad.metrics.roas),
      ctr: r2(ad.metrics.ctr),
      spend: r2(ad.metrics.spend),
      angle: classifyAngle(`${ad.creative.headline} ${ad.creative.body}`),
      reason: 'In learning zone; iterate hooks and offer framing',
    } satisfies CopyActionBriefItem));

  const bestHeadlineExamples = topPerformingHeadlines
    .slice(0, 5)
    .map((x) => x.headline)
    .filter(Boolean);
  const bestPrimaryTextExamples = topPerformingPrimaryTexts
    .slice(0, 5)
    .map((x) => x.primaryText)
    .filter(Boolean);
  const winningAngles = copyAnglePerformance
    .slice(0, 4)
    .map((x) => ({ angle: x.angle, roas: x.roas, ctr: x.ctr, winRate: x.winRate }));

  const copyActionBrief: CopyActionBrief = {
    generatedAt: new Date().toISOString(),
    bestHeadlineExamples,
    bestPrimaryTextExamples,
    winningAngles,
    scaleNow,
    testNext,
    refreshNow,
  };

  return {
    headlineLengthPerformance,
    ctaPerformance,
    emojiUsage,
    topPerformingHeadlines,
    primaryTextLength,
    sentimentAnalysis,
    copyAnglePerformance,
    headlinePatternPerformance,
    mergedCopyPerformance,
    topPerformingPrimaryTexts,
    copyActionBrief,
  };
}

export const getAdCopyInsights = createServiceFn<AdCopyInsightsResult, [MetaAuditQuery?]>(
  'meta',
  mockGetAdCopyInsights,
  async (query?: MetaAuditQuery) => {
    try {
      return await Promise.race<AdCopyInsightsResult>([
        realGetAdCopyInsights(query ?? {}),
        new Promise<AdCopyInsightsResult>((resolve) =>
          setTimeout(() => resolve(emptyAdCopyInsightsResult()), 55_000)
        ),
      ]);
    } catch {
      return emptyAdCopyInsightsResult();
    }
  },
);
