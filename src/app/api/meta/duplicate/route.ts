import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';

/**
 * Duplicate campaigns, ad sets, or ads using Meta's Marketing API
 * 
 * Meta's copy endpoint: POST /{object-id}/copies
 * - For campaigns: Creates copies of the campaign with all ad sets and ads
 * - For ad sets: Creates copies in the same or different campaign
 * - For ads: Creates copies in the same or different ad set
 */

interface DuplicateRequest {
  storeId: string;
  objectId: string;
  objectType: 'campaign' | 'adset' | 'ad';
  numberOfCopies: number;
  // For ad sets: where to duplicate
  targetCampaignId?: string; // If provided, duplicate to this campaign
  newCampaignName?: string; // If provided, create a new campaign with this name
  // For ads: where to duplicate
  targetAdSetId?: string;
  // Account ID for creating new campaigns
  accountId?: string;
}

async function fetchFromMeta<T>(
  token: string,
  endpoint: string,
  params?: Record<string, string>,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/v21.0${endpoint}`);
  url.searchParams.set('access_token', token);
  
  if (params && method === 'GET') {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (method === 'POST' && body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), options);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Meta API error: ${response.status}`);
  }

  return response.json();
}

export async function POST(request: NextRequest) {
  try {
    const body: DuplicateRequest = await request.json();
    const { storeId, objectId, objectType, numberOfCopies, targetCampaignId, newCampaignName, accountId } = body;

    if (!storeId || !objectId || !objectType || !numberOfCopies) {
      return NextResponse.json(
        { error: 'Missing required fields: storeId, objectId, objectType, numberOfCopies' },
        { status: 400 }
      );
    }

    const tokenData = await getMetaToken(storeId);
    if (!tokenData) {
      return NextResponse.json({ error: 'Meta token not found for store' }, { status: 401 });
    }
    const token = tokenData.accessToken;

    const results: { id: string; name?: string }[] = [];

    // Handle ad set duplication to a new campaign
    if (objectType === 'adset' && newCampaignName && accountId) {
      // First, get the original ad set to copy its campaign's settings
      const adSetData = await fetchFromMeta<{
        id: string;
        campaign: { id: string };
      }>(token, `/${objectId}`, { fields: 'id,campaign{id}' });

      // Get the original campaign settings
      const originalCampaign = await fetchFromMeta<{
        id: string;
        name: string;
        objective: string;
        status: string;
        special_ad_categories: string[];
        buying_type: string;
      }>(token, `/${adSetData.campaign.id}`, {
        fields: 'id,name,objective,status,special_ad_categories,buying_type',
      });

      // Create a new campaign
      const newCampaign = await fetchFromMeta<{ id: string }>(
        token,
        `/${accountId}/campaigns`,
        undefined,
        'POST',
        {
          name: newCampaignName,
          objective: originalCampaign.objective,
          status: 'PAUSED', // Create as paused
          special_ad_categories: originalCampaign.special_ad_categories || [],
        }
      );

      // Now duplicate the ad set to the new campaign
      for (let i = 0; i < numberOfCopies; i++) {
        const copyResult = await fetchFromMeta<{
          copied_adset_id: string;
        }>(token, `/${objectId}/copies`, undefined, 'POST', {
          campaign_id: newCampaign.id,
          deep_copy: true,
          status_option: 'PAUSED',
        });
        results.push({ id: copyResult.copied_adset_id });
      }

      return NextResponse.json({
        success: true,
        objectType,
        copies: results,
        newCampaignId: newCampaign.id,
        message: `Created ${results.length} copies in new campaign "${newCampaignName}"`,
      });
    }

    // Handle ad set duplication to existing campaign
    if (objectType === 'adset' && targetCampaignId) {
      for (let i = 0; i < numberOfCopies; i++) {
        const copyResult = await fetchFromMeta<{
          copied_adset_id: string;
        }>(token, `/${objectId}/copies`, undefined, 'POST', {
          campaign_id: targetCampaignId,
          deep_copy: true,
          status_option: 'PAUSED',
        });
        results.push({ id: copyResult.copied_adset_id });
      }

      return NextResponse.json({
        success: true,
        objectType,
        copies: results,
        targetCampaignId,
        message: `Created ${results.length} copies in campaign ${targetCampaignId}`,
      });
    }

    // Handle campaign duplication (includes all ad sets and ads)
    if (objectType === 'campaign') {
      for (let i = 0; i < numberOfCopies; i++) {
        const copyResult = await fetchFromMeta<{
          copied_campaign_id: string;
        }>(token, `/${objectId}/copies`, undefined, 'POST', {
          deep_copy: true,
          status_option: 'PAUSED',
        });
        results.push({ id: copyResult.copied_campaign_id });
      }

      return NextResponse.json({
        success: true,
        objectType,
        copies: results,
        message: `Created ${results.length} campaign copies`,
      });
    }

    // Handle ad set duplication to same campaign (original campaign)
    if (objectType === 'adset') {
      for (let i = 0; i < numberOfCopies; i++) {
        const copyResult = await fetchFromMeta<{
          copied_adset_id: string;
        }>(token, `/${objectId}/copies`, undefined, 'POST', {
          deep_copy: true,
          status_option: 'PAUSED',
        });
        results.push({ id: copyResult.copied_adset_id });
      }

      return NextResponse.json({
        success: true,
        objectType,
        copies: results,
        message: `Created ${results.length} ad set copies`,
      });
    }

    // Handle ad duplication
    if (objectType === 'ad') {
      const targetAdSet = body.targetAdSetId;
      for (let i = 0; i < numberOfCopies; i++) {
        const copyParams: Record<string, unknown> = {
          deep_copy: true,
          status_option: 'PAUSED',
        };
        if (targetAdSet) {
          copyParams.adset_id = targetAdSet;
        }
        const copyResult = await fetchFromMeta<{
          copied_ad_id: string;
        }>(token, `/${objectId}/copies`, undefined, 'POST', copyParams);
        results.push({ id: copyResult.copied_ad_id });
      }

      return NextResponse.json({
        success: true,
        objectType,
        copies: results,
        message: `Created ${results.length} ad copies`,
      });
    }

    return NextResponse.json({ error: 'Invalid object type' }, { status: 400 });
  } catch (error) {
    console.error('[duplicate] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to duplicate' },
      { status: 500 }
    );
  }
}
