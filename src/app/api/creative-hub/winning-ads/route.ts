export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getProductCampaignLinks } from '@/app/api/lib/creative-hub-db';

// ── Supabase REST helper ──

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function supabaseRest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status}`);
  return res.json();
}

// ── Types ──

interface SnapshotAd {
  id: string;
  name?: string;
  campaign_id?: string;
  campaignId?: string;
  adSetId?: string;
  status?: string;
  creative?: {
    headline?: string;
    title?: string;
    body?: string;
    description?: string;
    ctaType?: string;
    thumbnailUrl?: string;
    destinationUrl?: string;
    type?: string;
  };
  metrics?: {
    spend?: number;
    revenue?: number;
    roas?: number;
    cpa?: number;
    cpm?: number;
    cpc?: number;
    ctr?: number;
    impressions?: number;
    clicks?: number;
    conversions?: number;
  };
  asset_feed_spec?: {
    bodies?: Array<{ text: string }>;
    titles?: Array<{ text: string }>;
  };
}

interface AdsSnapshotRow {
  scope_id: string;
  payload_json: string;
}

interface SnapshotAdset {
  id?: string;
  campaign_id?: string;
  campaignId?: string;
}

interface CopyMetrics {
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  purchases: number;
  impressions: number;
  clicks: number;
}

interface RankedCopyItem {
  rank: number;
  text: string;
  label: string;
  usageCount: number;
  adCount: number;
  totalSpend: number;
  totalRevenue: number;
  totalPurchases: number;
  totalImpressions: number;
  totalClicks: number;
  blendedScore: number;
  metrics: CopyMetrics;
  examples?: string[];
}

interface WinningPT extends RankedCopyItem {
  combinedRoas: number;
  combinedSpend: number;
  combinedRevenue: number;
  purchases: number;
  avgCtr: number;
  avgCpa: number;
  avgCpc: number;
  avgCpm: number;
}

interface WinningHeadline extends RankedCopyItem {
  combinedRoas: number;
  combinedSpend: number;
  purchases: number;
  avgCtr: number;
  avgCpa: number;
  avgCpc: number;
  avgCpm: number;
}

interface WinningDescription extends RankedCopyItem {}

interface WinningCTA extends RankedCopyItem {
  ctaType: string;
}

interface CopyAggregateEntry {
  text: string;
  label: string;
  usageCount: number;
  adCount: number;
  totalSpend: number;
  totalRevenue: number;
  totalPurchases: number;
  totalImpressions: number;
  totalClicks: number;
  samples: Array<{
    roas: number;
    ctr: number;
    cpc: number;
    cpm: number;
    cpa: number;
    spend: number;
    revenue: number;
    purchases: number;
    impressions: number;
    clicks: number;
    weight: number;
  }>;
  examples: string[];
}

interface UniquePT {
  text: string;
  combinedRoas: number;
  combinedSpend: number;
  combinedRevenue: number;
  purchases: number;
  adCount: number;
  avgCtr: number;
  avgCpa: number;
  usageCount?: number;
  totalImpressions?: number;
  totalClicks?: number;
  avgCpc?: number;
  avgCpm?: number;
  blendedScore?: number;
  metrics?: CopyMetrics;
  label?: string;
  examples?: string[];
}

interface UniqueHeadline {
  text: string;
  combinedRoas: number;
  combinedSpend: number;
  combinedRevenue?: number;
  purchases: number;
  adCount: number;
  usageCount?: number;
  totalImpressions?: number;
  totalClicks?: number;
  avgCtr?: number;
  avgCpa?: number;
  avgCpc?: number;
  avgCpm?: number;
  blendedScore?: number;
  metrics?: CopyMetrics;
  label?: string;
  examples?: string[];
}

interface WinningAd {
  id: string;
  name: string;
  creative: {
    headline: string;
    body: string;
    description?: string;
    ctaType: string;
    thumbnailUrl: string;
    destinationUrl: string;
    type: string;
  };
  metrics: {
    spend: number;
    revenue: number;
    roas: number;
    cpa: number;
    cpm: number;
    cpc: number;
    ctr: number;
    impressions: number;
    clicks: number;
    conversions: number;
  };
  allPTs?: string[];
  allHeadlines?: string[];
}

// ── Helpers ──

function weightedAvg(values: Array<{ value: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight === 0) return 0;
  return values.reduce((sum, v) => sum + v.value * v.weight, 0) / totalWeight;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function humanizeLabel(value: string): string {
  if (!value) return '';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function copyWeight(metrics: { spend: number; impressions: number; clicks: number }): number {
  if (metrics.spend > 0) return metrics.spend;
  if (metrics.impressions > 0) return metrics.impressions / 1000;
  if (metrics.clicks > 0) return metrics.clicks / 10;
  return 1;
}

function aggregateCopyEntry(
  map: Map<string, CopyAggregateEntry>,
  key: string,
  inputs: { text: string; label: string },
  metrics: {
    spend: number;
    revenue: number;
    roas: number;
    ctr: number;
    cpc: number;
    cpm: number;
    cpa: number;
    purchases: number;
    impressions: number;
    clicks: number;
  },
  example?: string,
) {
  if (!map.has(key)) {
    map.set(key, {
      text: inputs.text,
      label: inputs.label,
      usageCount: 0,
      adCount: 0,
      totalSpend: 0,
      totalRevenue: 0,
      totalPurchases: 0,
      totalImpressions: 0,
      totalClicks: 0,
      samples: [],
      examples: [],
    });
  }

  const entry = map.get(key)!;
  const weight = copyWeight(metrics);
  entry.usageCount += 1;
  entry.adCount += 1;
  entry.totalSpend += metrics.spend;
  entry.totalRevenue += metrics.revenue;
  entry.totalPurchases += metrics.purchases;
  entry.totalImpressions += metrics.impressions;
  entry.totalClicks += metrics.clicks;
  entry.samples.push({ ...metrics, weight });
  if (example && !entry.examples.includes(example)) {
    entry.examples.push(example);
  }
}

function finalizeCopyMetrics(entry: CopyAggregateEntry): CopyMetrics {
  const weighted = (selector: (sample: CopyAggregateEntry['samples'][number]) => number) =>
    weightedAvg(entry.samples.map((sample) => ({ value: selector(sample), weight: sample.weight })));

  const roas = entry.totalSpend > 0 ? entry.totalRevenue / entry.totalSpend : weighted((sample) => sample.roas);
  const ctr = entry.totalImpressions > 0 ? entry.totalClicks / entry.totalImpressions : weighted((sample) => sample.ctr);
  const cpc = entry.totalClicks > 0 ? entry.totalSpend / entry.totalClicks : weighted((sample) => sample.cpc);
  const cpm = entry.totalImpressions > 0 ? (entry.totalSpend / entry.totalImpressions) * 1000 : weighted((sample) => sample.cpm);
  const cpa = entry.totalPurchases > 0 ? entry.totalSpend / entry.totalPurchases : weighted((sample) => sample.cpa);

  return {
    spend: entry.totalSpend,
    revenue: entry.totalRevenue,
    roas,
    ctr,
    cpc,
    cpm,
    cpa,
    purchases: entry.totalPurchases,
    impressions: entry.totalImpressions,
    clicks: entry.totalClicks,
  };
}

function minMax(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

function computeBlendedScore(metrics: CopyMetrics, usageCount: number, ranges: Record<string, { min: number; max: number }>): number {
  const score =
    minMax(metrics.roas, ranges.roas.min, ranges.roas.max) * 0.26 +
    minMax(metrics.ctr, ranges.ctr.min, ranges.ctr.max) * 0.17 +
    minMax(metrics.purchases, ranges.purchases.min, ranges.purchases.max) * 0.12 +
    minMax(metrics.clicks, ranges.clicks.min, ranges.clicks.max) * 0.09 +
    minMax(metrics.impressions, ranges.impressions.min, ranges.impressions.max) * 0.05 +
    minMax(metrics.spend, ranges.spend.min, ranges.spend.max) * 0.05 +
    minMax(usageCount, ranges.usageCount.min, ranges.usageCount.max) * 0.11 +
    (1 - minMax(metrics.cpa, ranges.cpa.min, ranges.cpa.max)) * 0.08 +
    (1 - minMax(metrics.cpc, ranges.cpc.min, ranges.cpc.max)) * 0.04 +
    (1 - minMax(metrics.cpm, ranges.cpm.min, ranges.cpm.max)) * 0.03;

  return Math.round(clamp(score, 0, 1) * 1000) / 10;
}

function finalizeRankedItems(
  entries: CopyAggregateEntry[],
  label: string,
  options?: { ctaType?: string },
): Array<WinningPT | WinningHeadline | WinningDescription | WinningCTA> {
  if (entries.length === 0) return [];

  const metricsList = entries.map((entry) => finalizeCopyMetrics(entry));
  const ranges = {
    spend: { min: Math.min(...metricsList.map((item) => item.spend), 0), max: Math.max(...metricsList.map((item) => item.spend), 1) },
    roas: { min: Math.min(...metricsList.map((item) => item.roas), 0), max: Math.max(...metricsList.map((item) => item.roas), 1) },
    ctr: { min: Math.min(...metricsList.map((item) => item.ctr), 0), max: Math.max(...metricsList.map((item) => item.ctr), 1) },
    cpc: { min: Math.min(...metricsList.map((item) => item.cpc), 0), max: Math.max(...metricsList.map((item) => item.cpc), 1) },
    cpm: { min: Math.min(...metricsList.map((item) => item.cpm), 0), max: Math.max(...metricsList.map((item) => item.cpm), 1) },
    cpa: { min: Math.min(...metricsList.map((item) => item.cpa), 0), max: Math.max(...metricsList.map((item) => item.cpa), 1) },
    purchases: { min: Math.min(...metricsList.map((item) => item.purchases), 0), max: Math.max(...metricsList.map((item) => item.purchases), 1) },
    impressions: { min: Math.min(...metricsList.map((item) => item.impressions), 0), max: Math.max(...metricsList.map((item) => item.impressions), 1) },
    clicks: { min: Math.min(...metricsList.map((item) => item.clicks), 0), max: Math.max(...metricsList.map((item) => item.clicks), 1) },
    usageCount: { min: Math.min(...entries.map((item) => item.usageCount), 0), max: Math.max(...entries.map((item) => item.usageCount), 1) },
  };

  return entries
    .map((entry, index) => {
      const metrics = metricsList[index];
      const blendedScore = computeBlendedScore(metrics, entry.usageCount, ranges);
      const base = {
        rank: 0,
        text: entry.text,
        label,
        usageCount: entry.usageCount,
        adCount: entry.adCount,
        totalSpend: entry.totalSpend,
        totalRevenue: entry.totalRevenue,
        totalPurchases: entry.totalPurchases,
        totalImpressions: entry.totalImpressions,
        totalClicks: entry.totalClicks,
        blendedScore,
        metrics,
        examples: entry.examples.slice(0, 3),
        combinedRoas: metrics.roas,
        combinedSpend: entry.totalSpend,
        combinedRevenue: entry.totalRevenue,
        purchases: entry.totalPurchases,
        avgRoas: metrics.roas,
        avgCtr: metrics.ctr,
        avgCpa: metrics.cpa,
        avgCpc: metrics.cpc,
        avgCpm: metrics.cpm,
      };

      if (typeof options?.ctaType !== 'undefined') {
        return {
          ...base,
          ctaType: options.ctaType || entry.text,
        } as WinningCTA;
      }

      return base;
    })
    .sort((a, b) => b.blendedScore - a.blendedScore || b.totalSpend - a.totalSpend || b.metrics.roas - a.metrics.roas)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

async function fetchLatestSnapshots<T extends AdsSnapshotRow>(storeId: string, endpoint: string): Promise<T[]> {
  let snapshots: T[] = [];

  try {
    const tableRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ensure_meta_snapshot_store_table`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_store_id: storeId }),
    });
    if (tableRes.ok) {
      const tableName = await tableRes.json();
      if (typeof tableName === 'string' && tableName) {
        snapshots = await supabaseRest<T[]>(
          `/${tableName}?endpoint=eq.${endpoint}&variant_key=eq.latest&select=scope_id,payload_json`,
        );
      }
    }
  } catch {
    // Fall back to the legacy table below.
  }

  if (snapshots.length > 0) {
    return snapshots;
  }

  try {
    return await supabaseRest<T[]>(
      `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.${endpoint}&variant_key=eq.latest&select=scope_id,payload_json`,
    );
  } catch {
    return [];
  }
}

