import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import {
  getCreativeTest,
  getProductProfile,
  updateCreativeTestStatus,
  updateCreativeTestItem,
} from '@/app/api/lib/creative-hub-db';
import type { TargetingSpec } from '@/types/creativeHub';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const DEFAULT_META_URL_TAGS =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';

function normalizeAccountNode(value: string): string {
  const node = value.trim();
  if (!node) return '';
  if (node.startsWith('act_')) return node;
  return `act_${node.replace(/^act_/, '')}`;
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
      const err = parsed.error as { message?: string; code?: number; fbtrace_id?: string };
      throw new Error(
        [err.message || 'Meta API error', typeof err.code === 'number' ? `code=${err.code}` : '', `endpoint=${endpoint}`]
          .filter(Boolean)
          .join(' | ')
      );
    }
    throw new Error(`${text} | endpoint=${endpoint}`);
  }

  return parsed;
}

/**
 * POST /api/creative-hub/launch/retry/[testId]
 *
 * Retries creating adsets/ads for failed items in an existing creative test.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  try {
    const { testId } = await params;
    const { storeId } = await request.json() as { storeId: string };

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const token = await getMetaToken(storeId);
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
    }

    const test = await getCreativeTest(testId);
    if (!test) {
      return NextResponse.json({ error: 'Creative test not found' }, { status: 404 });
    }

    if (test.storeId !== storeId) {
      return NextResponse.json({ error: 'Test does not belong to this store' }, { status: 403 });
    }

    const profile = await getProductProfile(test.productProfileId);
    if (!profile) {
      return NextResponse.json({ error: 'Product profile not found' }, { status: 404 });
    }

    const accountNode = normalizeAccountNode(profile.adAccountId);
    const failedItems = test.items.filter((item) => item.launchStatus === 'failed');

    if (failedItems.length === 0) {
      return NextResponse.json({ error: 'No failed items to retry' }, { status: 400 });
    }

    await updateCreativeTestStatus(testId, 'launching');

    let retryFailures = 0;

    for (const item of failedItems) {
      try {
        if (!item.metaAssetId) {
          throw new Error(`Creative "${item.creativeName}" has no Meta asset ID`);
        }

        // Build targeting from profile defaults
        const targetingPayload: Record<string, unknown> = {
          geo_locations: { countries: ['US'] },
          age_min: 18,
          age_max: 65,
        };

        // Create adset (if not already created)
        let adsetId = item.metaAdsetId;
        if (!adsetId) {
          const adsetBody: Record<string, string> = {
            name: item.creativeName,
            campaign_id: test.campaignId,
            status: test.launchStatus || 'PAUSED',
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'OFFSITE_CONVERSIONS',
            targeting: JSON.stringify(targetingPayload),
            start_time: new Date().toISOString(),
          };

          if (test.structure === 'ABO' && test.dailyBudget) {
            adsetBody.daily_budget = String(Math.round(test.dailyBudget * 100));
          }

          if (test.bidStrategy) {
            adsetBody.bid_strategy = test.bidStrategy;
          }

          if (test.bidAmount && test.bidStrategy !== 'LOWEST_COST_WITHOUT_CAP') {
            adsetBody.bid_amount = String(Math.round(test.bidAmount * 100));
          }

          if (test.testDuration && test.testDuration > 0) {
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + test.testDuration);
            adsetBody.end_time = endDate.toISOString();
          }

          const pixelId = profile.pixelId;
          if (pixelId) {
            adsetBody.promoted_object = JSON.stringify({
              pixel_id: pixelId,
              custom_event_type: profile.conversionEvent || 'PURCHASE',
            });
          }

          const adsetRes = await postToMeta(token.accessToken, `/${accountNode}/adsets`, adsetBody);
          adsetId = String(adsetRes.id || '');
          if (!adsetId) throw new Error('Meta adset creation did not return an ID');
        }

        // Create ad creative (if not already created)
        let creativeId = item.metaCreativeId;
        if (!creativeId) {
          const destinationUrl = profile.destinationUrl || '';
          const pageId = profile.pageId;

          // Use object_story_spec for retry simplicity
          const story: Record<string, unknown> = { page_id: pageId };
          if (profile.instagramActorId) story.instagram_actor_id = profile.instagramActorId;

          const primaryText = test.adCopy.find((c) => c.copyType === 'primary_text')?.copyText || '';
          const headline = test.adCopy.find((c) => c.copyType === 'headline')?.copyText || '';
          const description = test.adCopy.find((c) => c.copyType === 'description')?.copyText || '';

          if (item.metaAssetType === 'VIDEO' || item.creativeFormat === 'video') {
            story.video_data = {
              video_id: item.metaAssetId,
              title: headline,
              message: primaryText,
            };
          } else {
            story.link_data = {
              message: primaryText,
              name: headline,
              description,
              link: destinationUrl,
              image_hash: item.metaAssetId,
            };
          }

          const creativeRes = await postToMeta(token.accessToken, `/${accountNode}/adcreatives`, {
            name: `${item.creativeName} Creative`,
            object_story_spec: JSON.stringify(story),
            url_tags: profile.utmTemplate || DEFAULT_META_URL_TAGS,
          });
          creativeId = String(creativeRes.id || '');
          if (!creativeId) throw new Error('Meta ad creative creation did not return an ID');
        }

        // Create ad (if not already created)
        let adId = item.metaAdId;
        if (!adId) {
          const adRes = await postToMeta(token.accessToken, `/${accountNode}/ads`, {
            name: item.creativeName,
            adset_id: adsetId,
            status: test.launchStatus || 'PAUSED',
            creative: JSON.stringify({ creative_id: creativeId }),
          });
          adId = String(adRes.id || '');
          if (!adId) throw new Error('Meta ad creation did not return an ID');
        }

        await updateCreativeTestItem(item.id, {
          metaAdsetId: adsetId,
          metaAdId: adId,
          metaCreativeId: creativeId,
          launchStatus: 'created',
          reviewFeedback: undefined,
        });
      } catch (err) {
        retryFailures++;
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Retry] Failed for "${item.creativeName}":`, message);
        await updateCreativeTestItem(item.id, {
          launchStatus: 'failed',
          reviewFeedback: message,
        });
      }
    }

    // Update overall test status
    if (retryFailures === 0) {
      await updateCreativeTestStatus(testId, 'active');
    } else if (retryFailures < failedItems.length) {
      await updateCreativeTestStatus(testId, 'partial');
    }
    // If all retries failed, leave status as-is (still partial/failed)

    const updatedTest = await getCreativeTest(testId);

    return NextResponse.json({
      testId,
      status: updatedTest?.status || 'partial',
      retriedCount: failedItems.length,
      failedCount: retryFailures,
      items: updatedTest?.items || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retry failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
