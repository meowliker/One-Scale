import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import {
  getCreativeTest,
  getProductProfile,
  updateCreativeTestStatus,
  updateCreativeTestItem,
} from '@/app/api/lib/creative-hub-db';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

async function deleteMetaEntity(accessToken: string, entityId: string): Promise<boolean> {
  try {
    const endpoint = `${GRAPH_BASE}/${entityId}?access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(endpoint, { method: 'DELETE' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * POST /api/creative-hub/launch/rollback/[testId]
 *
 * Deletes all created adsets/ads from Meta and marks the test as failed.
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

    const test = getCreativeTest(testId);
    if (!test) {
      return NextResponse.json({ error: 'Creative test not found' }, { status: 404 });
    }

    if (test.storeId !== storeId) {
      return NextResponse.json({ error: 'Test does not belong to this store' }, { status: 403 });
    }

    const deletionResults: Array<{ itemId: string; creativeName: string; deletedAd: boolean; deletedAdset: boolean }> = [];

    // Delete ads and adsets for each item (delete ads first, then adsets)
    for (const item of test.items) {
      const result = {
        itemId: item.id,
        creativeName: item.creativeName,
        deletedAd: false,
        deletedAdset: false,
      };

      // Delete ad first
      if (item.metaAdId) {
        result.deletedAd = await deleteMetaEntity(token.accessToken, item.metaAdId);
      }

      // Delete ad creative
      if (item.metaCreativeId) {
        await deleteMetaEntity(token.accessToken, item.metaCreativeId);
      }

      // Delete adset
      if (item.metaAdsetId) {
        result.deletedAdset = await deleteMetaEntity(token.accessToken, item.metaAdsetId);
      }

      // Update item status
      updateCreativeTestItem(item.id, {
        launchStatus: 'rolled_back',
        metaAdId: undefined,
        metaAdsetId: undefined,
        metaCreativeId: undefined,
      });

      deletionResults.push(result);
    }

    // If a new campaign was created for this test and all items are rolled back,
    // also try to delete the campaign
    let deletedCampaign = false;
    if (test.campaignMode === 'new' && test.campaignId) {
      deletedCampaign = await deleteMetaEntity(token.accessToken, test.campaignId);
    }

    // Update test status to failed
    updateCreativeTestStatus(testId, 'failed');

    const updatedTest = getCreativeTest(testId);

    return NextResponse.json({
      testId,
      status: 'failed',
      deletedCampaign,
      deletionResults,
      items: updatedTest?.items || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Rollback failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
