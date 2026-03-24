import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled, rest } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type CampaignEntityRow = {
  store_id: string;
  campaign_id: string;
  campaign_name: string;
  ad_account_id?: string | null;
  objective: string | null;
  status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  bid_strategy: string | null;
  start_date: string | null;
  end_date: string | null;
  meta_updated_time: string | null;
  policy_json: Record<string, unknown> | null;
  metrics_json: Record<string, unknown> | null;
  source_window_start: string | null;
  source_window_end: string | null;
  source_synced_at: string | null;
};

type AdSetEntityRow = {
  store_id: string;
  adset_id: string;
  campaign_id: string;
  adset_name: string;
  ad_account_id?: string | null;
  status: string | null;
  daily_budget: number | null;
  bid_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  meta_updated_time: string | null;
  targeting_age_min: number | null;
  targeting_age_max: number | null;
  targeting_genders: unknown[] | null;
  targeting_locations: unknown[] | null;
  targeting_interests: unknown[] | null;
  targeting_custom_audiences: unknown[] | null;
  targeting_json: Record<string, unknown> | null;
  policy_json: Record<string, unknown> | null;
  metrics_json: Record<string, unknown> | null;
  source_window_start: string | null;
  source_window_end: string | null;
  source_synced_at: string | null;
};

type AdEntityRow = {
  store_id: string;
  ad_id: string;
  adset_id: string;
  campaign_id: string;
  ad_name: string;
  ad_account_id?: string | null;
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
  policy_json: Record<string, unknown> | null;
  metrics_json: Record<string, unknown> | null;
  source_window_start: string | null;
  source_window_end: string | null;
  source_synced_at: string | null;
};

type FlatCreativeRow = {
  store_id: string;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string;
  ad_account_id?: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  ad_status: string | null;
  creative_type: string | null;
  primary_text: string | null;
  headline: string | null;
  cta_type: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  video_id: string | null;
  destination_url: string | null;
  url_tags: string | null;
  ad_metrics_json: Record<string, unknown> | null;
  source_window_start: string | null;
  source_window_end: string | null;
  source_synced_at: string | null;
};

type DailyMetricRow = {
  store_id: string;
  entity_level: 'campaign' | 'adset' | 'ad';
  entity_id: string;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  ad_account_id: string | null;
  metric_date: string;
  metrics_json: Record<string, unknown> | null;
};

type SpendDay = {
  date: string;
  spend: number;
  revenue: number;
  roas: number;
};

type TargetingSpec = {
  ageMin: number;
  ageMax: number;
  genders: Array<'male' | 'female' | 'all'>;
  locations: string[];
  interests: string[];
  customAudiences: string[];
};

const PAGE_SIZE = 1000;

function normalizeMetaAccountId(value: string): string {
  return value.replace(/^act_/, '');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function mergeMetrics(
  target: Record<string, unknown>,
  source: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const next = { ...target };
  const src = asRecord(source);
  for (const [key, value] of Object.entries(src)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = asNumber(next[key], 0) + value;
    } else if (!(key in next)) {
      next[key] = value;
    }
  }

  const spend = asNumber(next.spend, 0);
  const revenue = asNumber(next.revenue, 0);
  const clicks = asNumber(next.clicks, 0);
  const impressions = asNumber(next.impressions, 0);
  const conversions = asNumber(next.conversions, 0);

  next.roas = spend > 0 ? revenue / spend : 0;
  next.cpc = clicks > 0 ? spend / clicks : 0;
  next.cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  next.ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  next.cpa = conversions > 0 ? spend / conversions : 0;
  return next;
}

function toTargeting(row: AdSetEntityRow): TargetingSpec {
  const targeting = asRecord(row.targeting_json);
  const gendersRaw = (Array.isArray(row.targeting_genders) ? row.targeting_genders : []) as unknown[];
  const gendersNorm = gendersRaw
    .map((g) => asString(g).toLowerCase())
    .filter(Boolean);
  const genders: Array<'male' | 'female' | 'all'> =
    gendersNorm.includes('male') || gendersNorm.includes('female')
      ? [
        ...(gendersNorm.includes('male') ? (['male'] as const) : []),
        ...(gendersNorm.includes('female') ? (['female'] as const) : []),
      ]
      : ['all'];

  const ageMin = Math.max(13, asNumber(row.targeting_age_min, asNumber(targeting.ageMin, 18)));
  const ageMax = Math.max(ageMin, asNumber(row.targeting_age_max, asNumber(targeting.ageMax, 65)));

  return {
    ageMin,
    ageMax,
    genders,
    locations: asStringArray(row.targeting_locations).length > 0
      ? asStringArray(row.targeting_locations)
      : asStringArray(targeting.locations),
    interests: asStringArray(row.targeting_interests).length > 0
      ? asStringArray(row.targeting_interests)
      : asStringArray(targeting.interests),
    customAudiences: asStringArray(row.targeting_custom_audiences).length > 0
      ? asStringArray(row.targeting_custom_audiences)
      : asStringArray(targeting.customAudiences),
  };
}

