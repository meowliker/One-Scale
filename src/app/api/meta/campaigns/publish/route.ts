import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import type { CampaignObjective, CTAType, BidStrategy } from '@/types/campaign';
import type { CampaignPublishSettings, CampaignUploadedAsset } from '@/types/campaignCreate';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const DEFAULT_META_URL_TAGS =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';

interface PublishPayload {
  objective: CampaignObjective;
  targeting: {
    ageMin: number;
    ageMax: number;
    genders: string[];
    locations: string[];
    interests: string[];
    customAudiences: string[];
  };
  budget: {
    type: 'daily' | 'lifetime';
    amount: number;
    bidStrategy: BidStrategy;
    bidAmount: number | null;
  };
  schedule: {
    startDate: string;
    endDate: string | null;
  };
  creative: {
    type: 'image' | 'video';
    headline: string;
    body: string;
    description: string;
    ctaType: CTAType;
  };
  settings: CampaignPublishSettings;
  asset: CampaignUploadedAsset;
}

function normalizeAccountNode(value: string): string {
  const node = value.trim();
  if (!node) return '';
  if (node.startsWith('act_')) return node;
  return `act_${node.replace(/^act_/, '')}`;
}

function objectiveToMeta(value: CampaignObjective): string {
  const map: Record<CampaignObjective, string> = {
    CONVERSIONS: 'OUTCOME_SALES',
    TRAFFIC: 'OUTCOME_TRAFFIC',
    REACH: 'OUTCOME_AWARENESS',
    ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
    APP_INSTALLS: 'OUTCOME_APP_PROMOTION',
    VIDEO_VIEWS: 'OUTCOME_ENGAGEMENT',
    LEAD_GENERATION: 'OUTCOME_LEADS',
    BRAND_AWARENESS: 'OUTCOME_AWARENESS',
  };
  return map[value] || 'OUTCOME_SALES';
}

function objectiveLegacy(value: CampaignObjective): string {
  const map: Record<CampaignObjective, string> = {
    CONVERSIONS: 'CONVERSIONS',
    TRAFFIC: 'TRAFFIC',
    REACH: 'REACH',
    ENGAGEMENT: 'ENGAGEMENT',
    APP_INSTALLS: 'APP_INSTALLS',
    VIDEO_VIEWS: 'VIDEO_VIEWS',
    LEAD_GENERATION: 'LEAD_GENERATION',
    BRAND_AWARENESS: 'BRAND_AWARENESS',
  };
  return map[value] || 'CONVERSIONS';
}

function optimizationGoalForObjective(value: CampaignObjective): string {
  if (value === 'CONVERSIONS' || value === 'LEAD_GENERATION') return 'OFFSITE_CONVERSIONS';
  if (value === 'TRAFFIC') return 'LINK_CLICKS';
  if (value === 'ENGAGEMENT') return 'POST_ENGAGEMENT';
  if (value === 'VIDEO_VIEWS') return 'THRUPLAY';
  if (value === 'APP_INSTALLS') return 'APP_INSTALLS';
  return 'REACH';
}

function metaBidStrategy(value: BidStrategy): string {
  if (value === 'LOWEST_COST') return 'LOWEST_COST_WITHOUT_CAP';
  if (value === 'COST_CAP') return 'COST_CAP';
  if (value === 'BID_CAP') return 'LOWEST_COST_WITH_BID_CAP';
  if (value === 'MINIMUM_ROAS') return 'LOWEST_COST_WITH_MIN_ROAS';
  return 'LOWEST_COST_WITHOUT_CAP';
}

function toCountryCode(location: string): string {
  const normalized = location.trim().toLowerCase();
  const map: Record<string, string> = {
    'united states': 'US',
    usa: 'US',
    canada: 'CA',
    'united kingdom': 'GB',
    uk: 'GB',
    australia: 'AU',
    india: 'IN',
    germany: 'DE',
    france: 'FR',
    netherlands: 'NL',
    spain: 'ES',
    italy: 'IT',
    brazil: 'BR',
    mexico: 'MX',
    japan: 'JP',
  };

  if (map[normalized]) return map[normalized];
  if (/^[a-z]{2}$/i.test(location.trim())) return location.trim().toUpperCase();
  return '';
}

