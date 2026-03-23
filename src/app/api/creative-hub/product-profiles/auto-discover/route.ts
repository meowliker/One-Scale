// Allow up to 60s on Vercel Pro plan
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { getMetaToken } from '@/app/api/lib/tokens';
import {
  isSupabasePersistenceEnabled,
  listPersistentStores,
  rest,
} from '@/app/api/lib/supabase-persistence';
import {
  getProductProfiles,
  upsertProductProfile,
  upsertProductCampaignLink,
} from '@/app/api/lib/creative-hub-db';
import type { DbStoreAdAccount } from '@/app/api/lib/db';

// ─── Types ───────────────────────────────────────────────────────────

interface ShopifyProduct {
  id: number | string;
  title: string;
  handle: string;
  image?: { src: string } | null;
  images?: Array<{ src: string }>;
}

/** Per-campaign metadata extracted from the creative + promoted_object */
interface CampaignMeta {
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  pageId?: string;
  pixelId?: string;
  instagramActorId?: string;
  destinationUrl?: string;
}

interface UnmappedCampaign {
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  destinationUrls: string[];
}

const DEFAULT_UTM_TEMPLATE =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';

// ─── Helpers ─────────────────────────────────────────────────────────

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

/** Process items in sequential batches of `size`, parallel within each batch */
async function batchProcess<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

