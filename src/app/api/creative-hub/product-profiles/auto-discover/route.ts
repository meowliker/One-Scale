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
  deleteAllCampaignLinksForProfile,
  deleteProductProfile,
} from '@/app/api/lib/creative-hub-db';
import type { DbStoreAdAccount } from '@/app/api/lib/db';
import type { ProductCampaignLink } from '@/types/creativeHub';

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

    // ━━━ Step 2: Get active campaigns from per-store Supabase snapshot table ━━━
    // Get the per-store snapshot table name via RPC
    const activeAdAccountIds = new Set(adAccounts.map((a) => a.ad_account_id));
    let snapshotTable = '';
    try {
      const tableNameResult = await rest<string>(
        '/rpc/ensure_meta_snapshot_store_table',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ p_store_id: storeId }),
        },
      );
      snapshotTable = typeof tableNameResult === 'string' ? tableNameResult : '';
    } catch (e) {
      console.warn('[auto-discover] Could not get per-store table, falling back to legacy:', e);
    }

    interface CampaignSnapshotRow {
      scope_id: string;
      payload_json: string;
    }

    // Use per-store table if available, otherwise fall back to legacy table
    const snapshotQuery = snapshotTable
      ? `/${snapshotTable}?endpoint=eq.campaigns&variant_key=eq.latest&select=scope_id,payload_json&order=updated_at.desc`
      : `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId!)}&endpoint=eq.campaigns&variant_key=eq.latest&select=scope_id,payload_json`;

    console.log(`[auto-discover] Using snapshot table: ${snapshotTable || 'meta_endpoint_snapshots (legacy)'}`);
    const campaignSnapshots = await rest<CampaignSnapshotRow[]>(snapshotQuery);

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

          const adAccountId =
            c.ad_account_id || c.adAccountId || c.account_id || scopeAdAccount;

          // ★ Only include campaigns from the store's CURRENT active ad accounts
          if (!activeAdAccountIds.has(adAccountId)) continue;

          seenCampaignIds.add(c.id);
          allCampaigns.push({ id: c.id, name: c.name, adAccountId });
        }
      } catch { /* skip malformed */ }
    }

    console.log(`[auto-discover] Found ${allCampaigns.length} ACTIVE campaigns from store's ad accounts (filtered from ${seenCampaignIds.size} total)`);

    // ━━━ Step 2b: Extract destination URLs from ads snapshots (skip Meta API when possible) ━━━
    // The per-store table has ads with creative.destinationUrl already embedded
    const campaignUrlMap = new Map<string, string>(); // campaignId → destinationUrl
    if (snapshotTable) {
      try {
        const adsSnapshots = await rest<CampaignSnapshotRow[]>(
          `/${snapshotTable}?endpoint=eq.ads&variant_key=eq.latest&select=scope_id,payload_json&order=updated_at.desc`,
        );
        interface RawAd {
          id: string;
          campaignId?: string;
          campaign_id?: string;
          adSetId?: string;
          creative?: {
            destinationUrl?: string;
            type?: string;
          };
        }
        for (const snap of adsSnapshots) {
          try {
            const ads: RawAd[] = JSON.parse(snap.payload_json);
            for (const ad of ads) {
              const campId = ad.campaignId || ad.campaign_id;
              if (!campId || campaignUrlMap.has(campId)) continue;
              const url = ad.creative?.destinationUrl;
              if (url) {
                campaignUrlMap.set(campId, url);
              }
            }
          } catch { /* skip malformed */ }
        }
        console.log(`[auto-discover] Extracted ${campaignUrlMap.size} destination URLs from ads snapshots (skipping Meta API for these)`);
      } catch (e) {
        console.warn('[auto-discover] Could not read ads snapshots:', e);
      }
    }

    // ━━━ Step 3: For each campaign, get destination URL ━━━
    // First populate from snapshot data (no API calls needed)
    const campaignMetaMap = new Map<string, CampaignMeta>();
    const campaignsNeedingApi: typeof allCampaigns = [];

    for (const campaign of allCampaigns) {
      const snapshotUrl = campaignUrlMap.get(campaign.id);
      if (snapshotUrl) {
        campaignMetaMap.set(campaign.id, {
          campaignId: campaign.id,
          campaignName: campaign.name,
          adAccountId: campaign.adAccountId,
          destinationUrl: snapshotUrl,
        });
      } else {
        campaignsNeedingApi.push(campaign);
      }
    }

    console.log(`[auto-discover] ${campaignMetaMap.size} campaigns resolved from snapshots, ${campaignsNeedingApi.length} need Meta API`);

    const metaTokenObj = await getMetaToken(storeId!);
    if (!metaTokenObj) {
      return NextResponse.json({ error: 'No Meta token found for this store' }, { status: 400 });
    }
    const metaToken = metaTokenObj.accessToken;

    // Only call Meta API for campaigns not covered by snapshot data
    await batchProcess(campaignsNeedingApi, 15, async (campaign) => {
      try {
        // Step 3a: Get 1 ad from the campaign with creative.id and promoted_object
        const adsResult = await fetchFromMeta<{
          data: Array<{
            id: string;
            adset_id?: string;
            creative?: { id?: string };
            promoted_object?: { pixel_id?: string };
          }>;
        }>(metaToken, `${campaign.id}/ads`, {
          fields: 'id,adset_id,creative{id},promoted_object',
          limit: '1',
        }, 8000, 0);

        const ad = adsResult.data?.[0];
        if (!ad) return;

        const creativeId = ad.creative?.id;
        let pixelId = ad.promoted_object?.pixel_id;

        // pixel_id is on the adset's promoted_object, not the ad
        // If not found on ad, fetch from adset
        if (!pixelId && ad.adset_id) {
          try {
            const adsetResult = await fetchFromMeta<{
              promoted_object?: { pixel_id?: string };
            }>(metaToken, ad.adset_id, {
              fields: 'promoted_object',
            }, 5000, 0);
            pixelId = adsetResult.promoted_object?.pixel_id;
          } catch { /* skip */ }
        }

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

    // Pre-populate names from campaign-setup/options API (most reliable source)
    try {
      const baseUrl = new URL(request.url).origin;
      const cookie = request.headers.get('cookie') ?? '';
      const optionsRes = await fetch(
        `${baseUrl}/api/meta/campaign-setup/options?storeId=${encodeURIComponent(storeId!)}`,
        { headers: { cookie } },
      );
      if (optionsRes.ok) {
        const options = await optionsRes.json() as {
          pages?: Array<{ id: string; name: string; instagramAccountId?: string; instagramUsername?: string }>;
          pixels?: Array<{ id: string; name: string }>;
          instagramAccounts?: Array<{ id: string; username: string }>;
          accounts?: Array<{ id: string; name: string; businessId?: string; businessName?: string }>;
        };
        for (const page of options.pages ?? []) {
          if (page.id && page.name) pageNameMap.set(page.id, page.name);
          if (page.instagramAccountId && page.instagramUsername) {
            igUsernameMap.set(page.instagramAccountId, page.instagramUsername);
          }
        }
        for (const pixel of options.pixels ?? []) {
          if (pixel.id && pixel.name) pixelNameMap.set(pixel.id, pixel.name);
        }
        for (const ig of options.instagramAccounts ?? []) {
          if (ig.id && ig.username) igUsernameMap.set(ig.id, ig.username);
        }
        for (const acct of options.accounts ?? []) {
          if (acct.businessId) {
            accountBmMap.set(acct.id, { bmId: acct.businessId, bmName: acct.businessName || acct.businessId });
          }
        }
        console.log(`[auto-discover] Pre-populated from options: ${pageNameMap.size} pages, ${igUsernameMap.size} IG, ${pixelNameMap.size} pixels, ${accountBmMap.size} BM`);
      }
    } catch (err) {
      console.warn('[auto-discover] Options API pre-populate failed:', err);
    }

    // 4a: Resolve page names
    // First try: fetch ALL pages the user manages via me/accounts (catches cross-BM pages)
    try {
      const allPages = await fetchFromMeta<{ data: Array<{ id: string; name: string }> }>(
        metaToken, 'me/accounts', { fields: 'id,name', limit: '200' }, 8000, 0,
      );
      for (const p of allPages.data || []) {
        if (p.id && p.name) pageNameMap.set(p.id, p.name);
      }
    } catch { /* skip */ }

    // Second try: for any still-unresolved page IDs, try direct lookup + promote_pages
    const unresolvedPageIds = Array.from(uniquePageIds).filter(id => !pageNameMap.has(id));
    if (unresolvedPageIds.length > 0) {
      console.log(`[auto-discover] Attempting direct lookup for ${unresolvedPageIds.length} unresolved page IDs: ${unresolvedPageIds.join(', ')}`);
    }
    await batchProcess(unresolvedPageIds, 10, async (pageId) => {
      try {
        const page = await fetchFromMeta<{ id: string; name: string }>(
          metaToken, pageId, { fields: 'id,name' }, 5000, 0,
        );
        if (page.name) {
          pageNameMap.set(pageId, page.name);
          console.log(`[auto-discover] Resolved cross-BM page ${pageId} → "${page.name}" via direct lookup`);
        }
      } catch (directErr) {
        console.warn(`[auto-discover] Direct page lookup failed for ${pageId}:`, directErr);
        // Try promote_pages fallback across all ad accounts
        for (const acct of adAccounts) {
          try {
            const promotedPages = await fetchFromMeta<{ data: Array<{ id: string; name: string }> }>(
              metaToken, `${acct.ad_account_id}/promote_pages`, { fields: 'id,name', limit: '100' }, 5000, 0,
            );
            for (const p of promotedPages.data || []) {
              if (p.id === pageId && p.name) {
                pageNameMap.set(pageId, p.name);
                console.log(`[auto-discover] Resolved page ${pageId} → "${p.name}" via promote_pages on ${acct.ad_account_id}`);
                return;
              }
            }
          } catch { /* skip */ }
        }
      }
    });

    // 4b: Resolve instagram usernames (skip already-resolved)
    const unresolvedIgIds = Array.from(uniqueIgIds).filter(id => !igUsernameMap.has(id));
    await batchProcess(unresolvedIgIds, 10, async (igId) => {
      try {
        const ig = await fetchFromMeta<{ id: string; username: string }>(
          metaToken, igId, { fields: 'id,username' }, 5000, 0,
        );
        if (ig.username) igUsernameMap.set(igId, ig.username);
      } catch (err) {
        console.warn(`[auto-discover] Failed to resolve IG username for ${igId}:`, err);
      }
    });

    // 4c: Resolve pixel names + BM info per ad account (skip already-resolved BMs)
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

      // Only fetch BM info if not already resolved from options API
      if (!accountBmMap.has(acctId)) {
        try {
          const acctRes = await fetchFromMeta<{ business?: { id: string; name: string } }>(
            metaToken, acctId, { fields: 'business{id,name}' }, 8000, 0,
          );
          if (acctRes.business) {
            accountBmMap.set(acctId, { bmId: acctRes.business.id, bmName: acctRes.business.name });
          }
        } catch { /* skip */ }
      }
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

    // Log unresolved IDs for debugging cross-BM issues
    const stillUnresolvedPages = Array.from(uniquePageIds).filter(id => !pageNameMap.has(id));
    const stillUnresolvedIgs = Array.from(uniqueIgIds).filter(id => !igUsernameMap.has(id));
    const stillUnresolvedBms = Array.from(uniqueAdAccountIds).filter(id => !accountBmMap.has(id));
    if (stillUnresolvedPages.length > 0) {
      console.warn(`[auto-discover] Unresolved page IDs (will show as raw IDs): ${stillUnresolvedPages.join(', ')}`);
    }
    if (stillUnresolvedIgs.length > 0) {
      console.warn(`[auto-discover] Unresolved IG IDs (will show as raw IDs): ${stillUnresolvedIgs.join(', ')}`);
    }
    if (stillUnresolvedBms.length > 0) {
      console.warn(`[auto-discover] Unresolved BM for ad accounts: ${stillUnresolvedBms.join(', ')}`);
    }

    console.log(
      `[auto-discover] Name resolution: ${pageNameMap.size}/${uniquePageIds.size} pages, ` +
      `${igUsernameMap.size}/${uniqueIgIds.size} IG, ` +
      `${pixelNameMap.size}/${uniquePixelIds.size} pixels, ` +
      `${accountBmMap.size}/${uniqueAdAccountIds.size} BM`,
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

    // ━━━ Step 5b: Fallback — fetch URL from Meta API for unmapped campaigns ━━━
    // For campaigns where snapshot had no destinationUrl, try ONE Meta API call per campaign
    if (unmappedCampaigns.length > 0 && metaToken) {
      console.log(`[auto-discover] ${unmappedCampaigns.length} unmapped campaigns — trying Meta API fallback for URLs`);
      const stillUnmapped: UnmappedCampaign[] = [];

      for (const unmapped of unmappedCampaigns) {
        if (mappedCampaignIds.has(unmapped.campaignId)) continue;

        try {
          // Fetch 1 ad from the campaign to get the destination URL
          // Try multiple ads (not just 1) since some may lack URLs
          const adsResponse = await fetchFromMeta<{
            data: Array<{
              id: string;
              creative?: {
                object_story_spec?: {
                  link_data?: { link?: string; call_to_action?: { value?: { link?: string } } };
                  video_data?: { call_to_action?: { value?: { link?: string } } };
                };
                // Also check asset_feed_spec for dynamic creatives
                asset_feed_spec?: {
                  link_urls?: Array<{ website_url?: string }>;
                };
              };
            }>;
          }>(
            metaToken,
            `${unmapped.campaignId}/ads`,
            {
              fields: 'id,creative{object_story_spec{link_data{link,call_to_action{value{link}}},video_data{call_to_action{value{link}}}},asset_feed_spec{link_urls}}',
              limit: '5',
            },
            8000,
            0,
          );

          let url = '';
          for (const ad of adsResponse?.data ?? []) {
            const spec = ad?.creative?.object_story_spec;
            const feed = ad?.creative?.asset_feed_spec;
            url =
              spec?.link_data?.link ||
              spec?.link_data?.call_to_action?.value?.link ||
              spec?.video_data?.call_to_action?.value?.link ||
              feed?.link_urls?.[0]?.website_url ||
              '';
            if (url) break;
          }

          if (!url) {
            console.log(`[auto-discover] Meta API fallback: no URL found for "${unmapped.campaignName}" after checking ${adsResponse?.data?.length ?? 0} ads`);
          }

          if (url) {
            const handle = extractProductHandle(url);
            if (handle && handleMap.has(handle)) {
              // Matched! Add to product
              const meta: CampaignMeta = {
                campaignId: unmapped.campaignId,
                campaignName: unmapped.campaignName,
                adAccountId: unmapped.adAccountId,
                destinationUrl: url,
              };
              const existing = matchesByHandle.get(handle);
              if (existing) {
                existing.campaigns.push(meta);
              } else {
                matchesByHandle.set(handle, {
                  shopifyProduct: handleMap.get(handle)!,
                  campaigns: [meta],
                });
              }
              mappedCampaignIds.add(unmapped.campaignId);
              console.log(`[auto-discover] Meta API fallback matched "${unmapped.campaignName}" → ${handle} via ${url}`);
              continue;
            }
          }
        } catch (err) {
          console.warn(`[auto-discover] Meta API fallback failed for campaign ${unmapped.campaignId}:`, err);
        }

        stillUnmapped.push(unmapped);
      }

      unmappedCampaigns.length = 0;
      unmappedCampaigns.push(...stillUnmapped);
      console.log(`[auto-discover] After Meta API fallback: ${unmappedCampaigns.length} still unmapped`);
    }

    // ━━━ Step 6: Save to Supabase ━━━
    const existingProfiles = await getProductProfiles(storeId!);

    // Clean up stale profiles from ad accounts no longer mapped to this store
    for (const profile of existingProfiles) {
      if (profile.adAccountId && !activeAdAccountIds.has(profile.adAccountId)) {
        console.log(`[auto-discover] Removing stale profile "${profile.productName}" (ad account ${profile.adAccountId} no longer in store)`);
        await deleteAllCampaignLinksForProfile(profile.id);
        await deleteProductProfile(profile.id);
      }
    }

    // Re-fetch after cleanup
    const cleanProfiles = await getProductProfiles(storeId!);
    const existingByShopifyId = new Map(
      cleanProfiles.filter((p) => p.shopifyProductId).map((p) => [p.shopifyProductId!, p]),
    );
    // Also dedup by product name as safety net
    const existingByName = new Map(
      cleanProfiles.map((p) => [p.productName.toLowerCase().trim(), p]),
    );

    const savedProfiles: Array<
      Awaited<ReturnType<typeof getProductProfiles>>[0] & { campaignLinks: unknown[] }
    > = [];

    for (const [, match] of matchesByHandle) {
      const shopifyId = String(match.shopifyProduct.id);
      const existingProfile = existingByShopifyId.get(shopifyId)
        || existingByName.get(match.shopifyProduct.title.toLowerCase().trim());

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
          destinationUrl: match.campaigns[0]?.destinationUrl || existingProfile.destinationUrl,
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

      // Clear existing campaign links before re-creating (clean resync)
      await deleteAllCampaignLinksForProfile(profileId);

      // Save campaign links
      const campaignLinks: ProductCampaignLink[] = [];
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
