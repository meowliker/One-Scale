import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaCampaigns } from '@/app/api/lib/meta-client';
import { getMetaEndpointSnapshot, getLatestMetaEndpointSnapshot, getStoreAdAccounts, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import type { Campaign } from '@/types/campaign';

function isApproxLast30Range(since?: string | null, until?: string | null): boolean {
  if (!since || !until) return false;
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return days >= 28 && days <= 32;
}

function hasCampaignSignal(rows: Campaign[]): boolean {
  return rows.some((row) =>
    (row.metrics?.spend || 0) > 0 ||
    (row.metrics?.impressions || 0) > 0 ||
    (row.metrics?.conversions || 0) > 0
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const accountId = searchParams.get('accountId');
  const accountIds = searchParams.get('accountIds');
  const since = searchParams.get('since');
  const until = searchParams.get('until');
  const strictDate = searchParams.get('strictDate') === '1';
  const preferCache = searchParams.get('preferCache') === '1';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  // Determine which accounts to fetch campaigns from.
  let targetIds: string[] = [];
  if (accountId) {
    targetIds = [accountId];
  } else if (accountIds) {
    targetIds = accountIds.split(',').filter(Boolean);
  } else {
    const mapped = getStoreAdAccounts(storeId);
    targetIds = mapped
      .filter((a) => a.platform === 'meta' && a.is_active === 1)
      .map((a) => a.ad_account_id);
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ error: 'No ad accounts specified' }, { status: 400 });
  }

  const sortedAccountIds = [...new Set(targetIds)].sort();
  const scopeId = `accounts:${sortedAccountIds.join(',')}`;
  const exactVariant = `range:since:${since || ''}|until:${until || ''}|strict:${strictDate ? '1' : '0'}`;
  const isStrictRangeRequest = strictDate && !!since && !!until;

  if (preferCache) {
    const exactSnapshot = getMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId, exactVariant);
    if (exactSnapshot && exactSnapshot.data.length > 0) {
      return NextResponse.json({
        data: exactSnapshot.data,
        cached: true,
        stale: true,
        snapshotAt: exactSnapshot.updatedAt,
        staleReason: 'snapshot_exact_fast',
      });
    }

    if (!isStrictRangeRequest && !isApproxLast30Range(since, until)) {
      const last30Snapshot = getMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId, 'preset:last_30d');
      if (last30Snapshot && last30Snapshot.data.length > 0) {
        return NextResponse.json({
          data: last30Snapshot.data,
          cached: true,
          stale: true,
          snapshotAt: last30Snapshot.updatedAt,
          staleReason: 'snapshot_last_30d_fast',
        });
      }
    }

    if (!isStrictRangeRequest) {
      const latestSnapshot =
        getMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId, 'latest')
        || getLatestMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId);
      if (latestSnapshot && latestSnapshot.data.length > 0) {
        return NextResponse.json({
          data: latestSnapshot.data,
          cached: true,
          stale: true,
          snapshotAt: latestSnapshot.updatedAt,
          staleReason: 'snapshot_latest_fast',
        });
      }
    }
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  // Build date range if both since and until are provided
  const dateRange = since && until ? { since, until } : undefined;

  try {

    // Fetch campaigns from all accounts in parallel
    const allCampaigns = await Promise.all(
      sortedAccountIds.map((id) =>
        fetchMetaCampaigns(token.accessToken, id, dateRange, { disableDateFallback: strictDate }).catch(() => [])
      )
    );

    // Flatten all campaigns (deduplicate by ID in case of overlap)
    const campaignMap = new Map<string, typeof allCampaigns[0][0]>();
    for (const campaigns of allCampaigns) {
      for (const campaign of campaigns) {
        if (!campaignMap.has(campaign.id)) {
          campaignMap.set(campaign.id, campaign);
        }
      }
    }

    const rows = Array.from(campaignMap.values());
    if (rows.length > 0) {
      upsertMetaEndpointSnapshot(storeId, 'campaigns', scopeId, exactVariant, rows);
      upsertMetaEndpointSnapshot(storeId, 'campaigns', scopeId, 'latest', rows);
      if (isApproxLast30Range(since, until) || (!since && !until)) {
        upsertMetaEndpointSnapshot(storeId, 'campaigns', scopeId, 'preset:last_30d', rows);
      }
      if (hasCampaignSignal(rows)) {
        upsertMetaEndpointSnapshot(storeId, 'campaigns', scopeId, 'latest_nonzero', rows);
      }
    }

    return NextResponse.json({ data: rows });
  } catch (err) {
    const exactSnapshot = getMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId, exactVariant);
    if (exactSnapshot && exactSnapshot.data.length > 0) {
      return NextResponse.json({
        data: exactSnapshot.data,
        cached: true,
        stale: true,
        snapshotAt: exactSnapshot.updatedAt,
        staleReason: 'live_error_exact',
      });
    }
    if (!isStrictRangeRequest) {
      const last30Snapshot = getMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId, 'preset:last_30d');
      if (last30Snapshot && last30Snapshot.data.length > 0) {
        return NextResponse.json({
          data: last30Snapshot.data,
          cached: true,
          stale: true,
          snapshotAt: last30Snapshot.updatedAt,
          staleReason: 'live_error_last_30d',
        });
      }
      const latestSnapshot =
        getMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId, 'latest')
        || getLatestMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId);
      if (latestSnapshot && latestSnapshot.data.length > 0) {
        return NextResponse.json({
          data: latestSnapshot.data,
          cached: true,
          stale: true,
          snapshotAt: latestSnapshot.updatedAt,
          staleReason: 'live_error_latest',
        });
      }
    }

    const message = err instanceof Error ? err.message : 'Failed to fetch campaigns';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
