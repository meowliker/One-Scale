import { NextRequest, NextResponse } from 'next/server';
import { getStoreAdAccounts, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled, listPersistentStoreAdAccounts } from '@/app/api/lib/supabase-persistence';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaCampaigns, MetaRateLimitError } from '@/app/api/lib/meta-client';
import { upsertPersistentMetaEndpointSnapshot } from '@/app/api/lib/supabase-tracking';
import { isMetaCallBlocked, markMetaRateLimited } from '@/app/api/lib/meta-sync-queue';
import type { Campaign } from '@/types/campaign';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isIsoDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isApproxLast30Range(since: string, until: string): boolean {
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return days >= 28 && days <= 32;
}

function normalizeActiveMetaAccounts(
  rows: Array<{ ad_account_id: string; is_active: number | boolean; platform?: string }>
): string[] {
  return rows
    .filter((row) => (row.platform || 'meta') === 'meta' && Number(row.is_active) === 1)
    .map((row) => row.ad_account_id)
    .filter(Boolean);
}

/**
 * GET /api/sync/prewarm-campaigns?storeId=...&since=YYYY-MM-DD&until=YYYY-MM-DD
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Warms exact campaign snapshots for the requested range so Ads Manager can load
 * quickly from cache for strict date-range requests.
 */
export async function GET(request: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = (searchParams.get('storeId') || '').trim();
  const since = searchParams.get('since');
  const until = searchParams.get('until');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }
  if (!isIsoDate(since) || !isIsoDate(until)) {
    return NextResponse.json({ error: 'since and until must be YYYY-MM-DD' }, { status: 400 });
  }

  if (isMetaCallBlocked(storeId)) {
    return NextResponse.json(
      { error: 'Meta API temporarily rate-limited for this store', storeId },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const useSupabase = isSupabasePersistenceEnabled();
  const adAccountRows = useSupabase
    ? await listPersistentStoreAdAccounts(storeId)
    : getStoreAdAccounts(storeId);

  const accountIds = normalizeActiveMetaAccounts(adAccountRows);
  if (accountIds.length === 0) {
    return NextResponse.json({ error: 'No active Meta ad accounts configured', storeId }, { status: 400 });
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta', storeId }, { status: 401 });
  }

  const scopeId = `accounts:${[...new Set(accountIds)].sort().join(',')}`;
  const exactVariant = `range:since:${since}|until:${until}|strict:1`;
  const dateRange = { since, until };

  try {
    const allCampaigns = await Promise.all(
      accountIds.map(async (accountId) => ({
        accountId,
        campaigns: await fetchMetaCampaigns(token.accessToken, accountId, dateRange, {
          disableDateFallback: true,
        }).catch(() => []),
      }))
    );

    const campaignMap = new Map<string, Campaign>();
    for (const group of allCampaigns) {
      for (const campaign of group.campaigns) {
        if (!campaignMap.has(campaign.id)) {
          campaignMap.set(campaign.id, {
            ...campaign,
            ad_account_id: group.accountId,
          } as Campaign);
        }
      }
    }

    const rows = Array.from(campaignMap.values());

    if (useSupabase) {
      await Promise.all([
        upsertPersistentMetaEndpointSnapshot(storeId, 'campaigns', scopeId, exactVariant, rows),
        upsertPersistentMetaEndpointSnapshot(storeId, 'campaigns', scopeId, 'latest', rows),
        isApproxLast30Range(since, until)
          ? upsertPersistentMetaEndpointSnapshot(storeId, 'campaigns', scopeId, 'preset:last_30d', rows)
          : Promise.resolve(),
      ]);
    } else {
      upsertMetaEndpointSnapshot(storeId, 'campaigns', scopeId, exactVariant, rows);
      upsertMetaEndpointSnapshot(storeId, 'campaigns', scopeId, 'latest', rows);
      if (isApproxLast30Range(since, until)) {
        upsertMetaEndpointSnapshot(storeId, 'campaigns', scopeId, 'preset:last_30d', rows);
      }
    }

    return NextResponse.json({
      ok: true,
      storeId,
      since,
      until,
      campaignCount: rows.length,
      accountCount: accountIds.length,
      mode: useSupabase ? 'supabase' : 'sqlite',
    });
  } catch (err) {
    if (err instanceof MetaRateLimitError) {
      markMetaRateLimited(storeId, 60);
      return NextResponse.json({ error: 'Meta API rate-limited', storeId }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : 'Prewarm failed';
    return NextResponse.json({ error: message, storeId }, { status: 500 });
  }
}

