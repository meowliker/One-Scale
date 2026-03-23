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

interface CampaignMeta {
  pageId?: string;
  pixelId?: string;
  instagramActorId?: string;
}

interface DiscoveredMatch {
  shopifyProduct: ShopifyProduct;
  adAccountId: string;
  adAccountCurrency: string;
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    destinationUrl: string;
    meta?: CampaignMeta;
  }>;
}

interface UnmappedCampaign {
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  destinationUrls: string[];
}

const DEFAULT_UTM_TEMPLATE =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';

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

    // 3. Try DB-first: snapshots (instant, no API calls)
    const matchesByHandle = new Map<string, DiscoveredMatch>();
    const unmappedCampaigns: UnmappedCampaign[] = [];
    const seenCampaignIds = new Set<string>();
    const accountLookup = new Map(adAccounts.map((a) => [a.ad_account_id, a]));
    let source = 'none';

    // Per-campaign metadata extracted from ad snapshots
    // campaignId → { pageId, pixelId, instagramActorId }
    const campaignMetaMap = new Map<string, CampaignMeta>();

    if (isSupabasePersistenceEnabled()) {
      try {
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
                const accountMatch = snap.scope_id.match(/accounts:(.+)/);
                const firstAccount = accountMatch ? accountMatch[1].split(',')[0] : adAccounts[0]?.ad_account_id;
                campaignNameMap.set(c.id, { name: c.name, adAccountId: firstAccount || '' });
              }
            }
          } catch { /* skip malformed */ }
        }

        // Build ad_id → {campaign_id, destination_url} from ads snapshots
        // Each ad in the payload has: id, name, campaign_id, creative.destinationUrl
        // The raw creative may also have object_story_spec with page_id
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
            pageId?: string;
            // Raw Meta fields that might be present
            object_story_spec?: {
              page_id?: string;
              instagram_actor_id?: string;
            };
          };
          // Raw promoted_object that might be present
          promoted_object?: {
            pixel_id?: string;
            page_id?: string;
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

              // Extract per-campaign metadata from ad snapshot fields
              if (!campaignMetaMap.has(campId)) {
                const meta: CampaignMeta = {};
                // Try creative.object_story_spec.page_id or creative.pageId
                const pageId = ad.creative?.object_story_spec?.page_id
                  || ad.creative?.pageId;
                if (pageId) meta.pageId = String(pageId);

                // Try promoted_object.pixel_id
                const pixelId = ad.promoted_object?.pixel_id;
                if (pixelId) meta.pixelId = String(pixelId);

                // Try creative.object_story_spec.instagram_actor_id
                const igId = ad.creative?.object_story_spec?.instagram_actor_id;
                if (igId) meta.instagramActorId = String(igId);

                if (meta.pageId || meta.pixelId || meta.instagramActorId) {
                  campaignMetaMap.set(campId, meta);
                }
              }

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
                  existing.campaigns.push({
                    campaignId,
                    campaignName,
                    destinationUrl: destUrl,
                    meta: campaignMetaMap.get(campaignId),
                  });
                }
              } else {
                matchesByHandle.set(handle, {
                  shopifyProduct: product,
                  adAccountId,
                  adAccountCurrency: account?.currency ?? 'USD',
                  campaigns: [{
                    campaignId,
                    campaignName,
                    destinationUrl: destUrl,
                    meta: campaignMetaMap.get(campaignId),
                  }],
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
                    page_id?: string;
                    instagram_actor_id?: string;
                    link_data?: { link?: string };
                    video_data?: { call_to_action?: { value?: { link?: string } } };
                  };
                  asset_feed_spec?: { link_urls?: Array<{ website_url?: string }> };
                };
                promoted_object?: {
                  pixel_id?: string;
                };
              }
              const result = await fetchFromMeta<{ data: MetaAd[] }>(
                metaToken,
                `${campaign.id}/ads`,
                {
                  fields: 'id,creative{object_story_spec,asset_feed_spec},promoted_object',
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

              // Extract per-campaign metadata from live API response
              const meta: CampaignMeta = {};
              if (c.object_story_spec?.page_id) meta.pageId = String(c.object_story_spec.page_id);
              if (c.object_story_spec?.instagram_actor_id) meta.instagramActorId = String(c.object_story_spec.instagram_actor_id);
              if (ad.promoted_object?.pixel_id) meta.pixelId = String(ad.promoted_object.pixel_id);
              if (meta.pageId || meta.pixelId || meta.instagramActorId) {
                campaignMetaMap.set(campaign.id, meta);
              }

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
                  existing.campaigns.push({
                    campaignId: campaign.id,
                    campaignName: campaign.name,
                    destinationUrl: destUrl,
                    meta: campaignMetaMap.get(campaign.id),
                  });
                }
              } else {
                matchesByHandle.set(handle, {
                  shopifyProduct: product,
                  adAccountId: campaign.adAccountId,
                  adAccountCurrency: account?.currency ?? 'USD',
                  campaigns: [{
                    campaignId: campaign.id,
                    campaignName: campaign.name,
                    destinationUrl: destUrl,
                    meta: campaignMetaMap.get(campaign.id),
                  }],
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

    // 4b. Look up names for pages, pixels, instagram, and BM from snapshots
    //     These provide human-readable names for the IDs extracted per-campaign above,
    //     and also serve as fallback metadata when ad snapshots lack the IDs.
    const pageNameMap = new Map<string, string>();   // pageId → pageName
    const pixelNameMap = new Map<string, string>();   // pixelId → pixelName
    const igUsernameMap = new Map<string, string>();  // igId → igUsername
    const accountBmMap = new Map<string, { bmId: string; bmName: string }>();  // adAccountId → BM info

    // Fallback: account-level page/pixel/ig for campaigns that had no per-ad metadata
    const accountPageMap = new Map<string, string>();  // adAccountId → first pageId
    const accountPixelMap = new Map<string, string>(); // adAccountId → first pixelId
    const accountIgMap = new Map<string, string>();    // adAccountId → first igId

    // Collect unique ad account IDs from matched profiles
    const usedAdAccountIds = new Set<string>();
    for (const [, match] of matchesByHandle) {
      if (match.adAccountId) usedAdAccountIds.add(match.adAccountId);
    }

    if (usedAdAccountIds.size > 0 && isSupabasePersistenceEnabled()) {
      try {
        interface SnapshotRow { scope_id: string; payload_json: string; }

        const [pagesSnaps, pixelsSnaps, igSnaps, accountsSnaps] = await Promise.all([
          supabaseRest<SnapshotRow[]>(
            `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.pages&variant_key=eq.latest&select=scope_id,payload_json`
          ).catch(() => [] as SnapshotRow[]),
          supabaseRest<SnapshotRow[]>(
            `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.pixels&variant_key=eq.latest&select=scope_id,payload_json`
          ).catch(() => [] as SnapshotRow[]),
          supabaseRest<SnapshotRow[]>(
            `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.instagram&variant_key=eq.latest&select=scope_id,payload_json`
          ).catch(() => [] as SnapshotRow[]),
          supabaseRest<SnapshotRow[]>(
            `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.accounts&variant_key=eq.latest&select=scope_id,payload_json`
          ).catch(() => [] as SnapshotRow[]),
        ]);

        // Parse pages snapshots → build pageId→pageName and account→pageId maps
        for (const snap of pagesSnaps) {
          try {
            const pages = JSON.parse(snap.payload_json) as Array<{
              id: string;
              name?: string;
              instagram_business_account?: { id: string; username?: string };
            }>;
            const accountMatch = snap.scope_id.match(/(act_[^,\s]+)/);
            for (const page of pages) {
              if (page.id && page.name) pageNameMap.set(String(page.id), page.name);
              // Also map IG from page's instagram_business_account
              if (page.instagram_business_account?.id) {
                const igId = String(page.instagram_business_account.id);
                if (page.instagram_business_account.username) {
                  igUsernameMap.set(igId, page.instagram_business_account.username);
                }
              }
            }
            // Account-level fallback: first page for each ad account
            if (pages[0]?.id) {
              if (accountMatch) {
                accountPageMap.set(accountMatch[1], String(pages[0].id));
              } else {
                for (const acctId of usedAdAccountIds) {
                  if (!accountPageMap.has(acctId)) accountPageMap.set(acctId, String(pages[0].id));
                }
              }
            }
          } catch { /* skip */ }
        }

        // Parse pixels snapshots → build pixelId→pixelName and account→pixelId maps
        for (const snap of pixelsSnaps) {
          try {
            const pixels = JSON.parse(snap.payload_json) as Array<{ id: string; name?: string }>;
            const accountMatch = snap.scope_id.match(/(act_[^,\s]+)/);
            for (const pixel of pixels) {
              if (pixel.id && pixel.name) pixelNameMap.set(String(pixel.id), pixel.name);
            }
            if (pixels[0]?.id) {
              if (accountMatch) {
                accountPixelMap.set(accountMatch[1], String(pixels[0].id));
              } else {
                for (const acctId of usedAdAccountIds) {
                  if (!accountPixelMap.has(acctId)) accountPixelMap.set(acctId, String(pixels[0].id));
                }
              }
            }
          } catch { /* skip */ }
        }

        // Parse instagram snapshots → build igId→igUsername and account→igId maps
        for (const snap of igSnaps) {
          try {
            const igs = JSON.parse(snap.payload_json) as Array<{ id: string; username?: string }>;
            const accountMatch = snap.scope_id.match(/(act_[^,\s]+)/);
            for (const ig of igs) {
              if (ig.id && ig.username) igUsernameMap.set(String(ig.id), ig.username);
            }
            if (igs[0]?.id) {
              if (accountMatch) {
                accountIgMap.set(accountMatch[1], String(igs[0].id));
              } else {
                for (const acctId of usedAdAccountIds) {
                  if (!accountIgMap.has(acctId)) accountIgMap.set(acctId, String(igs[0].id));
                }
              }
            }
          } catch { /* skip */ }
        }

        // Parse accounts snapshots for Business Manager info
        for (const snap of accountsSnaps) {
          try {
            const accounts = JSON.parse(snap.payload_json);
            // Accounts snapshot could be a single object or array
            const acctList = Array.isArray(accounts) ? accounts : [accounts];
            for (const acct of acctList) {
              const acctId = acct.id ? String(acct.id) : undefined;
              const business = acct.business || acct.owner_business;
              if (acctId && business && business.id) {
                accountBmMap.set(acctId, {
                  bmId: String(business.id),
                  bmName: String(business.name || business.id),
                });
              }
            }
          } catch { /* skip */ }
        }

        console.log(
          `[auto-discover] Name lookups: ${pageNameMap.size} pages, ${pixelNameMap.size} pixels, ` +
          `${igUsernameMap.size} IG accounts, ${accountBmMap.size} BM mappings`
        );
      } catch (err) {
        console.warn('[auto-discover] Snapshot name lookup failed:', err);
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

      // Determine profile-level page/pixel/ig from the first campaign's metadata or account fallback
      const firstCampMeta = match.campaigns[0]?.meta;
      const profilePageId = firstCampMeta?.pageId || accountPageMap.get(match.adAccountId);
      const profilePixelId = firstCampMeta?.pixelId || accountPixelMap.get(match.adAccountId);
      const profileIgId = firstCampMeta?.instagramActorId || accountIgMap.get(match.adAccountId);
      const bm = accountBmMap.get(match.adAccountId);

      if (existingProfile) {
        profileId = existingProfile.id;
        // Update existing profile with page/pixel/instagram if it was missing them
        const needsMetaUpdate = (!existingProfile.pageId && profilePageId)
          || (!existingProfile.pixelId && profilePixelId)
          || (!existingProfile.instagramActorId && profileIgId);
        if (needsMetaUpdate) {
          upsertProductProfile({
            id: profileId,
            storeId,
            productName: existingProfile.productName,
            adAccountId: existingProfile.adAccountId,
            pageId: existingProfile.pageId || profilePageId,
            pixelId: existingProfile.pixelId || profilePixelId,
            instagramActorId: existingProfile.instagramActorId || profileIgId,
            instagramUsername: existingProfile.instagramUsername || (profileIgId ? igUsernameMap.get(profileIgId) : undefined),
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
          utmTemplate: DEFAULT_UTM_TEMPLATE,
          pageId: profilePageId,
          pixelId: profilePixelId,
          instagramActorId: profileIgId,
          instagramUsername: profileIgId ? igUsernameMap.get(profileIgId) : undefined,
        });
      }

      const campaignLinks = [];
      for (const camp of match.campaigns) {
        const linkId = randomUUID();

        // Resolve per-campaign metadata: use campaign-level first, then account-level fallback
        const campMeta = camp.meta || campaignMetaMap.get(camp.campaignId);
        const linkPageId = campMeta?.pageId || accountPageMap.get(match.adAccountId);
        const linkPixelId = campMeta?.pixelId || accountPixelMap.get(match.adAccountId);
        const linkIgId = campMeta?.instagramActorId || accountIgMap.get(match.adAccountId);
        const linkBm = accountBmMap.get(match.adAccountId);

        const linkPageName = linkPageId ? pageNameMap.get(linkPageId) : undefined;
        const linkPixelName = linkPixelId ? pixelNameMap.get(linkPixelId) : undefined;
        const linkIgUsername = linkIgId ? igUsernameMap.get(linkIgId) : undefined;

        upsertProductCampaignLink({
          id: linkId,
          productProfileId: profileId,
          campaignId: camp.campaignId,
          campaignName: camp.campaignName,
          campaignType: 'testing',
          adAccountId: match.adAccountId,
          isActive: true,
          pageId: linkPageId,
          pageName: linkPageName,
          pixelId: linkPixelId,
          pixelName: linkPixelName,
          instagramActorId: linkIgId,
          instagramUsername: linkIgUsername,
          bmId: linkBm?.bmId,
          bmName: linkBm?.bmName,
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
          pageId: linkPageId,
          pageName: linkPageName,
          pixelId: linkPixelId,
          pixelName: linkPixelName,
          instagramActorId: linkIgId,
          instagramUsername: linkIgUsername,
          bmId: linkBm?.bmId,
          bmName: linkBm?.bmName,
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
        pageId: existingProfile?.pageId || profilePageId,
        pixelId: existingProfile?.pixelId || profilePixelId,
        instagramActorId: existingProfile?.instagramActorId || profileIgId,
        instagramUsername: existingProfile?.instagramUsername || (profileIgId ? igUsernameMap.get(profileIgId) : undefined),
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
