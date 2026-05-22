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
import { getStoreCurrencyFromConfig, getStoreTimezoneFromConfig } from '@/lib/onboarding/stages/detectStoreConfig';
import type { InboxCreative, LaunchConfig, TargetingSpec } from '@/types/creativeHub';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const DEFAULT_META_URL_TAGS =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';
const WORLDWIDE_COUNTRY_VALUE = 'WORLDWIDE';
type VideoThumbnailOverride = NonNullable<LaunchConfig['videoThumbnails']>[string];

// ── Helpers ──

function normalizeAccountNode(value: string): string {
  const node = value.trim();
  if (!node) return '';
  if (node.startsWith('act_')) return node;
  return `act_${node.replace(/^act_/, '')}`;
}

function sameAdAccount(left?: string | null, right?: string | null): boolean {
  if (!left || !right) return false;
  return normalizeAccountNode(left) === normalizeAccountNode(right);
}

async function resolveCampaignOwnerAccountId(
  accessToken: string,
  campaignId: string,
): Promise<string | null> {
  if (!campaignId) return null;
  const campaign = await fetchFromMeta<Record<string, unknown>>(
    accessToken,
    `/${campaignId}`,
    { fields: 'account_id' },
    10000,
    1,
  );
  const accountId = typeof campaign.account_id === 'string' ? campaign.account_id : '';
  return accountId ? normalizeAccountNode(accountId) : null;
}

function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function cleanMetaName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 255);
}

function renderNameTemplate(
  template: string | undefined,
  fallbackName: string,
  context: {
    index: number;
    total: number;
    batchName?: string;
    creativeName?: string;
    productName?: string;
  },
): string {
  const rawTemplate = template?.trim();
  if (!rawTemplate) return cleanMetaName(fallbackName);

  const today = new Date().toISOString().slice(0, 10);
  let rendered = rawTemplate
    .replace(/\{\{\s*(index|number)\s*\}\}/gi, String(context.index))
    .replace(/\{\{\s*total\s*\}\}/gi, String(context.total))
    .replace(/\{\{\s*(batch\.name|batchName)\s*\}\}/gi, context.batchName || fallbackName)
    .replace(/\{\{\s*(creative\.name|creativeName)\s*\}\}/gi, context.creativeName || fallbackName)
    .replace(/\{\{\s*(product\.name|productName)\s*\}\}/gi, context.productName || '')
    .replace(/\{\{\s*date\s*\}\}/gi, today);

  const hasUniqueToken = /\{\{\s*(index|number|batch\.name|batchName|creative\.name|creativeName)\s*\}\}/i
    .test(rawTemplate);
  if (context.total > 1 && !hasUniqueToken) {
    rendered = `${rendered} ${context.index}`;
  }

  return cleanMetaName(rendered) || cleanMetaName(fallbackName);
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
  if (config.useTestDuration === false) {
    return undefined;
  }

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

function bidStrategyRequiresRoasFloor(strategy: string): boolean {
  return strategy === 'LOWEST_COST_WITH_MIN_ROAS';
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

function toRoasAverageFloor(amountInput?: number): number | undefined {
  const amount = toPositiveNumber(amountInput);
  if (!amount) {
    return undefined;
  }
  return Math.max(1, Math.round(amount * 10000));
}

function resolveAdsetBidConfig(
  strategyInput: string | undefined,
  bidAmountInput?: number | null,
  dailyBudgetInput?: number | null,
): { bidStrategy?: string; bidAmountCents?: number; bidConstraints?: string } {
  const strategy = normalizeBidStrategy(strategyInput);
  const explicitBidAmount = toPositiveNumber(bidAmountInput);
  const fallbackBidAmount = estimateBidAmountFromDailyBudget(dailyBudgetInput);

  if (strategy === 'LOWEST_COST_WITHOUT_CAP') {
    return {};
  }

  if (bidStrategyRequiresRoasFloor(strategy)) {
    const roasAverageFloor = toRoasAverageFloor(explicitBidAmount);
    if (!roasAverageFloor) {
      return {};
    }
    return {
      bidStrategy: strategy,
      bidConstraints: JSON.stringify({ roas_average_floor: roasAverageFloor }),
    };
  }

  if (!bidStrategyRequiresBidAmount(strategy)) {
    return { bidStrategy: strategy };
  }

  const resolvedBidAmount = explicitBidAmount ?? fallbackBidAmount;
  const bidAmountCents = toBidAmountCents(resolvedBidAmount);

  if (!bidAmountCents) {
    return {};
  }

  return {
    bidStrategy: strategy,
    bidAmountCents,
  };
}

function resolveCampaignBidConfig(
  strategyInput: string | undefined,
  bidAmountInput?: number | null,
  dailyBudgetInput?: number | null,
): { bidStrategy: string; bidAmountCents?: number; bidConstraints?: string } {
  const strategy = normalizeBidStrategy(strategyInput);

  if (bidStrategyRequiresRoasFloor(strategy)) {
    const roasAverageFloor = toRoasAverageFloor(bidAmountInput ?? undefined);
    if (!roasAverageFloor) {
      return { bidStrategy: 'LOWEST_COST_WITHOUT_CAP' };
    }
    return {
      bidStrategy: strategy,
      bidConstraints: JSON.stringify({ roas_average_floor: roasAverageFloor }),
    };
  }

  if (!bidStrategyRequiresBidAmount(strategy)) {
    return { bidStrategy: strategy };
  }

  const explicitBidAmount = toPositiveNumber(bidAmountInput);
  const fallbackBidAmount = estimateBidAmountFromDailyBudget(dailyBudgetInput);
  const bidAmountCents = toBidAmountCents(explicitBidAmount ?? fallbackBidAmount);

  if (!bidAmountCents) {
    return { bidStrategy: 'LOWEST_COST_WITHOUT_CAP' };
  }

  return { bidStrategy: strategy, bidAmountCents };
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

function isDegreesOfFreedomMetaError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('degrees_of_freedom_spec') ||
    lower.includes('creative_features_spec') ||
    lower.includes('enroll_status') ||
    lower.includes('unsupported field')
  );
}

function isContextualMultiAdsMetaError(message: string): boolean {
  return message.toLowerCase().includes('contextual_multi_ads');
}

function isGenericAdCreativeMetaError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('subcode=2490433') ||
    lower.includes('unexpected error occurred') ||
    lower.includes('user_title=something went wrong')
  );
}