/** Find the most common value in an array, ignoring undefined */
function mostCommon<T>(values: (T | undefined)[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) {
    if (v !== undefined) counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best: T | undefined;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return best;
}

// ─── Main handler ────────────────────────────────────────────────────

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
    // ━━━ Step 1: Get all ad accounts from Supabase ━━━
    if (!isSupabasePersistenceEnabled()) {
      return NextResponse.json({ error: 'Supabase persistence is not enabled' }, { status: 500 });
    }

    const allStores = await listPersistentStores();
    const store = allStores.find((s) => s.id === storeId);
    if (!store) {
      return NextResponse.json({ error: `Store ${storeId} not found` }, { status: 404 });
    }

    const adAccounts = store.adAccounts.filter(
      (a) =>
        (a.platform === 'meta' || !a.platform || a.platform === '') &&
        (a.is_active === 1 || a.is_active === undefined || (a.is_active as unknown) === null),
    );
    if (adAccounts.length === 0) {
      return NextResponse.json(
        { error: `No active Meta ad accounts found. Found ${store.adAccounts.length} total.` },
        { status: 400 },
      );
    }

    const accountLookup = new Map(adAccounts.map((a) => [a.ad_account_id, a]));

    // ━━━ Step 2: Get active campaigns from Supabase snapshots ━━━
    interface CampaignSnapshotRow {
      scope_id: string;
      payload_json: string;
    }

    const campaignSnapshots = await rest<CampaignSnapshotRow[]>(
      `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId!)}&endpoint=eq.campaigns&variant_key=eq.latest&select=scope_id,payload_json`,
    );

    interface RawCampaign {
      id: string;
      name: string;
      status?: string;
      effective_status?: string;
      ad_account_id?: string;
      adAccountId?: string;
      account_id?: string;
    }

    const allCampaigns: Array<{ id: string; name: string; adAccountId: string }> = [];
    const seenCampaignIds = new Set<string>();
    // Only process ACTIVE campaigns for auto-discover (PAUSED/others can be added via Edit)
    const allowedStatuses = new Set(['ACTIVE', 'active']);

    for (const snap of campaignSnapshots) {
      try {
        const campaigns: RawCampaign[] = JSON.parse(snap.payload_json);
        const scopeAdAccount =
          snap.scope_id.match(/accounts:(.+)/)?.[1]?.split(',')[0] ||
          adAccounts[0]?.ad_account_id ||
          '';

        for (const c of campaigns) {
          if (!c.id || !c.name) continue;
          if (seenCampaignIds.has(c.id)) continue;
          // Filter: only ACTIVE campaigns (skip PAUSED/DELETED/ARCHIVED)
          const status = c.status || c.effective_status || '';
          if (!allowedStatuses.has(status)) continue;
          seenCampaignIds.add(c.id);

          const adAccountId =
            c.ad_account_id || c.adAccountId || c.account_id || scopeAdAccount;
          allCampaigns.push({ id: c.id, name: c.name, adAccountId });
        }
      } catch { /* skip malformed */ }
    }

    console.log(`[auto-discover] Found ${allCampaigns.length} campaigns (ACTIVE/PAUSED) from Supabase snapshots`);

    // ━━━ Step 3: For each campaign, get 1 ad → creative_id → object_story_spec ━━━
    const metaTokenObj = await getMetaToken(storeId!);
    if (!metaTokenObj) {
      return NextResponse.json({ error: 'No Meta token found for this store' }, { status: 400 });
    }
    const metaToken = metaTokenObj.accessToken;

    const campaignMetaMap = new Map<string, CampaignMeta>();

    await batchProcess(allCampaigns, 15, async (campaign) => {
      try {
        // Step 3a: Get 1 ad from the campaign with creative.id and promoted_object
        const adsResult = await fetchFromMeta<{
          data: Array<{
            id: string;
            creative?: { id?: string };
            promoted_object?: { pixel_id?: string };
          }>;
        }>(metaToken, `${campaign.id}/ads`, {
          fields: 'id,creative{id},promoted_object',
          limit: '1',
        }, 8000, 0);

        const ad = adsResult.data?.[0];
        if (!ad) return;

        const creativeId = ad.creative?.id;
        const pixelId = ad.promoted_object?.pixel_id;

        const meta: CampaignMeta = {
          campaignId: campaign.id,
          campaignName: campaign.name,
          adAccountId: campaign.adAccountId,
          pixelId: pixelId ? String(pixelId) : undefined,
        };

        if (!creativeId) {
          // No creative, but we might still have pixel info
          if (meta.pixelId) campaignMetaMap.set(campaign.id, meta);
          return;
        }

        // Step 3b: Fetch creative details separately (MUST NOT use field expansion on ads endpoint)
        const creativeResult = await fetchFromMeta<{
          id: string;
          object_story_spec?: {
            page_id?: string;
            instagram_actor_id?: string;
            instagram_user_id?: string;
            link_data?: { link?: string };
            video_data?: { call_to_action?: { value?: { link?: string } } };
          };
          asset_feed_spec?: { link_urls?: Array<{ website_url?: string }> };
        }>(metaToken, creativeId, {
          fields: 'id,object_story_spec',
        }, 8000, 0);

        const oss = creativeResult.object_story_spec;
        if (oss) {
          if (oss.page_id) meta.pageId = String(oss.page_id);
          const igId = oss.instagram_actor_id || oss.instagram_user_id;
          if (igId) meta.instagramActorId = String(igId);

          // Extract landing URL
          if (oss.link_data?.link) {
            meta.destinationUrl = oss.link_data.link;
          } else if (oss.video_data?.call_to_action?.value?.link) {
            meta.destinationUrl = oss.video_data.call_to_action.value.link;
          }
        }

        // Fallback for asset_feed_spec link URLs
        if (!meta.destinationUrl && creativeResult.asset_feed_spec?.link_urls?.[0]?.website_url) {
          meta.destinationUrl = creativeResult.asset_feed_spec.link_urls[0].website_url;
        }

        campaignMetaMap.set(campaign.id, meta);
      } catch (err) {
        console.warn(`[auto-discover] Failed to fetch creative for campaign ${campaign.id}:`, err);
      }
    });

    console.log(
      `[auto-discover] Creative fetch complete: ${campaignMetaMap.size}/${allCampaigns.length} campaigns resolved`,
    );

    // ━━━ Step 4: Batch resolve names for all unique IDs ━━━
    const uniquePageIds = new Set<string>();
    const uniqueIgIds = new Set<string>();
    const uniquePixelIds = new Set<string>();
    const uniqueAdAccountIds = new Set<string>();

    for (const [, meta] of campaignMetaMap) {
      if (meta.pageId) uniquePageIds.add(meta.pageId);
      if (meta.instagramActorId) uniqueIgIds.add(meta.instagramActorId);
      if (meta.pixelId) uniquePixelIds.add(meta.pixelId);
      if (meta.adAccountId) uniqueAdAccountIds.add(meta.adAccountId);
    }

    const pageNameMap = new Map<string, string>();
    const igUsernameMap = new Map<string, string>();
    const pixelNameMap = new Map<string, string>();
    const accountBmMap = new Map<string, { bmId: string; bmName: string }>();

    // 4a: Resolve page names
    await batchProcess(Array.from(uniquePageIds), 10, async (pageId) => {
      try {
        const page = await fetchFromMeta<{ id: string; name: string }>(
          metaToken, pageId, { fields: 'id,name' }, 5000, 0,
        );
        if (page.name) pageNameMap.set(pageId, page.name);
      } catch {
        // Try promote_pages fallback for pages we can't access directly
        for (const acct of adAccounts) {
          try {
            const promotedPages = await fetchFromMeta<{ data: Array<{ id: string; name: string }> }>(
              metaToken, `${acct.ad_account_id}/promote_pages`, { fields: 'id,name', limit: '100' }, 5000, 0,
            );
            for (const p of promotedPages.data || []) {
              if (p.id === pageId && p.name) {
                pageNameMap.set(pageId, p.name);
                return;
              }
            }
          } catch { /* skip */ }
        }
      }
    });

    // 4b: Resolve instagram usernames
    await batchProcess(Array.from(uniqueIgIds), 10, async (igId) => {
      try {
        const ig = await fetchFromMeta<{ id: string; username: string }>(
          metaToken, igId, { fields: 'id,username' }, 5000, 0,
        );
        if (ig.username) igUsernameMap.set(igId, ig.username);
      } catch { /* skip */ }
    });

    // 4c: Resolve pixel names + BM info per ad account
    await batchProcess(Array.from(uniqueAdAccountIds), 10, async (acctId) => {
      try {
        // Fetch pixels for this ad account
        const pixelRes = await fetchFromMeta<{ data: Array<{ id: string; name: string }> }>(
          metaToken, `${acctId}/adspixels`, { fields: 'id,name' }, 8000, 0,
        );
        for (const px of pixelRes.data || []) {
          pixelNameMap.set(px.id, px.name);
        }
      } catch { /* skip */ }

      try {
        // Fetch BM info for this ad account
        const acctRes = await fetchFromMeta<{ business?: { id: string; name: string } }>(
          metaToken, acctId, { fields: 'business{id,name}' }, 8000, 0,
        );
        if (acctRes.business) {
          accountBmMap.set(acctId, { bmId: acctRes.business.id, bmName: acctRes.business.name });
        }
      } catch { /* skip */ }
    });

    // For any pixel IDs still not resolved, try direct lookup
    for (const pixelId of uniquePixelIds) {
      if (!pixelNameMap.has(pixelId)) {
        try {
          const px = await fetchFromMeta<{ id: string; name: string }>(
            metaToken, pixelId, { fields: 'id,name' }, 5000, 0,
          );
          if (px.name) pixelNameMap.set(pixelId, px.name);
        } catch { /* skip */ }
      }
    }

    console.log(
      `[auto-discover] Name resolution: ${pageNameMap.size} pages, ${igUsernameMap.size} IG, ` +
      `${pixelNameMap.size} pixels, ${accountBmMap.size} BM`,
    );

    // ━━━ Step 5: Match URLs to Shopify products ━━━
    const shopifyProducts = await getShopifyProducts(storeId!, request);
    const handleMap = new Map<string, ShopifyProduct>();
    for (const product of shopifyProducts) {
      if (product.handle) handleMap.set(product.handle.toLowerCase(), product);
    }

    // Group campaigns by matched product handle
    const matchesByHandle = new Map<
      string,
      {
        shopifyProduct: ShopifyProduct;
        campaigns: CampaignMeta[];
      }
    >();
    const unmappedCampaigns: UnmappedCampaign[] = [];
    const mappedCampaignIds = new Set<string>();

    for (const [, meta] of campaignMetaMap) {
      if (!meta.destinationUrl) {
        unmappedCampaigns.push({
          campaignId: meta.campaignId,
          campaignName: meta.campaignName,
          adAccountId: meta.adAccountId,
          destinationUrls: [],
        });
        continue;
      }

      const handle = extractProductHandle(meta.destinationUrl);
      if (handle && handleMap.has(handle)) {
        const existing = matchesByHandle.get(handle);
        if (existing) {
          existing.campaigns.push(meta);
        } else {
          matchesByHandle.set(handle, {
            shopifyProduct: handleMap.get(handle)!,
            campaigns: [meta],
          });
        }
        mappedCampaignIds.add(meta.campaignId);
      } else {
        unmappedCampaigns.push({
          campaignId: meta.campaignId,
          campaignName: meta.campaignName,
          adAccountId: meta.adAccountId,
          destinationUrls: [meta.destinationUrl],
        });
      }
    }

    // Also track campaigns that had no creative data at all
    for (const campaign of allCampaigns) {
      if (!campaignMetaMap.has(campaign.id) && !mappedCampaignIds.has(campaign.id)) {
        unmappedCampaigns.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          adAccountId: campaign.adAccountId,
          destinationUrls: [],
        });
      }
    }

    // ━━━ Step 6: Save to Supabase ━━━
    const existingProfiles = await getProductProfiles(storeId!);
    const existingByShopifyId = new Map(
      existingProfiles.filter((p) => p.shopifyProductId).map((p) => [p.shopifyProductId!, p]),
    );

    const savedProfiles: Array<
      Awaited<ReturnType<typeof getProductProfiles>>[0] & { campaignLinks: unknown[] }
    > = [];

    for (const [, match] of matchesByHandle) {
      const shopifyId = String(match.shopifyProduct.id);
      const existingProfile = existingByShopifyId.get(shopifyId);

      // Determine profile-level metadata from MOST COMMON across campaigns
      const profilePageId = mostCommon(match.campaigns.map((c) => c.pageId));
      const profilePixelId = mostCommon(match.campaigns.map((c) => c.pixelId));
      const profileIgId = mostCommon(match.campaigns.map((c) => c.instagramActorId));
      const profileAdAccountId = mostCommon(match.campaigns.map((c) => c.adAccountId)) || match.campaigns[0].adAccountId;
      const account = accountLookup.get(profileAdAccountId);
      const bm = accountBmMap.get(profileAdAccountId);

      const profilePageName = profilePageId ? pageNameMap.get(profilePageId) : undefined;
      const profilePixelName = profilePixelId ? pixelNameMap.get(profilePixelId) : undefined;
      const profileIgUsername = profileIgId ? igUsernameMap.get(profileIgId) : undefined;

      let profileId: string;

      if (existingProfile) {
        profileId = existingProfile.id;
        await upsertProductProfile({
          id: profileId,
          storeId: storeId!,
          productName: existingProfile.productName,
          adAccountId: profileAdAccountId,
          pageId: profilePageId || existingProfile.pageId,
          pageName: profilePageName || existingProfile.pageName,
          pixelId: profilePixelId || existingProfile.pixelId,
          pixelName: profilePixelName || existingProfile.pixelName,
          instagramActorId: profileIgId || existingProfile.instagramActorId,
          instagramUsername: profileIgUsername || existingProfile.instagramUsername,
        });
      } else {
        profileId = randomUUID();
        const productImage =
          match.shopifyProduct.image?.src ?? match.shopifyProduct.images?.[0]?.src;
        await upsertProductProfile({
          id: profileId,
          storeId: storeId!,
          shopifyProductId: shopifyId,
          productName: match.shopifyProduct.title,
          productImage,
          adAccountId: profileAdAccountId,
          adAccountCurrency: account?.currency ?? 'USD',
          destinationUrl: match.campaigns[0]?.destinationUrl,
          utmTemplate: DEFAULT_UTM_TEMPLATE,
          pageId: profilePageId,
          pageName: profilePageName,
          pixelId: profilePixelId,
          pixelName: profilePixelName,
          instagramActorId: profileIgId,
          instagramUsername: profileIgUsername,
        });
      }

      // Save campaign links
      const campaignLinks = [];
      for (const camp of match.campaigns) {
        const linkId = randomUUID();
        const linkBm = accountBmMap.get(camp.adAccountId);

        await upsertProductCampaignLink({
          id: linkId,
          productProfileId: profileId,
          campaignId: camp.campaignId,
          campaignName: camp.campaignName,
          campaignType: 'testing',
          adAccountId: camp.adAccountId,
          isActive: true,
          pageId: camp.pageId,
          pageName: camp.pageId ? pageNameMap.get(camp.pageId) : undefined,
          pixelId: camp.pixelId,
          pixelName: camp.pixelId ? pixelNameMap.get(camp.pixelId) : undefined,
          instagramActorId: camp.instagramActorId,
          instagramUsername: camp.instagramActorId
            ? igUsernameMap.get(camp.instagramActorId)
            : undefined,
          bmId: linkBm?.bmId,
          bmName: linkBm?.bmName,
        });

        campaignLinks.push({
          id: linkId,
          productProfileId: profileId,
          campaignId: camp.campaignId,
          campaignName: camp.campaignName,
          campaignType: 'testing',
          adAccountId: camp.adAccountId,
          isActive: true,
          linkedAt: new Date().toISOString(),
          pageId: camp.pageId,
          pageName: camp.pageId ? pageNameMap.get(camp.pageId) : undefined,
          pixelId: camp.pixelId,
          pixelName: camp.pixelId ? pixelNameMap.get(camp.pixelId) : undefined,
          instagramActorId: camp.instagramActorId,
          instagramUsername: camp.instagramActorId
            ? igUsernameMap.get(camp.instagramActorId)
            : undefined,
          bmId: linkBm?.bmId,
          bmName: linkBm?.bmName,
          destinationUrl: camp.destinationUrl,
        });
      }

      savedProfiles.push({
        id: profileId,
        storeId: storeId!,
        shopifyProductId: shopifyId,
        productName: match.shopifyProduct.title,
        productImage:
          match.shopifyProduct.image?.src ?? match.shopifyProduct.images?.[0]?.src,
        adAccountId: profileAdAccountId,
        adAccountCurrency: account?.currency ?? 'USD',
        destinationUrl: match.campaigns[0]?.destinationUrl,
        pageId: profilePageId || existingProfile?.pageId,
        pageName: profilePageName || existingProfile?.pageName,
        pixelId: profilePixelId || existingProfile?.pixelId,
        pixelName: profilePixelName || existingProfile?.pixelName,
        instagramActorId: profileIgId || existingProfile?.instagramActorId,
        instagramUsername: profileIgUsername || existingProfile?.instagramUsername,
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

    // ━━━ Step 7: Return response ━━━
    return NextResponse.json({
      profiles: savedProfiles,
      unmappedCampaigns,
      stats: {
        totalCampaigns: allCampaigns.length,
        matchedProducts: savedProfiles.length,
        unmappedCount: unmappedCampaigns.length,
        source: 'supabase_snapshots',
      },
      _debug: {
        campaignMetaMapSize: campaignMetaMap.size,
        campaignMetaEntries: Array.from(campaignMetaMap.entries()).map(([, v]) => ({
          ...v,
        })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-discovery failed';
    console.error('[auto-discover] Fatal error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Shopify product fetch ───────────────────────────────────────────

async function getShopifyProducts(
  storeId: string,
  request: NextRequest,
): Promise<ShopifyProduct[]> {
  try {
    const baseUrl = new URL(request.url).origin;
    const cookie = request.headers.get('cookie') ?? '';
    const res = await fetch(
      `${baseUrl}/api/shopify/products?storeId=${encodeURIComponent(storeId)}&limit=250`,
      { headers: { cookie } },
    );
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
  return [];
}
