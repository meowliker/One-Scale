import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getStoreAdAccounts, getLatestMetaEndpointSnapshot, getDb } from '@/app/api/lib/db';
import {
  getProductProfiles,
  upsertProductProfile,
  upsertProductCampaignLink,
} from '@/app/api/lib/creative-hub-db';
import type { Campaign, Ad } from '@/types/campaign';

interface ShopifyProduct {
  id: number | string;
  title: string;
  handle: string;
  image?: { src: string } | null;
  images?: Array<{ src: string }>;
}

interface DiscoveredMatch {
  shopifyProduct: ShopifyProduct;
  adAccountId: string;
  adAccountCurrency: string;
  pageId?: string;
  pixelId?: string;
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    destinationUrl: string;
  }>;
}

interface UnmappedCampaign {
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  destinationUrls: string[];
}

/**
 * Extract product handle from a URL path.
 * Matches patterns like /products/{handle} or /products/{handle}?variant=...
 */
function extractProductHandle(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/products\/([^/?#]+)/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    // Try as a relative path
    const match = url.match(/\/products\/([^/?#]+)/);
    return match ? match[1].toLowerCase() : null;
  }
}

/**
 * Collect all destination URLs from a campaign's ads.
 */
function collectDestinationUrls(campaign: Campaign): Array<{ url: string; ad: Ad; adSetId: string }> {
  const results: Array<{ url: string; ad: Ad; adSetId: string }> = [];
  for (const adSet of campaign.adSets ?? []) {
    for (const ad of adSet.ads ?? []) {
      const url = ad.creative?.destinationUrl;
      if (url) {
        results.push({ url, ad, adSetId: adSet.id });
      }
    }
  }
  return results;
}

// POST /api/creative-hub/product-profiles/auto-discover
export async function POST(request: NextRequest) {
  // Accept storeId from either query param or request body
  const { searchParams } = new URL(request.url);
  let storeId = searchParams.get('storeId');

  if (!storeId) {
    try {
      const body = await request.json();
      storeId = body.storeId ?? null;
    } catch {
      // No body or invalid JSON
    }
  }

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    // 1. Get all ad accounts for the store
    const adAccounts = getStoreAdAccounts(storeId).filter(
      (a) => a.platform === 'meta' && a.is_active === 1
    );

    if (adAccounts.length === 0) {
      return NextResponse.json(
        { error: 'No active Meta ad accounts found for this store' },
        { status: 400 }
      );
    }

    // 2. Read cached campaign data from the database
    const sortedAccountIds = adAccounts.map((a) => a.ad_account_id).sort();
    const scopeId = `accounts:${sortedAccountIds.join(',')}`;

    const snapshot = getLatestMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId);

    if (!snapshot || !snapshot.data || snapshot.data.length === 0) {
      return NextResponse.json(
        { error: 'No cached campaign data available. Please sync your Meta data first.' },
        { status: 404 }
      );
    }

    const campaigns = snapshot.data;

    // 3. Fetch Shopify products from the database
    const shopifyProducts = getShopifyProductsFromDb(storeId);

    // Build a handle-to-product lookup map
    const handleMap = new Map<string, ShopifyProduct>();
    for (const product of shopifyProducts) {
      if (product.handle) {
        handleMap.set(product.handle.toLowerCase(), product);
      }
    }

    // 4. Match ad destination URLs to Shopify product handles
    const matchesByHandle = new Map<string, DiscoveredMatch>();
    const unmappedCampaigns: UnmappedCampaign[] = [];

    // Build ad account lookup for currency
    const accountLookup = new Map(
      adAccounts.map((a) => [a.ad_account_id, a])
    );

    for (const campaign of campaigns) {
      const urlEntries = collectDestinationUrls(campaign);

      if (urlEntries.length === 0) {
        continue;
      }

      let matched = false;
      const campaignDestUrls: string[] = [];

      for (const { url } of urlEntries) {
        campaignDestUrls.push(url);
        const handle = extractProductHandle(url);

        if (handle && handleMap.has(handle)) {
          matched = true;
          const product = handleMap.get(handle)!;

          // Determine which ad account this campaign belongs to
          // Use the first ad account as default (campaigns are fetched per-account-scope)
          const adAccountId = sortedAccountIds[0];
          const account = accountLookup.get(adAccountId);

          const existing = matchesByHandle.get(handle);
          if (existing) {
            // Add this campaign to existing match
            existing.campaigns.push({
              campaignId: campaign.id,
              campaignName: campaign.name,
              destinationUrl: url,
            });
          } else {
            matchesByHandle.set(handle, {
              shopifyProduct: product,
              adAccountId,
              adAccountCurrency: account?.currency ?? 'USD',
              campaigns: [{
                campaignId: campaign.id,
                campaignName: campaign.name,
                destinationUrl: url,
              }],
            });
          }
        }
      }

      // Tier 2: unmatched campaigns
      if (!matched && campaignDestUrls.length > 0) {
        unmappedCampaigns.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          adAccountId: sortedAccountIds[0],
          destinationUrls: [...new Set(campaignDestUrls)],
        });
      }
    }

    // 5. Get existing profiles to avoid duplicates
    const existingProfiles = getProductProfiles(storeId);
    const existingByShopifyId = new Map(
      existingProfiles
        .filter((p) => p.shopifyProductId)
        .map((p) => [p.shopifyProductId!, p])
    );

    // 6. Save matches as product profiles + campaign links
    const savedProfiles: Array<ReturnType<typeof getProductProfiles>[0] & { campaignLinks: unknown[] }> = [];

    for (const [, match] of matchesByHandle) {
      const shopifyId = String(match.shopifyProduct.id);
      let profileId: string;

      // Check if profile already exists for this Shopify product
      const existingProfile = existingByShopifyId.get(shopifyId);

      if (existingProfile) {
        profileId = existingProfile.id;
      } else {
        // Create new profile
        profileId = randomUUID();
        const productImage =
          match.shopifyProduct.image?.src ??
          match.shopifyProduct.images?.[0]?.src;

        upsertProductProfile({
          id: profileId,
          storeId,
          shopifyProductId: shopifyId,
          productName: match.shopifyProduct.title,
          productImage,
          adAccountId: match.adAccountId,
          adAccountCurrency: match.adAccountCurrency,
          destinationUrl: match.campaigns[0]?.destinationUrl,
        });
      }

      // Link campaigns to profile
      const campaignLinks = [];
      for (const camp of match.campaigns) {
        const linkId = randomUUID();
        upsertProductCampaignLink({
          id: linkId,
          productProfileId: profileId,
          campaignId: camp.campaignId,
          campaignName: camp.campaignName,
          campaignType: 'testing',
          adAccountId: match.adAccountId,
          isActive: true,
        });
        campaignLinks.push({
          id: linkId,
          productProfileId: profileId,
          campaignId: camp.campaignId,
          campaignName: camp.campaignName,
          campaignType: 'testing',
          adAccountId: match.adAccountId,
          isActive: true,
          linkedAt: new Date().toISOString(),
        });
      }

      savedProfiles.push({
        id: profileId,
        storeId,
        shopifyProductId: shopifyId,
        productName: match.shopifyProduct.title,
        productImage:
          match.shopifyProduct.image?.src ??
          match.shopifyProduct.images?.[0]?.src,
        adAccountId: match.adAccountId,
        adAccountCurrency: match.adAccountCurrency,
        destinationUrl: match.campaigns[0]?.destinationUrl,
        conversionEvent: 'PURCHASE',
        defaultBudget: 20,
        defaultDuration: 3,
        defaultBidStrategy: 'LOWEST_COST_WITHOUT_CAP',
        defaultStructure: 'ABO' as const,
        defaultLaunchStatus: 'ACTIVE' as const,
        clickupSyncInterval: 30,
        aiMinImpressions: 500,
        aiMinHours: 24,
        aiEvalFrequency: 'every_6h',
        createdAt: existingProfile?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        campaignLinks,
      });
    }

    return NextResponse.json({
      profiles: savedProfiles,
      unmappedCampaigns,
      stats: {
        totalCampaigns: campaigns.length,
        matchedProducts: savedProfiles.length,
        unmappedCount: unmappedCampaigns.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-discovery failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Read Shopify products from the local database cache.
 * Falls back to the meta_endpoint_snapshots table where Shopify product data
 * may be cached, or queries a dedicated shopify products table if available.
 */
function getShopifyProductsFromDb(storeId: string): ShopifyProduct[] {
  const db = getDb();

  // Try the shopify endpoint snapshots first (same pattern as Meta snapshots)
  try {
    const row = db.prepare(`
      SELECT payload_json FROM meta_endpoint_snapshots
      WHERE store_id = ? AND endpoint = 'shopify_products'
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(storeId) as { payload_json: string } | undefined;

    if (row) {
      return JSON.parse(row.payload_json) as ShopifyProduct[];
    }
  } catch {
    // Table or column may not exist, continue to fallback
  }

  // Fallback: try a dedicated shopify_products table
  try {
    const rows = db.prepare(
      'SELECT * FROM shopify_products WHERE store_id = ?'
    ).all(storeId) as Array<{
      shopify_id: string;
      title: string;
      handle: string;
      image_url: string | null;
    }>;

    return rows.map((r) => ({
      id: r.shopify_id,
      title: r.title,
      handle: r.handle,
      image: r.image_url ? { src: r.image_url } : null,
    }));
  } catch {
    // Table doesn't exist
  }

  return [];
}
