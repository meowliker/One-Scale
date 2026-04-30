import { NextRequest, NextResponse } from 'next/server';
import { addDays } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import {
  getProductProfile,
  createCreativeTest,
  updateCreativeTestStatus,
  updateCreativeTestItem,
  getCreativeTest,
} from '@/app/api/lib/creative-hub-db';
import { getDb } from '@/app/api/lib/db';
import { validateLaunchPlanAssignments } from '@/lib/creative-hub/launchPlanValidation';
import { getStoreTimezoneFromConfig } from '@/lib/onboarding/stages/detectStoreConfig';
import type { InboxCreative, LaunchConfig, TargetingSpec } from '@/types/creativeHub';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const DEFAULT_META_URL_TAGS =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';

// ── Helpers ──

function normalizeAccountNode(value: string): string {
  const node = value.trim();
  if (!node) return '';
  if (node.startsWith('act_')) return node;
  return `act_${node.replace(/^act_/, '')}`;
}

function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function resolveStartTime(config: LaunchConfig, timezone: string): string {
  if (config.launchTime === 'scheduled' && config.scheduledDate) {
    return fromZonedTime(
      `${config.scheduledDate}T${config.scheduledTime || '00:00'}:00`,
      timezone,
    ).toISOString();
  }
  return new Date().toISOString();
}

function resolveEndTime(config: LaunchConfig, timezone: string): string | undefined {
  if (config.endDate) {
    return fromZonedTime(`${config.endDate}T23:59:59`, timezone).toISOString();
  }

  if (!(config.testDuration > 0)) {
    return undefined;
  }

  return addDays(new Date(resolveStartTime(config, timezone)), config.testDuration).toISOString();
}

function resolveScheduledLaunchDate(config: LaunchConfig, timezone: string): Date | null {
  if (config.launchTime !== 'scheduled' || !config.scheduledDate) {
    return null;
  }

  try {
    const scheduled = fromZonedTime(
      `${config.scheduledDate}T${config.scheduledTime || '00:00'}:00`,
      timezone,
    );
    if (Number.isNaN(scheduled.getTime())) {
      return null;
    }
    return scheduled;
  } catch {
    return null;
  }
}

function bidStrategyRequiresBidAmount(strategy: string): boolean {
  return (
    strategy === 'LOWEST_COST_WITH_BID_CAP' ||
    strategy === 'BID_CAP' ||
    strategy === 'COST_CAP' ||
    strategy === 'TARGET_COST'
  );
}

function normalizeBidStrategy(strategyInput: string | undefined): string {
  const value = (strategyInput || '').trim().toUpperCase();
  if (!value) return 'LOWEST_COST_WITHOUT_CAP';
  if (value === 'BID_CAP') return 'LOWEST_COST_WITH_BID_CAP';
  if (value === 'MINIMUM_ROAS') return 'LOWEST_COST_WITH_MIN_ROAS';
  if (value === 'TARGET_COST') return 'COST_CAP';
  if (value === 'LOWEST_COST') return 'LOWEST_COST_WITHOUT_CAP';
  return value;
}

function toPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function estimateBidAmountFromDailyBudget(dailyBudgetInput?: number | null): number | undefined {
  const dailyBudget = toPositiveNumber(dailyBudgetInput);
  if (!dailyBudget) {
    return undefined;
  }
  // Meta frequently expects bid caps/cost caps to be a fraction of the ad set budget.
  // 20% with a floor keeps retries deterministic and avoids zero-value caps.
  return Math.max(0.5, dailyBudget * 0.2);
}

function toBidAmountCents(amountInput?: number): number | undefined {
  const amount = toPositiveNumber(amountInput);
  if (!amount) {
    return undefined;
  }
  return Math.max(1, Math.round(amount * 100));
}

function resolveAdsetBidConfig(
  strategyInput: string | undefined,
  bidAmountInput?: number | null,
  dailyBudgetInput?: number | null,
): { bidStrategy: string; bidAmountCents?: number } {
  const strategy = normalizeBidStrategy(strategyInput);
  const explicitBidAmount = toPositiveNumber(bidAmountInput);
  const fallbackBidAmount = estimateBidAmountFromDailyBudget(dailyBudgetInput);

  if (!bidStrategyRequiresBidAmount(strategy)) {
    return { bidStrategy: strategy };
  }

  const resolvedBidAmount = explicitBidAmount ?? fallbackBidAmount;
  const bidAmountCents = toBidAmountCents(resolvedBidAmount);

  if (!bidAmountCents) {
    return { bidStrategy: 'LOWEST_COST_WITHOUT_CAP' };
  }

  return {
    bidStrategy: strategy,
    bidAmountCents,
  };
}

function isBidAmountRequiredMetaError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('subcode=1815857') ||
    lower.includes('bid amount required') ||
    lower.includes('lowest_cost_with_bid_cap') ||
    lower.includes('target cost')
  );
}

function isInvalidInstagramActorMetaError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('instagram_actor_id') &&
    (lower.includes('valid instagram account id') || lower.includes('invalid parameter'))
  );
}

function isVideoThumbnailRequiredMetaError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('subcode=1443226') ||
    lower.includes('needs a video thumbnail') ||
    lower.includes('image_hash or image_url in the video_data field')
  );
}

function isValidHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function removeInstagramActorFromCreativeBody(
  creativeBody: Record<string, string>,
): Record<string, string> | null {
  if (!creativeBody.object_story_spec) {
    return null;
  }

  try {
    const parsed = JSON.parse(creativeBody.object_story_spec) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || !('instagram_actor_id' in parsed)) {
      return null;
    }

    const sanitizedSpec = { ...parsed };
    delete sanitizedSpec.instagram_actor_id;

    return {
      ...creativeBody,
      object_story_spec: JSON.stringify(sanitizedSpec),
    };
  } catch {
    return null;
  }
}

async function uploadAdImageFromUrl(
  accessToken: string,
  accountNode: string,
  sourceUrl: string,
): Promise<string | null> {
  if (!isValidHttpUrl(sourceUrl)) {
    return null;
  }

  let imageBuffer: ArrayBuffer;
  let contentType = 'image/jpeg';
  try {
    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) {
      return null;
    }
    imageBuffer = await imageResponse.arrayBuffer();
    contentType = imageResponse.headers.get('content-type') || contentType;
    if (!contentType.startsWith('image/')) {
      contentType = 'image/jpeg';
    }
  } catch {
    return null;
  }

  try {
    const form = new FormData();
    form.append('access_token', accessToken);
    form.append('source', new Blob([imageBuffer], { type: contentType }), 'video-thumb.jpg');

    const response = await fetch(`${GRAPH_BASE}/${accountNode}/adimages`, {
      method: 'POST',
      body: form,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return null;
    }

    const images = payload.images;
    if (!images || typeof images !== 'object') {
      return null;
    }

    const firstImage = Object.values(images as Record<string, unknown>)[0] as
      | Record<string, unknown>
      | undefined;
    const hash = asString(firstImage?.hash);
    return hash || null;
  } catch {
    return null;
  }
}

