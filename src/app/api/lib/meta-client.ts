import type {
  Campaign,
  AdSet,
  Ad,
  PerformanceMetrics,
  CampaignObjective,
  EntityStatus,
  BidStrategy,
} from '@/types/campaign';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

// ------ Concurrency Limiter ------
// Meta API rate limits: ~200 calls/hour per token.
// More importantly, too many simultaneous TCP connections overloads Node.
const MAX_CONCURRENT = 5;
let activeRequests = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    queue.push(() => {
      activeRequests++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeRequests--;
  if (queue.length > 0) {
    const next = queue.shift()!;
    next();
  }
}

interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  currency: string;
  timezone_name: string;
  account_status: number;
}

// ------ Rate Limit Error (exported for route handlers) ------

export class MetaRateLimitError extends Error {
  constructor(endpoint: string) {
    super(`Meta API rate limited on ${endpoint} — try again in a minute`);
    this.name = 'MetaRateLimitError';
  }
}

// ------ Generic Fetch with Rate-Limit Retry ------

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 2000; // 2 seconds — keep retries fast, fail early if still limited

function isRateLimitError(status: number, body: string): boolean {
  // Meta rate limit: error code 17, subcode 2446079, or HTTP 429
  if (status === 429) return true;
  if (status === 400 || status === 403) {
    return (
      body.includes('"code":17') ||
      body.includes('"code": 17') ||
      body.includes('Too Many') ||
      body.includes('User request limit reached') ||
      body.includes('too many api calls') ||
      body.includes('2446079')
    );
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchFromMeta<T>(
  token: string,
  endpoint: string,
  params: Record<string, string> = {},
  timeoutMs: number = 15000,
  maxRetriesOverride?: number
): Promise<T> {
  let lastError: Error | null = null;
  const retries = typeof maxRetriesOverride === 'number' ? Math.max(0, maxRetriesOverride) : MAX_RETRIES;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // On retries, wait with exponential backoff BEFORE acquiring a slot
    if (attempt > 0) {
      const backoffMs = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 2s, 4s (max ~6s total)
      console.log(`[Meta] Rate limit retry ${attempt}/${retries} for ${endpoint} — waiting ${backoffMs}ms`);
      await delay(backoffMs);
    }

    await acquireSlot();
    try {
      const url = new URL(`${META_GRAPH_URL}${endpoint}`);
      url.searchParams.set('access_token', token);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url.toString(), { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();

          // Check for rate limit error — retry with backoff or throw specific error
          if (isRateLimitError(response.status, errorBody)) {
            if (attempt < retries) {
              lastError = new Error(`Meta API rate limit (${response.status}): ${errorBody}`);
              console.warn(`[Meta] Rate limited on ${endpoint} (attempt ${attempt + 1}/${retries + 1})`);
              continue; // will retry after backoff at top of loop
            }
            // Last attempt — throw specific rate limit error for route handlers to detect
            console.error(`[Meta] Rate limit exhausted for ${endpoint} after ${retries + 1} attempts`);
            throw new MetaRateLimitError(endpoint);
          }

          throw new Error(`Meta API error (${response.status}): ${errorBody}`);
        }

        return response.json() as Promise<T>;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error(`Meta API timeout (${timeoutMs}ms) for ${endpoint}`);
        }
        // If this is a rate limit error we set via continue, it was already handled
        // For other errors, don't retry
        throw err;
      }
    } finally {
      releaseSlot();
    }
  }

  // If we exhausted all retries — throw a specific rate limit error so routes can return 429
  throw new MetaRateLimitError(endpoint);
}

export async function fetchFromMetaBatched<T>(
  token: string,
  requests: Array<{ endpoint: string; params?: Record<string, string> }>,
  concurrency: number = 5,
  timeoutMs: number = 15000
): Promise<T[]> {
  // Process requests in chunks — each individual call still goes through
  // the global concurrency limiter inside fetchFromMeta, but chunking here
  // prevents queueing hundreds of promises at once.
  const results: T[] = [];
  for (let i = 0; i < requests.length; i += concurrency) {
    const batch = requests.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(req =>
        fetchFromMeta<T>(token, req.endpoint, req.params || {}, timeoutMs)
      )
    );
    results.push(...batchResults);
  }
  return results;
}

// ------ Mappers ------