async function fetchAllRows<T>(
  resource: string,
  storeId: string,
  select: string,
  extraQuery?: string
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const extra = extraQuery ? `&${extraQuery}` : '';
    const page = await rest<T[]>(
      `/${resource}?store_id=eq.${encodeURIComponent(storeId)}&select=${encodeURIComponent(select)}${extra}&limit=${PAGE_SIZE}&offset=${offset}`
    );
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

function matchAccount(
  accountFilter: Set<string> | null,
  accountId: string | null | undefined
): boolean {
  if (!accountFilter || accountFilter.size === 0) return true;
  const normalized = normalizeMetaAccountId(accountId || '');
  return normalized ? accountFilter.has(normalized) : true;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const includeAds = searchParams.get('includeAds') !== '0';
  const accountIds = searchParams.get('accountIds');
  const since = searchParams.get('since');
  const until = searchParams.get('until');
  const hasRange = !!since && !!until;

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase persistence is required' }, { status: 400 });
  }

  const accountFilter = accountIds
    ? new Set(
      accountIds
        .split(',')
        .map((id) => normalizeMetaAccountId(id.trim()))
        .filter(Boolean)
    )
    : null;

  try {
    const [campaignRowsRaw, adSetRowsRaw, adRowsRaw, flatRowsRaw, dailyRowsRaw] = await Promise.all([
      fetchAllRows<CampaignEntityRow>(
        'meta_campaign_entities',
        storeId,
        'store_id,campaign_id,campaign_name,ad_account_id,objective,status,daily_budget,lifetime_budget,bid_strategy,start_date,end_date,meta_updated_time,policy_json,metrics_json,source_window_start,source_window_end,source_synced_at'
      ),
      fetchAllRows<AdSetEntityRow>(
        'meta_adset_entities',
        storeId,
        'store_id,adset_id,campaign_id,adset_name,ad_account_id,status,daily_budget,bid_amount,start_date,end_date,meta_updated_time,targeting_age_min,targeting_age_max,targeting_genders,targeting_locations,targeting_interests,targeting_custom_audiences,targeting_json,policy_json,metrics_json,source_window_start,source_window_end,source_synced_at'
      ),
      includeAds
        ? fetchAllRows<AdEntityRow>(
          'meta_ad_entities',
          storeId,
          'store_id,ad_id,adset_id,campaign_id,ad_name,ad_account_id,status,creative_id,creative_type,primary_text,headline,cta_type,media_url,thumbnail_url,video_id,destination_url,url_tags,policy_json,metrics_json,source_window_start,source_window_end,source_synced_at'
        )
        : Promise.resolve([] as AdEntityRow[]),
      fetchAllRows<FlatCreativeRow>(
        'meta_entities_flat_v',
        storeId,
        'store_id,campaign_id,adset_id,ad_id,campaign_name,adset_name,ad_name,ad_status,creative_type,primary_text,headline,cta_type,media_url,thumbnail_url,video_id,destination_url,url_tags,ad_metrics_json,source_window_start,source_window_end,source_synced_at,ad_account_id'
      ),
      hasRange
        ? fetchAllRows<DailyMetricRow>(
          'meta_entity_daily_metrics',
          storeId,
          'store_id,entity_level,entity_id,campaign_id,adset_id,ad_id,ad_account_id,metric_date,metrics_json',
          `metric_date=gte.${encodeURIComponent(since!)}&metric_date=lte.${encodeURIComponent(until!)}&order=metric_date.asc`
        )
        : Promise.resolve([] as DailyMetricRow[]),
    ]);

    const campaignRows = campaignRowsRaw.filter((row) =>
      matchAccount(accountFilter, row.ad_account_id || '')
    );
    const adSetRows = adSetRowsRaw.filter((row) =>
      matchAccount(accountFilter, row.ad_account_id || '')
    );
    const adRows = adRowsRaw.filter((row) =>
      matchAccount(accountFilter, row.ad_account_id || '')
    );
    const flatRows = flatRowsRaw.filter((row) =>
      matchAccount(accountFilter, row.ad_account_id || '')
    );
    const dailyRows = dailyRowsRaw.filter((row) =>
      matchAccount(accountFilter, row.ad_account_id || '')
    );

    const adRowsByAdSet = new Map<string, AdEntityRow[]>();
    for (const row of adRows) {
      const list = adRowsByAdSet.get(row.adset_id) || [];
      list.push(row);
      adRowsByAdSet.set(row.adset_id, list);
    }

    const adSetsByCampaign = new Map<string, AdSetEntityRow[]>();
    for (const row of adSetRows) {
      const list = adSetsByCampaign.get(row.campaign_id) || [];
      list.push(row);
      adSetsByCampaign.set(row.campaign_id, list);
    }

    const campaignMetricsById = new Map<string, Record<string, unknown>>();
    const adsetMetricsById = new Map<string, Record<string, unknown>>();
    const adMetricsById = new Map<string, Record<string, unknown>>();
    const dailySpendByDate = new Map<string, { spend: number; revenue: number }>();

    for (const row of dailyRows) {
      const metrics = asRecord(row.metrics_json);
      if (row.entity_level === 'campaign') {
        campaignMetricsById.set(
          row.entity_id,
          mergeMetrics(campaignMetricsById.get(row.entity_id) || {}, metrics)
        );
        const day = dailySpendByDate.get(row.metric_date) || { spend: 0, revenue: 0 };
        day.spend += asNumber(metrics.spend, 0);
        day.revenue += asNumber(metrics.revenue, 0);
        dailySpendByDate.set(row.metric_date, day);
      } else if (row.entity_level === 'adset') {
        adsetMetricsById.set(
          row.entity_id,
          mergeMetrics(adsetMetricsById.get(row.entity_id) || {}, metrics)
        );
      } else if (row.entity_level === 'ad') {
        adMetricsById.set(
          row.entity_id,
          mergeMetrics(adMetricsById.get(row.entity_id) || {}, metrics)
        );
      }
    }

    const campaigns = campaignRows.map((campaign) => {
      const adSets = (adSetsByCampaign.get(campaign.campaign_id) || []).map((adSet) => {
        const ads = includeAds
          ? (adRowsByAdSet.get(adSet.adset_id) || []).map((ad) => ({
            ...(hasRange
              ? { metrics: adMetricsById.get(ad.ad_id) || asRecord(ad.metrics_json) }
              : { metrics: asRecord(ad.metrics_json) }),
            id: ad.ad_id,
            adSetId: ad.adset_id,
            name: ad.ad_name || `Ad ${ad.ad_id}`,
            status: (ad.status || 'PAUSED') as 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED',
            policyInfo: asRecord(ad.policy_json),
            creative: {
              id: ad.creative_id || ad.ad_id,
              type: ad.creative_type === 'video' || ad.creative_type === 'carousel'
                ? ad.creative_type
                : 'image',
              headline: ad.headline || '',
              body: ad.primary_text || '',
              ctaType: (ad.cta_type || 'LEARN_MORE') as 'SHOP_NOW' | 'LEARN_MORE' | 'SIGN_UP' | 'BOOK_NOW' | 'CONTACT_US' | 'DOWNLOAD' | 'GET_OFFER',
              mediaUrl: ad.media_url || '',
              thumbnailUrl: ad.thumbnail_url || '',
              videoId: ad.video_id || undefined,
              destinationUrl: ad.destination_url || undefined,
              urlTags: ad.url_tags || undefined,
            },
          }))
          : [];

        const adSetMetrics = hasRange
          ? (adsetMetricsById.get(adSet.adset_id) || asRecord(adSet.metrics_json))
          : asRecord(adSet.metrics_json);

        return {
          id: adSet.adset_id,
          campaignId: adSet.campaign_id,
          name: adSet.adset_name || `Ad Set ${adSet.adset_id}`,
          status: (adSet.status || 'PAUSED') as 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED',
          policyInfo: asRecord(adSet.policy_json),
          dailyBudget: asNumber(adSet.daily_budget, 0),
          bidAmount: adSet.bid_amount == null ? null : asNumber(adSet.bid_amount, 0),
          targeting: toTargeting(adSet),
          startDate: adSet.start_date || new Date().toISOString(),
          endDate: adSet.end_date || null,
          updatedTime: adSet.meta_updated_time || undefined,
          ads,
          metrics: adSetMetrics,
        };
      });

      const campaignMetrics = hasRange
        ? (campaignMetricsById.get(campaign.campaign_id) || asRecord(campaign.metrics_json))
        : asRecord(campaign.metrics_json);

      return {
        id: campaign.campaign_id,
        name: campaign.campaign_name || `Campaign ${campaign.campaign_id}`,
        objective: (campaign.objective || 'CONVERSIONS') as 'CONVERSIONS' | 'TRAFFIC' | 'REACH' | 'ENGAGEMENT' | 'APP_INSTALLS' | 'VIDEO_VIEWS' | 'LEAD_GENERATION' | 'BRAND_AWARENESS',
        status: (campaign.status || 'PAUSED') as 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED',
        policyInfo: asRecord(campaign.policy_json),
        dailyBudget: asNumber(campaign.daily_budget, 0),
        lifetimeBudget: campaign.lifetime_budget == null ? null : asNumber(campaign.lifetime_budget, 0),
        bidStrategy: (campaign.bid_strategy || 'LOWEST_COST') as 'LOWEST_COST' | 'COST_CAP' | 'BID_CAP' | 'MINIMUM_ROAS',
        startDate: campaign.start_date || new Date().toISOString(),
        endDate: campaign.end_date || null,
        updatedTime: campaign.meta_updated_time || undefined,
        adSets,
        metrics: campaignMetrics,
      };
    });

    const creatives = flatRows.map((row, idx) => {
      const metrics = hasRange
        ? (adMetricsById.get(row.ad_id) || asRecord(row.ad_metrics_json))
        : asRecord(row.ad_metrics_json);
      const spend = asNumber(metrics.spend, 0);
      const revenue = asNumber(metrics.revenue, 0);
      const impressions = asNumber(metrics.impressions, 0);
      const clicks = asNumber(metrics.clicks, 0);
      const conversions = asNumber(metrics.conversions, 0);
      const ctr = asNumber(metrics.ctr, impressions > 0 ? (clicks / impressions) * 100 : 0);
      const roas = asNumber(metrics.roas, spend > 0 ? revenue / spend : 0);
      const cpc = asNumber(metrics.cpc, clicks > 0 ? spend / clicks : 0);
      const cpm = asNumber(metrics.cpm, impressions > 0 ? (spend / impressions) * 1000 : 0);
      const frequency = asNumber(metrics.frequency, 0);
      const fatigueScore = Math.min(
        100,
        Math.round((frequency / 5) * 50 + (ctr < 1 ? 30 : 0) + (roas < 1 ? 20 : 0))
      );
      const normalizedType = (row.creative_type || '').toLowerCase() === 'video' ? 'Video' : 'Image';
      return {
        id: row.ad_id || `creative_${idx}`,
        name: row.ad_name || row.headline || `Creative ${idx + 1}`,
        campaignId: row.campaign_id || undefined,
        campaignName: row.campaign_name || undefined,
        adSetId: row.adset_id || undefined,
        adSetName: row.adset_name || undefined,
        headline: row.headline || '',
        primaryText: row.primary_text || '',
        type: normalizedType as 'Image' | 'Video',
        spend,
        roas,
        ctr,
        impressions,
        status: fatigueScore >= 60 ? 'Fatigue' : 'Active',
        thumbnailUrl: row.thumbnail_url || undefined,
        revenue,
        conversions,
        cpc,
        cpm,
        frequency,
        fatigueScore,
        startDate: new Date().toISOString(),
        videoDurationSec: undefined,
        metaConfiguredStatus: row.ad_status || undefined,
        metaEffectiveStatus: row.ad_status || undefined,
        metaDeliveryStatus: row.ad_status || undefined,
        dailyStats: [],
      };
    });

    const dailySpendByDay: SpendDay[] = [...dailySpendByDate.entries()]
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, totals]) => ({
        date,
        spend: totals.spend,
        revenue: totals.revenue,
        roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
      }));

    const sourceSyncedAt = [
      ...campaignRows.map((row) => row.source_synced_at || ''),
      ...adSetRows.map((row) => row.source_synced_at || ''),
      ...adRows.map((row) => row.source_synced_at || ''),
      ...flatRows.map((row) => row.source_synced_at || ''),
    ]
      .filter(Boolean)
      .sort()
      .at(-1) || null;

    const sourceWindowStart = [
      ...campaignRows.map((row) => row.source_window_start || ''),
      ...adSetRows.map((row) => row.source_window_start || ''),
      ...adRows.map((row) => row.source_window_start || ''),
      ...flatRows.map((row) => row.source_window_start || ''),
    ]
      .filter(Boolean)
      .sort()
      .at(0) || null;

    const sourceWindowEnd = [
      ...campaignRows.map((row) => row.source_window_end || ''),
      ...adSetRows.map((row) => row.source_window_end || ''),
      ...adRows.map((row) => row.source_window_end || ''),
      ...flatRows.map((row) => row.source_window_end || ''),
    ]
      .filter(Boolean)
      .sort()
      .at(-1) || null;

    return NextResponse.json({
      data: {
        campaigns,
        creatives,
        dailySpendByDay,
        sourceSyncedAt,
        sourceWindowStart,
        sourceWindowEnd,
      },
      cached: true,
      source: 'warehouse',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read warehouse audit data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
