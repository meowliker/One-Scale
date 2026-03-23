// Allow up to 60s on Vercel Pro plan
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getStoreAdAccounts, getLatestMetaEndpointSnapshot, getDb, type DbStoreAdAccount } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import {
  getProductProfiles,
  upsertProductProfile,
  upsertProductCampaignLink,
} from '@/app/api/lib/creative-hub-db';

// Supabase REST helper
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

// ───────────────────── APPROACH: 1 ad per campaign ─────────────────────
// For each ad account:
//   1. Fetch campaigns (from Meta API — just IDs + names, fast)
//   2. For each campaign: fetch 1 ad with creative URL (limit=1)
//   3. Match URL → Shopify product → map entire campaign
// Total: ~6 + ~40 API calls = ~46 calls, parallelized

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let storeId = searchParams.get('storeId');
  if (!storeId) {
    try { const body = await request.json(); storeId = body.storeId ?? null; } catch { /* */ }
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
        { error: `No active Meta ad accounts found. Found ${allAccounts.length} total.` },
        { status: 400 }
      );
    }

    // 2. Fetch Shopify products
    const shopifyProducts = await getShopifyProducts(storeId, request);
    const handleMap = new Map<string, ShopifyProduct>();
    for (const product of shopifyProducts) {
      if (product.handle) handleMap.set(product.handle.toLowerCase(), product);
    }

    // 3. Try DB-first: creative_assets table (instant, no API calls)
    const matchesByHandle = new Map<string, DiscoveredMatch>();
    const unmappedCampaigns: UnmappedCampaign[] = [];
    const seenCampaignIds = new Set<string>();
    const accountLookup = new Map(adAccounts.map((a) => [a.ad_account_id, a]));
    let source = 'none';

    if (isSupabasePersistenceEnabled()) {
      try {
        // Query creative_assets joined with campaign info via ads snapshots
        // creative_assets has: ad_id, destination_url
        // We need: ad_id → campaign_id mapping
        //
        // Strategy: fetch ALL ads snapshots for this store, build ad→campaign map,
        // then cross-reference with creative_assets destination URLs

        interface AdsSnapshotRow {
          scope_id: string;
          payload_json: string;
        }

        // Get all ads snapshots (scope_id = adset_id, variant = latest)
        const adsSnapshots = await supabaseRest<AdsSnapshotRow[]>(
          `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.ads&variant_key=eq.latest&select=scope_id,payload_json`
        );

        // Also get campaigns snapshots for campaign names
        interface CampaignSnapshotRow {
          scope_id: string;
          payload_json: string;
        }
        const campaignSnapshots = await supabaseRest<CampaignSnapshotRow[]>(
          `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.campaigns&variant_key=eq.latest&select=scope_id,payload_json`
        );

        // Build campaign name lookup
        const campaignNameMap = new Map<string, { name: string; adAccountId: string }>();
        for (const snap of campaignSnapshots) {
          try {
            const campaigns = JSON.parse(snap.payload_json);
            for (const c of campaigns) {
              if (c.id && c.name) {
                // Extract ad account from scope_id: "accounts:act_123,act_456"
                const accountMatch = snap.scope_id.match(/accounts:(.+)/);
                const firstAccount = accountMatch ? accountMatch[1].split(',')[0] : adAccounts[0]?.ad_account_id;
                campaignNameMap.set(c.id, { name: c.name, adAccountId: firstAccount || '' });
              }
            }
          } catch { /* skip malformed */ }
        }

        // Build ad_id → {campaign_id, destination_url} from ads snapshots
        // Each ad in the payload has: id, name, campaign_id, creative.destinationUrl
        interface SnapshotAd {
          id: string;
          name?: string;
          campaign_id?: string;
          campaignId?: string;
          creative?: {
            destinationUrl?: string;
            headline?: string;
            body?: string;
            ctaType?: string;
          };
        }

        // Map: campaignId → first destination URL found (1-ad-per-campaign approach)
        const campaignToUrl = new Map<string, string>();

        for (const snap of adsSnapshots) {
          try {
            const ads: SnapshotAd[] = JSON.parse(snap.payload_json);
            for (const ad of ads) {
              const campId = ad.campaign_id || ad.campaignId;
              if (!campId) continue;

              // Skip if we already have a URL for this campaign (1-ad-per-campaign)
              if (campaignToUrl.has(campId)) continue;

              const destUrl = ad.creative?.destinationUrl;
              if (destUrl) {
                campaignToUrl.set(campId, destUrl);
              }
            }
          } catch { /* skip malformed */ }
        }

        // If ads snapshots didn't have URLs, try creative_assets table
        if (campaignToUrl.size === 0) {
          interface CreativeAssetRow { ad_id: string; destination_url: string | null; }
          const assets = await supabaseRest<CreativeAssetRow[]>(
            `/creative_assets?store_id=eq.${encodeURIComponent(storeId)}&destination_url=not.is.null&destination_url=neq.&select=ad_id,destination_url&limit=500`
          );

          // Build ad_id → campaign_id from ads snapshots
          const adToCampaign = new Map<string, string>();
          for (const snap of adsSnapshots) {
            try {
              const ads: SnapshotAd[] = JSON.parse(snap.payload_json);
              for (const ad of ads) {
                const campId = ad.campaign_id || ad.campaignId;
                if (campId) adToCampaign.set(ad.id, campId);
              }
            } catch { /* skip */ }
          }

          for (const asset of assets) {
            if (!asset.destination_url) continue;
            const campId = adToCampaign.get(asset.ad_id);
            if (campId && !campaignToUrl.has(campId)) {
              campaignToUrl.set(campId, asset.destination_url);
            }
          }
        }

        // Now match campaigns to Shopify products
        if (campaignToUrl.size > 0) {
          source = 'database';

          for (const [campaignId, destUrl] of campaignToUrl) {
            const handle = extractProductHandle(destUrl);
            const campInfo = campaignNameMap.get(campaignId);
            const campaignName = campInfo?.name || `Campaign ${campaignId}`;
            const adAccountId = campInfo?.adAccountId || adAccounts[0]?.ad_account_id || '';
            const account = accountLookup.get(adAccountId);

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
                  adAccountId,
                  adAccountCurrency: account?.currency ?? 'USD',
                  campaigns: [{ campaignId, campaignName, destinationUrl: destUrl }],
                });
              }
              seenCampaignIds.add(campaignId);
            } else if (!seenCampaignIds.has(campaignId)) {
              const existing = unmappedCampaigns.find(u => u.campaignId === campaignId);
              if (existing) {
                if (!existing.destinationUrls.includes(destUrl)) existing.destinationUrls.push(destUrl);
              } else {
                unmappedCampaigns.push({ campaignId, campaignName, adAccountId, destinationUrls: [destUrl] });
              }
            }
          }
        }
      } catch (err) {
        console.warn('[auto-discover] DB approach failed:', err);
      }
    }

    // 4. Fallback: live Meta API (1 ad per campaign)
    if (matchesByHandle.size === 0 && unmappedCampaigns.length === 0) {
      const metaTokenObj = await getMetaToken(storeId);
      if (metaTokenObj) {
        source = 'live_api';
        const metaToken = metaTokenObj.accessToken;

        // Step A: Get all campaigns across accounts (parallel)
        interface MetaCampaign { id: string; name: string; }
        const allCampaigns: Array<MetaCampaign & { adAccountId: string }> = [];

        const campResults = await Promise.allSettled(
          adAccounts.map(async (account) => {
            const result = await fetchFromMeta<{ data: MetaCampaign[] }>(
              metaToken,
              `${account.ad_account_id}/campaigns`,
              { fields: 'id,name', effective_status: '["ACTIVE","PAUSED"]', limit: '100' },
              15000, 1,
            );
            return (result.data || []).map(c => ({ ...c, adAccountId: account.ad_account_id }));
          })
        );

        for (const result of campResults) {
          if (result.status === 'fulfilled') allCampaigns.push(...result.value);
        }

        // Step B: For each campaign, fetch 1 ad with creative URL (batched parallel)
        const BATCH_SIZE = 10;
        for (let i = 0; i < allCampaigns.length; i += BATCH_SIZE) {
          const batch = allCampaigns.slice(i, i + BATCH_SIZE);

          const adResults = await Promise.allSettled(
            batch.map(async (campaign) => {
              interface MetaAd {
                id: string;
                creative?: {
                  object_story_spec?: {
                    link_data?: { link?: string };
                    video_data?: { call_to_action?: { value?: { link?: string } } };
                  };
                  asset_feed_spec?: { link_urls?: Array<{ website_url?: string }> };
                };
              }
              const result = await fetchFromMeta<{ data: MetaAd[] }>(
                metaToken,
                `${campaign.id}/ads`,
                {
                  fields: 'id,creative{object_story_spec,asset_feed_spec}',
                  limit: '1', // Just 1 ad per campaign!
                },
                10000, 0,
              );
              const ad = result.data?.[0];
              if (!ad?.creative) return null;

              let destUrl: string | undefined;
              const c = ad.creative;
              if (c.object_story_spec?.link_data?.link) destUrl = c.object_story_spec.link_data.link;
              else if (c.object_story_spec?.video_data?.call_to_action?.value?.link) destUrl = c.object_story_spec.video_data.call_to_action.value.link;
              else if (c.asset_feed_spec?.link_urls?.[0]?.website_url) destUrl = c.asset_feed_spec.link_urls[0].website_url;

              return destUrl ? { campaign, destUrl } : null;
            })
          );

          for (const result of adResults) {
            if (result.status !== 'fulfilled' || !result.value) continue;
            const { campaign, destUrl } = result.value;
            const handle = extractProductHandle(destUrl);
            const account = accountLookup.get(campaign.adAccountId);

            if (handle && handleMap.has(handle)) {
              const product = handleMap.get(handle)!;
              const existing = matchesByHandle.get(handle);
              if (existing) {
                if (!existing.campaigns.some(c => c.campaignId === campaign.id)) {
                  existing.campaigns.push({ campaignId: campaign.id, campaignName: campaign.name, destinationUrl: destUrl });
                }
              } else {
                matchesByHandle.set(handle, {
                  shopifyProduct: product,
                  adAccountId: campaign.adAccountId,
                  adAccountCurrency: account?.currency ?? 'USD',
                  campaigns: [{ campaignId: campaign.id, campaignName: campaign.name, destinationUrl: destUrl }],
                });
              }
              seenCampaignIds.add(campaign.id);
            } else if (!seenCampaignIds.has(campaign.id)) {
              unmappedCampaigns.push({
                campaignId: campaign.id,
                campaignName: campaign.name,
                adAccountId: campaign.adAccountId,
                destinationUrls: [destUrl],
              });
            }
          }
        }
      }
    }

    const filteredUnmapped = unmappedCampaigns.filter(u => !seenCampaignIds.has(u.campaignId));

    // 4b. Fetch Page ID, Pixel ID, and Instagram Account ID per ad account
    //     DB-first (Supabase snapshots), then live Meta API fallback
    interface AdAccountMeta {
      pageId?: string;
      pixelId?: string;
      instagramAccountId?: string;
    }
    const adAccountMetaMap = new Map<string, AdAccountMeta>();

    // Collect unique ad account IDs from matched profiles
    const usedAdAccountIds = new Set<string>();
    for (const [, match] of matchesByHandle) {
      if (match.adAccountId) usedAdAccountIds.add(match.adAccountId);
    }

    if (usedAdAccountIds.size > 0) {
      // Try Supabase snapshots first
      let resolvedFromSnapshots = false;

      if (isSupabasePersistenceEnabled()) {
        try {
          interface SnapshotRow { scope_id: string; payload_json: string; }

          const [pagesSnaps, pixelsSnaps, igSnaps] = await Promise.all([
            supabaseRest<SnapshotRow[]>(
              `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.pages&variant_key=eq.latest&select=scope_id,payload_json`
            ).catch(() => [] as SnapshotRow[]),
            supabaseRest<SnapshotRow[]>(
              `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.pixels&variant_key=eq.latest&select=scope_id,payload_json`
            ).catch(() => [] as SnapshotRow[]),
            supabaseRest<SnapshotRow[]>(
              `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.instagram&variant_key=eq.latest&select=scope_id,payload_json`
            ).catch(() => [] as SnapshotRow[]),
          ]);

          // Parse pages snapshots — pages are fetched via /me/accounts, scope may be global
          let allPages: Array<{ id: string; name?: string; instagram_business_account?: { id: string; username?: string } }> = [];
          for (const snap of pagesSnaps) {
            try { allPages = allPages.concat(JSON.parse(snap.payload_json)); } catch { /* skip */ }
          }

          // Parse pixels snapshots — keyed by ad account
          const pixelsByAccount = new Map<string, Array<{ id: string; name?: string }>>();
          for (const snap of pixelsSnaps) {
            try {
              const pixels = JSON.parse(snap.payload_json) as Array<{ id: string; name?: string }>;
              // scope_id may contain the ad account id
              const accountMatch = snap.scope_id.match(/(act_[^,\s]+)/);
              if (accountMatch) pixelsByAccount.set(accountMatch[1], pixels);
              else for (const acctId of usedAdAccountIds) { if (!pixelsByAccount.has(acctId)) pixelsByAccount.set(acctId, pixels); }
            } catch { /* skip */ }
          }

          // Parse instagram snapshots
          const igByAccount = new Map<string, Array<{ id: string; username?: string }>>();
          for (const snap of igSnaps) {
            try {
              const igs = JSON.parse(snap.payload_json) as Array<{ id: string; username?: string }>;
              const accountMatch = snap.scope_id.match(/(act_[^,\s]+)/);
              if (accountMatch) igByAccount.set(accountMatch[1], igs);
              else for (const acctId of usedAdAccountIds) { if (!igByAccount.has(acctId)) igByAccount.set(acctId, igs); }
            } catch { /* skip */ }
          }

          const hasSnapshotData = allPages.length > 0 || pixelsByAccount.size > 0 || igByAccount.size > 0;
          if (hasSnapshotData) {
            resolvedFromSnapshots = true;
            const firstPage = allPages[0];
            const igFromPage = firstPage?.instagram_business_account;

            for (const acctId of usedAdAccountIds) {
              const meta: AdAccountMeta = {};
              if (firstPage) meta.pageId = String(firstPage.id);
              const pixels = pixelsByAccount.get(acctId);
              if (pixels?.[0]) meta.pixelId = String(pixels[0].id);
              const igs = igByAccount.get(acctId);
              if (igs?.[0]) meta.instagramAccountId = String(igs[0].id);
              else if (igFromPage) meta.instagramAccountId = String(igFromPage.id);
              adAccountMetaMap.set(acctId, meta);
            }
            console.log(`[auto-discover] Resolved page/pixel/instagram from Supabase snapshots for ${usedAdAccountIds.size} ad account(s)`);
          }
        } catch (err) {
          console.warn('[auto-discover] Supabase snapshot fetch for page/pixel/ig failed:', err);
        }
      }

      // Also try local SQLite snapshots
      if (!resolvedFromSnapshots) {
        try {
          for (const acctId of usedAdAccountIds) {
            const meta: AdAccountMeta = {};
            const pagesSnap = getLatestMetaEndpointSnapshot<Array<{ id: string; instagram_business_account?: { id: string } }>>(storeId, 'pages', acctId);
            if (pagesSnap?.data?.[0]) {
              meta.pageId = String(pagesSnap.data[0].id);
              if (pagesSnap.data[0].instagram_business_account) {
                meta.instagramAccountId = String(pagesSnap.data[0].instagram_business_account.id);
              }
            }
            const pixelsSnap = getLatestMetaEndpointSnapshot<Array<{ id: string }>>(storeId, 'pixels', acctId);
            if (pixelsSnap?.data?.[0]) meta.pixelId = String(pixelsSnap.data[0].id);
            const igSnap = getLatestMetaEndpointSnapshot<Array<{ id: string }>>(storeId, 'instagram', acctId);
            if (igSnap?.data?.[0]) meta.instagramAccountId = String(igSnap.data[0].id);

            if (meta.pageId || meta.pixelId || meta.instagramAccountId) {
              adAccountMetaMap.set(acctId, meta);
              resolvedFromSnapshots = true;
            }
          }
          if (resolvedFromSnapshots) {
            console.log(`[auto-discover] Resolved page/pixel/instagram from local SQLite snapshots`);
          }
        } catch (err) {
          console.warn('[auto-discover] Local snapshot fetch for page/pixel/ig failed:', err);
        }
      }

      // Fallback: live Meta API calls
      if (!resolvedFromSnapshots) {
        const metaTokenObj = await getMetaToken(storeId);
        if (metaTokenObj) {
          const metaToken = metaTokenObj.accessToken;
          const accountResults = await Promise.allSettled(
            Array.from(usedAdAccountIds).map(async (acctId) => {
              const [pagesRes, pixelsRes, igRes] = await Promise.all([
                fetchFromMeta<{ data: Array<{ id: string; instagram_business_account?: { id: string } }> }>(
                  metaToken, 'me/accounts', { fields: 'id,name,instagram_business_account{id,username}', limit: '10' }, 10000, 1
                ).catch(() => ({ data: [] as Array<{ id: string; instagram_business_account?: { id: string } }> })),
                fetchFromMeta<{ data: Array<{ id: string; name?: string }> }>(
                  metaToken, `${acctId}/adspixels`, { fields: 'id,name', limit: '10' }, 10000, 1
                ).catch(() => ({ data: [] as Array<{ id: string; name?: string }> })),
                fetchFromMeta<{ data: Array<{ id: string; username?: string }> }>(
                  metaToken, `${acctId}/instagram_accounts`, { fields: 'id,username', limit: '10' }, 10000, 1
                ).catch(() => ({ data: [] as Array<{ id: string; username?: string }> })),
              ]);
              const meta: AdAccountMeta = {};
              if (pagesRes.data?.[0]) {
                meta.pageId = String(pagesRes.data[0].id);
                if (pagesRes.data[0].instagram_business_account) {
                  meta.instagramAccountId = String(pagesRes.data[0].instagram_business_account.id);
                }
              }
              if (pixelsRes.data?.[0]) meta.pixelId = String(pixelsRes.data[0].id);
              if (igRes.data?.[0] && !meta.instagramAccountId) meta.instagramAccountId = String(igRes.data[0].id);
              return { acctId, meta };
            })
          );
          for (const result of accountResults) {
            if (result.status === 'fulfilled') {
              adAccountMetaMap.set(result.value.acctId, result.value.meta);
            }
          }
          console.log(`[auto-discover] Resolved page/pixel/instagram from live Meta API for ${usedAdAccountIds.size} ad account(s)`);
        }
      }
    }

    // 5. Save matches as product profiles
    const existingProfiles = getProductProfiles(storeId);
    const existingByShopifyId = new Map(
      existingProfiles.filter((p) => p.shopifyProductId).map((p) => [p.shopifyProductId!, p])
    );

    const savedProfiles: Array<ReturnType<typeof getProductProfiles>[0] & { campaignLinks: unknown[] }> = [];

    for (const [, match] of matchesByHandle) {
      const shopifyId = String(match.shopifyProduct.id);
      let profileId: string;
      const existingProfile = existingByShopifyId.get(shopifyId);

      const acctMeta = adAccountMetaMap.get(match.adAccountId) ?? {};

      if (existingProfile) {
        profileId = existingProfile.id;
        // Update existing profile with page/pixel/instagram if it was missing them
        const needsMetaUpdate = (!existingProfile.pageId && acctMeta.pageId)
          || (!existingProfile.pixelId && acctMeta.pixelId)
          || (!existingProfile.instagramActorId && acctMeta.instagramAccountId);
        if (needsMetaUpdate) {
          upsertProductProfile({
            id: profileId,
            storeId,
            productName: existingProfile.productName,
            adAccountId: existingProfile.adAccountId,
            pageId: existingProfile.pageId || acctMeta.pageId,
            pixelId: existingProfile.pixelId || acctMeta.pixelId,
            instagramActorId: existingProfile.instagramActorId || acctMeta.instagramAccountId,
          });
        }
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
          pageId: acctMeta.pageId,
          pixelId: acctMeta.pixelId,
          instagramActorId: acctMeta.instagramAccountId,
        });
      }

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
        pageId: existingProfile?.pageId || acctMeta.pageId,
        pixelId: existingProfile?.pixelId || acctMeta.pixelId,
        instagramActorId: existingProfile?.instagramActorId || acctMeta.instagramAccountId,
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
        source,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-discovery failed';
    console.error('[auto-discover] Fatal error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