function mapObjective(metaObjective: string): CampaignObjective {
  const map: Record<string, CampaignObjective> = {
    OUTCOME_SALES: 'CONVERSIONS',
    OUTCOME_LEADS: 'LEAD_GENERATION',
    OUTCOME_ENGAGEMENT: 'ENGAGEMENT',
    OUTCOME_AWARENESS: 'BRAND_AWARENESS',
    OUTCOME_TRAFFIC: 'TRAFFIC',
    OUTCOME_APP_PROMOTION: 'APP_INSTALLS',
    CONVERSIONS: 'CONVERSIONS',
    LEAD_GENERATION: 'LEAD_GENERATION',
    ENGAGEMENT: 'ENGAGEMENT',
    BRAND_AWARENESS: 'BRAND_AWARENESS',
    REACH: 'REACH',
    TRAFFIC: 'TRAFFIC',
    APP_INSTALLS: 'APP_INSTALLS',
    VIDEO_VIEWS: 'VIDEO_VIEWS',
  };
  return map[metaObjective] || 'CONVERSIONS';
}

function mapStatus(metaStatus: string): EntityStatus {
  const map: Record<string, EntityStatus> = {
    ACTIVE: 'ACTIVE',
    PAUSED: 'PAUSED',
    DELETED: 'DELETED',
    ARCHIVED: 'ARCHIVED',
  };
  return map[metaStatus] || 'PAUSED';
}

function mapBidStrategy(metaStrategy: string): BidStrategy {
  const map: Record<string, BidStrategy> = {
    LOWEST_COST_WITHOUT_CAP: 'LOWEST_COST',
    LOWEST_COST_WITH_BID_CAP: 'BID_CAP',
    COST_CAP: 'COST_CAP',
    LOWEST_COST_WITH_MIN_ROAS: 'MINIMUM_ROAS',
  };
  return map[metaStrategy] || 'LOWEST_COST';
}

// Quality ranking string → numeric score mapping
function mapRankingToScore(ranking: string | undefined): number {
  if (!ranking) return 0;
  const map: Record<string, number> = {
    ABOVE_AVERAGE: 1,
    AVERAGE: 2,
    BELOW_AVERAGE_10: 5,
    BELOW_AVERAGE_20: 4,
    BELOW_AVERAGE_35: 3,
  };
  return map[ranking] || 0;
}