async function addVideoThumbnailToCreativeBody(
  accessToken: string,
  accountNode: string,
  creativeBody: Record<string, string>,
  preferredThumbnailUrl?: string,
): Promise<Record<string, string> | null> {
  if (!creativeBody.object_story_spec) {
    return null;
  }

  try {
    const parsed = JSON.parse(creativeBody.object_story_spec) as Record<string, unknown>;
    const videoData =
      parsed && typeof parsed === 'object'
        ? ((parsed.video_data as Record<string, unknown> | undefined) ?? undefined)
        : undefined;

    if (!videoData || typeof videoData !== 'object') {
      return null;
    }

    if (asString(videoData.image_url) || asString(videoData.image_hash)) {
      return null;
    }

    const videoId = asString(videoData.video_id);
    const thumbnailCandidates: string[] = [];

    const preferred = asString(preferredThumbnailUrl);
    if (preferred && isValidHttpUrl(preferred)) {
      thumbnailCandidates.push(preferred);
    }

    if (videoId) {
      try {
        const videoMeta = await fetchFromMeta<Record<string, unknown>>(
          accessToken,
          `/${videoId}`,
          { fields: 'picture,thumbnails{uri}' },
          10000,
          1,
        );
        const thumbnails = Array.isArray(videoMeta.thumbnails)
          ? (videoMeta.thumbnails as Array<Record<string, unknown>>)
          : [];
        for (const thumb of thumbnails) {
          const uri = asString(thumb?.uri);
          if (uri && isValidHttpUrl(uri)) {
            thumbnailCandidates.push(uri);
          }
        }
        const picture = asString(videoMeta.picture);
        if (picture && isValidHttpUrl(picture)) {
          thumbnailCandidates.push(picture);
        }
      } catch {
        // Best effort only.
      }
    }

    const uniqueCandidates = Array.from(new Set(thumbnailCandidates));
    if (uniqueCandidates.length === 0) {
      return null;
    }

    for (const candidateUrl of uniqueCandidates) {
      const uploadedHash = await uploadAdImageFromUrl(accessToken, accountNode, candidateUrl);
      if (uploadedHash) {
        const updatedVideoData = {
          ...videoData,
          image_hash: uploadedHash,
        };
        delete (updatedVideoData as Record<string, unknown>).image_url;

        const updatedStorySpec = {
          ...parsed,
          video_data: updatedVideoData,
        };

        return {
          ...creativeBody,
          object_story_spec: JSON.stringify(updatedStorySpec),
        };
      }
    }

    const fallbackUrl = uniqueCandidates[0];
    const updatedVideoData = {
      ...videoData,
      image_url: fallbackUrl,
    };
    const updatedStorySpec = {
      ...parsed,
      video_data: updatedVideoData,
    };

    return {
      ...creativeBody,
      object_story_spec: JSON.stringify(updatedStorySpec),
    };
  } catch {
    return null;
  }
}

async function createAdCreativeWithFallback(
  accessToken: string,
  accountNode: string,
  creativeBody: Record<string, string>,
  preferredThumbnailUrl?: string,
): Promise<Record<string, unknown>> {
  const attemptErrors: string[] = [];

  try {
    return await postToMeta(accessToken, `/${accountNode}/adcreatives`, creativeBody);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const message = error.message || 'Meta adcreative creation failed';
    attemptErrors.push(`attempt_1:${message}`);

    let workingBody = creativeBody;

    if (isInvalidInstagramActorMetaError(message)) {
      const withoutInstagramActor = removeInstagramActorFromCreativeBody(workingBody);
      if (withoutInstagramActor) {
        workingBody = withoutInstagramActor;
        try {
          return await postToMeta(accessToken, `/${accountNode}/adcreatives`, workingBody);
        } catch (fallbackErr) {
          const fallbackMessage =
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          attemptErrors.push(`attempt_2_without_instagram_actor:${fallbackMessage}`);
          if (!isVideoThumbnailRequiredMetaError(fallbackMessage)) {
            throw new Error(attemptErrors.join(' || '));
          }
        }
      }
    }

    if (isVideoThumbnailRequiredMetaError(message) || attemptErrors.some((entry) => isVideoThumbnailRequiredMetaError(entry))) {
      const withThumbnail = await addVideoThumbnailToCreativeBody(
        accessToken,
        accountNode,
        workingBody,
        preferredThumbnailUrl,
      );
      if (withThumbnail) {
        try {
          return await postToMeta(accessToken, `/${accountNode}/adcreatives`, withThumbnail);
        } catch (thumbnailErr) {
          const thumbnailMessage =
            thumbnailErr instanceof Error ? thumbnailErr.message : String(thumbnailErr);
          attemptErrors.push(`attempt_3_with_video_thumbnail:${thumbnailMessage}`);
          throw new Error(attemptErrors.join(' || '));
        }
      }
    }

    if (attemptErrors.length > 0) {
      throw new Error(attemptErrors.join(' || '));
    }
    throw error;
  }
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

async function createAdsetWithFallback(
  accessToken: string,
  accountNode: string,
  adsetBody: Record<string, string>,
  fallbackBidAmountCents?: number,
): Promise<Record<string, unknown>> {
  const normalizedStrategy = normalizeBidStrategy(adsetBody.bid_strategy);
  const baseCandidate: Record<string, string> = { ...adsetBody, bid_strategy: normalizedStrategy };
  const candidates: Array<Record<string, string>> = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: Record<string, string>) => {
    const key = `${candidate.bid_strategy || '__none__'}|${candidate.bid_amount || '__none__'}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  if (!bidStrategyRequiresBidAmount(normalizedStrategy)) {
    delete baseCandidate.bid_amount;
  } else if (
    (!baseCandidate.bid_amount ||
      !Number.isFinite(Number(baseCandidate.bid_amount)) ||
      Number(baseCandidate.bid_amount) <= 0) &&
    fallbackBidAmountCents
  ) {
    baseCandidate.bid_amount = String(fallbackBidAmountCents);
  }

  pushCandidate(baseCandidate);

  if (fallbackBidAmountCents) {
    pushCandidate({
      ...adsetBody,
      bid_strategy: 'LOWEST_COST_WITH_BID_CAP',
      bid_amount: String(fallbackBidAmountCents),
    });
    pushCandidate({
      ...adsetBody,
      bid_strategy: 'COST_CAP',
      bid_amount: String(fallbackBidAmountCents),
    });
  }

  const lowestCostCandidate: Record<string, string> = {
    ...adsetBody,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
  };
  delete lowestCostCandidate.bid_amount;
  pushCandidate(lowestCostCandidate);

  const noBidFieldsCandidate: Record<string, string> = { ...adsetBody };
  delete noBidFieldsCandidate.bid_strategy;
  delete noBidFieldsCandidate.bid_amount;
  pushCandidate(noBidFieldsCandidate);

  let lastError: Error | null = null;
  const errors: string[] = [];

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    try {
      return await postToMeta(accessToken, `/${accountNode}/adsets`, candidate);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const message = error.message || 'unknown';
      lastError = error;
      errors.push(`attempt_${index + 1}:${message}`);

      // Continue through all candidate payloads to maximize recovery chance.
      if (!isBidAmountRequiredMetaError(message)) continue;
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(' || '));
  }
  throw lastError || new Error('Meta adset creation failed');
}

async function createCampaignWithFallback(
  accessToken: string,
  accountNode: string,
  campaignName: string,
  structure: 'ABO' | 'CBO',
  dailyBudget: number,
): Promise<Record<string, unknown>> {
  // Keep launch-center campaign creation on ODAX objectives only.
  const objectiveCandidates = ['OUTCOME_SALES'];
  const statusModes: Array<'status' | 'configured_status'> = ['status', 'configured_status'];
  const specialCategoryCandidates = ['[]', '["NONE"]'];
  const buyingTypeModes: Array<boolean> = [false, true];
  const adsetBudgetSharingModes: Array<'false' | 'true' | 'omit'> =
    structure === 'ABO' ? ['false', 'true', 'omit'] : ['omit', 'false', 'true'];
  const errors: string[] = [];

  for (const objective of objectiveCandidates) {
    for (const statusMode of statusModes) {
      for (const specialAdCategories of specialCategoryCandidates) {
        for (const includeBuyingType of buyingTypeModes) {
          for (const adsetBudgetSharingMode of adsetBudgetSharingModes) {
            try {
              const campaignBody: Record<string, string> = {
                name: campaignName,
                objective,
                special_ad_categories: specialAdCategories,
              };

              // Create campaign in paused state first; ads/adsets carry desired launch status.
              campaignBody[statusMode] = 'PAUSED';

              if (structure === 'CBO') {
                const budgetCents = Math.round(dailyBudget * 100);
                campaignBody.daily_budget = String(budgetCents);
              }

              if (adsetBudgetSharingMode === 'false') {
                campaignBody.is_adset_budget_sharing_enabled = 'false';
              } else if (adsetBudgetSharingMode === 'true') {
                campaignBody.is_adset_budget_sharing_enabled = 'true';
              }

              if (includeBuyingType) {
                campaignBody.buying_type = 'AUCTION';
              }

              return await postToMeta(accessToken, `/${accountNode}/campaigns`, campaignBody);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              errors.push(
                `${objective}/${statusMode}/${specialAdCategories}/${
                  includeBuyingType ? 'buying_type' : 'no_buying_type'
                }/adset_budget_sharing_${adsetBudgetSharingMode}: ${message}`,
              );
            }
          }
        }
      }
    }
  }

  throw new Error(errors[errors.length - 1] || 'Failed to create campaign');
}

async function cleanupCampaignOnFailure(
  accessToken: string,
  campaignId: string,
): Promise<'deleted' | 'paused'> {
  const deleteResponse = await fetch(`${GRAPH_BASE}/${campaignId}?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'DELETE',
  });
  if (deleteResponse.ok) {
    return 'deleted';
  }

  await postToMeta(accessToken, `/${campaignId}`, { status: 'PAUSED' });
  return 'paused';
}

