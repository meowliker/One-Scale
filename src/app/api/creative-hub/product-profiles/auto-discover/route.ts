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

// Supabase REST helper (reuse the same pattern as supabase-tracking)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function supabaseRest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status}`);
  return res.json();
}

/**
 * Get ad accounts for a store, preferring Supabase (cloud) over local SQLite.
 */
async function getAdAccountsForStore(storeId: string): Promise<DbStoreAdAccount[]> {
  if (isSupabasePersistenceEnabled()) {
    try {
      const allStores = await listPersistentStores();
      const store = allStores.find((s) => s.id === storeId);
      if (store && store.adAccounts.length > 0) return store.adAccounts;
    } catch (err) {
      console.warn('[auto-discover] Supabase store fetch failed:', err);
    }
  }
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

interface CreativeAssetRow {
  ad_id: string;
  destination_url: string | null;
  cached_at: string;
}

/**
 * Extract product handle from a URL path.
 */
function extractProductHandle(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/products\/([^/?#]+)/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    const match = url.match(/\/products\/([^/?#]+)/);
    return match ? match[1].toLowerCase() : null;
  }
}

// POST /api/creative-hub/product-profiles/auto-discover
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let storeId = searchParams.get('storeId');

  if (!storeId) {
    try {
      const body = await request.json();
      storeId = body.storeId ?? null;
    } catch { /* No body */ }
  }

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    // 1. Get ad accounts (Supabase-aware)
    const allAccounts = await getAdAccountsForStore(storeId);
    const adAccounts = allAccounts.filter(
      (a) => (a.platform === 'meta' || !a.platform || a.platform === '') &&
             (a.is_active === 1 || a.is_active === undefined || (a.is_active as unknown) === null)
    );

    if (adAccounts.length === 0) {
      return NextResponse.json(
        { error: `No active Meta ad accounts found. Found ${allAccounts.length} total accounts.` },
        { status: 400 }
      );
    }

    // 2. Fetch Shopify products (live API)
    const shopifyProducts = await getShopifyProducts(storeId, request);
    const handleMap = new Map<string, ShopifyProduct>();
    for (const product of shopifyProducts) {
      if (product.handle) handleMap.set(product.handle.toLowerCase(), product);
    }

    // 3. Get destination URLs from creative_assets table (already synced by cron)
    // This is FAST — just a DB read, no Meta API calls
    const matchesByHandle = new Map<string, DiscoveredMatch>();
    const unmappedCampaigns: UnmappedCampaign[] = [];
    const seenCampaignIds = new Set<string>();
    const accountLookup = new Map(adAccounts.map((a) => [a.ad_account_id, a]));

    let usedCreativeAssets = false;

    if (isSupabasePersistenceEnabled()) {
      try {
        // Fetch all creative assets with destination URLs for this store
        const assets = await supabaseRest<CreativeAssetRow[]>(
          `/creative_assets?store_id=eq.${encodeURIComponent(storeId)}&destination_url=not.is.null&destination_url=neq.&select=ad_id,destination_url,cached_at`
        );

        if (assets.length > 0) {
          usedCreativeAssets = true;

          // Get campaign info from the campaigns snapshot
          // Try each account's campaigns to build ad_id -> campaign mapping
          const adToCampaign = new Map<string, { campaignId: string; campaignName: string; adAccountId: string }>();

          for (const account of adAccounts) {
            // Read the cached ads snapshots — ads are stored per-adset
            // But campaigns snapshot has the hierarchy: campaign -> adSets -> ads
            const sortedIds = [account.ad_account_id];
            const scopeId = `accounts:${sortedIds.join(',')}`;

            let campaigns: Campaign[] = [];
            try {
              const snap = await getLatestPersistentMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId);
              if (snap?.data) campaigns = snap.data;
            } catch { /* continue */ }

            // Build ad_id -> campaign lookup from the nested hierarchy
            for (const campaign of campaigns) {
              for (const adSet of campaign.adSets ?? []) {
                for (const ad of adSet.ads ?? []) {
                  adToCampaign.set(ad.id, {
                    campaignId: campaign.id,
                    campaignName: campaign.name,
                    adAccountId: account.ad_account_id,
                  });
                }
              }
            }
          }

          // Now match creative_assets destination URLs to Shopify products
          for (const asset of assets) {
            const destUrl = asset.destination_url;
            if (!destUrl) continue;

            const handle = extractProductHandle(destUrl);
            const campInfo = adToCampaign.get(asset.ad_id);

            if (handle && handleMap.has(handle) && campInfo) {
              const product = handleMap.get(handle)!;
              const existing = matchesByHandle.get(handle);
              const account = accountLookup.get(campInfo.adAccountId);

              if (existing) {
                if (!existing.campaigns.some(c => c.campaignId === campInfo.campaignId)) {
                  existing.campaigns.push({
                    campaignId: campInfo.campaignId,
                    campaignName: campInfo.campaignName,
                    destinationUrl: destUrl,
                  });
                }
              } else {
                matchesByHandle.set(handle, {
                  shopifyProduct: product,
                  adAccountId: campInfo.adAccountId,
                  adAccountCurrency: account?.currency ?? 'USD',
                  campaigns: [{
                    campaignId: campInfo.campaignId,
                    campaignName: campInfo.campaignName,
                    destinationUrl: destUrl,
                  }],
                });
              }
              seenCampaignIds.add(campInfo.campaignId);
            } else if (destUrl && campInfo && !seenCampaignIds.has(campInfo.campaignId)) {
              const existing = unmappedCampaigns.find(u => u.campaignId === campInfo.campaignId);
              if (existing) {
                if (!existing.destinationUrls.includes(destUrl)) existing.destinationUrls.push(destUrl);
              } else {
                unmappedCampaigns.push({
                  campaignId: campInfo.campaignId,
                  campaignName: campInfo.campaignName,
                  adAccountId: campInfo.adAccountId,
                  destinationUrls: [destUrl],
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('[auto-discover] creative_assets approach failed:', err);
      }
    }

    // 4. Fallback: if creative_assets didn't work, try live Meta API (slower)
    if (!usedCreativeAssets || (matchesByHandle.size === 0 && unmappedCampaigns.length === 0)) {
      const metaTokenObj = await getMetaToken(storeId);
      if (metaTokenObj) {
        const metaToken = metaTokenObj.accessToken;

        interface MetaAd {
          id: string;
          campaign_id: string;
          campaign: { id: string; name: string };
          creative?: {
            id: string;
            object_story_spec?: {
              link_data?: { link?: string };
              video_data?: { call_to_action?: { value?: { link?: string } } };
            };
            asset_feed_spec?: {
              link_urls?: Array<{ website_url?: string }>;
            };
          };
        }

        const accountResults = await Promise.allSettled(
          adAccounts.map(async (account) => {
            const result = await fetchFromMeta<{ data: MetaAd[] }>(
              metaToken,
              `${account.ad_account_id}/ads`,
              {
                fields: 'id,campaign_id,campaign{id,name},creative{id,object_story_spec,asset_feed_spec}',
                effective_status: '["ACTIVE","PAUSED"]',
                limit: '50',
              },
              25000,
              1,
            );
            return { account, ads: result.data || [] };
          })
        );

        for (const result of accountResults) {
          if (result.status !== 'fulfilled') continue;
          const { account, ads } = result.value;

          for (const ad of ads) {
            const creative = ad.creative;
            if (!creative || !ad.campaign) continue;

            let destUrl: string | undefined;
            if (creative.object_story_spec?.link_data?.link) {
              destUrl = creative.object_story_spec.link_data.link;
            } else if (creative.object_story_spec?.video_data?.call_to_action?.value?.link) {
              destUrl = creative.object_story_spec.video_data.call_to_action.value.link;
            } else if (creative.asset_feed_spec?.link_urls?.[0]?.website_url) {
              destUrl = creative.asset_feed_spec.link_urls[0].website_url;
            }
            if (!destUrl) continue;

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
            } else if (!seenCampaignIds.has(campaignId)) {
              const existing = unmappedCampaigns.find(u => u.campaignId === campaignId);
              if (existing) {
                if (!existing.destinationUrls.includes(destUrl)) existing.destinationUrls.push(destUrl);
              } else {
                unmappedCampaigns.push({ campaignId, campaignName, adAccountId: account.ad_account_id, destinationUrls: [destUrl] });
              }
            }
          }
        }
      }
    }

    const filteredUnmapped = unmappedCampaigns.filter(u => !seenCampaignIds.has(u.campaignId));

    // 5. Get existing profiles to avoid duplicates
    const existingProfiles = getProductProfiles(storeId);
    const existingByShopifyId = new Map(
      existingProfiles.filter((p) => p.shopifyProductId).map((p) => [p.shopifyProductId!, p])
    );

    // 6. Save matches as product profiles + campaign links
    const savedProfiles: Array<ReturnType<typeof getProductProfiles>[0] & { campaignLinks: unknown[] }> = [];

    for (const [, match] of matchesByHandle) {
      const shopifyId = String(match.shopifyProduct.id);
      let profileId: string;
      const existingProfile = existingByShopifyId.get(shopifyId);

      if (existingProfile) {
        profileId = existingProfile.id;
      } else {
        profileId = randomUUID();
        const productImage = match.shopifyProduct.image?.src ?? match.shopifyProduct.images?.[0]?.src;

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
        productImage: match.shopifyProduct.image?.src ?? match.shopifyProduct.images?.[0]?.src,
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
        source: usedCreativeAssets ? 'database' : 'live_api',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-discovery failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Fetch Shopify products — tries internal API first, then local DB.
 */
async function getShopifyProducts(storeId: string, request: NextRequest): Promise<ShopifyProduct[]> {
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