export function mapInsightsToMetrics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insights: Record<string, any>
): PerformanceMetrics {
  const spend = parseFloat(insights.spend || '0');
  const impressions = parseInt(insights.impressions || '0', 10);
  const reach = parseInt(insights.reach || '0', 10);
  const clicks = parseInt(insights.clicks || '0', 10);

  // --- Action type mappings for the actions array (counts) ---
  // IMPORTANT: Meta returns DUPLICATE data under different action_type names
  // e.g. "purchase" and "offsite_conversion.fb_pixel_purchase" are the SAME purchases.
  // We use a priority system: prefer the "offsite_conversion.fb_pixel_*" variant
  // (most specific), and only fall back to the generic name if the pixel variant is absent.
  //
  // Priority groups: for each metric, list action types from HIGHEST to LOWEST priority.
  // We take only the FIRST match found for each metric key.
  const actionPriorityMap: Array<{ actionTypes: string[]; metricKey: keyof PerformanceMetrics }> = [
    // Purchases / Conversions — prefer pixel, fall back to generic
    { actionTypes: ['offsite_conversion.fb_pixel_purchase', 'purchase'], metricKey: 'conversions' },
    // Add to Cart
    { actionTypes: ['offsite_conversion.fb_pixel_add_to_cart', 'add_to_cart'], metricKey: 'addToCart' },
    // Initiate Checkout
    { actionTypes: ['offsite_conversion.fb_pixel_initiate_checkout', 'initiate_checkout'], metricKey: 'initiateCheckout' },
    // Leads
    { actionTypes: ['offsite_conversion.fb_pixel_lead', 'lead'], metricKey: 'leads' },
    // Link clicks (only one variant)
    { actionTypes: ['link_click'], metricKey: 'linkClicks' },
    // Video views (only one variant)
    { actionTypes: ['video_view'], metricKey: 'videoViews' },
    // Post engagement — prefer post_engagement over page_engagement (page_engagement includes more)
    { actionTypes: ['post_engagement'], metricKey: 'postEngagement' },
    { actionTypes: ['post_reaction'], metricKey: 'postReactions' },
    { actionTypes: ['comment'], metricKey: 'postComments' },
    { actionTypes: ['post'], metricKey: 'postShares' },
    { actionTypes: ['like'], metricKey: 'pageLikes' },
    // Landing page views
    { actionTypes: ['landing_page_view'], metricKey: 'landingPageViews' },
  ];

  // --- Action value priority (monetary) ---
  const actionValuePriorityMap: Array<{ actionTypes: string[]; metricKey: keyof PerformanceMetrics }> = [
    { actionTypes: ['offsite_conversion.fb_pixel_purchase', 'purchase'], metricKey: 'revenue' },
    { actionTypes: ['offsite_conversion.fb_pixel_add_to_cart', 'add_to_cart'], metricKey: 'addToCartValue' },
  ];

  // Build lookup from action_type → value for quick access
  const actionsLookup: Record<string, number> = {};
  if (insights.actions) {
    for (const action of insights.actions) {
      actionsLookup[action.action_type] = parseInt(action.value || '0', 10);
    }
  }

  const actionValuesLookup: Record<string, number> = {};
  if (insights.action_values) {
    for (const action of insights.action_values) {
      actionValuesLookup[action.action_type] = parseFloat(action.value || '0');
    }
  }

  // Resolve each metric using priority (first match wins, no double-counting)
  const metricAccum: Partial<Record<keyof PerformanceMetrics, number>> = {};

  for (const { actionTypes, metricKey } of actionPriorityMap) {
    for (const actionType of actionTypes) {
      if (actionType in actionsLookup) {
        metricAccum[metricKey] = actionsLookup[actionType];
        break; // take first match only — no double-counting
      }
    }
  }

  for (const { actionTypes, metricKey } of actionValuePriorityMap) {
    for (const actionType of actionTypes) {
      if (actionType in actionValuesLookup) {
        metricAccum[metricKey] = actionValuesLookup[actionType];
        break; // take first match only — no double-counting
      }
    }
  }

  // Extract accumulated values with defaults
  const conversions = metricAccum.conversions || 0;
  const revenue = metricAccum.revenue || 0;
  const addToCart = metricAccum.addToCart || 0;
  const addToCartValue = metricAccum.addToCartValue || 0;
  const initiateCheckout = metricAccum.initiateCheckout || 0;
  const leads = metricAccum.leads || 0;
  const linkClicks = metricAccum.linkClicks || 0;
  const videoViews = metricAccum.videoViews || 0;
  const postEngagement = metricAccum.postEngagement || 0;
  const postReactions = metricAccum.postReactions || 0;
  const postComments = metricAccum.postComments || 0;
  const postShares = metricAccum.postShares || 0;
  const pageLikes = metricAccum.pageLikes || 0;
  const landingPageViews = metricAccum.landingPageViews || 0;

  // Extract video thru-play count from video_thruplay_actions array
  let videoThruPlays = 0;
  if (insights.video_thruplay_actions) {
    for (const action of insights.video_thruplay_actions) {
      videoThruPlays += parseInt(action.value || '0', 10);
    }
  }

  // Extract video average percent watched
  let videoAvgPctWatched = 0;
  if (insights.video_avg_time_watched_actions) {
    // video_avg_time_watched_actions provides avg seconds; approximate pct from first entry
    for (const action of insights.video_avg_time_watched_actions) {
      videoAvgPctWatched = parseFloat(action.value || '0');
      break; // take first entry
    }
  } else if (insights.video_avg_percent_watched_actions) {
    for (const action of insights.video_avg_percent_watched_actions) {
      videoAvgPctWatched = parseFloat(action.value || '0');
      break;
    }
  }

  // Extract unique_clicks and unique_ctr from raw insights if available
  const uniqueClicks = insights.unique_clicks
    ? parseInt(insights.unique_clicks, 10)
    : Math.round(clicks * 0.85); // estimate if not available
  const uniqueCTR = insights.unique_ctr
    ? parseFloat(insights.unique_ctr)
    : reach > 0
      ? (uniqueClicks / reach) * 100
      : 0;

  // Quality rankings
  const qualityRanking = mapRankingToScore(insights.quality_ranking);
  const engagementRateRanking = mapRankingToScore(insights.engagement_rate_ranking);
  const conversionRateRanking = mapRankingToScore(insights.conversion_rate_ranking);

  // Derived metrics
  const roas = spend > 0 ? revenue / spend : 0;
  const aov = conversions > 0 ? revenue / conversions : 0;
  const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
  const cpa = conversions > 0 ? spend / conversions : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const frequency = reach > 0 ? impressions / reach : 0;
  const costPerLead = leads > 0 ? spend / leads : 0;
  const linkCTR = impressions > 0 ? (linkClicks / impressions) * 100 : 0;
  const costPerLinkClick = linkClicks > 0 ? spend / linkClicks : 0;
  const costPerLandingPageView = landingPageViews > 0 ? spend / landingPageViews : 0;
  const costPerThruPlay = videoThruPlays > 0 ? spend / videoThruPlays : 0;

  return {
    spend,
    revenue,
    roas,
    ctr,
    cpc,
    cpm,
    impressions,
    reach,
    clicks,
    conversions,
    aov,
    frequency,
    cvr,
    cpa,
    // Aliases
    results: conversions,
    costPerResult: cpa,
    purchases: conversions,
    purchaseValue: revenue,
    appPixelResults: 0,
    appPixelPurchases: 0,
    appPixelPurchaseValue: 0,
    appPixelRoas: 0,
    appPixelCpa: 0,
    // Action-based metrics
    addToCart,
    addToCartValue,
    initiateCheckout,
    leads,
    costPerLead,
    linkClicks,
    linkCTR,
    costPerLinkClick,
    postEngagement,
    postReactions,
    postComments,
    postShares,
    pageLikes,
    videoViews,
    videoThruPlays,
    videoAvgPctWatched,
    costPerThruPlay,
    // Quality rankings
    qualityRanking,
    engagementRateRanking,
    conversionRateRanking,
    // Unique metrics
    uniqueClicks,
    uniqueCTR,
    landingPageViews,
    costPerLandingPageView,
  };
}