function buildTargetingPayload(targeting?: TargetingSpec): Record<string, unknown> {
  if (!targeting) {
    return {
      geo_locations: { countries: ['US'] },
      age_min: 18,
      age_max: 65,
    };
  }

  const result: Record<string, unknown> = {};

  if (targeting.ageMin) result.age_min = Math.max(13, Math.min(99, targeting.ageMin));
  if (targeting.ageMax) result.age_max = Math.max(13, Math.min(99, targeting.ageMax));
  if (targeting.genders && targeting.genders.length > 0) result.genders = targeting.genders;

  if (targeting.geoLocations) {
    const geo: Record<string, unknown> = {};
    if (targeting.geoLocations.countries?.length) geo.countries = targeting.geoLocations.countries;
    if (targeting.geoLocations.regions?.length) geo.regions = targeting.geoLocations.regions;
    if (targeting.geoLocations.cities?.length) geo.cities = targeting.geoLocations.cities;
    result.geo_locations = Object.keys(geo).length > 0 ? geo : { countries: ['US'] };
  } else {
    result.geo_locations = { countries: ['US'] };
  }

  if (targeting.customAudiences?.length) result.custom_audiences = targeting.customAudiences;
  if (targeting.excludedCustomAudiences?.length) result.excluded_custom_audiences = targeting.excludedCustomAudiences;
  if (targeting.flexibleSpec?.length) result.flexible_spec = targeting.flexibleSpec;
  if (targeting.publisherPlatforms?.length) result.publisher_platforms = targeting.publisherPlatforms;
  if (targeting.facebookPositions?.length) result.facebook_positions = targeting.facebookPositions;
  if (targeting.instagramPositions?.length) result.instagram_positions = targeting.instagramPositions;
  if (targeting.targetingAutomation) result.targeting_automation = targeting.targetingAutomation;

  return result;
}

function buildAssetFeedSpec(
  config: LaunchConfig,
  profile: { pageId?: string; instagramActorId?: string; destinationUrl?: string },
  creativeUrl?: string
): Record<string, unknown> {
  const destinationUrl = creativeUrl || config.destinationUrl || profile.destinationUrl || '';

  const spec: Record<string, unknown> = {};

  // Bodies (primary texts)
  if (config.primaryTexts.length > 0) {
    spec.bodies = config.primaryTexts.map((pt) => ({ text: pt.text }));
  }

  // Titles (headlines)
  if (config.headlines.length > 0) {
    spec.titles = config.headlines.map((hl) => ({ text: hl.text }));
  }

  // Descriptions
  if (config.descriptions.length > 0) {
    spec.descriptions = config.descriptions.map((d) => ({ text: d.text }));
  }

  // Link URLs
  if (destinationUrl) {
    spec.link_urls = [{ website_url: destinationUrl }];
  }

  // CTA
  if (config.ctaType) {
    spec.call_to_action_types = [config.ctaType];
  }

  // Advantage+ creative optimization
  if (config.advantageCreative) {
    spec.optimization_type = 'DEGREES_OF_FREEDOM';
  }

  return spec;
}

