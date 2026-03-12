import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled, listPersistentStoreAdAccounts } from '@/app/api/lib/supabase-persistence';
import {
  getPersistentMetaEndpointSnapshot,
  getLatestPersistentMetaEndpointSnapshot,
} from '@/app/api/lib/supabase-tracking';
import { getMetaEndpointSnapshot, getLatestMetaEndpointSnapshot, getStoreAdAccounts } from '@/app/api/lib/db';
import type { Campaign, AdSet, Ad } from '@/types/campaign';

/**
 * GET /api/meta/hierarchy
 * 
 * Returns the full campaign hierarchy (campaigns + adsets + ads) from cache in a single request.
 * This enables instant page loads without multiple API calls.
 * 
 * Data is populated by the background cron sync (/api/sync/cron).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const useSupabase = isSupabasePersistenceEnabled();

  // Get account IDs for scope
  const accounts = useSupabase
    ? await listPersistentStoreAdAccounts(storeId)
    : getStoreAdAccounts(storeId);
  const targetIds = accounts
    .filter((a) => a.platform === 'meta' && a.is_active === 1)
    .map((a) => a.ad_account_id);

  if (targetIds.length === 0) {
    return NextResponse.json({ 
      campaigns: [], 
      cached: true, 
      snapshotAt: null,
      hint: 'No ad accounts configured' 
    });
  }

  const sortedAccountIds = [...new Set(targetIds)].sort();
  const scopeId = `accounts:${sortedAccountIds.join(',')}`;

  // Get campaigns from cache
  const campaignsSnapshot = useSupabase
    ? await getPersistentMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId, 'latest')
    : getMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId, 'latest');

  if (!campaignsSnapshot || campaignsSnapshot.data.length === 0) {
    // Try any available snapshot
    const anySnapshot = useSupabase
      ? await getLatestPersistentMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId)
      : getLatestMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId);
    
    if (!anySnapshot || anySnapshot.data.length === 0) {
      return NextResponse.json({ 
        campaigns: [], 
        cached: true, 
        snapshotAt: null,
        hint: 'Cache empty - data will be available after background sync runs' 
      });
    }
  }

  const campaigns = campaignsSnapshot?.data || [];
  let snapshotAt = campaignsSnapshot?.updatedAt || null;

  // For each ACTIVE campaign, load ad sets from cache
  const enrichedCampaigns = await Promise.all(
    campaigns.map(async (campaign) => {
      if (campaign.status !== 'ACTIVE') {
        return { ...campaign, adSets: [] };
      }

      // Get ad sets from cache
      const adSetsSnapshot = useSupabase
        ? await getPersistentMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaign.id, 'latest')
        : getMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaign.id, 'latest');

      const adSets = adSetsSnapshot?.data || [];

      // For each ad set, load ads from cache
      const enrichedAdSets = await Promise.all(
        adSets.map(async (adSet) => {
          const adsSnapshot = useSupabase
            ? await getPersistentMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adSet.id, 'latest')
            : getMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adSet.id, 'latest');

          return {
            ...adSet,
            ads: adsSnapshot?.data || [],
          };
        })
      );

      return {
        ...campaign,
        adSets: enrichedAdSets,
      };
    })
  );

  return NextResponse.json({
    campaigns: enrichedCampaigns,
    cached: true,
    snapshotAt,
  });
}