// ------ Fetchers ------

export async function fetchMetaAdAccounts(
  token: string
): Promise<{ id: string; name: string; accountId: string; currency: string; timezone: string }[]> {
  const data = await fetchFromMeta<{ data: MetaAdAccount[] }>(token, '/me/adaccounts', {
    fields: 'id,name,account_id,currency,timezone_name,account_status',
    limit: '100',
  });

  return data.data
    .filter((acc) => acc.account_status === 1) // only active accounts
    .map((acc) => ({
      id: acc.id,
      name: acc.name,
      accountId: acc.account_id,
      currency: acc.currency,
      timezone: acc.timezone_name,
    }));
}

/**
 * Fetch all campaigns for an account using a SINGLE account-level insights call
 * instead of N individual per-campaign calls. This drastically reduces API calls
 * (1 call instead of N) and avoids rate limiting.
 */
export async function fetchMetaCampaigns(
  token: string,
  accountId: string,
  dateRange?: { since: string; until: string },
  options?: { disableDateFallback?: boolean }
): Promise<Campaign[]> {
  const fields = [
    'id', 'name', 'objective', 'status', 'daily_budget', 'lifetime_budget',
    'bid_strategy', 'start_time', 'stop_time', 'effective_status', 'configured_status', 'issues_info', 'ad_review_feedback',
  ].join(',');

  const data = await fetchFromMeta<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, any>[];
  }>(token, `/${accountId}/campaigns`, {
    fields,
    limit: '100',
  });

  // --- OPTIMIZED: Single account-level insights call with level=campaign ---
  // Instead of N individual calls (one per campaign), make ONE call that returns
  // insights for ALL campaigns at once. This is the key fix for rate limiting.
  const insightsFields = 'campaign_id,campaign_name,spend,impressions,reach,clicks,actions,action_values,ctr,cpc,cpm,unique_clicks,unique_ctr,quality_ranking,engagement_rate_ranking,conversion_rate_ranking';
  const insightsParams: Record<string, string> = {
    fields: insightsFields,
    level: 'campaign',
    limit: '500',
    ...(dateRange
      ? { time_range: JSON.stringify(dateRange) }
      : { date_preset: 'last_30d' }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insightsMap = new Map<string, Record<string, any>>();

  try {
    const insightsResponse = await fetchFromMeta<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: Record<string, any>[];
      paging?: { next?: string };
    }>(token, `/${accountId}/insights`, insightsParams);

    // Build map from campaign_id to insights row
    if (insightsResponse.data) {
      for (const row of insightsResponse.data) {
        if (row.campaign_id) {
          insightsMap.set(row.campaign_id, row);
        }
      }
    }

    // Follow pagination if needed (rare for <500 campaigns)
    let nextUrl = insightsResponse.paging?.next;
    while (nextUrl) {
      try {
        const nextResponse = await fetch(nextUrl);
        if (!nextResponse.ok) break;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nextData = await nextResponse.json() as { data: Record<string, any>[]; paging?: { next?: string } };
        if (nextData.data) {
          for (const row of nextData.data) {
            if (row.campaign_id) {
              insightsMap.set(row.campaign_id, row);
            }
          }
        }
        nextUrl = nextData.paging?.next;
      } catch {
        break;
      }
    }

    console.log(`[Meta] Account-level campaign insights: ${insightsMap.size}/${data.data.length} campaigns have data (1 API call)`);
  } catch (err) {
    console.error('[Meta] Account-level campaign insights failed:', err instanceof Error ? err.message : err);
  }

  // Fallback: if dateRange was used and we got NO insights, retry with date_preset
  if (dateRange && !options?.disableDateFallback && insightsMap.size === 0 && data.data.length > 0) {
    console.log('[Meta] Account-level campaign insights empty with time_range, retrying with date_preset: last_30d');
    const fallbackParams: Record<string, string> = {
      fields: insightsFields,
      level: 'campaign',
      limit: '500',
      date_preset: 'last_30d',
    };
    try {
      const fallbackResponse = await fetchFromMeta<{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: Record<string, any>[];
      }>(token, `/${accountId}/insights`, fallbackParams);

      if (fallbackResponse.data) {
        for (const row of fallbackResponse.data) {
          if (row.campaign_id) {
            insightsMap.set(row.campaign_id, row);
          }
        }
      }
      console.log(`[Meta] Account-level campaign fallback insights: ${insightsMap.size}/${data.data.length} campaigns have data`);
    } catch (err) {
      console.error('[Meta] Account-level campaign fallback insights failed:', err instanceof Error ? err.message : err);
    }
  }

  const campaigns: Campaign[] = data.data.map((raw) => {
    const insightsRow = insightsMap.get(raw.id);
    const metrics = insightsRow
      ? mapInsightsToMetrics(insightsRow)
      : getEmptyMetrics();

    return {
      id: raw.id,
      name: raw.name,
      objective: mapObjective(raw.objective || ''),
      status: mapStatus(raw.status || ''),
      policyInfo: {
        effectiveStatus: raw.effective_status || undefined,
        configuredStatus: raw.configured_status || undefined,
        reviewFeedback: mapReviewFeedback(raw.ad_review_feedback),
        issuesInfo: mapIssuesInfo(raw.issues_info),
      },
      dailyBudget: raw.daily_budget ? parseInt(raw.daily_budget, 10) / 100 : 0,
      lifetimeBudget: raw.lifetime_budget ? parseInt(raw.lifetime_budget, 10) / 100 : null,
      bidStrategy: mapBidStrategy(raw.bid_strategy || ''),
      startDate: raw.start_time || new Date().toISOString(),
      endDate: raw.stop_time || null,
      adSets: [],
      metrics,
    };
  });

  return campaigns;
}