function buildObjectStorySpec(
  config: LaunchConfig,
  profile: { pageId?: string; instagramActorId?: string; destinationUrl?: string },
  assetId: string,
  assetType: string,
  creativeUrl?: string
): Record<string, unknown> {
  const destinationUrl = creativeUrl || config.destinationUrl || profile.destinationUrl || '';
  const pageId = config.pageId || profile.pageId;
  const instagramActorId = config.instagramActorId || profile.instagramActorId;

  const story: Record<string, unknown> = { page_id: pageId };
  if (instagramActorId) story.instagram_actor_id = instagramActorId;

  const primaryText = config.primaryTexts[0]?.text || '';
  const headline = config.headlines[0]?.text || '';
  const description = config.descriptions[0]?.text || '';

  const cta = config.ctaType
    ? { type: config.ctaType, value: { link: destinationUrl } }
    : undefined;

  if (assetType === 'VIDEO' || assetType === 'video') {
    const videoData: Record<string, unknown> = {
      video_id: assetId,
      title: headline,
      message: primaryText,
    };
    if (cta) videoData.call_to_action = cta;
    story.video_data = videoData;
  } else {
    const linkData: Record<string, unknown> = {
      message: primaryText,
      name: headline,
      description,
      link: destinationUrl,
      image_hash: assetId,
    };
    if (cta) linkData.call_to_action = cta;
    story.link_data = linkData;
  }

  return story;
}

interface CreativeTestItemRow {
  id: string;
  sourceCreativeId?: string | null;
  creative_name: string;
  creative_format: string | null;
  meta_asset_id: string | null;
  meta_asset_type: string | null;
  clickup_task_id: string | null;
  clickup_task_name: string | null;
  hook: string | null;
  angle: string | null;
  drive_url: string | null;
  thumbnail_url: string | null;
  upload_status: string;
}

function mapSnapshotToLaunchItem(snapshot: InboxCreative): CreativeTestItemRow {
  return {
    id: generateId(),
    sourceCreativeId: snapshot.id,
    creative_name: snapshot.creativeName,
    creative_format: snapshot.creativeFormat,
    meta_asset_id: snapshot.metaAssetId ?? null,
    meta_asset_type: snapshot.metaAssetType ?? null,
    clickup_task_id: snapshot.clickupTaskId,
    clickup_task_name: snapshot.clickupTaskName,
    hook: snapshot.hook ?? null,
    angle: snapshot.angle ?? null,
    drive_url: snapshot.driveDownloadUrl || snapshot.driveContentUrl || snapshot.driveUrl || null,
    thumbnail_url: snapshot.thumbnailUrl ?? null,
    upload_status:
      snapshot.uploadStatus === 'ready' || !!snapshot.metaAssetId
        ? 'ready'
        : snapshot.driveUrl
          ? 'pending'
          : (snapshot.uploadStatus || 'no_link'),
  };
}

