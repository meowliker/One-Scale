import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getStoreAdAccounts, getLatestMetaEndpointSnapshot, getDb, type DbStoreAdAccount } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import {
  getLatestPersistentMetaEndpointSnapshot,
} from '@/app/api/lib/supabase-tracking';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import {
  getProductProfiles,
  upsertProductProfile,
  upsertProductCampaignLink,
} from '@/app/api/lib/creative-hub-db';
import type { Campaign, Ad } from '@/types/campaign';

/**
 * Get ad accounts for a store, preferring Supabase (cloud) over local SQLite.
 */
async function getAdAccountsForStore(storeId: string): Promise<DbStoreAdAccount[]> {
  // Try Supabase first (used on Vercel)
  if (isSupabasePersistenceEnabled()) {
    try {
      const allStores = await listPersistentStores();
      const store = allStores.find((s) => s.id === storeId);
      if (store && store.adAccounts.length > 0) {
        return store.adAccounts;
      }
    } catch (err) {
      console.warn('[auto-discover] Supabase fallback failed:', err);
    }
  }
  // Fallback to local SQLite
  return getStoreAdAccounts(storeId);
}

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
    // 1. Get all ad accounts for the store (Supabase-aware)
    const allAccounts = await getAdAccountsForStore(storeId);

    // Accept accounts that are meta or have no platform set (legacy data)
    const adAccounts = allAccounts.filter(
      (a) => (a.platform === 'meta' || !a.platform || a.platform === '') &&
             (a.is_active === 1 || a.is_active === undefined || (a.is_active as unknown) === null)
    );

    if (adAccounts.length === 0) {
      console.error('[auto-discover] No ad accounts match. All accounts for store:',
        JSON.stringify(allAccounts.map(a => ({ id: a.ad_account_id, platform: a.platform, active: a.is_active }))));
      return NextResponse.json(
        { error: `No active Meta ad accounts found for this store. Found ${allAccounts.length} total accounts.` },
        { status: 400 }
      );
    }

    // 2. Get Meta token for live API calls
    const metaToken = await getMetaToken(storeId);
    if (!metaToken) {
      return NextResponse.json(
        { error: 'No Meta access token found. Please reconnect Meta in Settings.' },
        { status: 400 }
      );
    }

    // 3. Fetch Shopify products (live API with DB fallback)
    const shopifyProducts = await getShopifyProducts(storeId, request);

    // Build a handle-to-product lookup map
    const handleMap = new Map<string, ShopifyProduct>();
    for (const product of shopifyProducts) {
      if (product.handle) {
        handleMap.set(product.handle.toLowerCase(), product);
      }
    }

    // 4. For each ad account, fetch active ads with destination URLs from Meta API
    const matchesByHandle = new Map<string, DiscoveredMatch>();
    const unmappedCampaigns: UnmappedCampaign[] = [];
    const seenCampaignIds = new Set<string>();

    const accountLookup = new Map(
      adAccounts.map((a) => [a.ad_account_id, a])
    );

    for (const account of adAccounts) {
      try {
        // Fetch ads with their creative destination URLs
        interface MetaAdResult {
          data: Array<{
            id: string;
            name: string;
            campaign_id: string;
            campaign: { id: string; name: string };
            adset_id: string;
            creative?: {
              id: string;
              effective_object_story_id?: string;
            };
            tracking_specs?: Array<Record<string, unknown>>;
            // The preview link or destination URL
            effective_status: string;
          }>;
        }

        // Fetch ads with campaign info and creative details
        const adsResult = await fetchFromMeta<MetaAdResult>(
          metaToken,
          `${account.ad_account_id}/ads`,
          {
            fields: 'id,name,campaign_id,campaign{id,name},adset_id,effective_status',
            effective_status: '["ACTIVE","PAUSED"]',
            limit: '100',
          }
        );

        // For each ad, fetch its creative to get the destination URL
        const adIds = (adsResult.data || []).map(a => a.id).slice(0, 50); // limit to 50 ads

        // Batch fetch creatives with destination URLs
        interface MetaCreativeResult {
          data: Array<{
            id: string;
            object_story_spec?: {
              link_data?: { link?: string };
              video_data?: { call_to_action?: { value?: { link?: string } } };
            };
            asset_feed_spec?: {
              link_urls?: Array<{ website_url?: string }>;
            };
          }>;
        }

        // Build a map of campaign_id -> campaign_name + ad_account from ads
        const campaignMap = new Map<string, { name: string; adAccountId: string }>();
        for (const ad of adsResult.data || []) {
          if (ad.campaign) {
            campaignMap.set(ad.campaign.id, {
              name: ad.campaign.name,
              adAccountId: account.ad_account_id,
            });
          }
        }

        // Fetch destination URLs via ad creatives
        for (const ad of (adsResult.data || []).slice(0, 30)) {
          try {
            const creativeResult = await fetchFromMeta<{
              id: string;
              object_story_spec?: {
                link_data?: { link?: string; message?: string };
                video_data?: { call_to_action?: { value?: { link?: string } } };
              };
              asset_feed_spec?: {
                link_urls?: Array<{ website_url?: string }>;
              };
            }>(
              metaToken,
              `${ad.id}`,
              { fields: 'creative{object_story_spec,asset_feed_spec}' }
            );

            // Extract URL from creative
            const creative = (creativeResult as unknown as { creative?: typeof creativeResult })?.creative ?? creativeResult;
            let destUrl: string | undefined;

            if (creative.object_story_spec?.link_data?.link) {
              destUrl = creative.object_story_spec.link_data.link;
            } else if (creative.object_story_spec?.video_data?.call_to_action?.value?.link) {
              destUrl = creative.object_story_spec.video_data.call_to_action.value.link;
            } else if (creative.asset_feed_spec?.link_urls?.[0]?.website_url) {
              destUrl = creative.asset_feed_spec.link_urls[0].website_url;
            }

            if (!destUrl || !ad.campaign) continue;

            const campaignId = ad.campaign.id;
            const campaignName = ad.campaign.name;
            const handle = extractProductHandle(destUrl);

            if (handle && handleMap.has(handle)) {
              const product = handleMap.get(handle)!;
              const existing = matchesByHandle.get(handle);

              if (existing) {
                if (!existing.campaigns.some(c => c.campaignId === campaignId)) {
                  existing.campaigns.push({ campaignId, campaignName, destinationUrl: destUrl });
                }
              } else {
                matchesByHandle.set(handle, {
                  shopifyProduct: product,
                  adAccountId: account.ad_account_id,
                  adAccountCurrency: account.currency ?? 'USD',
                  campaigns: [{ campaignId, campaignName, destinationUrl: destUrl }],
                });
              }
              seenCampaignIds.add(campaignId);
            } else if (destUrl && !seenCampaignIds.has(campaignId)) {
              // Unmapped campaign
              const existing = unmappedCampaigns.find(u => u.campaignId === campaignId);
              if (existing) {
                if (!existing.destinationUrls.includes(destUrl)) {
                  existing.destinationUrls.push(destUrl);
                }
              } else {
                unmappedCampaigns.push({
                  campaignId,
                  campaignName,
                  adAccountId: account.ad_account_id,
                  destinationUrls: [destUrl],
                });
              }
            }
          } catch {
            // Skip individual ad fetch errors
          }
        }
      } catch (err) {
        console.warn(`[auto-discover] Failed to fetch ads for ${account.ad_account_id}:`, err);
      }
    }

    // Remove unmapped campaigns that were later matched
    const filteredUnmapped = unmappedCampaigns.filter(u => !seenCampaignIds.has(u.campaignId));

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
      unmappedCampaigns: filteredUnmapped,
      stats: {
        totalCampaigns: seenCampaignIds.size + filteredUnmapped.length,
        matchedProducts: savedProfiles.length,
        unmappedCount: filteredUnmapped.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-discovery failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Fetch Shopify products — tries internal API first (works on Vercel),
 * then falls back to local DB cache.
 */
async function getShopifyProducts(storeId: string, request: NextRequest): Promise<ShopifyProduct[]> {
  // Try the internal Shopify products API (this works on Vercel)
  try {
    const baseUrl = new URL(request.url).origin;
    const cookie = request.headers.get('cookie') ?? '';
    const res = await fetch(`${baseUrl}/api/shopify/products?storeId=${encodeURIComponent(storeId)}&limit=250`, {
      headers: { cookie },
    });
    if (res.ok) {
      const data = await res.json();
      const products = data.data ?? data.products ?? [];
      return products.map((p: Record<string, unknown>) => ({
        id: p.id,
        title: p.title,
        handle: p.handle,
        image: (p.images as Array<{ src: string }> | undefined)?.[0] ?? null,
        images: p.images,
      }));
    }
  } catch (err) {
    console.warn('[auto-discover] Shopify API fetch failed:', err);
  }

  // Fallback: local DB
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT payload_json FROM meta_endpoint_snapshots
      WHERE store_id = ? AND endpoint = 'shopify_products'
      ORDER BY updated_at DESC LIMIT 1
    `).get(storeId) as { payload_json: string } | undefined;
    if (row) return JSON.parse(row.payload_json) as ShopifyProduct[];
  } catch { /* ignore */ }

  return [];
}
