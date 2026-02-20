import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { getStoreAdAccounts, getAllStores } from '@/app/api/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let storeId = searchParams.get('storeId');

  // Auto-detect store if not provided — find first store with a Meta connection
  if (!storeId) {
    const allStores = getAllStores();
    const storeWithMeta = allStores.find((s) => s.metaConnected);
    if (storeWithMeta) {
      storeId = storeWithMeta.id;
    } else {
      return NextResponse.json({
        error: 'No store with Meta connection found',
        availableStores: allStores.map((s) => ({ id: s.id, name: s.name, metaConnected: s.metaConnected })),
      }, { status: 400 });
    }
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    const allStores = getAllStores();
    return NextResponse.json({
      error: 'Not authenticated — token not found or expired for this storeId',
      storeIdUsed: storeId,
      availableStores: allStores.map((s) => ({ id: s.id, name: s.name, metaConnected: s.metaConnected })),
      hint: 'Try visiting this URL without ?storeId to auto-detect, or use one of the store IDs listed above',
    }, { status: 401 });
  }

  const mapped = getStoreAdAccounts(storeId);
  const activeAccounts = mapped.filter(a => a.platform === 'meta' && a.is_active === 1);

  if (activeAccounts.length === 0) {
    return NextResponse.json({ error: 'No active accounts', storeId, allMappedAccounts: mapped }, { status: 400 });
  }

  const accountId = activeAccounts[0].ad_account_id;
  const results: Record<string, unknown> = {
    storeId,
    accountId,
    accountName: activeAccounts[0].ad_account_name,
    tokenPresent: true,
  };

  // Use 10s timeout for debug
  const TIMEOUT = 10000;

  // 1. Fetch campaigns first (fast call)
  try {
    const start = Date.now();
    const campaignsData = await fetchFromMeta<{ data: Array<Record<string, unknown>> }>(
      token.accessToken,
      `/${accountId}/campaigns`,
      { fields: 'id,name,objective,special_ad_categories,special_ad_category_country', limit: '5' },
      TIMEOUT
    );
    results.campaignsFetchMs = Date.now() - start;
    results.campaigns = campaignsData.data?.slice(0, 3) || [];

    if (!campaignsData.data?.length) {
      results.error = 'No campaigns found';
      return NextResponse.json(results);
    }

    const firstCampaignId = campaignsData.data[0].id;
    results.firstCampaignId = firstCampaignId;

    // 2. Fetch insights with date_preset (most reliable approach)
    try {
      const start2 = Date.now();
      const insightsWithPreset = await fetchFromMeta<{ data: Record<string, unknown>[] }>(
        token.accessToken,
        `/${firstCampaignId}/insights`,
        {
          fields: 'spend,impressions,reach,clicks,actions,action_values,ctr,cpc,cpm',
          date_preset: 'last_30d',
        },
        TIMEOUT
      );
      results.insightsWithPresetMs = Date.now() - start2;
      results.insightsWithPreset = insightsWithPreset;
      results.hasInsightsData = !!(insightsWithPreset.data && insightsWithPreset.data.length > 0);
      if (insightsWithPreset.data?.[0]) {
        results.sampleSpend = insightsWithPreset.data[0].spend;
        results.sampleImpressions = insightsWithPreset.data[0].impressions;
        results.hasActions = !!insightsWithPreset.data[0].actions;
        results.hasActionValues = !!insightsWithPreset.data[0].action_values;
      }
    } catch (err: unknown) {
      results.insightsWithPreset = { error: err instanceof Error ? err.message : String(err) };
    }

    // 3. Fetch with time_range
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since = thirtyDaysAgo.toISOString().split('T')[0];
    const until = now.toISOString().split('T')[0];
    results.timeRangeUsed = { since, until };

    try {
      const start3 = Date.now();
      const insightsWithTimeRange = await fetchFromMeta<{ data: Record<string, unknown>[] }>(
        token.accessToken,
        `/${firstCampaignId}/insights`,
        {
          fields: 'spend,impressions,reach,clicks,actions,action_values,ctr,cpc,cpm',
          time_range: JSON.stringify({ since, until }),
        },
        TIMEOUT
      );
      results.insightsWithTimeRangeMs = Date.now() - start3;
      results.insightsWithTimeRange = insightsWithTimeRange;
    } catch (err: unknown) {
      results.insightsWithTimeRange = { error: err instanceof Error ? err.message : String(err) };
    }

    // 4. Account-level insights
    try {
      const start4 = Date.now();
      const accountInsights = await fetchFromMeta<{ data: Record<string, unknown>[] }>(
        token.accessToken,
        `/${accountId}/insights`,
        {
          fields: 'spend,impressions,clicks,actions,action_values',
          date_preset: 'last_30d',
        },
        TIMEOUT
      );
      results.accountInsightsMs = Date.now() - start4;
      results.accountInsights = accountInsights;
    } catch (err: unknown) {
      results.accountInsights = { error: err instanceof Error ? err.message : String(err) };
    }

  } catch (err: unknown) {
    results.error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(results);
}
