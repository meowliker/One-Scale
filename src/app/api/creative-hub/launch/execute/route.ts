import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import {
  getProductProfile,
  createCreativeTest,
  updateCreativeTestStatus,
  updateCreativeTestItem,
  getCreativeTest,
} from '@/app/api/lib/creative-hub-db';
import { getDb } from '@/app/api/lib/db';
import type { LaunchConfig, TargetingSpec } from '@/types/creativeHub';

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
      };
      const detail = [
        err.message || 'Meta API error',
        err.type ? `type=${err.type}` : '',
        typeof err.code === 'number' ? `code=${err.code}` : '',
        typeof err.error_subcode === 'number' ? `subcode=${err.error_subcode}` : '',
        err.fbtrace_id ? `fbtrace=${err.fbtrace_id}` : '',
        `endpoint=${endpoint}`,
      ].filter(Boolean).join(' | ');
      throw new Error(detail);
    }
    throw new Error(`${text} | endpoint=${endpoint}`);
  }

  return parsed;
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

/**
 * POST /api/creative-hub/launch/execute
 *
 * Creates campaigns, adsets, ad creatives, and ads on Meta for a creative test.
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
      return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
    }

    const profile = await getProductProfile(launchConfig.productProfileId);
    if (!profile) {
      return NextResponse.json({ error: 'Product profile not found' }, { status: 404 });
    }

    const accountId = launchConfig.adAccountId || profile.adAccountId;
    const accountNode = normalizeAccountNode(accountId);
    const pageId = launchConfig.pageId || profile.pageId;

    if (!pageId) {
      return NextResponse.json({ error: 'Facebook Page ID is required' }, { status: 400 });
    }

    // Fetch selected creative items from DB
    const db = getDb();
    const selectedItems = launchConfig.selectedCreativeIds.length > 0
      ? db.prepare(
          `SELECT * FROM creative_test_items
           WHERE id IN (${launchConfig.selectedCreativeIds.map(() => '?').join(',')})`
        ).all(...launchConfig.selectedCreativeIds) as CreativeTestItemRow[]
      : [];

    if (selectedItems.length === 0) {
      return NextResponse.json({ error: 'No valid creative items found' }, { status: 400 });
    }

    // Create test record with status = 'launching'
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
    let campaignName = launchConfig.newCampaignName || '';

    // Step 1: Create campaign if new
    if (launchConfig.campaignMode === 'new') {
      if (!campaignName) {
        return NextResponse.json({ error: 'Campaign name is required for new campaigns' }, { status: 400 });
      }

      const campaignBody: Record<string, string> = {
        name: campaignName,
        objective: 'OUTCOME_SALES',
        status: launchConfig.launchStatus || 'PAUSED',
        special_ad_categories: '[]',
      };

      if (launchConfig.structure === 'CBO') {
        const budgetCents = Math.round(launchConfig.dailyBudget * 100);
        campaignBody.daily_budget = String(budgetCents);
        campaignBody.is_adset_budget_sharing_enabled = 'false';
      }

      const campaignRes = await postToMeta(token.accessToken, `/${accountNode}/campaigns`, campaignBody);
      campaignId = String(campaignRes.id || '');

      if (!campaignId) {
        return NextResponse.json({ error: 'Meta campaign creation did not return an ID' }, { status: 500 });
      }
    }

    // Create creative_tests record
    await createCreativeTest({
      id: testId,
      storeId,
      productProfileId: launchConfig.productProfileId,
      campaignId,
      campaignName,
      campaignMode: launchConfig.campaignMode,
      adsetMode: launchConfig.adsetMode,
      structure: launchConfig.structure,
      bidStrategy: launchConfig.bidStrategy,
      bidAmount: launchConfig.bidAmount,
      roasFloor: launchConfig.roasFloor,
      dailyBudget: launchConfig.dailyBudget,
      testDuration: launchConfig.testDuration,
      launchStatus: launchConfig.launchStatus,
      status: 'launching',
      launchedBy: 'user',
      launchedAt: now,
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
    });

    // Step 2: For each creative item, create adset + ad creative + ad
    const createdAdsetIds: string[] = [];
    let hasFailure = false;

    for (const item of selectedItems) {
      try {
        if (!item.meta_asset_id) {
          throw new Error(`Creative "${item.creative_name}" has no Meta asset ID. Upload the asset first.`);
        }

        // Determine the creative-specific destination URL
        const creativeUrl = launchConfig.usePerCreativeUrls && launchConfig.perCreativeUrls
          ? launchConfig.perCreativeUrls[item.id]
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
          start_time: launchConfig.scheduledDate
            ? new Date(`${launchConfig.scheduledDate}T${launchConfig.scheduledTime || '00:00'}:00`).toISOString()
            : new Date().toISOString(),
        };

        // Budget (ABO puts budget on adset, CBO on campaign)
        if (launchConfig.structure === 'ABO') {
          const budgetCents = Math.round(launchConfig.dailyBudget * 100);
          adsetBody.daily_budget = String(budgetCents);
        }

        // Bid strategy
        adsetBody.bid_strategy = launchConfig.bidStrategy;
        if (launchConfig.bidAmount && launchConfig.bidStrategy !== 'LOWEST_COST_WITHOUT_CAP') {
          adsetBody.bid_amount = String(Math.round(launchConfig.bidAmount * 100));
        }

        // End date
        if (launchConfig.endDate) {
          adsetBody.end_time = new Date(`${launchConfig.endDate}T23:59:59`).toISOString();
        } else if (launchConfig.testDuration > 0) {
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + launchConfig.testDuration);
          adsetBody.end_time = endDate.toISOString();
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

        const adsetRes = await postToMeta(token.accessToken, `/${accountNode}/adsets`, adsetBody);
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
          const assetFeedSpec = buildAssetFeedSpec(launchConfig, profile, creativeUrl);

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
            profile,
            item.meta_asset_id!,
            item.meta_asset_type || 'IMAGE',
            creativeUrl
          );
          creativeBody.object_story_spec = JSON.stringify(objectStorySpec);
        }

        const creativeRes = await postToMeta(token.accessToken, `/${accountNode}/adcreatives`, creativeBody);
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

    // If any items failed, pause all created adsets and set test status to partial
    if (hasFailure) {
      for (const adsetId of createdAdsetIds) {
        try {
          await postToMeta(token.accessToken, `/${adsetId}`, { status: 'PAUSED' });
        } catch {
          // Best-effort pause
        }
      }
      await updateCreativeTestStatus(testId, 'partial');
    } else {
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