/**
 * Fetch all ad sets for a campaign using a SINGLE campaign-level insights call
 * with level=adset instead of N individual per-adset calls.
 * This reduces API calls from N+1 to just 2 (list + insights).
 */
export async function fetchMetaAdSets(
  token: string,
  campaignId: string,
  dateRange?: { since: string; until: string },
  options?: { disableDateFallback?: boolean; preferLightweight?: boolean; basicOnly?: boolean }
): Promise<AdSet[]> {
  const fields = options?.basicOnly
    ? [
        'id', 'name', 'status', 'daily_budget', 'bid_amount',
        'effective_status', 'configured_status', 'issues_info', 'ad_review_feedback',
      ].join(',')
    : [
        'id', 'name', 'status', 'daily_budget', 'bid_amount',
        'targeting', 'start_time', 'end_time', 'effective_status', 'configured_status', 'issues_info', 'ad_review_feedback',
      ].join(',');

  const listTimeoutMs = options?.preferLightweight ? 7000 : 15000;
  const listRetries = options?.preferLightweight ? 0 : undefined;
  const data = await fetchFromMeta<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, any>[];
  }>(token, `/${campaignId}/adsets`, {
    fields,
    limit: '100',
  }, listTimeoutMs, listRetries);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insightsMap = new Map<string, Record<string, any>>();
  if (!options?.basicOnly) {
    // --- OPTIMIZED: Single campaign-level insights call with level=adset ---
    const insightsFields = 'adset_id,adset_name,spend,impressions,reach,clicks,actions,action_values,ctr,cpc,cpm,unique_clicks,unique_ctr,quality_ranking,engagement_rate_ranking,conversion_rate_ranking';
    const insightsParams: Record<string, string> = {
      fields: insightsFields,
      level: 'adset',
      limit: '500',
      ...(dateRange
        ? { time_range: JSON.stringify(dateRange) }
        : { date_preset: 'last_30d' }),
    };

    try {
      const insightsResponse = await fetchFromMeta<{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: Record<string, any>[];
      }>(token, `/${campaignId}/insights`, insightsParams);

      if (insightsResponse.data) {
        for (const row of insightsResponse.data) {
          if (row.adset_id) {
            insightsMap.set(row.adset_id, row);
          }
        }
      }
      console.log(`[Meta] Campaign-level adset insights: ${insightsMap.size}/${data.data.length} adsets have data (1 API call)`);
    } catch (err) {
      console.error('[Meta] Campaign-level adset insights failed:', err instanceof Error ? err.message : err);
    }

    // Fallback: if dateRange was used and we got NO insights, retry with date_preset
    if (dateRange && !options?.disableDateFallback && insightsMap.size === 0 && data.data.length > 0) {
      console.log('[Meta] Campaign-level adset insights empty with time_range, retrying with date_preset: last_30d');
      try {
        const fallbackResponse = await fetchFromMeta<{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: Record<string, any>[];
        }>(token, `/${campaignId}/insights`, {
          fields: insightsFields,
          level: 'adset',
          limit: '500',
          date_preset: 'last_30d',
        });
        if (fallbackResponse.data) {
          for (const row of fallbackResponse.data) {
            if (row.adset_id) {
              insightsMap.set(row.adset_id, row);
            }
          }
        }
        console.log(`[Meta] Campaign-level adset fallback insights: ${insightsMap.size}/${data.data.length} adsets have data`);
      } catch (err) {
        console.error('[Meta] Campaign-level adset fallback insights failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  const adSets: AdSet[] = data.data.map((raw) => {
    const insightsRow = insightsMap.get(raw.id);
    const metrics = insightsRow
      ? mapInsightsToMetrics(insightsRow)
      : getEmptyMetrics();

    const targeting = raw.targeting || {};
    return {
      id: raw.id,
      campaignId,
      name: raw.name,
      status: mapStatus(raw.status || ''),
      policyInfo: {
        effectiveStatus: raw.effective_status || undefined,
        configuredStatus: raw.configured_status || undefined,
        reviewFeedback: mapReviewFeedback(raw.ad_review_feedback),
        issuesInfo: mapIssuesInfo(raw.issues_info),
      },
      dailyBudget: raw.daily_budget ? parseInt(raw.daily_budget, 10) / 100 : 0,
      bidAmount: raw.bid_amount ? parseInt(raw.bid_amount, 10) / 100 : null,
      targeting: {
        ageMin: targeting.age_min || 18,
        ageMax: targeting.age_max || 65,
        genders: targeting.genders?.map((g: number) =>
          g === 1 ? 'male' : g === 2 ? 'female' : 'all'
        ) || ['all'],
        locations: targeting.geo_locations?.countries || [],
        interests: targeting.flexible_spec?.[0]?.interests?.map(
          (i: { name: string }) => i.name
        ) || [],
        customAudiences: targeting.custom_audiences?.map(
          (a: { id: string }) => a.id
        ) || [],
      },
      startDate: raw.start_time || new Date().toISOString(),
      endDate: raw.end_time || null,
      ads: [],
      metrics,
    };
  });

  return adSets;
}

/**
 * Fetch all ads for an ad set using a SINGLE adset-level insights call
 * with level=ad instead of N individual per-ad calls.
 * This reduces API calls from N+1+video to just 2+video (list + insights + video thumbnails).
 */
export async function fetchMetaAds(
  token: string,
  adSetId: string,
  dateRange?: { since: string; until: string },
  options?: { disableDateFallback?: boolean; preferLightweight?: boolean; basicOnly?: boolean }
): Promise<Ad[]> {
  function extractDestinationUrl(creative: Record<string, unknown>): string {
    const story = (creative.object_story_spec && typeof creative.object_story_spec === 'object')
      ? creative.object_story_spec as Record<string, unknown>
      : null;
    if (!story) return '';

    const linkData = (story.link_data && typeof story.link_data === 'object')
      ? story.link_data as Record<string, unknown>
      : null;
    const videoData = (story.video_data && typeof story.video_data === 'object')
      ? story.video_data as Record<string, unknown>
      : null;
    const link = typeof linkData?.link === 'string'
      ? linkData.link
      : (
        (videoData?.call_to_action && typeof videoData.call_to_action === 'object')
          ? ((videoData.call_to_action as Record<string, unknown>).value as Record<string, unknown> | undefined)
          : undefined
      )?.link;
    return typeof link === 'string' ? link : '';
  }

  const fields = options?.basicOnly
    ? [
        'id', 'name', 'status', 'effective_status', 'configured_status', 'ad_review_feedback', 'issues_info',
        'creative{id,title,call_to_action_type,image_url,thumbnail_url,video_id,object_story_spec,url_tags}',
      ].join(',')
    : [
        'id', 'name', 'status', 'effective_status', 'configured_status', 'ad_review_feedback', 'issues_info',
        'creative{id,title,body,call_to_action_type,image_url,thumbnail_url,video_id,object_story_spec,url_tags}',
      ].join(',');

  const listTimeoutMs = options?.preferLightweight ? 7000 : 15000;
  const listRetries = options?.preferLightweight ? 0 : undefined;
  const data = await fetchFromMeta<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, any>[];
  }>(token, `/${adSetId}/ads`, {
    fields,
    limit: '100',
  }, listTimeoutMs, listRetries);

  // Basic-only mode: skip insights + thumbnail expansion to minimize API calls.
  if (options?.basicOnly) {
    return data.data.map((raw) => {
      const creative = raw.creative || {};
      const isVideo = !!creative.video_id;
      return {
        id: raw.id,
        adSetId,
        name: raw.name,
        status: mapStatus(raw.status || ''),
        policyInfo: {
          effectiveStatus: raw.effective_status || undefined,
          configuredStatus: raw.configured_status || undefined,
          reviewFeedback: mapReviewFeedback(raw.ad_review_feedback),
          issuesInfo: mapIssuesInfo(raw.issues_info),
        },
        creative: {
          id: creative.id || raw.id,
          type: isVideo ? 'video' : 'image',
          headline: creative.title || '',
          body: '',
          ctaType: mapCtaType(creative.call_to_action_type || ''),
          mediaUrl: isVideo ? '' : (creative.image_url || ''),
          thumbnailUrl: creative.thumbnail_url || creative.image_url || '',
          videoId: isVideo ? creative.video_id : undefined,
          destinationUrl: extractDestinationUrl(creative),
          urlTags: typeof creative.url_tags === 'string' ? creative.url_tags : undefined,
        },
        metrics: getEmptyMetrics(),
      };
    });
  }

  // --- OPTIMIZED: Single adset-level insights call with level=ad ---
  const insightsFields = 'ad_id,ad_name,spend,impressions,reach,clicks,actions,action_values,ctr,cpc,cpm,unique_clicks,unique_ctr,quality_ranking,engagement_rate_ranking,conversion_rate_ranking';
  const insightsParams: Record<string, string> = {
    fields: insightsFields,
    level: 'ad',
    limit: '500',
    ...(dateRange
      ? { time_range: JSON.stringify(dateRange) }
      : { date_preset: 'last_30d' }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insightsMap = new Map<string, Record<string, any>>();

  // Fetch insights + video thumbnails in parallel
  const insightsPromise = fetchFromMeta<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, any>[];
  }>(token, `/${adSetId}/insights`, insightsParams).catch((err) => {
    console.error('[Meta] AdSet-level ad insights failed:', err instanceof Error ? err.message : err);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: [] as Record<string, any>[] };
  });

  // Fetch video thumbnails in parallel for all video ads
  const videoThumbnailPromises = data.data.map((raw) => {
    const creative = raw.creative || {};
    if (creative.video_id && !creative.thumbnail_url) {
      return fetchFromMeta<{
        thumbnails?: { data?: { uri: string }[] };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
      }>(token, `/${creative.video_id}`, { fields: 'thumbnails' }).catch(() => null);
    }
    return Promise.resolve(null);
  });

  const [insightsResponse, allVideoData] = await Promise.all([
    insightsPromise,
    Promise.all(videoThumbnailPromises),
  ]);

  if (insightsResponse.data) {
    for (const row of insightsResponse.data) {
      if (row.ad_id) {
        insightsMap.set(row.ad_id, row);
      }
    }
  }
  console.log(`[Meta] AdSet-level ad insights: ${insightsMap.size}/${data.data.length} ads have data (1 API call)`);

  // Fallback: if dateRange was used and we got NO insights, retry with date_preset
  if (dateRange && !options?.disableDateFallback && insightsMap.size === 0 && data.data.length > 0) {
    console.log('[Meta] AdSet-level ad insights empty with time_range, retrying with date_preset: last_30d');
    try {
      const fallbackResponse = await fetchFromMeta<{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: Record<string, any>[];
      }>(token, `/${adSetId}/insights`, {
        fields: insightsFields,
        level: 'ad',
        limit: '500',
        date_preset: 'last_30d',
      });
      if (fallbackResponse.data) {
        for (const row of fallbackResponse.data) {
          if (row.ad_id) {
            insightsMap.set(row.ad_id, row);
          }
        }
      }
      console.log(`[Meta] AdSet-level ad fallback insights: ${insightsMap.size}/${data.data.length} ads have data`);
    } catch (err) {
      console.error('[Meta] AdSet-level ad fallback insights failed:', err instanceof Error ? err.message : err);
    }
  }

  const ads: Ad[] = data.data.map((raw, i) => {
    const insightsRow = insightsMap.get(raw.id);
    const metrics = insightsRow
      ? mapInsightsToMetrics(insightsRow)
      : getEmptyMetrics();

    const creative = raw.creative || {};
    const isVideo = !!creative.video_id;
    let videoThumbnailUrl = creative.thumbnail_url || '';

    // Use pre-fetched video thumbnail
    const videoData = allVideoData[i];
    if (isVideo && !videoThumbnailUrl && videoData?.thumbnails?.data?.[0]?.uri) {
      videoThumbnailUrl = videoData.thumbnails.data[0].uri;
    }

    return {
      id: raw.id,
      adSetId,
      name: raw.name,
      status: mapStatus(raw.status || ''),
      policyInfo: {
        effectiveStatus: raw.effective_status || undefined,
        configuredStatus: raw.configured_status || undefined,
        reviewFeedback: mapReviewFeedback(raw.ad_review_feedback),
        issuesInfo: mapIssuesInfo(raw.issues_info),
      },
      creative: {
        id: creative.id || raw.id,
        type: isVideo ? 'video' : 'image',
        headline: creative.title || '',
        body: creative.body || '',
        ctaType: mapCtaType(creative.call_to_action_type || ''),
        mediaUrl: isVideo ? '' : (creative.image_url || ''),
        thumbnailUrl: isVideo
          ? (videoThumbnailUrl || creative.image_url || '')
          : (creative.thumbnail_url || creative.image_url || ''),
        videoId: isVideo ? creative.video_id : undefined,
        destinationUrl: extractDestinationUrl(creative),
        urlTags: typeof creative.url_tags === 'string' ? creative.url_tags : undefined,
      },
      metrics,
    };
  });

  return ads;
}