function isAssetFeedFormatMetaError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('subcode=1885374') ||
    lower.includes('invalid ad formats in asset feed') ||
    lower.includes('asset feed can have exactly one ad format')
  );
}

function isDynamicCreativeAdsetMismatchMetaError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('subcode=1885998') ||
    lower.includes('cannot create dynamic creative ad in non-dynamic creative ad set') ||
    lower.includes('dynamic creative ads can only be created under dynamic creative ad sets')
  );
}

function isVideoNotReadyMetaError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('subcode=1885252') ||
    lower.includes('video is still being processed') ||
    lower.includes('video not ready for use in an ad')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyVideoProcessingState(raw: Record<string, unknown>): 'ready' | 'processing' | 'failed' | 'unknown' {
  const statusObject =
    raw.status && typeof raw.status === 'object'
      ? (raw.status as Record<string, unknown>)
      : undefined;
  const processingPhase =
    statusObject?.processing_phase && typeof statusObject.processing_phase === 'object'
      ? (statusObject.processing_phase as Record<string, unknown>)
      : undefined;
  const publishingPhase =
    statusObject?.publishing_phase && typeof statusObject.publishing_phase === 'object'
      ? (statusObject.publishing_phase as Record<string, unknown>)
      : undefined;
  const uploadingPhase =
    statusObject?.uploading_phase && typeof statusObject.uploading_phase === 'object'
      ? (statusObject.uploading_phase as Record<string, unknown>)
      : undefined;

  const states = [
    asString(raw.video_status),
    asString(statusObject?.video_status),
    asString(statusObject?.status),
    asString(processingPhase?.status),
    asString(publishingPhase?.status),
    asString(uploadingPhase?.status),
  ]
    .map((value) => value?.toLowerCase())
    .filter(Boolean) as string[];

  if (states.length === 0) return 'unknown';
  if (states.some((value) => ['error', 'failed', 'failure'].includes(value))) return 'failed';
  if (states.some((value) => ['ready', 'completed', 'complete', 'finished', 'published'].includes(value))) {
    return 'ready';
  }
  if (states.some((value) => ['processing', 'in_progress', 'pending', 'not_started'].includes(value))) {
    return 'processing';
  }
  return 'unknown';
}

async function waitForVideoReady(
  accessToken: string,
  videoId: string,
  timeoutMs = 12_000,
  pollMs = 2_000,
): Promise<'ready' | 'processing' | 'failed'> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const meta = await fetchFromMeta<Record<string, unknown>>(
        accessToken,
        `/${videoId}`,
        { fields: 'status,video_status' },
        10_000,
        1,
      );
      const state = classifyVideoProcessingState(meta);
      if (state === 'ready') return 'ready';
      if (state === 'failed') return 'failed';
    } catch {
      // Best effort polling only.
    }

    await sleep(pollMs);
  }

  return 'processing';
}

