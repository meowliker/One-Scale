import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  getProductProfiles,
  getProductCampaignLinks,
  upsertProductProfile,
} from '@/app/api/lib/creative-hub-db';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import {
  getRecentPersistentMetaEndpointSnapshots,
} from '@/app/api/lib/supabase-tracking';
import type { Campaign } from '@/types/campaign';
import type { ProductCampaignLink } from '@/types/creativeHub';

/**
 * Build a map of campaignId -> Meta effective status from the latest campaign snapshots.
 * Falls back gracefully: if snapshots are unavailable, returns an empty map.
 */
async function buildCampaignStatusMap(storeId: string): Promise<Map<string, string>> {
  const statusMap = new Map<string, string>();

  if (!isSupabasePersistenceEnabled()) return statusMap;

  try {
    // Fetch recent campaign snapshots (each snapshot contains an array of Campaign objects)
    const snapshots = await getRecentPersistentMetaEndpointSnapshots<Campaign[]>(
      storeId,
      'campaigns',
      20 // enough to cover multiple ad accounts & date ranges
    );

    // Dedupe: keep the first (most recent) status seen for each campaign ID
    for (const snapshot of snapshots) {
      if (!Array.isArray(snapshot.data)) continue;
      for (const campaign of snapshot.data) {
        if (campaign.id && campaign.status && !statusMap.has(campaign.id)) {
          statusMap.set(campaign.id, campaign.status);
        }
      }
    }
  } catch {
    // Snapshot lookup failed — fall back to treating all linked campaigns as active
  }

  return statusMap;
}

/**
 * Build a map of campaignId -> budget/bid info from the latest campaign snapshots.
 * Used to detect CBO (dailyBudget > 0 at campaign level) and bid strategy.
 */
async function buildCampaignBudgetMap(storeId: string): Promise<Map<string, { dailyBudget?: number; bidStrategy?: string }>> {
  const budgetMap = new Map<string, { dailyBudget?: number; bidStrategy?: string }>();

  if (!isSupabasePersistenceEnabled()) return budgetMap;

  try {
    const snapshots = await getRecentPersistentMetaEndpointSnapshots<Campaign[]>(
      storeId,
      'campaigns',
      20
    );

    for (const snapshot of snapshots) {
      if (!Array.isArray(snapshot.data)) continue;
      for (const campaign of snapshot.data) {
        if (campaign.id && !budgetMap.has(campaign.id)) {
          const raw = campaign as unknown as Record<string, unknown>;
          const dailyBudgetRaw = raw.dailyBudget as number | undefined;
          // Convert from cents to dollars (Meta stores in cents)
          const dailyBudget = dailyBudgetRaw ? dailyBudgetRaw / 100 : undefined;
          const bidStrategy = (raw.bidStrategy || raw.bid_strategy) as string | undefined;
          budgetMap.set(campaign.id, { dailyBudget, bidStrategy });
        }
      }
    }
  } catch {
    // Fallback: no budget info available
  }

  return budgetMap;
}

/**
 * Count active vs inactive campaigns for a profile's linked campaigns using Meta status data.
 * A campaign is "active" only if Meta reports status === 'ACTIVE'.
 * If we have no snapshot data for a campaign, we fall back to the DB isActive flag.
 */
function countCampaignStatuses(
  links: ProductCampaignLink[],
  statusMap: Map<string, string>
): { activeCampaignCount: number; inactiveCampaignCount: number } {
  let active = 0;
  let inactive = 0;

  for (const link of links) {
    const metaStatus = statusMap.get(link.campaignId);
    if (metaStatus) {
      // Use real Meta status
      if (metaStatus === 'ACTIVE') {
        active++;
      } else {
        inactive++;
      }
    } else {
      // Fallback: use the DB isActive flag
      if (link.isActive) {
        active++;
      } else {
        inactive++;
      }
    }
  }

  return { activeCampaignCount: active, inactiveCampaignCount: inactive };
}

// GET /api/creative-hub/product-profiles?storeId=X
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    const profiles = await getProductProfiles(storeId);

    // Fetch campaign status + budget maps once (shared across all profiles)
    const [statusMap, budgetMap] = await Promise.all([
      buildCampaignStatusMap(storeId),
      buildCampaignBudgetMap(storeId),
    ]);

    // Attach campaign links + active/inactive counts to each profile
    // Enrich links with CBO/ABO budget and bid strategy data
    const profilesWithLinks = await Promise.all(
      profiles.map(async (profile) => {
        const rawLinks = await getProductCampaignLinks(profile.id);
        // Enrich each link with campaign-level budget/bid data for CBO/ABO detection
        const campaignLinks = rawLinks.map((link) => {
          const budget = budgetMap.get(link.campaignId);
          const metaStatus = statusMap.get(link.campaignId);
          return {
            ...link,
            campaignDailyBudget: budget?.dailyBudget,
            campaignBidStrategy: budget?.bidStrategy,
            effectiveStatus: metaStatus || link.effectiveStatus,
          };
        });
        const { activeCampaignCount, inactiveCampaignCount } = countCampaignStatuses(campaignLinks, statusMap);
        return {
          ...profile,
          campaignLinks,
          activeCampaignCount,
          inactiveCampaignCount,
        };
      })
    );

    return NextResponse.json({ profiles: profilesWithLinks });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch product profiles';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/creative-hub/product-profiles
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.storeId || !body.productName || !body.adAccountId) {
      return NextResponse.json(
        { error: 'storeId, productName, and adAccountId are required' },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const profile = { ...body, id };

    await upsertProductProfile(profile);

    return NextResponse.json({ profile: { ...profile, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create product profile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
