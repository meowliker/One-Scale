import { NextRequest, NextResponse } from 'next/server';
import { getCreativeTest, updateCreativeTestItem } from '@/app/api/lib/creative-hub-db';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';

interface MetaInsightRow {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
}

interface MetaInsightsResponse {
  data?: MetaInsightRow[];
}

function extractActionValue(
  actions: Array<{ action_type: string; value: string }> | undefined,
  actionType: string
): number {
  if (!actions) return 0;
  const match = actions.find((a) => a.action_type === actionType);
  return match ? parseFloat(match.value) || 0 : 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  const { testId } = await params;
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const test = await getCreativeTest(testId);
  if (!test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 });
  }
  if (test.storeId !== storeId) {
    return NextResponse.json({ error: 'Test does not belong to this store' }, { status: 403 });
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  try {
    const insightFields = [
      'spend',
      'impressions',
      'clicks',
      'ctr',
      'cpc',
      'cpm',
      'actions',
      'action_values',
      'purchase_roas',
      'cost_per_action_type',
    ].join(',');

    // Fetch insights for each ad in the test
    const itemsWithAds = test.items.filter((item) => item.metaAdId);

    const insightResults = await Promise.all(
      itemsWithAds.map(async (item) => {
        try {
          const response = await fetchFromMeta<MetaInsightsResponse>(
            token.accessToken,
            `/${item.metaAdId}/insights`,
            {
              fields: insightFields,
              date_preset: 'maximum',
            },
            15_000,
            1
          );
          return { itemId: item.id, data: response.data?.[0] ?? null };
        } catch {
          return { itemId: item.id, data: null };
        }
      })
    );

    // Update each item with fetched metrics
    let totalSpend = 0;
    for (const result of insightResults) {
      if (!result.data) continue;

      const row = result.data;
      const spend = parseFloat(row.spend ?? '0');
      const impressions = parseInt(row.impressions ?? '0', 10);
      const clicks = parseInt(row.clicks ?? '0', 10);
      const ctr = parseFloat(row.ctr ?? '0');
      const purchases = extractActionValue(row.actions, 'purchase');
      const revenue = extractActionValue(row.action_values, 'purchase');
      const roas = spend > 0 ? revenue / spend : 0;
      const cpa = purchases > 0 ? spend / purchases : undefined;

      totalSpend += spend;

      await updateCreativeTestItem(result.itemId, {
        spend,
        impressions,
        ctr,
        purchases,
        revenue,
        roas,
        cpa,
      });
    }

    // Update total spend on the test
    const db = (await import('@/app/api/lib/db')).getDb();
    db.prepare('UPDATE creative_tests SET total_spend = ? WHERE id = ?').run(totalSpend, testId);

    // Re-fetch the test with updated metrics
    const updatedTest = await getCreativeTest(testId);

    return NextResponse.json({ test: updatedTest });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch test metrics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
