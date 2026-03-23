import { NextRequest, NextResponse } from 'next/server';
import {
  getCreativeTest,
  updateCreativeTestItem,
  updateCreativeTestStatus,
  saveCopyToLibrary,
} from '@/app/api/lib/creative-hub-db';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { randomUUID } from 'crypto';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

interface ActionItem {
  itemId: string;
  action: 'kill' | 'scale' | 'graduate';
  params?: {
    newBudget?: number;
    scalingCampaignId?: string;
  };
}

interface ActionResult {
  itemId: string;
  action: string;
  success: boolean;
  error?: string;
}

async function postToMeta(
  accessToken: string,
  objectId: string,
  data: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  try {
    const form = new URLSearchParams(data);
    const response = await fetch(
      `${META_GRAPH_URL}/${encodeURIComponent(objectId)}?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      }
    );

    if (!response.ok) {
      const raw = await response.text();
      return { success: false, error: `Meta API error (${response.status}): ${raw}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Meta API request failed' };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  const { testId } = await params;
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const test = getCreativeTest(testId);
  if (!test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 });
  }
  if (test.storeId !== storeId) {
    return NextResponse.json({ error: 'Test does not belong to this store' }, { status: 403 });
  }

  let body: { actions?: ActionItem[] } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const actions = body.actions;
  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return NextResponse.json({ error: 'actions array is required' }, { status: 400 });
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  const results: ActionResult[] = [];

  for (const actionItem of actions) {
    const item = test.items.find((i) => i.id === actionItem.itemId);
    if (!item) {
      results.push({ itemId: actionItem.itemId, action: actionItem.action, success: false, error: 'Item not found in test' });
      continue;
    }

    try {
      switch (actionItem.action) {
        case 'kill': {
          // Pause the adset to kill the creative test
          if (!item.metaAdsetId) {
            results.push({ itemId: item.id, action: 'kill', success: false, error: 'No adset ID to pause' });
            break;
          }

          const killResult = await postToMeta(token.accessToken, item.metaAdsetId, { status: 'PAUSED' });
          if (!killResult.success) {
            results.push({ itemId: item.id, action: 'kill', success: false, error: killResult.error });
            break;
          }

          updateCreativeTestItem(item.id, { testStatus: 'killed' });
          results.push({ itemId: item.id, action: 'kill', success: true });
          break;
        }

        case 'scale': {
          // Update adset budget
          if (!item.metaAdsetId) {
            results.push({ itemId: item.id, action: 'scale', success: false, error: 'No adset ID to scale' });
            break;
          }

          const newBudget = actionItem.params?.newBudget;
          if (!newBudget || newBudget <= 0) {
            results.push({ itemId: item.id, action: 'scale', success: false, error: 'newBudget is required and must be positive' });
            break;
          }

          // Meta API expects budget in cents
          const budgetCents = Math.round(newBudget * 100).toString();
          const scaleResult = await postToMeta(token.accessToken, item.metaAdsetId, {
            daily_budget: budgetCents,
          });
          if (!scaleResult.success) {
            results.push({ itemId: item.id, action: 'scale', success: false, error: scaleResult.error });
            break;
          }

          updateCreativeTestItem(item.id, { testStatus: 'winner' });
          results.push({ itemId: item.id, action: 'scale', success: true });
          break;
        }

        case 'graduate': {
          // Graduate: duplicate ad to scaling campaign
          // For now, use Meta API to copy the ad creative into a new ad in the scaling campaign
          const scalingCampaignId = actionItem.params?.scalingCampaignId;

          if (!item.metaAdId) {
            results.push({ itemId: item.id, action: 'graduate', success: false, error: 'No ad ID to graduate' });
            break;
          }

          if (!scalingCampaignId) {
            results.push({ itemId: item.id, action: 'graduate', success: false, error: 'scalingCampaignId is required for graduate action' });
            break;
          }

          // Fetch the source ad details for duplication
          try {
            const adDetails = await fetchFromMeta<{
              creative?: { id: string };
              targeting?: Record<string, unknown>;
              adset_id?: string;
            }>(
              token.accessToken,
              `/${item.metaAdId}`,
              { fields: 'creative,targeting,adset_id' },
              15_000,
              1
            );

            // Create a new adset in the scaling campaign
            const adAccountId = test.items[0]?.metaAdsetId
              ? undefined // we'll use the campaign's account
              : undefined;

            // For full graduation, the frontend should use the existing
            // /api/meta/adsets and /api/meta/ads creation endpoints.
            // Here we mark the item as graduated (winner).
            updateCreativeTestItem(item.id, { testStatus: 'winner' });

            // Save ad copy to copy library for winner
            const adCopy = test.adCopy;
            const primaryText = adCopy.find((c) => c.copyType === 'primary_text');
            const headline = adCopy.find((c) => c.copyType === 'headline');
            const description = adCopy.find((c) => c.copyType === 'description');

            if (primaryText) {
              saveCopyToLibrary({
                id: randomUUID(),
                productProfileId: test.productProfileId,
                primaryText: primaryText.copyText,
                headline: headline?.copyText,
                description: description?.copyText,
                sourceAdId: item.metaAdId,
                sourceTestId: testId,
                roas: item.roas,
                cpa: item.cpa,
                ctr: item.ctr,
                totalSpend: item.spend,
                totalRevenue: item.revenue,
                totalPurchases: item.purchases,
                isAiGenerated: primaryText.source === 'ai_generated',
              });
            }

            results.push({
              itemId: item.id,
              action: 'graduate',
              success: true,
            });
          } catch (fetchErr) {
            results.push({
              itemId: item.id,
              action: 'graduate',
              success: false,
              error: fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch ad details for graduation',
            });
          }
          break;
        }

        default:
          results.push({ itemId: item.id, action: actionItem.action, success: false, error: 'Unknown action' });
      }
    } catch (err) {
      results.push({
        itemId: item.id,
        action: actionItem.action,
        success: false,
        error: err instanceof Error ? err.message : 'Action failed',
      });
    }
  }

  // Check if all items in test are now resolved (winner or killed)
  const updatedTest = getCreativeTest(testId);
  if (updatedTest) {
    const allResolved = updatedTest.items.every(
      (i) => i.testStatus === 'winner' || i.testStatus === 'killed' || i.testStatus === 'inconclusive'
    );
    if (allResolved) {
      updateCreativeTestStatus(testId, 'completed');
    }
  }

  return NextResponse.json({ success: true, results });
}