export async function fetchMetaInsights(
  token: string,
  objectId: string,
  datePreset: string = 'last_30d'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>[]> {
  const data = await fetchFromMeta<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, any>[];
  }>(token, `/${objectId}/insights`, {
    fields: 'spend,impressions,reach,clicks,actions,action_values,ctr,cpc,cpm,unique_clicks,unique_ctr,quality_ranking,engagement_rate_ranking,conversion_rate_ranking,date_start,date_stop',
    date_preset: datePreset,
    time_increment: '1',
  });

  return data.data || [];
}

/**
 * Fetch hourly insights from Meta API using the hourly breakdown.
 * Returns data with hourly_stats_aggregated_by_advertiser_time_zone field.
 */
export async function fetchMetaHourlyInsights(
  token: string,
  objectId: string,
  datePreset: string = 'last_30d'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>[]> {
  const data = await fetchFromMeta<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, any>[];
    paging?: { cursors: { after: string }; next?: string };
  }>(token, `/${objectId}/insights`, {
    fields: 'spend,impressions,reach,clicks,actions,action_values,ctr,cpc,cpm,unique_clicks,unique_ctr,date_start,date_stop',
    date_preset: datePreset,
    time_increment: '1',
    breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
    limit: '500',
  });

  return data.data || [];
}