/**
 * POST /api/creative-hub/launch/execute
 *
 * Executes launch immediately on Meta, or stores a scheduled launch plan for later execution.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { launchConfig: LaunchConfig; storeId: string };
    const { launchConfig, storeId } = body;

    if (!launchConfig || !storeId) {
      return NextResponse.json({ error: 'launchConfig and storeId are required' }, { status: 400 });
    }

    const token = await getMetaToken(storeId);
    if (!token) {
      return NextResponse.json(
        {
          error:
            'Meta token is missing or expired for this store. Please reconnect Meta in Settings → Integrations and try again.',
        },
        { status: 401 },
      );
    }
    const storeTimezone = await getStoreTimezoneFromConfig(storeId);

    const profile = await getProductProfile(launchConfig.productProfileId);
    if (!profile) {
      return NextResponse.json({ error: 'Product profile not found' }, { status: 404 });
    }

    const accountId = launchConfig.adAccountId || profile.adAccountId;
    const accountNode = normalizeAccountNode(accountId);
    let resolvedPageId = launchConfig.pageId || profile.pageId || '';
    let resolvedInstagramActorId = launchConfig.instagramActorId || profile.instagramActorId || '';

    // Backward-compatible fallback: if profile/campaign mapping doesn't carry page_id,
    // derive it from the connected Meta account so launch is still possible.
    if (!resolvedPageId) {
      try {
        const promotedPages = await fetchFromMeta<{ data?: Array<Record<string, unknown>> }>(
          token.accessToken,
          `/${accountNode}/promote_pages`,
          { fields: 'id,instagram_business_account{id}', limit: '10' },
          10000,
          1,
        );
        const firstPage = promotedPages.data?.[0];
        const fallbackPageId = asString(firstPage?.id);
        const fallbackInstagramActorId = asString(
          (firstPage?.instagram_business_account as Record<string, unknown> | undefined)?.id,
        );
        if (fallbackPageId) {
          resolvedPageId = fallbackPageId;
        }
        if (!resolvedInstagramActorId && fallbackInstagramActorId) {
          resolvedInstagramActorId = fallbackInstagramActorId;
        }
      } catch {
        // Best effort fallback only.
      }
    }

    if (!resolvedPageId) {
      try {
        const userPages = await fetchFromMeta<{ data?: Array<Record<string, unknown>> }>(
          token.accessToken,
          '/me/accounts',
          { fields: 'id,instagram_business_account{id}', limit: '10' },
          10000,
          1,
        );
        const firstPage = userPages.data?.[0];
        const fallbackPageId = asString(firstPage?.id);
        const fallbackInstagramActorId = asString(
          (firstPage?.instagram_business_account as Record<string, unknown> | undefined)?.id,
        );
        if (fallbackPageId) {
          resolvedPageId = fallbackPageId;
        }
        if (!resolvedInstagramActorId && fallbackInstagramActorId) {
          resolvedInstagramActorId = fallbackInstagramActorId;
        }
      } catch {
        // Best effort fallback only.
      }
    }

    if (!resolvedPageId) {
      return NextResponse.json(
        {
          error:
            'Facebook Page ID is required. Please map a Page in Product Profile or reconnect Meta.',
        },
        { status: 400 },
      );
    }

    if (resolvedInstagramActorId) {
      try {
        const pageMeta = await fetchFromMeta<Record<string, unknown>>(
          token.accessToken,
          `/${resolvedPageId}`,
          { fields: 'instagram_business_account{id}' },
          10000,
          1,
        );
        const linkedInstagramActorId = asString(
          (pageMeta.instagram_business_account as Record<string, unknown> | undefined)?.id,
        );
        if (!linkedInstagramActorId || linkedInstagramActorId !== resolvedInstagramActorId) {
          resolvedInstagramActorId = '';
        }
      } catch {
        // If validation fails, avoid passing an invalid actor id.
        resolvedInstagramActorId = '';
      }
    }

    const launchProfileContext = {
      pageId: resolvedPageId || undefined,
      instagramActorId: resolvedInstagramActorId || undefined,
      destinationUrl: profile.destinationUrl,
    };

    // Fetch selected creative items from DB
    const db = getDb();
    const sourceItems = launchConfig.selectedCreativeIds.length > 0
      ? db.prepare(
          `SELECT * FROM creative_test_items
           WHERE id IN (${launchConfig.selectedCreativeIds.map(() => '?').join(',')})`
        ).all(...launchConfig.selectedCreativeIds) as CreativeTestItemRow[]
      : [];

    const selectedItems = sourceItems.length > 0
      ? sourceItems.map((item) => ({
          ...item,
          id: generateId(),
          sourceCreativeId: item.id,
        }))
      : (launchConfig.selectedCreativeSnapshots || []).map(mapSnapshotToLaunchItem);

    if (selectedItems.length === 0) {
      return NextResponse.json({ error: 'No valid creative items found' }, { status: 400 });
    }

    if (launchConfig.campaignMode === 'existing' && !launchConfig.existingCampaignId) {
      return NextResponse.json(
        { error: 'Select the existing campaign before launching.' },
        { status: 400 },
      );
    }

    if (launchConfig.campaignMode === 'new' && !launchConfig.newCampaignName?.trim()) {
      return NextResponse.json(
        { error: 'Campaign name is required for new campaigns.' },
        { status: 400 },
      );
    }

    const planValidation = validateLaunchPlanAssignments(launchConfig);
    if (launchConfig.adsetMode === 'existing_adsets' && planValidation.lanes.length === 0) {
      return NextResponse.json(
        { error: 'Assign creatives to at least one existing ad set before launching.' },
        { status: 400 },
      );
    }

    if (
      planValidation.duplicateIds.length > 0 ||
      planValidation.missingIds.length > 0 ||
      planValidation.unknownIds.length > 0
    ) {
      const details = [
        planValidation.duplicateIds.length > 0
          ? `${planValidation.duplicateIds.length} creative${planValidation.duplicateIds.length === 1 ? '' : 's'} assigned more than once`
          : null,
        planValidation.missingIds.length > 0
          ? `${planValidation.missingIds.length} creative${planValidation.missingIds.length === 1 ? '' : 's'} missing from the lane plan`
          : null,
        planValidation.unknownIds.length > 0
          ? `${planValidation.unknownIds.length} unknown creative reference${planValidation.unknownIds.length === 1 ? '' : 's'} in the lane plan`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');

      return NextResponse.json(
        { error: `Launch plan is inconsistent. ${details}` },
        { status: 400 },
      );
    }

    const existingAdsetAssignments =
      launchConfig.adsetMode === 'existing_adsets'
        ? Object.entries(launchConfig.existingAdsetAssignments || {}).filter(
            ([, creativeIds]) => Array.isArray(creativeIds) && creativeIds.length > 0,
          )
        : [];

    if (launchConfig.adsetMode === 'existing_adsets' && existingAdsetAssignments.length === 0) {
      return NextResponse.json(
        { error: 'Assign creatives to at least one existing ad set before launching.' },
        { status: 400 },
      );
    }

    const scheduledLaunchDate = resolveScheduledLaunchDate(launchConfig, storeTimezone);
    if (launchConfig.launchTime === 'scheduled') {
      if (!scheduledLaunchDate) {
        return NextResponse.json(
          { error: 'Choose a valid scheduled date and time.' },
          { status: 400 },
        );
      }
      if (scheduledLaunchDate.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: 'Scheduled launch time must be in the future.' },
          { status: 400 },
        );
      }
    }

    // Build test payload
    const testId = generateId();
    const now = new Date().toISOString();

    // Resolve targeting
    let targeting: TargetingSpec | undefined;
    if (launchConfig.customTargeting) {
      targeting = launchConfig.customTargeting;
    } else if (launchConfig.targetingPresetId && profile.targetingPresets) {
      const preset = profile.targetingPresets.find((p) => p.id === launchConfig.targetingPresetId);
      targeting = preset?.targeting;
    }

    // Determine campaign ID
    let campaignId = launchConfig.existingCampaignId || '';
    let campaignCreatedInThisRun = false;
    const campaignName = launchConfig.newCampaignName || '';

    const testPayloadBase = {
      id: testId,
      storeId,
      productProfileId: launchConfig.productProfileId,
      campaignMode: launchConfig.campaignMode,
      adsetMode: launchConfig.adsetMode,
      structure: launchConfig.structure,
      bidStrategy: launchConfig.bidStrategy,
      bidAmount: launchConfig.bidAmount,
      roasFloor: launchConfig.roasFloor,
      dailyBudget: launchConfig.dailyBudget,
      testDuration: launchConfig.testDuration,
      launchStatus: launchConfig.launchStatus,
      launchedBy: 'user',
      items: selectedItems.map((item) => ({
        id: item.id,
        clickupTaskId: item.clickup_task_id ?? undefined,
        clickupTaskName: item.clickup_task_name ?? undefined,
        creativeName: item.creative_name,
        creativeFormat: item.creative_format ?? undefined,
        hook: item.hook ?? undefined,
        angle: item.angle ?? undefined,
        driveUrl: item.drive_url ?? undefined,
        thumbnailUrl: item.thumbnail_url ?? undefined,
        metaAssetId: item.meta_asset_id ?? undefined,
        metaAssetType: item.meta_asset_type ?? undefined,
        uploadStatus: item.upload_status,
      })),
      adCopy: [
        ...launchConfig.primaryTexts.map((pt, i) => ({
          id: generateId(),
          copyType: 'primary_text' as const,
          copyText: pt.text,
          source: pt.source,
          sourceCopyId: pt.sourceCopyId,
          position: i,
        })),
        ...launchConfig.headlines.map((hl, i) => ({
          id: generateId(),
          copyType: 'headline' as const,
          copyText: hl.text,
          source: hl.source,
          sourceCopyId: hl.sourceCopyId,
          position: i,
        })),
        ...launchConfig.descriptions.map((d, i) => ({
          id: generateId(),
          copyType: 'description' as const,
          copyText: d.text,
          source: d.source,
          sourceCopyId: d.sourceCopyId,
          position: i,
        })),
      ],
    };

    // Scheduled launch: save the test plan only, skip all Meta creation for now.
    if (launchConfig.launchTime === 'scheduled' && scheduledLaunchDate) {
      if (!campaignId) {
        campaignId = `scheduled_${testId}`;
      }

      await createCreativeTest({
        ...testPayloadBase,
        campaignId,
        campaignName,
        status: 'scheduled',
        launchedAt: scheduledLaunchDate.toISOString(),
      });

      const scheduledTest = await getCreativeTest(testId);
      return NextResponse.json({
        testId,
        status: 'scheduled',
        campaignId,
        scheduledFor: scheduledLaunchDate.toISOString(),
        items: scheduledTest?.items || [],
      });
    }

    // Step 1: Create campaign if new
    if (launchConfig.campaignMode === 'new') {
      if (!campaignName) {
        return NextResponse.json({ error: 'Campaign name is required for new campaigns' }, { status: 400 });
      }

      const campaignRes = await createCampaignWithFallback(
        token.accessToken,
        accountNode,
        campaignName,
        launchConfig.structure,
        launchConfig.dailyBudget,
      );
      campaignId = String(campaignRes.id || '');

      if (!campaignId) {
        return NextResponse.json({ error: 'Meta campaign creation did not return an ID' }, { status: 500 });
      }
      campaignCreatedInThisRun = true;
    }

    // Create creative_tests record
    await createCreativeTest({
      ...testPayloadBase,
      campaignId,
      campaignName,
      status: 'launching',
      launchedAt: now,
    });

    // Step 2: Upload any creatives that don't have a Meta asset ID yet
    // This downloads from Drive and uploads to Meta ad account
    for (const item of selectedItems) {
      if (!item.meta_asset_id && item.drive_url) {
        try {
          const uploadRes = await fetch(
            `${request.nextUrl.origin}/api/creative-hub/inbox/upload`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                creativeId: item.id,
                driveUrl: item.drive_url,
                adAccountId: accountId,
                storeId,
                mediaTypeHint: item.creative_format || undefined,
              }),
            }
          );

          if (!uploadRes.ok) {
            const errBody = await uploadRes.json().catch(() => ({ error: 'Upload failed' })) as { error?: string };
            throw new Error(errBody.error || `Upload returned HTTP ${uploadRes.status}`);
          }

          const uploadData = (await uploadRes.json()) as {
            metaAssetId?: string;
            metaAssetType?: 'IMAGE' | 'VIDEO';
          };

          if (uploadData.metaAssetId) {
            item.meta_asset_id = uploadData.metaAssetId;
            item.meta_asset_type = uploadData.metaAssetType || null;

            // Persist the uploaded asset info to DB
            db.prepare(
              `UPDATE creative_test_items SET meta_asset_id = ?, meta_asset_type = ?, upload_status = 'ready' WHERE id = ?`
            ).run(uploadData.metaAssetId, uploadData.metaAssetType || null, item.id);
          } else {
            throw new Error('Upload succeeded but no metaAssetId returned');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Upload failed';
          console.error(`[Launch] Upload failed for "${item.creative_name}":`, message);
          // Mark upload_status as failed in DB
          db.prepare(
            `UPDATE creative_test_items SET upload_status = 'failed' WHERE id = ?`
          ).run(item.id);
          // We'll handle the launch failure for this item in the next loop
        }
      }
    }

    // Step 3: Create adsets + ad creatives + ads
    const createdAdsetIds: string[] = [];
    let hasFailure = false;

    const batches = launchConfig.batches as Array<{ id: string; name: string; creativeIds: string[]; dailyBudget?: number; bidAmount?: number }> | undefined;

    if (launchConfig.adsetMode === 'existing_adsets' && existingAdsetAssignments.length > 0) {
      console.log(`[launch] Existing adset mode: ${existingAdsetAssignments.length} assigned adsets`);

      for (const [adsetId, creativeIds] of existingAdsetAssignments) {
        const assignedCreatives = selectedItems.filter((item) =>
          creativeIds.includes(item.sourceCreativeId || item.id),
        );

        if (assignedCreatives.length === 0) {
          continue;
        }

        for (const item of assignedCreatives) {
          try {
            if (!item.meta_asset_id) {
              throw new Error(
                item.drive_url
                  ? `Creative "${item.creative_name}" failed to upload to Meta.`
                  : `Creative "${item.creative_name}" has no Drive URL. Cannot upload.`,
              );
            }

            const creativeUrl =
              launchConfig.usePerCreativeUrls && launchConfig.perCreativeUrls
                ? launchConfig.perCreativeUrls[item.sourceCreativeId || item.id]
                : undefined;

            const isFlexibleAd =
              launchConfig.primaryTexts.length > 1 || launchConfig.headlines.length > 1;
            const creativeBody: Record<string, string> = {
              name: `${item.creative_name} Creative`,
              url_tags:
                launchConfig.utmTemplate || profile.utmTemplate || DEFAULT_META_URL_TAGS,
            };

            if (isFlexibleAd) {
              const assetFeedSpec = buildAssetFeedSpec(launchConfig, launchProfileContext, creativeUrl);
              if (item.meta_asset_type === 'VIDEO' || item.meta_asset_type === 'video') {
                (assetFeedSpec as Record<string, unknown>).videos = [{ video_id: item.meta_asset_id }];
              } else {
                (assetFeedSpec as Record<string, unknown>).images = [{ hash: item.meta_asset_id }];
              }
              creativeBody.asset_feed_spec = JSON.stringify(assetFeedSpec);
              creativeBody.object_type = 'SHARE';

              if (launchConfig.advantageCreative) {
                creativeBody.degrees_of_freedom_spec = JSON.stringify({
                  creative_features_spec: {
                    standard_enhancements: { enroll_status: 'OPT_IN' },
                  },
                });
              }
            } else {
              const objectStorySpec = buildObjectStorySpec(
                launchConfig,
                launchProfileContext,
                item.meta_asset_id,
                item.meta_asset_type || 'IMAGE',
                creativeUrl,
              );
              creativeBody.object_story_spec = JSON.stringify(objectStorySpec);
            }

            const creativeRes = await createAdCreativeWithFallback(
              token.accessToken,
              accountNode,
              creativeBody,
              item.thumbnail_url || undefined,
            );
            const metaCreativeId = String(creativeRes.id || '');

            if (!metaCreativeId) {
              throw new Error('Meta ad creative creation did not return an ID');
            }

            const adRes = await postToMeta(token.accessToken, `/${accountNode}/ads`, {
              name: item.creative_name,
              adset_id: adsetId,
              status: launchConfig.launchStatus || 'PAUSED',
              creative: JSON.stringify({ creative_id: metaCreativeId }),
            });
            const adId = String(adRes.id || '');

            if (!adId) {
              throw new Error('Meta ad creation did not return an ID');
            }

            await updateCreativeTestItem(item.id, {
              metaAdsetId: adsetId,
              metaAdId: adId,
              metaCreativeId,
              launchStatus: 'created',
            });
          } catch (err) {
            hasFailure = true;
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error(
              `[Launch] Existing adset "${adsetId}" - Failed for "${item.creative_name}":`,
              message,
            );
            await updateCreativeTestItem(item.id, {
              launchStatus: 'failed',
              reviewFeedback: message,
            });
          }
        }
      }
    } else if (batches && batches.length > 0) {
      // ── BATCH MODE ──
      console.log(`[launch] Batch mode: ${batches.length} batches`);

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        const batchCreatives = selectedItems.filter((item) =>
          batch.creativeIds.includes(item.sourceCreativeId || item.id),
        );
        if (batchCreatives.length === 0) continue;

        try {
          // Create one adset per batch
          const targetingPayload = buildTargetingPayload(targeting);
          const adsetName = batch.name;

          const adsetBody: Record<string, string> = {
            name: adsetName,
            campaign_id: campaignId,
            status: launchConfig.launchStatus || 'PAUSED',
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'OFFSITE_CONVERSIONS',
            targeting: JSON.stringify(targetingPayload),
            start_time: resolveStartTime(launchConfig, storeTimezone),
          };

          // Budget (ABO puts budget on adset, CBO on campaign)
          if (launchConfig.structure === 'ABO') {
            const budgetCents = Math.round((batch.dailyBudget ?? launchConfig.dailyBudget) * 100);
            adsetBody.daily_budget = String(budgetCents);
          }

          // Bid strategy
          const bidAmt = batch.bidAmount ?? launchConfig.bidAmount;
          const batchDailyBudget = batch.dailyBudget ?? launchConfig.dailyBudget;
          const bidConfig = resolveAdsetBidConfig(launchConfig.bidStrategy, bidAmt, batchDailyBudget);
          adsetBody.bid_strategy = bidConfig.bidStrategy;
          if (bidConfig.bidAmountCents) {
            adsetBody.bid_amount = String(bidConfig.bidAmountCents);
          }

          // End date
          const resolvedEndTime = resolveEndTime(launchConfig, storeTimezone);
          if (resolvedEndTime) {
            adsetBody.end_time = resolvedEndTime;
          }

          // Promoted object for conversion campaigns
          const pixelId = launchConfig.pixelId || profile.pixelId;
          const conversionEvent = launchConfig.conversionEvent || profile.conversionEvent;
          if (pixelId) {
            adsetBody.promoted_object = JSON.stringify({
              pixel_id: pixelId,
              custom_event_type: conversionEvent || 'PURCHASE',
            });
          }

          const fallbackBidAmountCents =
            bidConfig.bidAmountCents ?? toBidAmountCents(estimateBidAmountFromDailyBudget(batchDailyBudget));
          const adsetRes = await createAdsetWithFallback(
            token.accessToken,
            accountNode,
            adsetBody,
            fallbackBidAmountCents,
          );
          const adsetId = String(adsetRes.id || '');

          if (!adsetId) {
            throw new Error(`Meta adset creation for batch "${batch.name}" did not return an ID`);
          }

          createdAdsetIds.push(adsetId);

          // Create an ad for each creative in the batch
          for (const item of batchCreatives) {
            try {
              if (!item.meta_asset_id) {
                throw new Error(
                  item.drive_url
                    ? `Creative "${item.creative_name}" failed to upload to Meta.`
                    : `Creative "${item.creative_name}" has no Drive URL. Cannot upload.`
                );
              }

              const creativeUrl = launchConfig.usePerCreativeUrls && launchConfig.perCreativeUrls
                ? launchConfig.perCreativeUrls[item.sourceCreativeId || item.id]
                : undefined;

              // Create ad creative
              const isFlexibleAd = launchConfig.primaryTexts.length > 1 || launchConfig.headlines.length > 1;
              const creativeBody: Record<string, string> = {
                name: `${item.creative_name} Creative`,
                url_tags: launchConfig.utmTemplate || profile.utmTemplate || DEFAULT_META_URL_TAGS,
              };

              if (isFlexibleAd) {
                const assetFeedSpec = buildAssetFeedSpec(launchConfig, launchProfileContext, creativeUrl);
                if (item.meta_asset_type === 'VIDEO' || item.meta_asset_type === 'video') {
                  (assetFeedSpec as Record<string, unknown>).videos = [{ video_id: item.meta_asset_id }];
                } else {
                  (assetFeedSpec as Record<string, unknown>).images = [{ hash: item.meta_asset_id }];
                }
                creativeBody.asset_feed_spec = JSON.stringify(assetFeedSpec);
                creativeBody.object_type = 'SHARE';

                if (launchConfig.advantageCreative) {
                  creativeBody.degrees_of_freedom_spec = JSON.stringify({
                    creative_features_spec: {
                      standard_enhancements: { enroll_status: 'OPT_IN' },
                    },
                  });
                }
              } else {
                const objectStorySpec = buildObjectStorySpec(
                  launchConfig,
                  launchProfileContext,
                  item.meta_asset_id!,
                  item.meta_asset_type || 'IMAGE',
                  creativeUrl
                );
                creativeBody.object_story_spec = JSON.stringify(objectStorySpec);
              }

              const creativeRes = await createAdCreativeWithFallback(
                token.accessToken,
                accountNode,
                creativeBody,
                item.thumbnail_url || undefined,
              );
              const metaCreativeId = String(creativeRes.id || '');

              if (!metaCreativeId) {
                throw new Error('Meta ad creative creation did not return an ID');
              }

              // Create ad
              const adRes = await postToMeta(token.accessToken, `/${accountNode}/ads`, {
                name: item.creative_name,
                adset_id: adsetId,
                status: launchConfig.launchStatus || 'PAUSED',
                creative: JSON.stringify({ creative_id: metaCreativeId }),
              });
              const adId = String(adRes.id || '');

              if (!adId) {
                throw new Error('Meta ad creation did not return an ID');
              }

              await updateCreativeTestItem(item.id, {
                metaAdsetId: adsetId,
                metaAdId: adId,
                metaCreativeId: metaCreativeId,
                launchStatus: 'created',
              });
            } catch (err) {
              hasFailure = true;
              const message = err instanceof Error ? err.message : 'Unknown error';
              console.error(`[Launch] Batch "${batch.name}" - Failed for "${item.creative_name}":`, message);
              await updateCreativeTestItem(item.id, {
                launchStatus: 'failed',
                reviewFeedback: message,
              });
            }
          }
        } catch (err) {
          hasFailure = true;
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error(`[Launch] Failed to create adset for batch "${batch.name}":`, message);
          // Mark all creatives in this batch as failed
          for (const item of batchCreatives) {
            await updateCreativeTestItem(item.id, {
              launchStatus: 'failed',
              reviewFeedback: `Batch adset creation failed: ${message}`,
            });
          }
        }
      }
    } else {
      // ── LEGACY MODE: existing 1:1 flow ──

    for (const item of selectedItems) {
      try {
        if (!item.meta_asset_id) {
          throw new Error(
            item.drive_url
              ? `Creative "${item.creative_name}" failed to upload to Meta.`
              : `Creative "${item.creative_name}" has no Drive URL. Cannot upload.`
          );
        }

        // Determine the creative-specific destination URL
        const creativeUrl = launchConfig.usePerCreativeUrls && launchConfig.perCreativeUrls
          ? launchConfig.perCreativeUrls[item.sourceCreativeId || item.id]
          : undefined;

        // Create adset
        const targetingPayload = buildTargetingPayload(targeting);
        const adsetName = item.creative_name;

        const adsetBody: Record<string, string> = {
          name: adsetName,
          campaign_id: campaignId,
          status: launchConfig.launchStatus || 'PAUSED',
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'OFFSITE_CONVERSIONS',
          targeting: JSON.stringify(targetingPayload),
          start_time: resolveStartTime(launchConfig, storeTimezone),
        };

        // Budget (ABO puts budget on adset, CBO on campaign)
        if (launchConfig.structure === 'ABO') {
          const budgetCents = Math.round(launchConfig.dailyBudget * 100);
          adsetBody.daily_budget = String(budgetCents);
        }

        // Bid strategy
        const bidConfig = resolveAdsetBidConfig(
          launchConfig.bidStrategy,
          launchConfig.bidAmount,
          launchConfig.dailyBudget,
        );
        adsetBody.bid_strategy = bidConfig.bidStrategy;
        if (bidConfig.bidAmountCents) {
          adsetBody.bid_amount = String(bidConfig.bidAmountCents);
        }

        // End date
        const resolvedEndTime = resolveEndTime(launchConfig, storeTimezone);
        if (resolvedEndTime) {
          adsetBody.end_time = resolvedEndTime;
        }

        // Promoted object for conversion campaigns
        const pixelId = launchConfig.pixelId || profile.pixelId;
        const conversionEvent = launchConfig.conversionEvent || profile.conversionEvent;
        if (pixelId) {
          adsetBody.promoted_object = JSON.stringify({
            pixel_id: pixelId,
            custom_event_type: conversionEvent || 'PURCHASE',
          });
        }

        const fallbackBidAmountCents =
          bidConfig.bidAmountCents ??
          toBidAmountCents(estimateBidAmountFromDailyBudget(launchConfig.dailyBudget));
        const adsetRes = await createAdsetWithFallback(
          token.accessToken,
          accountNode,
          adsetBody,
          fallbackBidAmountCents,
        );
        const adsetId = String(adsetRes.id || '');

        if (!adsetId) {
          throw new Error('Meta adset creation did not return an ID');
        }

        createdAdsetIds.push(adsetId);

        // Create ad creative
        const isFlexibleAd = launchConfig.primaryTexts.length > 1 || launchConfig.headlines.length > 1;
        const creativeBody: Record<string, string> = {
          name: `${item.creative_name} Creative`,
          url_tags: launchConfig.utmTemplate || profile.utmTemplate || DEFAULT_META_URL_TAGS,
        };

        if (isFlexibleAd) {
          // Flexible Ads with asset_feed_spec
          const assetFeedSpec = buildAssetFeedSpec(launchConfig, launchProfileContext, creativeUrl);

          // Add the creative's asset to the feed spec
          if (item.meta_asset_type === 'VIDEO' || item.meta_asset_type === 'video') {
            (assetFeedSpec as Record<string, unknown>).videos = [{ video_id: item.meta_asset_id }];
          } else {
            (assetFeedSpec as Record<string, unknown>).images = [{ hash: item.meta_asset_id }];
          }

          creativeBody.asset_feed_spec = JSON.stringify(assetFeedSpec);
          creativeBody.object_type = 'SHARE';

          // Degrees of freedom spec for Advantage+ creative
          if (launchConfig.advantageCreative) {
            creativeBody.degrees_of_freedom_spec = JSON.stringify({
              creative_features_spec: {
                standard_enhancements: { enroll_status: 'OPT_IN' },
              },
            });
          }
        } else {
          // Single PT/HL -- use object_story_spec
          const objectStorySpec = buildObjectStorySpec(
            launchConfig,
            launchProfileContext,
            item.meta_asset_id!,
            item.meta_asset_type || 'IMAGE',
            creativeUrl
          );
          creativeBody.object_story_spec = JSON.stringify(objectStorySpec);
        }

        const creativeRes = await createAdCreativeWithFallback(
          token.accessToken,
          accountNode,
          creativeBody,
          item.thumbnail_url || undefined,
        );
        const creativeId = String(creativeRes.id || '');

        if (!creativeId) {
          throw new Error('Meta ad creative creation did not return an ID');
        }

        // Create ad
        const adRes = await postToMeta(token.accessToken, `/${accountNode}/ads`, {
          name: item.creative_name,
          adset_id: adsetId,
          status: launchConfig.launchStatus || 'PAUSED',
          creative: JSON.stringify({ creative_id: creativeId }),
        });
        const adId = String(adRes.id || '');

        if (!adId) {
          throw new Error('Meta ad creation did not return an ID');
        }

        // Update creative_test_item with Meta IDs
        await updateCreativeTestItem(item.id, {
          metaAdsetId: adsetId,
          metaAdId: adId,
          metaCreativeId: creativeId,
          launchStatus: 'created',
        });
      } catch (err) {
        hasFailure = true;
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Launch] Failed to create ads for "${item.creative_name}":`, message);

        await updateCreativeTestItem(item.id, {
          launchStatus: 'failed',
          reviewFeedback: message,
        });
      }
    }
    } // end legacy mode

    // If any items failed, pause all created adsets and set test status to partial
    if (hasFailure) {
      if (campaignCreatedInThisRun && campaignId && createdAdsetIds.length === 0) {
        try {
          const rolledBackCampaignId = campaignId;
          const rollbackStatus = await cleanupCampaignOnFailure(token.accessToken, campaignId);
          if (rollbackStatus === 'deleted') {
            campaignId = '';
          }
          console.warn(
            `[Launch] Rolled back campaign ${rolledBackCampaignId} after adset creation failure (status=${rollbackStatus})`,
          );
        } catch (rollbackErr) {
          const rollbackMessage =
            rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
          console.error(
            `[Launch] Failed to rollback empty campaign ${campaignId} after adset errors:`,
            rollbackMessage,
          );
        }
      }

      for (const adsetId of createdAdsetIds) {
        try {
          await postToMeta(token.accessToken, `/${adsetId}`, { status: 'PAUSED' });
        } catch {
          // Best-effort pause
        }
      }
      await updateCreativeTestStatus(testId, 'partial');
    } else {
      if (launchConfig.campaignMode === 'new' && launchConfig.launchStatus === 'ACTIVE' && campaignId) {
        await postToMeta(token.accessToken, `/${campaignId}`, { status: 'ACTIVE' });
      }
      await updateCreativeTestStatus(testId, 'active');
    }

    // Fetch the updated test to return
    const test = await getCreativeTest(testId);

    return NextResponse.json({
      testId,
      status: hasFailure ? 'partial' : 'active',
      campaignId,
      items: test?.items || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Launch execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
