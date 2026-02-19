import { NextRequest, NextResponse } from 'next/server';
import {
  getLatestMetaEndpointSnapshot,
  getMetaEndpointSnapshot,
  getRecentMetaEndpointSnapshots,
  getStore,
} from '@/app/api/lib/db';
import type { Ad, AdSet, CampaignObjective } from '@/types/campaign';
import type { Creative } from '@/types/creative';
import type { CampaignCreateAnalysis, CampaignCreateCopyOption } from '@/types/campaignCreate';

type AudienceType = 'Broad' | 'Interest Stack' | 'Retargeting';
type AngleType =
  | 'Offer'
  | 'Problem-Solution'
  | 'Social Proof'
  | 'Urgency'
  | 'Benefit'
  | 'Objection Handling'
  | 'Educational';
type CtaLabel = 'Shop Now' | 'Learn More' | 'Sign Up' | 'Book Now' | 'Contact Us' | 'Download' | 'Get Offer';

const CTA_LABEL_MAP: Record<Ad['creative']['ctaType'], CtaLabel> = {
  SHOP_NOW: 'Shop Now',
  LEARN_MORE: 'Learn More',
  SIGN_UP: 'Sign Up',
  BOOK_NOW: 'Book Now',
  CONTACT_US: 'Contact Us',
  DOWNLOAD: 'Download',
  GET_OFFER: 'Get Offer',
};
const CTA_TYPE_MAP: Record<CtaLabel, CampaignCreateCopyOption['ctaType']> = {
  'Shop Now': 'SHOP_NOW',
  'Learn More': 'LEARN_MORE',
  'Sign Up': 'SIGN_UP',
  'Book Now': 'BOOK_NOW',
  'Contact Us': 'CONTACT_US',
  Download: 'DOWNLOAD',
  'Get Offer': 'GET_OFFER',
};
const DEFAULT_URL_TAGS =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';
const ANALYSIS_CACHE_TTL_MS = 5 * 60 * 1000;
const analysisCache = new Map<string, { at: number; data: CampaignCreateAnalysis }>();

function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function normalizeCopy(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s%$!?.,-]/g, '')
    .trim();
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function classifyAngle(text: string): AngleType {
  const normalized = text.toLowerCase();
  if (/\b(save|off|discount|sale|deal|offer|coupon|free shipping)\b/.test(normalized)) return 'Offer';
  if (/\bstruggling|tired of|problem|fix|solution|finally\b/.test(normalized)) return 'Problem-Solution';
  if (/\breview|rated|trusted|customers|testimonial|loved by\b/.test(normalized)) return 'Social Proof';
  if (/\blast chance|hurry|today only|ends tonight|limited\b/.test(normalized)) return 'Urgency';
  if (/\bresults|boost|improve|get better|transform|benefit\b/.test(normalized)) return 'Benefit';
  if (/\btoo expensive|worth it|risk free|guarantee|no hassle\b/.test(normalized)) return 'Objection Handling';
  return 'Educational';
}

function inferCta(headline: string, primaryText: string): string {
  const text = `${headline} ${primaryText}`.toLowerCase();
  if (/\b(shop|buy|order|checkout|cart)\b/.test(text)) return 'Shop Now';
  if (/\b(sign ?up|register|join)\b/.test(text)) return 'Sign Up';
  if (/\b(book|appointment|call)\b/.test(text)) return 'Book Now';
  if (/\b(contact|talk|message)\b/.test(text)) return 'Contact Us';
  if (/\b(download|guide|ebook|pdf)\b/.test(text)) return 'Download';
  if (/\b(offer|discount|coupon|deal)\b/.test(text)) return 'Get Offer';
  return 'Learn More';
}

function classifyAudience(targeting: AdSet['targeting']): AudienceType {
  if ((targeting.customAudiences || []).length > 0) return 'Retargeting';
  if ((targeting.interests || []).length > 0) return 'Interest Stack';
  return 'Broad';
}

function normalizeHttpUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes('.') && !trimmed.includes(' ')) return `https://${trimmed}`;
  return '';
}

function recommendObjective(creatives: Creative[]): CampaignObjective {
  let spend = 0;
  let revenue = 0;
  let conversions = 0;
  let clicks = 0;
  let hasVideo = false;

  for (const creative of creatives) {
    spend += creative.spend || 0;
    revenue += creative.revenue || 0;
    conversions += creative.conversions || 0;
    hasVideo = hasVideo || creative.type === 'Video';

    if (creative.impressions > 0 && creative.ctr > 0) {
      clicks += (creative.impressions * creative.ctr) / 100;
    } else if (creative.cpc > 0) {
      clicks += creative.spend / creative.cpc;
    }
  }

  if (conversions >= 5 || revenue > 0 || (spend > 0 && revenue / Math.max(spend, 1) >= 1)) return 'CONVERSIONS';
  if (clicks >= 30) return 'TRAFFIC';
  if (hasVideo) return 'VIDEO_VIEWS';
  return 'BRAND_AWARENESS';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const cached = analysisCache.get(storeId);
  if (cached && Date.now() - cached.at < ANALYSIS_CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const exactCreativeSnapshot = getMetaEndpointSnapshot<Creative[]>(
    storeId,
    'creatives',
    'default',
    'datePreset:last_30d'
  );
  const latestCreativeSnapshot = exactCreativeSnapshot
    ? null
    : getLatestMetaEndpointSnapshot<Creative[]>(storeId, 'creatives', 'default');
  const creatives = (exactCreativeSnapshot?.data || latestCreativeSnapshot?.data || []).filter(Boolean);
  const creativeById = new Map<string, Creative>();
  for (const creative of creatives) {
    if (!creative?.id) continue;
    const existing = creativeById.get(creative.id);
    if (!existing || (creative.spend || 0) > (existing.spend || 0)) {
      creativeById.set(creative.id, creative);
    }
  }

  const adSnapshots = getRecentMetaEndpointSnapshots<Ad[]>(storeId, 'ads', 120);
  const adRows = adSnapshots
    .flatMap((snapshot) => (Array.isArray(snapshot.data) ? snapshot.data : []))
    .filter(Boolean);

  const adDeduped = new Map<string, Ad>();
  for (const ad of adRows) {
    if (!ad?.id) continue;
    const existing = adDeduped.get(ad.id);
    if (!existing || (ad.metrics?.spend || 0) > (existing.metrics?.spend || 0)) {
      adDeduped.set(ad.id, ad);
    }
  }

  if (creatives.length === 0 && adDeduped.size === 0) {
    const storeDomain = (getStore(storeId)?.domain || '').trim();
    const fallbackDestinationUrl = normalizeHttpUrl(storeDomain);
    const empty: CampaignCreateAnalysis = {
      winnerChips: {},
      ourCopyOptions: [],
      aiContext: {
        topHeadlines: ['Stronger focus starts today', 'Trusted by thousands', 'Feel better, faster'],
        topPrimaryTexts: [
          'Built from your recent ad patterns with a clearer value proposition and stronger CTA.',
          'Use this as a base variant and tailor it to your audience segment before publishing.',
          'Winner-style structure: hook, core benefit, proof, and one direct next action.',
        ],
        topCtas: ['Shop Now', 'Learn More', 'Get Offer'],
        winningAngles: ['Benefit', 'Problem-Solution', 'Offer'],
      },
      recommendedObjective: 'CONVERSIONS',
      recommendedDestinationUrl: fallbackDestinationUrl,
      recommendedUrlTags: DEFAULT_URL_TAGS,
    };
    return NextResponse.json(empty);
  }

  const copySourceRows: Array<{
    id: string;
    headline: string;
    primaryText: string;
    cta: CtaLabel;
    spend: number;
    revenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
    destinationUrl: string;
    urlTags: string;
  }> = [];

  for (const ad of adDeduped.values()) {
    const creativePerf = creativeById.get(ad.id);
    const spend = (ad.metrics?.spend || 0) > 0 ? (ad.metrics?.spend || 0) : (creativePerf?.spend || 0);
    const revenue = (ad.metrics?.revenue || 0) > 0 ? (ad.metrics?.revenue || 0) : (creativePerf?.revenue || 0);
    const impressions = (ad.metrics?.impressions || 0) > 0 ? (ad.metrics?.impressions || 0) : (creativePerf?.impressions || 0);
    const clicks = (ad.metrics?.clicks || 0) > 0
      ? (ad.metrics?.clicks || 0)
      : (impressions > 0 ? (impressions * ((creativePerf?.ctr || 0) / 100)) : 0);
    const conversions = (ad.metrics?.conversions || 0) > 0 ? (ad.metrics?.conversions || 0) : (creativePerf?.conversions || 0);
    const headline = (ad.creative?.headline || creativePerf?.headline || ad.name || '').trim();
    const primaryText = (ad.creative?.body || creativePerf?.primaryText || '').trim();
    if (!headline && !primaryText) continue;
    copySourceRows.push({
      id: ad.id,
      headline,
      primaryText,
      cta: CTA_LABEL_MAP[ad.creative?.ctaType || 'LEARN_MORE'] || inferCta(headline, primaryText),
      spend,
      revenue,
      impressions,
      clicks,
      conversions,
      destinationUrl: normalizeHttpUrl(ad.creative?.destinationUrl || ''),
      urlTags: (ad.creative?.urlTags || '').trim(),
    });
  }

  if (copySourceRows.length === 0) {
    for (const creative of creatives) {
      const headline = (creative.headline || creative.name || '').trim();
      const primaryText = (creative.primaryText || '').trim();
      if (!headline && !primaryText) continue;
      const spend = creative.spend || 0;
      const impressions = creative.impressions || 0;
      const clicks = impressions > 0
        ? (impressions * (creative.ctr || 0)) / 100
        : (creative.cpc > 0 ? spend / creative.cpc : 0);
      copySourceRows.push({
        id: creative.id,
        headline,
        primaryText,
        cta: inferCta(headline, primaryText) as CtaLabel,
        spend,
        revenue: creative.revenue || 0,
        impressions,
        clicks,
        conversions: creative.conversions || 0,
        destinationUrl: '',
        urlTags: '',
      });
    }
  }

  const mergedMap = new Map<string, {
    headline: string;
    primaryText: string;
    ads: number;
    spend: number;
    revenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctaCounts: Map<CtaLabel, number>;
  }>();

  for (const row of copySourceRows) {
    const headline = row.headline;
    const primaryText = row.primaryText;
    if (!headline && !primaryText) continue;

    const key = `${normalizeCopy(headline)}|||${normalizeCopy(primaryText)}`;
    if (!key.replace(/\|/g, '')) continue;

    const existing = mergedMap.get(key) || {
      headline,
      primaryText,
      ads: 0,
      spend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctaCounts: new Map<CtaLabel, number>(),
    };

    if (headline.length > existing.headline.length) existing.headline = headline;
    if (primaryText.length > existing.primaryText.length) existing.primaryText = primaryText;

    existing.ads += 1;
    existing.spend += row.spend;
    existing.revenue += row.revenue;
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    existing.conversions += row.conversions;
    existing.ctaCounts.set(row.cta, (existing.ctaCounts.get(row.cta) || 0) + 1);
    mergedMap.set(key, existing);
  }

  const ourCopyOptions: CampaignCreateCopyOption[] = [...mergedMap.entries()]
    .map(([key, row]) => {
      const ctaLabel = [...row.ctaCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Learn More';
      const roas = row.spend > 0 ? row.revenue / row.spend : 0;
      const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
      const cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
      return {
        id: `copy_${hashString(key)}`,
        headline: row.headline,
        primaryText: row.primaryText,
        ctaLabel,
        ctaType: CTA_TYPE_MAP[ctaLabel] || 'LEARN_MORE',
        ads: row.ads,
        spend: r2(row.spend),
        roas: r2(roas),
        ctr: r2(ctr),
        cpc: r2(cpc),
        conversions: Math.round(row.conversions),
      } satisfies CampaignCreateCopyOption;
    })
    .sort((a, b) => b.spend - a.spend || b.roas - a.roas)
    .slice(0, 40);

  const creativeWinner = [...creatives]
    .filter((row) => (row.spend || 0) > 0)
    .sort((a, b) => (b.roas || 0) - (a.roas || 0) || (b.spend || 0) - (a.spend || 0))[0];
  const topSpendCreative = [...creatives]
    .filter((row) => (row.spend || 0) > 0)
    .sort((a, b) => (b.spend || 0) - (a.spend || 0))[0];
  const topSpendAd = [...adDeduped.values()]
    .sort((a, b) => (b.metrics?.spend || 0) - (a.metrics?.spend || 0))[0];
  const copyWinner =
    [...ourCopyOptions]
      .filter((row) => row.spend >= 20)
      .sort((a, b) => b.roas - a.roas || b.spend - a.spend)[0] ||
    ourCopyOptions[0];

  const adSetSnapshots = getRecentMetaEndpointSnapshots<AdSet[]>(storeId, 'adsets', 100);
  const adSets = adSetSnapshots
    .flatMap((snapshot) => (Array.isArray(snapshot.data) ? snapshot.data : []))
    .filter(Boolean);

  const adSetDeduped = new Map<string, AdSet>();
  for (const adSet of adSets) {
    const existing = adSetDeduped.get(adSet.id);
    if (!existing || (adSet.metrics?.spend || 0) > (existing.metrics?.spend || 0)) {
      adSetDeduped.set(adSet.id, adSet);
    }
  }

  const audienceAgg = new Map<AudienceType, {
    spend: number;
    revenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }>();

  for (const adSet of adSetDeduped.values()) {
    const type = classifyAudience(adSet.targeting);
    const current = audienceAgg.get(type) || { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
    current.spend += adSet.metrics?.spend || 0;
    current.revenue += adSet.metrics?.revenue || 0;
    current.impressions += adSet.metrics?.impressions || 0;
    current.clicks += adSet.metrics?.clicks || 0;
    current.conversions += adSet.metrics?.conversions || 0;
    audienceAgg.set(type, current);
  }

  const topAdSet = [...adSetDeduped.values()]
    .filter((row) => (row.metrics?.spend || 0) > 0)
    .sort((a, b) => (b.metrics?.spend || 0) - (a.metrics?.spend || 0))[0];

  const audienceWinner = [...audienceAgg.entries()]
    .map(([type, row]) => ({
      type,
      spend: row.spend,
      roas: row.spend > 0 ? row.revenue / row.spend : 0,
    }))
    .filter((row) => row.spend > 0)
    .sort((a, b) => b.roas - a.roas || b.spend - a.spend)[0];

  const objectiveSource = creatives.length > 0
    ? creatives
    : copySourceRows.map((row) => ({
      id: row.id,
      name: row.headline || row.id,
      type: 'Image' as const,
      spend: row.spend,
      roas: row.spend > 0 ? row.revenue / row.spend : 0,
      ctr: row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0,
      impressions: row.impressions,
      status: 'Active' as const,
      revenue: row.revenue,
      conversions: row.conversions,
      cpc: row.clicks > 0 ? row.spend / row.clicks : 0,
      cpm: row.impressions > 0 ? (row.spend / row.impressions) * 1000 : 0,
      frequency: 0,
      fatigueScore: 0,
      startDate: new Date().toISOString(),
    }));

  const recommendedObjective = recommendObjective(objectiveSource);
  const totalSpend = objectiveSource.reduce((sum, row) => sum + (row.spend || 0), 0);
  const totalRevenue = objectiveSource.reduce((sum, row) => sum + (row.revenue || 0), 0);
  const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const unique = (values: string[]) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
      const normalized = value.trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
    }
    return out;
  };

  const topHeadlines = [...ourCopyOptions]
    .filter((row) => row.headline.trim().length > 0)
    .map((row) => row.headline.slice(0, 80))
    .slice(0, 20);
  const topPrimaryTexts = [...ourCopyOptions]
    .filter((row) => row.primaryText.trim().length > 0)
    .map((row) => row.primaryText.slice(0, 240))
    .slice(0, 20);
  const topCtas = [...ourCopyOptions]
    .map((row) => row.ctaLabel)
    .filter((value, index, arr) => arr.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, 7);
  const winningAngles = [...ourCopyOptions]
    .map((row) => classifyAngle(`${row.headline} ${row.primaryText}`))
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .slice(0, 7);

  const topDestinationUrl =
    [...copySourceRows]
      .sort((a, b) => b.spend - a.spend)
      .map((row) => normalizeHttpUrl(row.destinationUrl))
      .find(Boolean) || '';
  const topUrlTags =
    [...copySourceRows]
      .sort((a, b) => b.spend - a.spend)
      .map((row) => row.urlTags.trim())
      .find((value) => value.length > 0) || '';
  const storeDomain = (getStore(storeId)?.domain || '').trim();
  const recommendedDestinationUrl = topDestinationUrl || normalizeHttpUrl(storeDomain);
  const recommendedUrlTags = topUrlTags || DEFAULT_URL_TAGS;

  const result: CampaignCreateAnalysis = {
    winnerChips: {
      objective: {
        key: 'objective',
        title: 'Objective Winner',
        value: `${recommendedObjective} • ${r2(totalRoas).toFixed(2)}x ROAS • ${money(totalSpend)} spend`,
      },
      audience: audienceWinner
        ? {
            key: 'audience',
            title: 'Audience Winner',
            value: `${audienceWinner.type} • ${r2(audienceWinner.roas).toFixed(2)}x ROAS • ${money(audienceWinner.spend)} spend`,
          }
        : undefined,
      creative: creativeWinner
        ? {
            key: 'creative',
            title: 'Creative Winner',
            value: `${creativeWinner.name} • ${r2(creativeWinner.roas || 0).toFixed(2)}x ROAS • ${money(creativeWinner.spend || 0)} spend`,
          }
        : undefined,
      copy: copyWinner
        ? {
            key: 'copy',
            title: 'Copy Winner',
            value: `${copyWinner.headline || 'Copy Variant'} • ${copyWinner.roas.toFixed(2)}x ROAS • ${money(copyWinner.spend)} spend`,
          }
        : undefined,
    },
    ourCopyOptions,
    aiContext: {
      topHeadlines: unique(topHeadlines).slice(0, 12),
      topPrimaryTexts: unique(topPrimaryTexts).slice(0, 12),
      topCtas,
      winningAngles,
    },
    recommendedObjective,
    recommendedTargeting: {
      ageMin: topAdSet?.targeting?.ageMin || 18,
      ageMax: topAdSet?.targeting?.ageMax || 65,
      genders: (topAdSet?.targeting?.genders || ['all']).map((g) => String(g).toLowerCase()),
      locations: (topAdSet?.targeting?.locations || ['United States']).filter(Boolean),
      interests: (topAdSet?.targeting?.interests || []).filter(Boolean).slice(0, 20),
    },
    recommendedNames: {
      campaignName: topSpendCreative?.campaignName || '',
      adSetName: topSpendCreative?.adSetName || topAdSet?.name || '',
      adName: topSpendCreative?.name || topSpendAd?.name || '',
    },
    recommendedDestinationUrl,
    recommendedUrlTags,
  };

  analysisCache.set(storeId, { at: Date.now(), data: result });
  return NextResponse.json(result);
}