// ------ Helpers ------

function mapCtaType(metaCta: string): Ad['creative']['ctaType'] {
  const map: Record<string, Ad['creative']['ctaType']> = {
    SHOP_NOW: 'SHOP_NOW',
    LEARN_MORE: 'LEARN_MORE',
    SIGN_UP: 'SIGN_UP',
    BOOK_NOW: 'BOOK_NOW',
    CONTACT_US: 'CONTACT_US',
    DOWNLOAD: 'DOWNLOAD',
    GET_OFFER: 'GET_OFFER',
  };
  return map[metaCta] || 'LEARN_MORE';
}

function getEmptyMetrics(): PerformanceMetrics {
  return {
    spend: 0, revenue: 0, roas: 0, ctr: 0, cpc: 0, cpm: 0,
    impressions: 0, reach: 0, clicks: 0, conversions: 0,
    aov: 0, frequency: 0, cvr: 0, cpa: 0,
    results: 0, costPerResult: 0, purchases: 0, purchaseValue: 0,
    appPixelResults: 0, appPixelPurchases: 0, appPixelPurchaseValue: 0, appPixelRoas: 0, appPixelCpa: 0,
    addToCart: 0, addToCartValue: 0, initiateCheckout: 0,
    leads: 0, costPerLead: 0,
    linkClicks: 0, linkCTR: 0, costPerLinkClick: 0,
    postEngagement: 0, postReactions: 0, postComments: 0,
    postShares: 0, pageLikes: 0,
    videoViews: 0, videoThruPlays: 0, videoAvgPctWatched: 0, costPerThruPlay: 0,
    qualityRanking: 0, engagementRateRanking: 0, conversionRateRanking: 0,
    uniqueClicks: 0, uniqueCTR: 0, landingPageViews: 0, costPerLandingPageView: 0,
  };
}

function mapReviewFeedback(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function mapIssuesInfo(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.map((v) => {
      if (typeof v === 'string') return v;
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    });
  }
  if (typeof value === 'string') return [value];
  try {
    return [JSON.stringify(value)];
  } catch {
    return [String(value)];
  }
}