async function postToMeta(
  accessToken: string,
  endpoint: string,
  body: Record<string, string>
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  params.set('access_token', accessToken);
  for (const [key, value] of Object.entries(body)) {
    params.set(key, value);
  }

  const response = await fetch(`${GRAPH_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    if (typeof parsed.error === 'object' && parsed.error) {
      const err = parsed.error as {
        message?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        fbtrace_id?: string;
        error_user_title?: string;
        error_user_msg?: string;
        error_data?: { blame_field_specs?: string[][] };
      };
      const blame = Array.isArray(err.error_data?.blame_field_specs)
        ? err.error_data?.blame_field_specs.flat().join(',')
        : '';
      const detail = [
        err.message || 'Meta API error',
        err.type ? `type=${err.type}` : '',
        typeof err.code === 'number' ? `code=${err.code}` : '',
        typeof err.error_subcode === 'number' ? `subcode=${err.error_subcode}` : '',
        err.error_user_title ? `user_title=${err.error_user_title}` : '',
        err.error_user_msg ? `user_msg=${err.error_user_msg}` : '',
        blame ? `blame=${blame}` : '',
        err.fbtrace_id ? `fbtrace=${err.fbtrace_id}` : '',
        `endpoint=${endpoint}`,
      ].filter(Boolean).join(' | ');
      throw new Error(detail);
    }
    throw new Error(`${text} | endpoint=${endpoint}`);
  }

  return parsed;
}

function buildTargeting(
  input: PublishPayload['targeting'],
  warnings: string[]
): Record<string, unknown> {
  const countries = [...new Set(input.locations.map(toCountryCode).filter(Boolean))];
  if (countries.length === 0) {
    countries.push('US');
    warnings.push('No valid location found. Defaulted targeting country to US.');
  }

  const targeting: Record<string, unknown> = {
    age_min: Math.max(13, Math.min(99, input.ageMin || 18)),
    age_max: Math.max(13, Math.min(99, input.ageMax || 65)),
    geo_locations: { countries },
  };

  const genderSet = new Set(input.genders.map((g) => g.toLowerCase()));
  const genders: number[] = [];
  if (genderSet.has('male') && !genderSet.has('female') && !genderSet.has('all')) genders.push(1);
  if (genderSet.has('female') && !genderSet.has('male') && !genderSet.has('all')) genders.push(2);
  if (genders.length > 0) targeting.genders = genders;

  const customAudienceIds = input.customAudiences
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => ({ id }));
  if (customAudienceIds.length > 0) targeting.custom_audiences = customAudienceIds;

  const interestIds = input.interests
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => /^\d+$/.test(value))
    .map((id) => ({ id }));
  const droppedInterests = input.interests.length - interestIds.length;
  if (interestIds.length > 0) {
    targeting.flexible_spec = [{ interests: interestIds }];
  } else if (droppedInterests > 0) {
    warnings.push('Interest targeting names were skipped because Meta requires interest IDs for publishing.');
  }

  return targeting;
}

function buildPromotedObject(payload: PublishPayload): Record<string, unknown> | null {
  const { objective, settings } = payload;

  if (settings.customConversionId) {
    return { custom_conversion_id: settings.customConversionId };
  }

  const needsConversionObject = objective === 'CONVERSIONS' || objective === 'LEAD_GENERATION';
  if (!needsConversionObject || !settings.pixelId) return null;

  return {
    pixel_id: settings.pixelId,
    custom_event_type: settings.conversionEvent || 'PURCHASE',
  };
}

async function resolveVideoThumbnailUrl(accessToken: string, videoId: string | undefined): Promise<string> {
  if (!videoId) return '';
  try {
    const thumb = await fetchFromMeta<{ thumbnails?: { data?: Array<{ uri?: string }> } }>(
      accessToken,
      `/${videoId}`,
      { fields: 'thumbnails' },
      12_000,
      0
    );
    return thumb.thumbnails?.data?.[0]?.uri || '';
  } catch {
    return '';
  }
}

async function buildAdCreativeObjectStory(payload: PublishPayload, accessToken: string): Promise<Record<string, unknown>> {
  const { creative, settings, asset } = payload;
  const story: Record<string, unknown> = {
    page_id: settings.pageId,
  };

  if (settings.instagramActorId) {
    story.instagram_actor_id = settings.instagramActorId;
  }

  const baseCta = {
    type: creative.ctaType,
    value: { link: settings.destinationUrl },
  };

  if (asset.mediaType === 'video') {
    const thumbnailUrl = asset.thumbnailUrl || await resolveVideoThumbnailUrl(accessToken, asset.videoId);
    if (!thumbnailUrl) {
      throw new Error('Video creative requires a thumbnail image. Re-upload the video asset and try again.');
    }
    const videoData: Record<string, unknown> = {
      video_id: asset.videoId,
      title: creative.headline,
      message: creative.body,
      call_to_action: baseCta,
      image_url: thumbnailUrl,
    };
    story.video_data = videoData;
    return story;
  }

  story.link_data = {
    message: creative.body,
    name: creative.headline,
    description: creative.description,
    link: settings.destinationUrl,
    image_hash: asset.imageHash,
    call_to_action: baseCta,
  };
  return story;
}

async function setEntityStatus(accessToken: string, id: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
  await postToMeta(accessToken, `/${id}`, { status });
}

async function deleteEntity(accessToken: string, id: string | undefined): Promise<void> {
  if (!id) return;
  try {
    const endpoint = `${GRAPH_BASE}/${id}?access_token=${encodeURIComponent(accessToken)}`;
    await fetch(endpoint, { method: 'DELETE' });
  } catch {
    // Best-effort rollback only.
  }
}

async function createCampaignWithFallback(
  accessToken: string,
  accountNode: string,
  payload: PublishPayload,
  warnings: string[]
): Promise<Record<string, unknown>> {
  const objectiveCandidates = [...new Set([objectiveToMeta(payload.objective), objectiveLegacy(payload.objective)])];
  const specialCategoryCandidates: string[] = ['[]', '["NONE"]'];
  const statusModes: Array<'status' | 'configured_status'> = ['status', 'configured_status'];
  const buyingTypeModes: Array<boolean> = [false, true];
  const errors: string[] = [];

  for (const objective of objectiveCandidates) {
    for (const statusMode of statusModes) {
      for (const specialAdCategories of specialCategoryCandidates) {
        for (const includeBuyingType of buyingTypeModes) {
          try {
            const campaignBody: Record<string, string> = {
              name: payload.settings.campaignName,
              objective,
              is_adset_budget_sharing_enabled: 'false',
            };
            campaignBody[statusMode] = 'PAUSED';
            campaignBody.special_ad_categories = specialAdCategories;
            if (includeBuyingType) {
              campaignBody.buying_type = 'AUCTION';
            }

            const created = await postToMeta(accessToken, `/${accountNode}/campaigns`, campaignBody);
            if (objective !== objectiveToMeta(payload.objective)) {
              warnings.push(`Campaign objective fallback applied (${objective}).`);
            }
            if (statusMode !== 'status') {
              warnings.push('Campaign status field fallback applied (configured_status).');
            }
            if (specialAdCategories !== '[]') {
              warnings.push('Campaign special_ad_categories fallback applied (["NONE"]).');
            }
            if (includeBuyingType) {
              warnings.push('Campaign buying_type fallback applied (AUCTION).');
            }
            return created;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(
              `${objective}/${statusMode}/${specialAdCategories}/${includeBuyingType ? 'buying_type' : 'no_buying_type'}: ${message}`
            );
          }
        }
      }
    }
  }

  throw new Error(errors[errors.length - 1] || 'Failed to create campaign');
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  const partial: Partial<{ campaignId: string; adSetId: string; creativeId: string; adId: string }> = {};

  try {
    const payload = await request.json() as PublishPayload;
    const warnings: string[] = [];

    if (!payload.objective) {
      return NextResponse.json({ error: 'objective is required' }, { status: 400 });
    }
    if (!payload.settings?.accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }
    if (!payload.settings?.pageId) {
      return NextResponse.json({ error: 'Facebook Page is required for ad publishing' }, { status: 400 });
    }
    if (!payload.settings?.destinationUrl) {
      return NextResponse.json({ error: 'Destination URL is required' }, { status: 400 });
    }
    try {
      // Validate URL format early before hitting Meta API.
      new URL(payload.settings.destinationUrl);
    } catch {
      return NextResponse.json({ error: 'Destination URL must be a valid URL' }, { status: 400 });
    }
    if (!payload.asset) {
      return NextResponse.json({ error: 'Uploaded creative asset is required' }, { status: 400 });
    }
    if (payload.asset.mediaType === 'image' && !payload.asset.imageHash) {
      return NextResponse.json({ error: 'Image asset must include imageHash' }, { status: 400 });
    }
    if (payload.asset.mediaType === 'video' && !payload.asset.videoId) {
      return NextResponse.json({ error: 'Video asset must include videoId' }, { status: 400 });
    }

    const accountNode = normalizeAccountNode(payload.settings.accountId);
    const optimizationGoal = optimizationGoalForObjective(payload.objective);
    const targeting = buildTargeting(payload.targeting, warnings);
    const promotedObject = buildPromotedObject(payload);
    const startDate = new Date(`${payload.schedule.startDate}T00:00:00`);
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
    }

    const campaignRes = await createCampaignWithFallback(token.accessToken, accountNode, payload, warnings);
    partial.campaignId = String(campaignRes.id || '');

    if (!partial.campaignId) {
      throw new Error('Meta campaign creation did not return an ID');
    }

    const adSetBody: Record<string, string> = {
      name: payload.settings.adSetName,
      campaign_id: partial.campaignId,
      status: 'PAUSED',
      billing_event: 'IMPRESSIONS',
      optimization_goal: optimizationGoal,
      targeting: JSON.stringify(targeting),
      start_time: startDate.toISOString(),
    };

    if (payload.schedule.endDate) {
      const endDate = new Date(`${payload.schedule.endDate}T23:59:59`);
      if (Number.isNaN(endDate.getTime())) {
        return NextResponse.json({ error: 'Invalid end date' }, { status: 400 });
      }
      adSetBody.end_time = endDate.toISOString();
    }

    const budgetCents = Math.max(1, Math.round(payload.budget.amount * 100));
    if (payload.budget.type === 'daily') adSetBody.daily_budget = String(budgetCents);
    else adSetBody.lifetime_budget = String(budgetCents);

    const bidStrategy = metaBidStrategy(payload.budget.bidStrategy);
    adSetBody.bid_strategy = bidStrategy;
    if (payload.budget.bidStrategy === 'MINIMUM_ROAS') {
      warnings.push('Minimum ROAS bid strategy created without explicit floor constraints.');
    }

    if (typeof payload.budget.bidAmount === 'number' && payload.budget.bidAmount > 0) {
      adSetBody.bid_amount = String(Math.round(payload.budget.bidAmount * 100));
    }

    if (promotedObject) {
      adSetBody.promoted_object = JSON.stringify(promotedObject);
    }

    const adSetRes = await postToMeta(token.accessToken, `/${accountNode}/adsets`, adSetBody);
    partial.adSetId = String(adSetRes.id || '');
    if (!partial.adSetId) {
      throw new Error('Meta ad set creation did not return an ID');
    }

    const objectStorySpec = await buildAdCreativeObjectStory(payload, token.accessToken);
    const creativeRes = await postToMeta(token.accessToken, `/${accountNode}/adcreatives`, {
      name: `${payload.settings.adName} Creative`,
      object_story_spec: JSON.stringify(objectStorySpec),
      url_tags: (payload.settings.urlTags || '').trim() || DEFAULT_META_URL_TAGS,
    });
    partial.creativeId = String(creativeRes.id || '');

    if (!partial.creativeId) {
      throw new Error('Meta ad creative creation did not return an ID');
    }

    const adRes = await postToMeta(token.accessToken, `/${accountNode}/ads`, {
      name: payload.settings.adName,
      adset_id: partial.adSetId,
      status: 'PAUSED',
      creative: JSON.stringify({ creative_id: partial.creativeId }),
    });
    partial.adId = String(adRes.id || '');

    if (!partial.adId) {
      throw new Error('Meta ad creation did not return an ID');
    }

    if (payload.settings.publishNow) {
      await setEntityStatus(token.accessToken, partial.campaignId, 'ACTIVE');
      await setEntityStatus(token.accessToken, partial.adSetId, 'ACTIVE');
      await setEntityStatus(token.accessToken, partial.adId, 'ACTIVE');
    }

    return NextResponse.json({
      success: true,
      status: payload.settings.publishNow ? 'ACTIVE' : 'PAUSED',
      created: {
        campaignId: partial.campaignId,
        adSetId: partial.adSetId,
        creativeId: partial.creativeId,
        adId: partial.adId,
      },
      warnings,
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'Failed to publish campaign';
    const isDevModeRestriction = rawMessage.includes('subcode=1885183');
    const message = isDevModeRestriction
      ? 'Meta blocked this in Development mode for the connected token. Reconnect Meta with an Admin/Developer/Tester account for this app, then retry.'
      : rawMessage;
    // Roll back partial entities so retries do not leave orphan test records.
    if (partial.adId) await deleteEntity(token.accessToken, partial.adId);
    if (partial.adSetId) await deleteEntity(token.accessToken, partial.adSetId);
    if (partial.campaignId) await deleteEntity(token.accessToken, partial.campaignId);
    return NextResponse.json({ error: message, partial, devModeRestricted: isDevModeRestriction }, { status: 500 });
  }
}
