import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { getStoreAdAccounts } from '@/app/api/lib/db';

/**
 * OPTIMIZED: Uses a SINGLE account-level insights call with level=campaign
 * and time_increment=1 to get daily sparkline data for ALL campaigns at once.
 * This replaces N individual per-entity calls (was 5-10 calls, now just 1).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const entityId = searchParams.get('entityId');
  const entityIds = searchParams.get('entityIds');
  const accountIds = searchParams.get('accountIds');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const token = getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const ids = entityIds ? entityIds.split(',').filter(Boolean) : (entityId ? [entityId] : []);
  if (ids.length === 0) {
    return NextResponse.json({ error: 'entityId or entityIds required' }, { status: 400 });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since = sevenDaysAgo.toISOString().split('T')[0];
  const until = now.toISOString().split('T')[0];

  // Determine which ad accounts to query
  let adAccountIds: string[] = [];
  if (accountIds) {
    adAccountIds = accountIds.split(',').filter(Boolean);
  } else {
    // Auto-detect from store
    try {
      const storeAccounts = getStoreAdAccounts(storeId);
      adAccountIds = storeAccounts
        .filter((a) => a.platform === 'meta' && a.is_active === 1)
        .map((a) => a.ad_account_id);
    } catch {
      // ignore
    }
  }

  if (adAccountIds.length === 0) {
    return NextResponse.json({ error: 'No ad accounts found' }, { status: 400 });
  }

  const idsSet = new Set(ids);
  const sparklineMap: Record<string, { day: string; spend: number; revenue: number; roas: number }[]> = {};

  try {
    // Use SINGLE account-level insights call with level=campaign and time_increment=1
    // This returns daily data for ALL campaigns in one call instead of N calls.
    const results = await Promise.allSettled(
      adAccountIds.map(async (accountId) => {
        const data = await fetchFromMeta<{
          data: {
            campaign_id: string;
            spend?: string;
            action_values?: { action_type: string; value: string }[];
            date_start?: string;
          }[];
        }>(
          token.accessToken,
          `/${accountId}/insights`,
          {
            fields: 'campaign_id,spend,action_values,date_start',
            level: 'campaign',
            time_range: JSON.stringify({ since, until }),
            time_increment: '1',
            limit: '1000',
          },
          20000 // 20s timeout for this heavier call
        );
        return data.data || [];
      })
    );

    // Merge results from all accounts — group by campaign_id and date
    const dailyByCampaign = new Map<string, Map<string, { spend: number; revenue: number }>>();

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const row of result.value) {
        const campaignId = row.campaign_id;
        if (!campaignId || !idsSet.has(campaignId)) continue;

        const dateStr = row.date_start || '';
        const spend = parseFloat(row.spend || '0');

        // Priority-based revenue extraction (no double-counting)
        let revenue = 0;
        if (row.action_values) {
          const pixelPurchase = row.action_values.find(
            (a) => a.action_type === 'offsite_conversion.fb_pixel_purchase'
          );
          const genericPurchase = row.action_values.find(
            (a) => a.action_type === 'purchase'
          );
          const revenueEntry = pixelPurchase || genericPurchase;
          if (revenueEntry) {
            revenue = parseFloat(revenueEntry.value || '0');
          }
        }

        if (!dailyByCampaign.has(campaignId)) {
          dailyByCampaign.set(campaignId, new Map());
        }
        const dayMap = dailyByCampaign.get(campaignId)!;
        const existing = dayMap.get(dateStr);
        if (existing) {
          existing.spend += spend;
          existing.revenue += revenue;
        } else {
          dayMap.set(dateStr, { spend, revenue });
        }
      }
    }

    // Build sparkline arrays sorted by date
    for (const id of ids) {
      const dayMap = dailyByCampaign.get(id);
      if (!dayMap || dayMap.size === 0) {
        sparklineMap[id] = [];
        continue;
      }

      const sorted = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b));
      sparklineMap[id] = sorted.map(([dateStr, { spend, revenue }]) => {
        const roas = spend > 0 ? revenue / spend : 0;
        const dayLabel = dateStr
          ? new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })
          : '';
        return { day: dayLabel, spend, revenue, roas };
      });
    }

    console.log(`[Meta] Sparkline: ${Object.keys(sparklineMap).filter(k => sparklineMap[k].length > 0).length}/${ids.length} campaigns have data (1 API call per account)`);

    return NextResponse.json({ data: sparklineMap });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch sparkline data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