function extractVideoIdFromCreativeBody(creativeBody: Record<string, string>): string | undefined {
  if (creativeBody.object_story_spec) {
    try {
      const parsed = JSON.parse(creativeBody.object_story_spec) as Record<string, unknown>;
      const videoData =
        parsed && typeof parsed === 'object'
          ? ((parsed.video_data as Record<string, unknown> | undefined) ?? undefined)
          : undefined;
      const videoId = asString(videoData?.video_id);
      if (videoId) return videoId;
    } catch {
      // Ignore parse errors and continue.
    }
  }

  if (creativeBody.asset_feed_spec) {
    try {
      const parsed = JSON.parse(creativeBody.asset_feed_spec) as Record<string, unknown>;
      const videos = Array.isArray(parsed.videos)
        ? (parsed.videos as Array<Record<string, unknown>>)
        : [];
      const firstVideoId = asString(videos[0]?.video_id);
      if (firstVideoId) return firstVideoId;
    } catch {
      // Ignore parse errors.
    }
  }

  return undefined;
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

function removeDegreesOfFreedomFromCreativeBody(
  creativeBody: Record<string, string>,
): Record<string, string> | null {
  if (!creativeBody.degrees_of_freedom_spec) {
    return null;
  }

  const sanitized = { ...creativeBody };
  delete sanitized.degrees_of_freedom_spec;
  return sanitized;
}

function buildContextualMultiAdsOptOutSpec(): Record<string, unknown> {
  return {
    enroll_status: 'OPT_OUT',
  };
}

function removeContextualMultiAdsFromCreativeBody(
  creativeBody: Record<string, string>,
): Record<string, string> {
  const sanitized = { ...creativeBody };
  delete sanitized.contextual_multi_ads;
  return sanitized;
}

function sanitizeDegreesOfFreedomSpecForMeta(
  creativeBody: Record<string, string>,
): Record<string, string> {
  if (!creativeBody.degrees_of_freedom_spec) {
    return creativeBody;
  }

  try {
    const parsed = JSON.parse(creativeBody.degrees_of_freedom_spec) as Record<string, unknown>;
    const featureSpec =
      parsed.creative_features_spec && typeof parsed.creative_features_spec === 'object'
        ? { ...(parsed.creative_features_spec as Record<string, unknown>) }
        : undefined;

    if (featureSpec) {
      delete featureSpec.standard_enhancements;
      delete featureSpec.standard_enhancements_catalog;
    }

    const sanitizedSpec: Record<string, unknown> = {
      ...parsed,
      ...(featureSpec ? { creative_features_spec: featureSpec } : {}),
    };

    const sanitizedFeatureSpec =
      sanitizedSpec.creative_features_spec && typeof sanitizedSpec.creative_features_spec === 'object'
        ? (sanitizedSpec.creative_features_spec as Record<string, unknown>)
        : undefined;

    if (sanitizedFeatureSpec && Object.keys(sanitizedFeatureSpec).length === 0) {
      delete sanitizedSpec.creative_features_spec;
    }

    if (Object.keys(sanitizedSpec).length === 0) {
      const withoutDegrees = { ...creativeBody };
      delete withoutDegrees.degrees_of_freedom_spec;
      return withoutDegrees;
    }

    return {
      ...creativeBody,
      degrees_of_freedom_spec: JSON.stringify(sanitizedSpec),
    };
  } catch {
    const withoutDegrees = { ...creativeBody };
    delete withoutDegrees.degrees_of_freedom_spec;
    return withoutDegrees;
  }
}

async function createAdCreativeWithFallback(
  accessToken: string,
  accountNode: string,
  creativeBody: Record<string, string>,
  preferredThumbnailUrl?: string,
  fallbackObjectStorySpec?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const attemptErrors: string[] = [];
  const initialBody = sanitizeDegreesOfFreedomSpecForMeta(creativeBody);

  try {
    return await postToMeta(accessToken, `/${accountNode}/adcreatives`, initialBody);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const message = error.message || 'Meta adcreative creation failed';
    attemptErrors.push(`attempt_1:${message}`);

    let workingBody = initialBody;
    const videoId = extractVideoIdFromCreativeBody(workingBody);
    const firstErrorWasGeneric = isGenericAdCreativeMetaError(message);
    let currentMessage = message;

    if (firstErrorWasGeneric && videoId) {
      const videoState = await waitForVideoReady(accessToken, videoId);
      if (videoState === 'failed') {
        attemptErrors.push('video_processing_failed');
      }

      if (videoState === 'ready' || videoState === 'processing') {
        // Even if processing is not fully complete yet, a second attempt often succeeds.
        if (videoState === 'processing') {
          await sleep(2_000);
        }
        try {
          return await postToMeta(accessToken, `/${accountNode}/adcreatives`, workingBody);
        } catch (retryErr) {
          const retryMessage = retryErr instanceof Error ? retryErr.message : String(retryErr);
          attemptErrors.push(`attempt_2_after_video_ready:${retryMessage}`);
          currentMessage = retryMessage;
        }
      }

      if (videoState !== 'ready' && videoState !== 'processing') {
        attemptErrors.push('video_still_processing_after_wait');
      }
    }

    if (firstErrorWasGeneric && !videoId) {
      await sleep(1_500);
      try {
        return await postToMeta(accessToken, `/${accountNode}/adcreatives`, workingBody);
      } catch (retryErr) {
        const retryMessage = retryErr instanceof Error ? retryErr.message : String(retryErr);
        attemptErrors.push(`attempt_2_after_generic_retry:${retryMessage}`);
        currentMessage = retryMessage;
      }
    }

    if (isInvalidInstagramActorMetaError(currentMessage)) {
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

    if (fallbackObjectStorySpec && workingBody.asset_feed_spec && isGenericAdCreativeMetaError(currentMessage)) {
      const downgradedBody: Record<string, string> = {
        ...workingBody,
        object_story_spec: JSON.stringify(fallbackObjectStorySpec),
      };
      delete downgradedBody.asset_feed_spec;
      delete downgradedBody.object_type;

      try {
        return await postToMeta(accessToken, `/${accountNode}/adcreatives`, downgradedBody);
      } catch (downgradeErr) {
        const downgradeMessage =
          downgradeErr instanceof Error ? downgradeErr.message : String(downgradeErr);
        attemptErrors.push(`attempt_2_downgrade_object_story_spec:${downgradeMessage}`);
        currentMessage = downgradeMessage;
      }
    }

    if (isContextualMultiAdsMetaError(currentMessage)) {
      workingBody = removeContextualMultiAdsFromCreativeBody(workingBody);
      try {
        return await postToMeta(accessToken, `/${accountNode}/adcreatives`, workingBody);
      } catch (contextualErr) {
        const contextualMessage =
          contextualErr instanceof Error ? contextualErr.message : String(contextualErr);
        attemptErrors.push(`attempt_without_contextual_multi_ads:${contextualMessage}`);
        currentMessage = contextualMessage;
      }
    }

    if (isDegreesOfFreedomMetaError(currentMessage)) {
      const withoutDegrees = removeDegreesOfFreedomFromCreativeBody(workingBody);
      if (withoutDegrees) {
        workingBody = withoutDegrees;
        try {
          return await postToMeta(accessToken, `/${accountNode}/adcreatives`, workingBody);
        } catch (degreesErr) {
          const degreesMessage =
            degreesErr instanceof Error ? degreesErr.message : String(degreesErr);
          attemptErrors.push(`attempt_without_degrees_of_freedom:${degreesMessage}`);
          currentMessage = degreesMessage;
        }
      }
    }

    if (fallbackObjectStorySpec && workingBody.asset_feed_spec && isAssetFeedFormatMetaError(currentMessage)) {
      const downgradedBody: Record<string, string> = {
        ...workingBody,
        object_story_spec: JSON.stringify(fallbackObjectStorySpec),
      };
      delete downgradedBody.asset_feed_spec;
      delete downgradedBody.object_type;

      workingBody = downgradedBody;
      try {
        return await postToMeta(accessToken, `/${accountNode}/adcreatives`, workingBody);
      } catch (downgradeErr) {
        const downgradeMessage =
          downgradeErr instanceof Error ? downgradeErr.message : String(downgradeErr);
        attemptErrors.push(`attempt_downgrade_after_asset_feed_format:${downgradeMessage}`);
        currentMessage = downgradeMessage;
      }
    }

    if (
      isVideoThumbnailRequiredMetaError(currentMessage) ||
      attemptErrors.some((entry) => isVideoThumbnailRequiredMetaError(entry))
    ) {
      const withThumbnail = await addVideoThumbnailToCreativeBody(
        accessToken,
        accountNode,
        workingBody,
        preferredThumbnailUrl,
      );
      if (withThumbnail) {
        const sanitizedThumbnailBody = sanitizeDegreesOfFreedomSpecForMeta(withThumbnail);
        try {
          return await postToMeta(accessToken, `/${accountNode}/adcreatives`, sanitizedThumbnailBody);
        } catch (thumbnailErr) {
          const thumbnailMessage =
            thumbnailErr instanceof Error ? thumbnailErr.message : String(thumbnailErr);
          attemptErrors.push(`attempt_3_with_video_thumbnail:${thumbnailMessage}`);
          currentMessage = thumbnailMessage;
          if (!isVideoNotReadyMetaError(thumbnailMessage)) {
            throw new Error(attemptErrors.join(' || '));
          }
        }
      }
    }

    if (isVideoNotReadyMetaError(currentMessage)) {
      const videoId = extractVideoIdFromCreativeBody(workingBody);
      if (videoId) {
        const videoState = await waitForVideoReady(accessToken, videoId);
        if (videoState === 'ready') {
          try {
            return await postToMeta(accessToken, `/${accountNode}/adcreatives`, workingBody);
          } catch (videoRetryErr) {
            const videoRetryMessage =
              videoRetryErr instanceof Error ? videoRetryErr.message : String(videoRetryErr);
            attemptErrors.push(`attempt_after_video_ready:${videoRetryMessage}`);
          }
        } else {
          attemptErrors.push(`video_${videoState}_after_wait`);
        }
      }
    }

    if (attemptErrors.length > 0) {
      if (isVideoNotReadyMetaError(currentMessage)) {
        throw new Error(`${attemptErrors.join(' || ')} || video_processing_retry_later=Meta is still processing this video. Wait a minute and launch again.`);
      }
      throw new Error(attemptErrors.join(' || '));
    }
    throw error;
  }
}

async function createAdWithCreativeFallback(input: {
  accessToken: string;
  accountNode: string;
  adsetId: string;
  adName: string;
  adStatus: string;
  metaCreativeId: string;
  creativeBody: Record<string, string>;
  preferredThumbnailUrl?: string;
  fallbackObjectStorySpec: Record<string, unknown>;
}): Promise<{ adId: string; metaCreativeId: string }> {
  const {
    accessToken,
    accountNode,
    adsetId,
    adName,
    adStatus,
    metaCreativeId,
    creativeBody,
    preferredThumbnailUrl,
    fallbackObjectStorySpec,
  } = input;

  try {
    const adRes = await postToMeta(accessToken, `/${accountNode}/ads`, {
      name: adName,
      adset_id: adsetId,
      status: adStatus,
      creative: JSON.stringify({ creative_id: metaCreativeId }),
    });
    const adId = String(adRes.id || '');
    if (!adId) {
      throw new Error('Meta ad creation did not return an ID');
    }
    return { adId, metaCreativeId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!creativeBody.asset_feed_spec || !isDynamicCreativeAdsetMismatchMetaError(message)) {
      throw err instanceof Error ? err : new Error(message);
    }

    const normalCreativeBody: Record<string, string> = {
      ...creativeBody,
      object_story_spec: JSON.stringify(fallbackObjectStorySpec),
    };
    delete normalCreativeBody.asset_feed_spec;
    delete normalCreativeBody.object_type;

    const fallbackCreativeRes = await createAdCreativeWithFallback(
      accessToken,
      accountNode,
      normalCreativeBody,
      preferredThumbnailUrl,
      fallbackObjectStorySpec,
    );
    const fallbackCreativeId = String(fallbackCreativeRes.id || '');
    if (!fallbackCreativeId) {
      throw new Error(`Dynamic creative fallback failed: Meta ad creative creation did not return an ID | original=${message}`);
    }

    const fallbackAdRes = await postToMeta(accessToken, `/${accountNode}/ads`, {
      name: adName,
      adset_id: adsetId,
      status: adStatus,
      creative: JSON.stringify({ creative_id: fallbackCreativeId }),
    });
    const fallbackAdId = String(fallbackAdRes.id || '');
    if (!fallbackAdId) {
      throw new Error(`Dynamic creative fallback failed: Meta ad creation did not return an ID | original=${message}`);
    }

    console.info('[launch] Downgraded flexible creative to normal ad creative for non-dynamic ad set', {
      adsetId,
      adName,
      originalCreativeId: metaCreativeId,
      fallbackCreativeId,
    });

    return { adId: fallbackAdId, metaCreativeId: fallbackCreativeId };
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
  const normalizedStrategy = adsetBody.bid_strategy
    ? normalizeBidStrategy(adsetBody.bid_strategy)
    : undefined;
  const baseCandidate: Record<string, string> = { ...adsetBody };
  if (normalizedStrategy) {
    baseCandidate.bid_strategy = normalizedStrategy;
  }
  const candidates: Array<Record<string, string>> = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: Record<string, string>) => {
    const key = `${candidate.bid_strategy || '__none__'}|${candidate.bid_amount || '__none__'}|${candidate.bid_constraints || '__none__'}|${candidate.daily_budget || '__none__'}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  if (!normalizedStrategy || (!bidStrategyRequiresBidAmount(normalizedStrategy) && !bidStrategyRequiresRoasFloor(normalizedStrategy))) {
    delete baseCandidate.bid_amount;
    delete baseCandidate.bid_constraints;
  } else if (bidStrategyRequiresRoasFloor(normalizedStrategy)) {
    delete baseCandidate.bid_amount;
  } else if (
    (!baseCandidate.bid_amount ||
      !Number.isFinite(Number(baseCandidate.bid_amount)) ||
      Number(baseCandidate.bid_amount) <= 0) &&
    fallbackBidAmountCents
  ) {
    baseCandidate.bid_amount = String(fallbackBidAmountCents);
  }

  if (
    !normalizedStrategy ||
    (!bidStrategyRequiresBidAmount(normalizedStrategy) && !bidStrategyRequiresRoasFloor(normalizedStrategy)) ||
    baseCandidate.bid_amount ||
    baseCandidate.bid_constraints
  ) {
    pushCandidate(baseCandidate);
  }

  if (fallbackBidAmountCents && normalizedStrategy && bidStrategyRequiresBidAmount(normalizedStrategy)) {
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

  const noBidFieldsCandidate: Record<string, string> = { ...adsetBody };
  delete noBidFieldsCandidate.bid_strategy;
  delete noBidFieldsCandidate.bid_amount;
  delete noBidFieldsCandidate.bid_constraints;
  pushCandidate(noBidFieldsCandidate);

  const lowestCostCandidate: Record<string, string> = {
    ...adsetBody,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
  };
  delete lowestCostCandidate.bid_amount;
  delete lowestCostCandidate.bid_constraints;
  pushCandidate(lowestCostCandidate);

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
      errors.push(
        `attempt_${index + 1}[bid_strategy=${candidate.bid_strategy || 'omitted'},bid_amount=${candidate.bid_amount || 'omitted'},bid_constraints=${candidate.bid_constraints || 'omitted'}]:${message}`,
      );

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
  bidStrategyInput?: string,
  bidAmountInput?: number | null,
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

              if (structure === 'CBO') {
                const campaignBidConfig = resolveCampaignBidConfig(
                  bidStrategyInput,
                  bidAmountInput,
                  dailyBudget,
                );
                campaignBody.bid_strategy = campaignBidConfig.bidStrategy;
                if (campaignBidConfig.bidAmountCents) {
                  campaignBody.bid_amount = String(campaignBidConfig.bidAmountCents);
                }
                if (campaignBidConfig.bidConstraints) {
                  campaignBody.bid_constraints = campaignBidConfig.bidConstraints;
                }
              }

              if (adsetBudgetSharingMode === 'false') {
                campaignBody.is_adset_budget_sharing_enabled = 'false';
              } else if (adsetBudgetSharingMode === 'true') {
                campaignBody.is_adset_budget_sharing_enabled = 'true';
              }

              if (includeBuyingType) {
                campaignBody.buying_type = 'AUCTION';
              }

              const response = await postToMeta(accessToken, `/${accountNode}/campaigns`, campaignBody);
              if (structure === 'CBO') {
                console.log(
                  `[launch] Created CBO campaign ${response.id || 'unknown'} with bid_strategy=${
                    campaignBody.bid_strategy || 'omitted'
                  }, bid_amount=${campaignBody.bid_amount || 'omitted'}`,
                );
              }
              return response;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              errors.push(
                `${objective}/${statusMode}/${specialAdCategories}/${
                  includeBuyingType ? 'buying_type' : 'no_buying_type'
                }/adset_budget_sharing_${adsetBudgetSharingMode}/campaign_bid_${
                  structure === 'CBO'
                    ? resolveCampaignBidConfig(bidStrategyInput, bidAmountInput, dailyBudget).bidStrategy
                    : 'adset_level'
                }: ${message}`,
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

function normalizeCountryCodes(values?: string[]): string[] {
  return [...new Set((values || [])
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value)))];
}

function hasWorldwideTargeting(values?: string[]): boolean {
  return (values || []).some((value) => value.trim().toUpperCase() === WORLDWIDE_COUNTRY_VALUE);
}

function inferDefaultCountryFromStore(storeCurrency?: string, destinationUrl?: string | null): string {
  try {
    const hostname = new URL(destinationUrl || '').hostname.toLowerCase();
    if (hostname.endsWith('.in')) return 'IN';
    if (hostname.endsWith('.ca')) return 'CA';
    if (hostname.endsWith('.co.uk') || hostname.endsWith('.uk')) return 'GB';
    if (hostname.endsWith('.com.au') || hostname.endsWith('.au')) return 'AU';
    if (hostname.endsWith('.ae')) return 'AE';
    if (hostname.endsWith('.sg')) return 'SG';
  } catch {
    // Non-critical fallback only.
  }

  const currencyCountryMap: Record<string, string> = {
    INR: 'IN',
    USD: 'US',
    CAD: 'CA',
    GBP: 'GB',
    AUD: 'AU',
    EUR: 'DE',
    AED: 'AE',
    SGD: 'SG',
  };
  const currencyCountry = currencyCountryMap[String(storeCurrency || '').toUpperCase()];
  if (currencyCountry) return currencyCountry;

  return 'US';
}

function buildTargetingPayload(targeting?: TargetingSpec, defaultCountries: string[] = ['US']): Record<string, unknown> {
  const safeDefaultCountries = normalizeCountryCodes(defaultCountries);
  if (!targeting) {
    return {
      geo_locations: { countries: safeDefaultCountries.length > 0 ? safeDefaultCountries : ['US'] },
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
    const isWorldwide = hasWorldwideTargeting(targeting.geoLocations.countries);
    const countries = normalizeCountryCodes(targeting.geoLocations.countries);
    if (isWorldwide) {
      geo.country_groups = ['worldwide'];
    } else if (countries.length) {
      geo.countries = countries;
    }
    if (targeting.geoLocations.regions?.length) geo.regions = targeting.geoLocations.regions;
    if (targeting.geoLocations.cities?.length) geo.cities = targeting.geoLocations.cities;
    result.geo_locations = Object.keys(geo).length > 0 ? geo : { countries: safeDefaultCountries.length > 0 ? safeDefaultCountries : ['US'] };
  } else {
    result.geo_locations = { countries: safeDefaultCountries.length > 0 ? safeDefaultCountries : ['US'] };
  }

  if (targeting.excludedGeoLocations) {
    const excludedGeo: Record<string, unknown> = {};
    const excludedCountries = normalizeCountryCodes(targeting.excludedGeoLocations.countries);
    if (excludedCountries.length) excludedGeo.countries = excludedCountries;
    if (targeting.excludedGeoLocations.regions?.length) excludedGeo.regions = targeting.excludedGeoLocations.regions;
    if (targeting.excludedGeoLocations.cities?.length) excludedGeo.cities = targeting.excludedGeoLocations.cities;
    if (Object.keys(excludedGeo).length > 0) {
      result.excluded_geo_locations = excludedGeo;
    }
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

function buildAttributionSpec(attributionWindow?: string): Array<{ event_type: string; window_days: number }> {
  switch (attributionWindow) {
    case '1d_click':
      return [{ event_type: 'CLICK_THROUGH', window_days: 1 }];
    case '7d_click':
      return [{ event_type: 'CLICK_THROUGH', window_days: 7 }];
    case '1d_click_1d_view':
      return [
        { event_type: 'CLICK_THROUGH', window_days: 1 },
        { event_type: 'VIEW_THROUGH', window_days: 1 },
      ];
    case '7d_click_1d_view':
      return [
        { event_type: 'CLICK_THROUGH', window_days: 7 },
        { event_type: 'VIEW_THROUGH', window_days: 1 },
      ];
    case '7d_click_1d_engagement':
    case '7d_click_1d_engaged_view':
    default:
      return [
        { event_type: 'CLICK_THROUGH', window_days: 7 },
        { event_type: 'ENGAGED_VIDEO_VIEW', window_days: 1 },
      ];
  }
}

const CREATIVE_FEATURE_OPT_OUTS = [
  'image_templates',
  'image_touchups',
  'video_auto_crop',
  'image_brightness_and_contrast',
  'text_optimizations',
  'media_type_automation',
  'pac_relaxation',
  'description_automation',
  'standard_enhancements',
  'inline_comment',
  'video_filtering',
  'text_overlay_translation',
  'profile_card',
  'add_text_overlay',
  'carousel_to_video',
  'image_animation',
  'image_auto_crop',
  'image_background_gen',
  'multi_photo_to_video',
  'music_generation',
  'profile_extension',
  'video_to_image',
  'translate_voiceover',
  'text_generation',
  'image_enhancement',
  'product_metadata_automation',
];

function buildDegreesOfFreedomSpec(enabled?: boolean): Record<string, unknown> {
  if (enabled) {
    return {
      creative_features_spec: {
        image_touchups: { enroll_status: 'OPT_IN' },
      },
    };
  }

  return {
    creative_features_spec: {
      ...Object.fromEntries(
        CREATIVE_FEATURE_OPT_OUTS.map((feature) => [feature, { enroll_status: 'OPT_OUT' }]),
      ),
    },
  };
}

function uniqueCopyItems(items: LaunchConfig['primaryTexts']): Array<{ text: string }> {
  const seen = new Set<string>();
  const result: Array<{ text: string }> = [];
  for (const item of items) {
    const text = item.text?.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ text });
  }
  return result.slice(0, 5);
}

function buildAssetFeedSpec(
  config: LaunchConfig,
): Record<string, unknown> {
  const spec: Record<string, unknown> = {};
  const bodies = uniqueCopyItems(config.primaryTexts);
  const titles = uniqueCopyItems(config.headlines);
  const descriptions = uniqueCopyItems(config.descriptions);

  if (bodies.length > 0) spec.bodies = bodies;
  if (titles.length > 0) spec.titles = titles;
  if (descriptions.length > 0) spec.descriptions = descriptions;
  spec.optimization_type = 'DEGREES_OF_FREEDOM';

  return spec;
}

function shouldUseFlexibleCreative(config: LaunchConfig): boolean {
  return (
    uniqueCopyItems(config.primaryTexts).length > 1 ||
    uniqueCopyItems(config.headlines).length > 1 ||
    uniqueCopyItems(config.descriptions).length > 1
  );
}

function buildCreativeBody(
  config: LaunchConfig,
  profile: { pageId?: string; instagramActorId?: string; destinationUrl?: string; utmTemplate?: string },
  item: Pick<CreativeTestItemRow, 'creative_name' | 'meta_asset_id' | 'meta_asset_type' | 'sourceCreativeId' | 'id'>,
  creativeUrl?: string,
): { creativeBody: Record<string, string>; fallbackObjectStorySpec: Record<string, unknown> } {
  const assetId = item.meta_asset_id || '';
  const assetType = item.meta_asset_type || 'IMAGE';
  const thumbnailSelection = config.videoThumbnails?.[item.sourceCreativeId || item.id];
  const fallbackObjectStorySpec = buildObjectStorySpec(
    config,
    profile,
    assetId,
    assetType,
    creativeUrl,
    thumbnailSelection,
  );
  const creativeBody: Record<string, string> = {
    name: `${item.creative_name} Creative`,
    url_tags: config.utmTemplate || profile.utmTemplate || DEFAULT_META_URL_TAGS,
    object_story_spec: JSON.stringify(fallbackObjectStorySpec),
    contextual_multi_ads: JSON.stringify(buildContextualMultiAdsOptOutSpec()),
  };

  if (config.advantageCreative) {
    creativeBody.degrees_of_freedom_spec = JSON.stringify(buildDegreesOfFreedomSpec(true));
  }

  if (shouldUseFlexibleCreative(config)) {
    creativeBody.asset_feed_spec = JSON.stringify(buildAssetFeedSpec(config));
  }

  return { creativeBody, fallbackObjectStorySpec };
}

function buildObjectStorySpec(
  config: LaunchConfig,
  profile: { pageId?: string; instagramActorId?: string; destinationUrl?: string },
  assetId: string,
  assetType: string,
  creativeUrl?: string,
  thumbnailSelection?: VideoThumbnailOverride,
): Record<string, unknown> {
  const destinationUrl = creativeUrl || profile.destinationUrl || config.destinationUrl || '';
  const pageId = profile.pageId || config.pageId;

  const story: Record<string, unknown> = { page_id: pageId };

  const primaryText = config.primaryTexts[0]?.text || '';
  const headline = config.headlines[0]?.text || '';
  const description = config.descriptions[0]?.text || '';

  const cta = config.ctaType && isValidHttpUrl(destinationUrl)
    ? { type: config.ctaType, value: { link: destinationUrl } }
    : undefined;

  if (assetType === 'VIDEO' || assetType === 'video') {
    const videoData: Record<string, unknown> = {
      video_id: assetId,
      title: headline,
      message: primaryText,
    };
    if (description) {
      videoData.link_description = description;
    }
    if (cta) videoData.call_to_action = cta;
    if (thumbnailSelection?.source === 'manual') {
      if (thumbnailSelection.imageHash) {
        videoData.image_hash = thumbnailSelection.imageHash;
      } else if (thumbnailSelection.imageUrl && isValidHttpUrl(thumbnailSelection.imageUrl)) {
        videoData.image_url = thumbnailSelection.imageUrl;
      }
    }
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
    drive_url:
      snapshot.driveDownloadUrl ||
      snapshot.driveContentUrl ||
      snapshot.driveUrl ||
      snapshot.clickupAttachmentUrl ||
      null,
    thumbnail_url: snapshot.thumbnailUrl ?? null,
    upload_status:
      snapshot.uploadStatus === 'ready' || !!snapshot.metaAssetId
        ? 'ready'
        : snapshot.driveUrl || snapshot.clickupAttachmentUrl
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
    const storeCurrency = await getStoreCurrencyFromConfig(storeId);

    const profile = await getProductProfile(launchConfig.productProfileId);
    if (!profile) {
      return NextResponse.json({ error: 'Product profile not found' }, { status: 404 });
    }

    let accountId = launchConfig.adAccountId || profile.adAccountId;
    if (launchConfig.campaignMode === 'existing' && launchConfig.existingCampaignId) {
      const campaignOwnerAccountId = await resolveCampaignOwnerAccountId(
        token.accessToken,
        launchConfig.existingCampaignId,
      );
      if (campaignOwnerAccountId && !sameAdAccount(accountId, campaignOwnerAccountId)) {
        console.warn('[launch] overriding ad account to match selected campaign owner', {
          configuredAccountId: normalizeAccountNode(accountId),
          campaignOwnerAccountId,
          campaignId: launchConfig.existingCampaignId,
        });
        accountId = campaignOwnerAccountId;
      }
    }
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

    const resolvedDestinationUrl = (
      launchConfig.destinationUrl ||
      profile.destinationUrl ||
      ''
    ).trim();
    if (!resolvedDestinationUrl) {
      return NextResponse.json(
        {
          error:
            'Destination URL is required. Please set a valid product URL in Product Profile or Launch Config.',
        },
        { status: 400 },
      );
    }
    if (!isValidHttpUrl(resolvedDestinationUrl)) {
      return NextResponse.json(
        {
          error:
            'Destination URL is invalid. Please use a full URL starting with http:// or https://',
        },
        { status: 400 },
      );
    }
    const defaultTargetingCountries = [
      inferDefaultCountryFromStore(storeCurrency, resolvedDestinationUrl),
    ];

    const launchProfileContext = {
      pageId: resolvedPageId || undefined,
      instagramActorId: resolvedInstagramActorId || undefined,
      destinationUrl: resolvedDestinationUrl,
      utmTemplate: profile.utmTemplate || undefined,
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
    const effectiveLaunchTime = scheduledLaunchDate?.toISOString() || now;

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
    const entityLaunchStatus = launchConfig.launchStatus || 'ACTIVE';
    const adLaunchStatus = launchConfig.adLaunchStatus || entityLaunchStatus;

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
      testDuration: launchConfig.useTestDuration === false ? 0 : launchConfig.testDuration,
      launchStatus: entityLaunchStatus,
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
        launchConfig.bidStrategy,
        launchConfig.bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS'
          ? launchConfig.roasFloor
          : launchConfig.bidAmount,
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
      launchedAt: effectiveLaunchTime,
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
              headers: {
                'Content-Type': 'application/json',
                ...(request.headers.get('cookie') ? { Cookie: request.headers.get('cookie') || '' } : {}),
              },
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

    const batches = launchConfig.batches as Array<{
      id: string;
      name: string;
      creativeIds: string[];
      dailyBudget?: number;
      dailyMinSpend?: number;
      dailyMaxSpend?: number;
      bidAmount?: number;
    }> | undefined;

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
            const { creativeBody, fallbackObjectStorySpec } = buildCreativeBody(
              launchConfig,
              launchProfileContext,
              item,
              creativeUrl,
            );

            const creativeRes = await createAdCreativeWithFallback(
              token.accessToken,
              accountNode,
              creativeBody,
              item.thumbnail_url || undefined,
              fallbackObjectStorySpec,
            );
            const metaCreativeId = String(creativeRes.id || '');

            if (!metaCreativeId) {
              throw new Error('Meta ad creative creation did not return an ID');
            }

            const createdAd = await createAdWithCreativeFallback({
              accessToken: token.accessToken,
              accountNode,
              adsetId,
              adName: item.creative_name,
              adStatus: adLaunchStatus,
              metaCreativeId,
              creativeBody,
              preferredThumbnailUrl: item.thumbnail_url || undefined,
              fallbackObjectStorySpec,
            });

            await updateCreativeTestItem(item.id, {
              metaAdsetId: adsetId,
              metaAdId: createdAd.adId,
              metaCreativeId: createdAd.metaCreativeId,
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
          const targetingPayload = buildTargetingPayload(targeting, defaultTargetingCountries);
          const adsetName = renderNameTemplate(
            launchConfig.adsetNameOverride,
            batch.name,
            {
              index: batchIdx + 1,
              total: batches.length,
              batchName: batch.name,
              productName: profile.productName,
            },
          );

          const adsetBody: Record<string, string> = {
            name: adsetName,
            campaign_id: campaignId,
            status: entityLaunchStatus,
            billing_event: launchConfig.billingEvent || 'IMPRESSIONS',
            optimization_goal: launchConfig.optimizationGoal || 'OFFSITE_CONVERSIONS',
            targeting: JSON.stringify(targetingPayload),
            attribution_spec: JSON.stringify(buildAttributionSpec(launchConfig.attributionWindow)),
            start_time: resolveStartTime(launchConfig, storeTimezone),
          };

          // Budget (ABO puts budget on ad set, CBO can apply ad-set spending limits).
          if (launchConfig.structure === 'ABO') {
            const budgetCents = Math.round((batch.dailyBudget ?? launchConfig.dailyBudget) * 100);
            adsetBody.daily_budget = String(budgetCents);
          } else {
            const minSpendCents = toBidAmountCents(batch.dailyMinSpend ?? launchConfig.adSetDailyMinSpend);
            const maxSpendCents = toBidAmountCents(batch.dailyMaxSpend ?? launchConfig.adSetDailyMaxSpend);
            if (minSpendCents) adsetBody.daily_min_spend_target = String(minSpendCents);
            if (maxSpendCents) adsetBody.daily_spend_cap = String(maxSpendCents);
          }

          // Bid strategy
          const bidAmt = launchConfig.bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS'
            ? launchConfig.roasFloor
            : batch.bidAmount ?? launchConfig.bidAmount;
          const batchDailyBudget = batch.dailyBudget ?? launchConfig.dailyBudget;
          const bidConfig = resolveAdsetBidConfig(launchConfig.bidStrategy, bidAmt, batchDailyBudget);
          if (bidConfig.bidStrategy) {
            adsetBody.bid_strategy = bidConfig.bidStrategy;
          }
          if (bidConfig.bidAmountCents) {
            adsetBody.bid_amount = String(bidConfig.bidAmountCents);
          }
          if (bidConfig.bidConstraints) {
            adsetBody.bid_constraints = bidConfig.bidConstraints;
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
              const { creativeBody, fallbackObjectStorySpec } = buildCreativeBody(
                launchConfig,
                launchProfileContext,
                item,
                creativeUrl,
              );

              const creativeRes = await createAdCreativeWithFallback(
                token.accessToken,
                accountNode,
                creativeBody,
                item.thumbnail_url || undefined,
                fallbackObjectStorySpec,
              );
              const metaCreativeId = String(creativeRes.id || '');

              if (!metaCreativeId) {
                throw new Error('Meta ad creative creation did not return an ID');
              }

              const createdAd = await createAdWithCreativeFallback({
                accessToken: token.accessToken,
                accountNode,
                adsetId,
                adName: item.creative_name,
                adStatus: adLaunchStatus,
                metaCreativeId,
                creativeBody,
                preferredThumbnailUrl: item.thumbnail_url || undefined,
                fallbackObjectStorySpec,
              });

              await updateCreativeTestItem(item.id, {
                metaAdsetId: adsetId,
                metaAdId: createdAd.adId,
                metaCreativeId: createdAd.metaCreativeId,
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
        const targetingPayload = buildTargetingPayload(targeting, defaultTargetingCountries);
        const adsetName = renderNameTemplate(
          launchConfig.adsetNameOverride,
          item.creative_name,
          {
            index: selectedItems.indexOf(item) + 1,
            total: selectedItems.length,
            creativeName: item.creative_name,
            productName: profile.productName,
          },
        );

        const adsetBody: Record<string, string> = {
          name: adsetName,
          campaign_id: campaignId,
          status: entityLaunchStatus,
          billing_event: launchConfig.billingEvent || 'IMPRESSIONS',
          optimization_goal: launchConfig.optimizationGoal || 'OFFSITE_CONVERSIONS',
          targeting: JSON.stringify(targetingPayload),
          attribution_spec: JSON.stringify(buildAttributionSpec(launchConfig.attributionWindow)),
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
          launchConfig.bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS'
            ? launchConfig.roasFloor
            : launchConfig.bidAmount,
          launchConfig.dailyBudget,
        );
        if (bidConfig.bidStrategy) {
          adsetBody.bid_strategy = bidConfig.bidStrategy;
        }
        if (bidConfig.bidAmountCents) {
          adsetBody.bid_amount = String(bidConfig.bidAmountCents);
        }
        if (bidConfig.bidConstraints) {
          adsetBody.bid_constraints = bidConfig.bidConstraints;
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

        const { creativeBody, fallbackObjectStorySpec } = buildCreativeBody(
          launchConfig,
          launchProfileContext,
          item,
          creativeUrl,
        );

        const creativeRes = await createAdCreativeWithFallback(
          token.accessToken,
          accountNode,
          creativeBody,
          item.thumbnail_url || undefined,
          fallbackObjectStorySpec,
        );
        const creativeId = String(creativeRes.id || '');

        if (!creativeId) {
          throw new Error('Meta ad creative creation did not return an ID');
        }

        const createdAd = await createAdWithCreativeFallback({
          accessToken: token.accessToken,
          accountNode,
          adsetId,
          adName: item.creative_name,
          adStatus: adLaunchStatus,
          metaCreativeId: creativeId,
          creativeBody,
          preferredThumbnailUrl: item.thumbnail_url || undefined,
          fallbackObjectStorySpec,
        });

        // Update creative_test_item with Meta IDs
        await updateCreativeTestItem(item.id, {
          metaAdsetId: adsetId,
          metaAdId: createdAd.adId,
          metaCreativeId: createdAd.metaCreativeId,
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
      if (launchConfig.campaignMode === 'new' && entityLaunchStatus === 'ACTIVE' && campaignId) {
        await postToMeta(token.accessToken, `/${campaignId}`, { status: 'ACTIVE' });
      }
      await updateCreativeTestStatus(
        testId,
        launchConfig.launchTime === 'scheduled' ? 'scheduled' : 'active',
      );
    }

    // Fetch the updated test to return
    const test = await getCreativeTest(testId);

    return NextResponse.json({
      testId,
      status: hasFailure ? 'partial' : launchConfig.launchTime === 'scheduled' ? 'scheduled' : 'active',
      campaignId,
      scheduledFor: scheduledLaunchDate?.toISOString(),
      items: test?.items || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Launch execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
