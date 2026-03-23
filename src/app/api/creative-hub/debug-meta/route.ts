import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';

// Debug endpoint to test what Meta API returns for a creative/ad
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const creativeId = searchParams.get('creativeId');
  const adId = searchParams.get('adId');
  const adAccountId = searchParams.get('adAccountId');

  if (!storeId) return NextResponse.json({ error: 'storeId required' });

  const tokenObj = await getMetaToken(storeId);
  if (!tokenObj) return NextResponse.json({ error: 'No Meta token' });
  const token = tokenObj.accessToken;

  const results: Record<string, unknown> = {};

  // Test 1: Fetch creative by ID with object_story_spec
  if (creativeId) {
    try {
      const creative = await fetchFromMeta<Record<string, unknown>>(
        token, creativeId,
        { fields: 'id,name,object_story_spec,instagram_actor_id,asset_feed_spec' },
        10000, 0,
      );
      results.creative = creative;
    } catch (err) {
      results.creativeError = String(err);
    }
  }

  // Test 2: Fetch ad by ID
  if (adId) {
    try {
      const ad = await fetchFromMeta<Record<string, unknown>>(
        token, adId,
        { fields: 'id,name,creative{id},promoted_object' },
        10000, 0,
      );
      results.ad = ad;
    } catch (err) {
      results.adError = String(err);
    }

    // Test 3: Fetch adcreatives from ad
    try {
      const adcreatives = await fetchFromMeta<{ data: Array<Record<string, unknown>> }>(
        token, `${adId}/adcreatives`,
        { fields: 'id,object_story_spec' },
        10000, 0,
      );
      results.adcreatives = adcreatives;
    } catch (err) {
      results.adcreativesError = String(err);
    }
  }

  // Test 4: Fetch pixels for ad account
  if (adAccountId) {
    try {
      const pixels = await fetchFromMeta<{ data: Array<Record<string, unknown>> }>(
        token, `${adAccountId}/adspixels`,
        { fields: 'id,name' },
        10000, 0,
      );
      results.pixels = pixels;
    } catch (err) {
      results.pixelsError = String(err);
    }
  }

  // Test 5: Fetch 1 ad from a campaign with promoted_object
  const campaignId = searchParams.get('campaignId');
  if (campaignId) {
    try {
      const campaignAds = await fetchFromMeta<{ data: Array<Record<string, unknown>> }>(
        token, `${campaignId}/ads`,
        { fields: 'id,creative{id},promoted_object', limit: '1' },
        10000, 0,
      );
      results.campaignAds = campaignAds;
    } catch (err) {
      results.campaignAdsError = String(err);
    }
  }

  return NextResponse.json(results);
}
