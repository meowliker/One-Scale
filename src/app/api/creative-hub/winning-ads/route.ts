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

interface UniquePT {
  text: string;
  combinedRoas: number;
  combinedSpend: number;
  combinedRevenue: number;
  purchases: number;
  adCount: number;
  avgCtr: number;
  avgCpa: number;
}

interface UniqueHeadline {
  text: string;
  combinedRoas: number;
  combinedSpend: number;
  purchases: number;
  adCount: number;
}

interface WinningAd {
  id: string;
  name: string;
  creative: {
    headline: string;
    body: string;
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
        winningAds: [],
        autoFill: { primaryTexts: [], headlines: [], cta: '' },
        bestCTA: { type: '', usagePercent: 0 },
        stats: { totalAds: 0, totalLinkedCampaigns: 0, dateRange: null },
      });
    }

    const linkedCampaignIds = new Set(campaignLinks.map((l) => l.campaignId));

    // 2. Fetch ads data from Supabase snapshots
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const adsSnapshots = await supabaseRest<AdsSnapshotRow[]>(
      `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.ads&variant_key=eq.latest&select=scope_id,payload_json`,
    );

    if (adsSnapshots.length === 0) {
      return NextResponse.json({
        uniquePTs: [],
        uniqueHeadlines: [],
        winningAds: [],
        autoFill: { primaryTexts: [], headlines: [], cta: '' },
        bestCTA: { type: '', usagePercent: 0 },
        stats: { totalAds: 0, totalLinkedCampaigns: linkedCampaignIds.size, dateRange: null },
      });
    }

    // 3. Parse snapshots and filter by linked campaigns
    const matchedAds: SnapshotAd[] = [];

    for (const snap of adsSnapshots) {
      let ads: SnapshotAd[];
      try {
        ads = JSON.parse(snap.payload_json);
      } catch {
        continue;
      }

      for (const ad of ads) {
        const campaignId = ad.campaign_id || ad.campaignId;
        if (!campaignId || !linkedCampaignIds.has(campaignId)) continue;
        // Normalize campaignId
        ad.campaignId = campaignId;
        matchedAds.push(ad);
      }
    }

    if (matchedAds.length === 0) {
      return NextResponse.json({
        uniquePTs: [],
        uniqueHeadlines: [],
        winningAds: [],
        autoFill: { primaryTexts: [], headlines: [], cta: '' },
        bestCTA: { type: '', usagePercent: 0 },
        stats: { totalAds: 0, totalLinkedCampaigns: linkedCampaignIds.size, dateRange: null },
      });
    }

    // 4. Deduplicate Primary Texts
    const ptMap = new Map<string, {
      text: string;
      spendEntries: Array<{ roas: number; spend: number; ctr: number; cpa: number }>;
      totalSpend: number;
      totalRevenue: number;
      totalPurchases: number;
      adCount: number;
    }>();

    for (const ad of matchedAds) {
      const body = ad.creative?.body || '';
      if (!body.trim()) continue;

      const key = body.trim().toLowerCase();
      const metrics = ad.metrics || {};
      const spend = metrics.spend ?? 0;
      const revenue = metrics.revenue ?? 0;
      const roas = metrics.roas ?? (spend > 0 ? revenue / spend : 0);

      if (!ptMap.has(key)) {
        ptMap.set(key, {
          text: body.trim(),
          spendEntries: [],
          totalSpend: 0,
          totalRevenue: 0,
          totalPurchases: 0,
          adCount: 0,
        });
      }

      const entry = ptMap.get(key)!;
      entry.spendEntries.push({
        roas,
        spend,
        ctr: metrics.ctr ?? 0,
        cpa: metrics.cpa ?? 0,
      });
      entry.totalSpend += spend;
      entry.totalRevenue += revenue;
      entry.totalPurchases += metrics.conversions ?? 0;
      entry.adCount += 1;
    }

    const uniquePTs: UniquePT[] = Array.from(ptMap.values())
      .map((entry) => ({
        text: entry.text,
        combinedRoas: weightedAvg(entry.spendEntries.map((e) => ({ value: e.roas, weight: e.spend }))),
        combinedSpend: entry.totalSpend,
        combinedRevenue: entry.totalRevenue,
        purchases: entry.totalPurchases,
        adCount: entry.adCount,
        avgCtr: weightedAvg(entry.spendEntries.map((e) => ({ value: e.ctr, weight: e.spend }))),
        avgCpa: weightedAvg(entry.spendEntries.map((e) => ({ value: e.cpa, weight: e.spend }))),
      }))
      .sort((a, b) => b.combinedRoas - a.combinedRoas || b.combinedSpend - a.combinedSpend)
      .slice(0, 15);

    // 5. Deduplicate Headlines
    const headlineMap = new Map<string, {
      text: string;
      spendEntries: Array<{ roas: number; spend: number }>;
      totalSpend: number;
      totalPurchases: number;
      adCount: number;
    }>();

    for (const ad of matchedAds) {
      const headline = ad.creative?.headline || ad.creative?.title || '';
      if (!headline.trim()) continue;

      const key = headline.trim().toLowerCase();
      const metrics = ad.metrics || {};
      const spend = metrics.spend ?? 0;
      const revenue = metrics.revenue ?? 0;
      const roas = metrics.roas ?? (spend > 0 ? revenue / spend : 0);

      if (!headlineMap.has(key)) {
        headlineMap.set(key, {
          text: headline.trim(),
          spendEntries: [],
          totalSpend: 0,
          totalPurchases: 0,
          adCount: 0,
        });
      }

      const entry = headlineMap.get(key)!;
      entry.spendEntries.push({ roas, spend });
      entry.totalSpend += spend;
      entry.totalPurchases += metrics.conversions ?? 0;
      entry.adCount += 1;
    }

    const uniqueHeadlines: UniqueHeadline[] = Array.from(headlineMap.values())
      .map((entry) => ({
        text: entry.text,
        combinedRoas: weightedAvg(entry.spendEntries.map((e) => ({ value: e.roas, weight: e.spend }))),
        combinedSpend: entry.totalSpend,
        purchases: entry.totalPurchases,
        adCount: entry.adCount,
      }))
      .sort((a, b) => b.combinedRoas - a.combinedRoas || b.combinedSpend - a.combinedSpend)
      .slice(0, 10);

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
    const topPTs = uniquePTs.slice(0, 3).map((pt) => pt.text);
    const topHeadlines = uniqueHeadlines.slice(0, 2).map((h) => h.text);

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
      cta: bestCtaType || 'LEARN_MORE',
    };

    // 8. Best CTA with usage percentage
    const totalAdsWithCta = winningAds.filter((a) => a.creative.ctaType).length;
    const bestCTA = {
      type: bestCtaType || '',
      usagePercent: totalAdsWithCta > 0 ? Math.round((bestCtaCount / totalAdsWithCta) * 100) : 0,
    };

    // 9. Response
    return NextResponse.json({
      uniquePTs,
      uniqueHeadlines,
      winningAds,
      autoFill,
      bestCTA,
      stats: {
        totalAds: matchedAds.length,
        totalLinkedCampaigns: linkedCampaignIds.size,
        dateRange: null, // Snapshot data doesn't carry an explicit date range
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch winning ads';
    console.error('[winning-ads] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