// ── GET handler ──

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const storeId = searchParams.get('storeId');
    const productProfileId = searchParams.get('productProfileId');

    if (!storeId || !productProfileId) {
      return NextResponse.json(
        { error: 'storeId and productProfileId are required' },
        { status: 400 },
      );
    }

    // 1. Get linked campaign IDs
    const campaignLinks = await getProductCampaignLinks(productProfileId);
    if (campaignLinks.length === 0) {
      return NextResponse.json({
        uniquePTs: [],
        uniqueHeadlines: [],
        winningPrimaryTexts: [],
        winningHeadlines: [],
        winningDescriptions: [],
        winningCTAs: [],
        copyIntelligence: {
          primaryTexts: [],
          headlines: [],
          descriptions: [],
          ctas: [],
          defaultRanking: 'blended_score',
        },
        winningAds: [],
        autoFill: { primaryTexts: [], headlines: [], descriptions: [], cta: '' },
        bestCTA: { type: '', usagePercent: 0, blendedScore: 0 },
        stats: {
          totalAds: 0,
          totalLinkedCampaigns: 0,
          totalSpend: 0,
          totalPurchases: 0,
          totalImpressions: 0,
          totalClicks: 0,
          dateRange: null,
        },
      });
    }

    const linkedCampaignIds = new Set(campaignLinks.map((l) => l.campaignId));

    // 2. Fetch ads data from Supabase snapshots
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const [adsSnapshots, adsetSnapshots] = await Promise.all([
      fetchLatestSnapshots<AdsSnapshotRow>(storeId, 'ads'),
      fetchLatestSnapshots<AdsSnapshotRow>(storeId, 'adsets'),
    ]);

    if (adsSnapshots.length === 0) {
      return NextResponse.json({
        uniquePTs: [],
        uniqueHeadlines: [],
        winningPrimaryTexts: [],
        winningHeadlines: [],
        winningDescriptions: [],
        winningCTAs: [],
        copyIntelligence: {
          primaryTexts: [],
          headlines: [],
          descriptions: [],
          ctas: [],
          defaultRanking: 'blended_score',
        },
        winningAds: [],
        autoFill: { primaryTexts: [], headlines: [], descriptions: [], cta: '' },
        bestCTA: { type: '', usagePercent: 0, blendedScore: 0 },
        stats: {
          totalAds: 0,
          totalLinkedCampaigns: linkedCampaignIds.size,
          totalSpend: 0,
          totalPurchases: 0,
          totalImpressions: 0,
          totalClicks: 0,
          dateRange: null,
        },
      });
    }

    // 3. Resolve ad set ids for the linked campaigns so ad-level snapshots can be matched reliably.
    const linkedAdsetIds = new Set<string>();
    const adsetToCampaignId = new Map<string, string>();

    for (const snap of adsetSnapshots) {
      let adsets: SnapshotAdset[];
      try {
        const parsed = JSON.parse(snap.payload_json);
        adsets = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        continue;
      }

      for (const adset of adsets) {
        const parentCampaignId = adset.campaign_id || adset.campaignId || snap.scope_id;
        if (!parentCampaignId || !linkedCampaignIds.has(parentCampaignId)) continue;

        const adsetId = adset.id || snap.scope_id;
        if (!adsetId) continue;

        linkedAdsetIds.add(adsetId);
        adsetToCampaignId.set(adsetId, parentCampaignId);
      }
    }

    // 4. Parse snapshots and filter by linked campaigns / ad sets
    const matchedAds: SnapshotAd[] = [];

    for (const snap of adsSnapshots) {
      let ads: SnapshotAd[];
      try {
        ads = JSON.parse(snap.payload_json);
      } catch {
        continue;
      }

      const scopeMatchesLinkedAdset = linkedAdsetIds.has(snap.scope_id);

      for (const ad of ads) {
        const campaignId = ad.campaign_id || ad.campaignId;
        const adsetId = ad.adSetId;
        const matchesLinkedCampaign =
          (!!campaignId && linkedCampaignIds.has(campaignId)) ||
          (!!adsetId && linkedAdsetIds.has(adsetId)) ||
          scopeMatchesLinkedAdset;

        if (!matchesLinkedCampaign) continue;

        ad.campaignId =
          campaignId ||
          (adsetId ? adsetToCampaignId.get(adsetId) : undefined) ||
          adsetToCampaignId.get(snap.scope_id);
        matchedAds.push(ad);
      }
    }

    if (matchedAds.length === 0) {
      return NextResponse.json({
        uniquePTs: [],
        uniqueHeadlines: [],
        winningPrimaryTexts: [],
        winningHeadlines: [],
        winningDescriptions: [],
        winningCTAs: [],
        copyIntelligence: {
          primaryTexts: [],
          headlines: [],
          descriptions: [],
          ctas: [],
          defaultRanking: 'blended_score',
        },
        winningAds: [],
        autoFill: { primaryTexts: [], headlines: [], descriptions: [], cta: '' },
        bestCTA: { type: '', usagePercent: 0, blendedScore: 0 },
        stats: {
          totalAds: 0,
          totalLinkedCampaigns: linkedCampaignIds.size,
          totalSpend: 0,
          totalPurchases: 0,
          totalImpressions: 0,
          totalClicks: 0,
          dateRange: null,
        },
      });
    }

    // 4. Rank copy variants across primary texts, headlines, descriptions, and CTAs
    const ptMap = new Map<string, CopyAggregateEntry>();
    const headlineMap = new Map<string, CopyAggregateEntry>();
    const descriptionMap = new Map<string, CopyAggregateEntry>();
    const ctaMap = new Map<string, CopyAggregateEntry>();

    for (const ad of matchedAds) {
      const metrics = ad.metrics || {};
      const normalizedMetrics = {
        spend: metrics.spend ?? 0,
        revenue: metrics.revenue ?? 0,
        roas: metrics.roas ?? 0,
        ctr: metrics.ctr ?? 0,
        cpc: metrics.cpc ?? 0,
        cpm: metrics.cpm ?? 0,
        cpa: metrics.cpa ?? 0,
        purchases: metrics.conversions ?? 0,
        impressions: metrics.impressions ?? 0,
        clicks: metrics.clicks ?? 0,
      };
      const example = ad.name || ad.id;

      const body = ad.creative?.body?.trim();
      if (body) {
        aggregateCopyEntry(
          ptMap,
          body.toLowerCase(),
          { text: body, label: 'Primary text' },
          normalizedMetrics,
          example,
        );
      }

      const headline = (ad.creative?.headline || ad.creative?.title || '').trim();
      if (headline) {
        aggregateCopyEntry(
          headlineMap,
          headline.toLowerCase(),
          { text: headline, label: 'Headline' },
          normalizedMetrics,
          example,
        );
      }

      const description = (ad.creative?.description || ad.creative?.title || ad.creative?.body || '').trim();
      if (description) {
        aggregateCopyEntry(
          descriptionMap,
          description.toLowerCase(),
          { text: description, label: 'Description' },
          normalizedMetrics,
          example,
        );
      }

      const ctaType = ad.creative?.ctaType?.trim();
      if (ctaType) {
        aggregateCopyEntry(
          ctaMap,
          ctaType.toLowerCase(),
          { text: ctaType, label: humanizeLabel(ctaType) || 'CTA' },
          normalizedMetrics,
          example,
        );
      }
    }

    const uniquePTs = finalizeRankedItems(Array.from(ptMap.values()), 'Primary text') as WinningPT[];
    const uniqueHeadlines = finalizeRankedItems(Array.from(headlineMap.values()), 'Headline') as WinningHeadline[];
    const uniqueDescriptions = finalizeRankedItems(Array.from(descriptionMap.values()), 'Description') as WinningDescription[];
    const uniqueCTAs = finalizeRankedItems(Array.from(ctaMap.values()), 'CTA', { ctaType: '' }) as WinningCTA[];

    const rankedPrimaryTexts = uniquePTs.slice(0, 15);
    const rankedHeadlines = uniqueHeadlines.slice(0, 10);
    const rankedDescriptions = uniqueDescriptions.slice(0, 10);
    const totalCtaUsage = uniqueCTAs.reduce((sum, item) => sum + (item.usageCount || 0), 0);
    const rankedCTAs = uniqueCTAs.slice(0, 10).map((item) => ({
      ...item,
      ctaType: item.text,
      label: item.label || humanizeLabel(item.text) || 'CTA',
      usagePercent: totalCtaUsage > 0 ? Math.round(((item.usageCount || 0) / totalCtaUsage) * 100) : 0,
    }));

    // 6. Winning Ads: rank by ROAS with min $10 spend filter
    const winningAds: WinningAd[] = matchedAds
      .filter((ad) => (ad.metrics?.spend ?? 0) >= 10)
      .sort((a, b) => {
        const roasA = a.metrics?.roas ?? 0;
        const roasB = b.metrics?.roas ?? 0;
        if (roasB !== roasA) return roasB - roasA;
        return (b.metrics?.spend ?? 0) - (a.metrics?.spend ?? 0);
      })
      .slice(0, 20)
      .map((ad) => {
        const metrics = ad.metrics || {};
        const result: WinningAd = {
          id: ad.id,
          name: ad.name || '',
          creative: {
            headline: ad.creative?.headline || ad.creative?.title || '',
            body: ad.creative?.body || '',
            description: ad.creative?.title || ad.creative?.body || '',
            ctaType: ad.creative?.ctaType || '',
            thumbnailUrl: ad.creative?.thumbnailUrl || '',
            destinationUrl: ad.creative?.destinationUrl || '',
            type: ad.creative?.type || '',
          },
          metrics: {
            spend: metrics.spend ?? 0,
            revenue: metrics.revenue ?? 0,
            roas: metrics.roas ?? 0,
            cpa: metrics.cpa ?? 0,
            cpm: metrics.cpm ?? 0,
            cpc: metrics.cpc ?? 0,
            ctr: metrics.ctr ?? 0,
            impressions: metrics.impressions ?? 0,
            clicks: metrics.clicks ?? 0,
            conversions: metrics.conversions ?? 0,
          },
        };

        // Include all PTs/headlines from flexible ads (asset_feed_spec)
        if (ad.asset_feed_spec) {
          if (ad.asset_feed_spec.bodies && ad.asset_feed_spec.bodies.length > 0) {
            result.allPTs = ad.asset_feed_spec.bodies.map((b) => b.text);
          }
          if (ad.asset_feed_spec.titles && ad.asset_feed_spec.titles.length > 0) {
            result.allHeadlines = ad.asset_feed_spec.titles.map((t) => t.text);
          }
        }

        return result;
      });

    // 7. Auto-Fill Suggestion
    const topPTs = rankedPrimaryTexts.slice(0, 3).map((pt) => pt.text);
    const topHeadlines = rankedHeadlines.slice(0, 2).map((h) => h.text);
    const topDescriptions = rankedDescriptions.slice(0, 2).map((item) => item.text);

    // Most common CTA among winning ads
    const ctaCounts = new Map<string, number>();
    for (const ad of winningAds) {
      const cta = ad.creative.ctaType;
      if (cta) {
        ctaCounts.set(cta, (ctaCounts.get(cta) || 0) + 1);
      }
    }

    let bestCtaType = '';
    let bestCtaCount = 0;
    for (const [cta, count] of ctaCounts) {
      if (count > bestCtaCount) {
        bestCtaType = cta;
        bestCtaCount = count;
      }
    }

    const autoFill = {
      primaryTexts: topPTs,
      headlines: topHeadlines,
      descriptions: topDescriptions,
      cta: bestCtaType || 'LEARN_MORE',
    };

    // 8. Best CTA with usage percentage
    const totalAdsWithCta = winningAds.filter((a) => a.creative.ctaType).length;
    const bestCTAItem = rankedCTAs.find((item) => item.text === bestCtaType);
    const bestCTA = {
      type: bestCtaType || '',
      usagePercent: totalAdsWithCta > 0 ? Math.round((bestCtaCount / totalAdsWithCta) * 100) : 0,
      blendedScore: bestCTAItem?.blendedScore,
    };

    const totalSpend = matchedAds.reduce((sum, ad) => sum + (ad.metrics?.spend ?? 0), 0);
    const totalPurchases = matchedAds.reduce((sum, ad) => sum + (ad.metrics?.conversions ?? 0), 0);
    const totalImpressions = matchedAds.reduce((sum, ad) => sum + (ad.metrics?.impressions ?? 0), 0);
    const totalClicks = matchedAds.reduce((sum, ad) => sum + (ad.metrics?.clicks ?? 0), 0);

    // 9. Response
    return NextResponse.json({
      uniquePTs,
      uniqueHeadlines,
      winningPrimaryTexts: rankedPrimaryTexts,
      winningHeadlines: rankedHeadlines,
      winningDescriptions: rankedDescriptions,
      winningCTAs: rankedCTAs,
      copyIntelligence: {
        primaryTexts: rankedPrimaryTexts,
        headlines: rankedHeadlines,
        descriptions: rankedDescriptions,
        ctas: rankedCTAs,
        defaultRanking: 'blended_score',
      },
      winningAds,
      autoFill,
      bestCTA,
      stats: {
        totalAds: matchedAds.length,
        totalLinkedCampaigns: linkedCampaignIds.size,
        totalSpend,
        totalPurchases,
        totalImpressions,
        totalClicks,
        dateRange: null, // Snapshot data doesn't carry an explicit date range
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch winning ads';
    console.error('[winning-ads] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
