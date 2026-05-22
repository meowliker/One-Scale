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
import type { ProductCampaignLink } from '@/types/creativeHub';

// ─── Types ───────────────────────────────────────────────────────────

interface ShopifyProduct {
  id: number | string;
  title: string;
  handle: string;
  image?: { src: string } | null;
  images?: Array<{ src: string }>;
}

interface CampaignMeta {
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  pageId?: string;
  pageName?: string;
  pixelId?: string;
  pixelName?: string;
  instagramActorId?: string;
  instagramUsername?: string;
  destinationUrl?: string;
}

interface UnmappedCampaign {
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  destinationUrls: string[];
}

interface ShopifyProductsResult {
  products: ShopifyProduct[];
  error?: string;
  status?: number;
}

const DEFAULT_UTM_TEMPLATE =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';

// ─── Helpers ─────────────────────────────────────────────────────────

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
    const startTime = Date.now();

    // ━━━ Step 1: Get store + ad accounts ━━━
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
        { error: `No active Meta ad accounts found.` },
        { status: 400 },
      );
    }

    const activeAdAccountIds = new Set(adAccounts.map((a) => a.ad_account_id));
    const accountLookup = new Map(adAccounts.map((a) => [a.ad_account_id, a]));

    // ━━━ Step 2: Get per-store snapshot table ━━━
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
      console.warn('[auto-discover] Could not get per-store table:', e);
    }

    if (!snapshotTable) {
      return NextResponse.json({ error: 'Per-store snapshot table not found' }, { status: 500 });
    }

    console.log(`[auto-discover] Using snapshot table: ${snapshotTable}`);

    interface SnapshotRow { scope_id: string; payload_json: string; }

    // ━━━ Step 3: Read ALL data from snapshot (ZERO Meta API calls) ━━━

    // 3a: Read campaigns → get campaign names + status
    const campaignSnapshots = await rest<SnapshotRow[]>(
      `/${snapshotTable}?endpoint=eq.campaigns&variant_key=eq.latest&select=scope_id,payload_json&order=updated_at.desc`,
    );

    interface RawCampaign {
      id: string;
      name: string;
      status?: string;
      policyInfo?: { effectiveStatus?: string; configuredStatus?: string };
      effective_status?: string;
      ad_account_id?: string;
      adAccountId?: string;
      dailyBudget?: number;
      bidStrategy?: string;
      buying_type?: string;
    }

    const allCampaigns: Array<{ id: string; name: string; adAccountId: string }> = [];
    const seenCampaignIds = new Set<string>();
    const campaignNameMap = new Map<string, string>(); // campaignId → name
    const campaignMetaInfoMap = new Map<string, { dailyBudget?: number; lifetimeBudget?: number | null; bidStrategy?: string; buyingType?: string }>(); // campaignId → budget/bid info

    for (const snap of campaignSnapshots) {
      try {
        const campaigns: RawCampaign[] = JSON.parse(snap.payload_json);
        // Extract ad account from scope_id if campaigns don't have it individually
        // scope_id format: "accounts:act_123,act_456" or just "act_123"
        const scopeAccounts = snap.scope_id?.startsWith('accounts:')
          ? snap.scope_id.replace('accounts:', '').split(',').map((a: string) => a.trim())
          : snap.scope_id ? [snap.scope_id] : [];
        const defaultAdAccountId = scopeAccounts.find((a: string) => activeAdAccountIds.has(a)) || scopeAccounts[0] || '';

        for (const c of campaigns) {
          if (!c.id || !c.name) continue;
          const adAccountId = c.ad_account_id || c.adAccountId || defaultAdAccountId;
          // If we know the store's accounts and this campaign's account isn't in them, skip
          if (adAccountId && activeAdAccountIds.size > 0 && !activeAdAccountIds.has(adAccountId)) continue;

          campaignNameMap.set(c.id, c.name);
          // Store campaign budget/bid metadata for CBO/ABO detection
          campaignMetaInfoMap.set(c.id, {
            dailyBudget: c.dailyBudget,
            bidStrategy: c.bidStrategy,
            buyingType: c.buying_type,
          });

          if (seenCampaignIds.has(c.id)) continue;
          // Only ACTIVE campaigns
          const effectiveStatus = c.policyInfo?.effectiveStatus || c.effective_status || c.status || '';
          if (effectiveStatus !== 'ACTIVE') continue;

          seenCampaignIds.add(c.id);
          allCampaigns.push({ id: c.id, name: c.name, adAccountId });
        }
      } catch { /* skip malformed */ }
    }

    console.log(`[auto-discover] Found ${allCampaigns.length} ACTIVE campaigns`);

    // 3b: Read ads → get destination URLs + page_id + pixel + IG per campaign
    const adsSnapshots = await rest<SnapshotRow[]>(
      `/${snapshotTable}?endpoint=eq.ads&variant_key=eq.latest&select=payload_json`,
    );

    interface RawAd {
      id: string;
      campaign_id?: string;
      campaignId?: string;
      ad_account_id?: string;
      page_id?: string;
      page_name?: string;
      instagram_user_id?: string;
      instagram_username?: string;
      creative?: {
        destinationUrl?: string;
        link_url?: string;
      };
      policyInfo?: { effectiveStatus?: string };
    }

    const campaignMetaMap = new Map<string, CampaignMeta>();
    const pageNameMap = new Map<string, string>();
    const pixelNameMap = new Map<string, string>();
    const igUsernameMap = new Map<string, string>();

    for (const snap of adsSnapshots) {
      try {
        const ads: RawAd[] = JSON.parse(snap.payload_json);
        // Extract default ad account from scope_id (same approach as campaigns)
        const adsScopeAccounts = snap.scope_id?.startsWith('accounts:')
          ? snap.scope_id.replace('accounts:', '').split(',').map((a: string) => a.trim())
          : snap.scope_id?.startsWith('act_') ? [snap.scope_id] : [];
        const adsDefaultAccount = adsScopeAccounts.find((a: string) => activeAdAccountIds.has(a)) || adsScopeAccounts[0] || '';

        for (const ad of ads) {
          const campId = ad.campaign_id || ad.campaignId;
          const adAccountId = ad.ad_account_id || adsDefaultAccount;
          if (!campId) continue;
          // Skip if we know the account and it's not in the store's active accounts
          if (adAccountId && activeAdAccountIds.size > 0 && !activeAdAccountIds.has(adAccountId)) continue;

          // Collect page/IG names from ads
          if (ad.page_id && ad.page_name) pageNameMap.set(ad.page_id, ad.page_name);
          if (ad.instagram_user_id && ad.instagram_username) igUsernameMap.set(ad.instagram_user_id, ad.instagram_username);

          // Get URL — skip if we already have one for this campaign
          if (campaignMetaMap.has(campId)) continue;

          const url = ad.creative?.destinationUrl || ad.creative?.link_url || '';
          const campName = campaignNameMap.get(campId) || '';

          campaignMetaMap.set(campId, {
            campaignId: campId,
            campaignName: campName,
            adAccountId,
            destinationUrl: url || undefined,
            pageId: ad.page_id,
            pageName: ad.page_name,
            instagramActorId: ad.instagram_user_id,
            instagramUsername: ad.instagram_username,
          });
        }
      } catch { /* skip malformed */ }
    }

    // 3c: Read accounts → get BM info
    const accountBmMap = new Map<string, { bmId: string; bmName: string }>();
    try {
      const accountSnapshots = await rest<SnapshotRow[]>(
        `/${snapshotTable}?endpoint=eq.accounts&select=payload_json&limit=1`,
      );
      for (const snap of accountSnapshots) {
        const accounts = JSON.parse(snap.payload_json) as Array<{
          id: string; name: string; business?: { id: string; name: string }; account_status?: number;
        }>;
        for (const acct of accounts) {
          if (acct.business) {
            accountBmMap.set(acct.id, { bmId: acct.business.id, bmName: acct.business.name });
          }
        }
      }
    } catch { /* skip */ }

    // 3d: Pre-populate names from campaign-setup/options API (fast, cached)
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
          if (acct.businessId && !accountBmMap.has(acct.id)) {
            accountBmMap.set(acct.id, { bmId: acct.businessId, bmName: acct.businessName || acct.businessId });
          }
        }
      }
    } catch { /* skip */ }

    console.log(`[auto-discover] Snapshot data: ${campaignMetaMap.size} campaigns with ad data, ${pageNameMap.size} pages, ${pixelNameMap.size} pixels, ${accountBmMap.size} BMs (${Date.now() - startTime}ms)`);

    // Get Meta token for API resolution
    const metaTokenObj = await getMetaToken(storeId!);
    const metaToken = metaTokenObj?.accessToken;

    // ━━━ Step 3e: Meta API resolution for page/pixel/IG/BM names ━━━
    // Collect unique IDs that need resolution
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

    if (metaToken) {
      // Resolve page names: me/accounts → direct lookup → promote_pages
      try {
        const allPages = await fetchFromMeta<{ data: Array<{ id: string; name: string }> }>(
          metaToken, 'me/accounts', { fields: 'id,name', limit: '200' }, 8000, 0,
        );
        for (const p of allPages.data || []) {
          if (p.id && p.name) pageNameMap.set(p.id, p.name);
        }
      } catch { /* skip */ }

      const unresolvedPageIds = Array.from(uniquePageIds).filter(id => !pageNameMap.has(id));
      if (unresolvedPageIds.length > 0) {
        console.log(`[auto-discover] Attempting direct lookup for ${unresolvedPageIds.length} unresolved page IDs: ${unresolvedPageIds.join(', ')}`);
      }
      await batchProcess(unresolvedPageIds, 10, async (pageId) => {
        try {
          const page = await fetchFromMeta<{ id: string; name: string }>(
            metaToken, pageId, { fields: 'id,name' }, 5000, 0,
          );
          if (page.name) pageNameMap.set(pageId, page.name);
        } catch {
          // Try promote_pages fallback
          for (const acct of adAccounts) {
            try {
              const promoted = await fetchFromMeta<{ data: Array<{ id: string; name: string }> }>(
                metaToken, `${acct.ad_account_id}/promote_pages`, { fields: 'id,name', limit: '100' }, 5000, 0,
              );
              for (const p of promoted.data || []) {
                if (p.id === pageId && p.name) { pageNameMap.set(pageId, p.name); return; }
              }
            } catch { /* skip */ }
          }
        }
      });

      // Resolve IG usernames
      const unresolvedIgIds = Array.from(uniqueIgIds).filter(id => !igUsernameMap.has(id));
      await batchProcess(unresolvedIgIds, 10, async (igId) => {
        try {
          const ig = await fetchFromMeta<{ id: string; username: string }>(metaToken, igId, { fields: 'id,username' }, 5000, 0);
          if (ig.username) igUsernameMap.set(igId, ig.username);
        } catch { /* skip */ }
      });

      // Resolve pixel names + BM info per ad account
      await batchProcess(Array.from(uniqueAdAccountIds), 10, async (acctId) => {
        try {
          const pixelRes = await fetchFromMeta<{ data: Array<{ id: string; name: string }> }>(
            metaToken, `${acctId}/adspixels`, { fields: 'id,name' }, 8000, 0,
          );
          for (const px of pixelRes.data || []) { pixelNameMap.set(px.id, px.name); }
        } catch { /* skip */ }
        if (!accountBmMap.has(acctId)) {
          try {
            const acctRes = await fetchFromMeta<{ business?: { id: string; name: string } }>(
              metaToken, acctId, { fields: 'business{id,name}' }, 8000, 0,
            );
            if (acctRes.business) accountBmMap.set(acctId, { bmId: acctRes.business.id, bmName: acctRes.business.name });
          } catch { /* skip */ }
        }
      });

      // Direct pixel ID lookup for any still unresolved
      for (const pixelId of uniquePixelIds) {
        if (!pixelNameMap.has(pixelId)) {
          try {
            const px = await fetchFromMeta<{ id: string; name: string }>(metaToken, pixelId, { fields: 'id,name' }, 5000, 0);
            if (px.name) pixelNameMap.set(pixelId, px.name);
          } catch { /* skip */ }
        }
      }

      // Log unresolved
      const stillUnresolvedPages = Array.from(uniquePageIds).filter(id => !pageNameMap.has(id));
      const stillUnresolvedIgs = Array.from(uniqueIgIds).filter(id => !igUsernameMap.has(id));
      if (stillUnresolvedPages.length > 0) console.warn(`[auto-discover] Unresolved page IDs: ${stillUnresolvedPages.join(', ')}`);
      if (stillUnresolvedIgs.length > 0) console.warn(`[auto-discover] Unresolved IG IDs: ${stillUnresolvedIgs.join(', ')}`);
    }

    console.log(`[auto-discover] Name resolution: ${pageNameMap.size}/${uniquePageIds.size} pages, ${igUsernameMap.size}/${uniqueIgIds.size} IG, ${pixelNameMap.size}/${uniquePixelIds.size} pixels, ${accountBmMap.size}/${uniqueAdAccountIds.size} BM`);

    // ━━━ Step 4: Match URLs to Shopify products ━━━
    const shopifyResult = await getShopifyProducts(storeId!, request);
    const shopifyProducts = shopifyResult.products;
    const handleMap = new Map<string, ShopifyProduct>();
    for (const product of shopifyProducts) {
      if (product.handle) handleMap.set(product.handle.toLowerCase(), product);
    }

    const matchesByHandle = new Map<string, { shopifyProduct: ShopifyProduct; campaigns: CampaignMeta[] }>();
    const unmappedCampaigns: UnmappedCampaign[] = [];
    const mappedCampaignIds = new Set<string>();
    const campaignUrlProducts = allCampaigns
      .map((campaign) => {
        const destinationUrl = campaignMetaMap.get(campaign.id)?.destinationUrl || '';
        return destinationUrl
          ? {
              campaignId: campaign.id,
              campaignName: campaign.name,
              destinationUrl,
              handle: extractProductHandle(destinationUrl),
            }
          : null;
      })
      .filter((item): item is { campaignId: string; campaignName: string; destinationUrl: string; handle: string | null } => item !== null);
    const campaignsWithDestinationUrls = allCampaigns.filter((campaign) => {
      const meta = campaignMetaMap.get(campaign.id);
      return Boolean(meta?.destinationUrl);
    }).length;
    let urlMatchedCampaigns = 0;
    let metaApiMatchedCampaigns = 0;
    let nameMatchedCampaigns = 0;
    let accountMatchedCampaigns = 0;

    for (const campaign of allCampaigns) {
      const meta = campaignMetaMap.get(campaign.id);
      const url = meta?.destinationUrl || '';

      if (url) {
        const handle = extractProductHandle(url);
        if (handle && handleMap.has(handle)) {
          const fullMeta: CampaignMeta = {
            campaignId: campaign.id,
            campaignName: campaign.name,
            adAccountId: campaign.adAccountId,
            destinationUrl: url,
            pageId: meta?.pageId,
            pageName: meta?.pageName,
            pixelId: meta?.pixelId,
            pixelName: meta?.pixelName,
            instagramActorId: meta?.instagramActorId,
            instagramUsername: meta?.instagramUsername,
          };
          const existing = matchesByHandle.get(handle);
          if (existing) {
            existing.campaigns.push(fullMeta);
          } else {
            matchesByHandle.set(handle, { shopifyProduct: handleMap.get(handle)!, campaigns: [fullMeta] });
          }
          mappedCampaignIds.add(campaign.id);
          urlMatchedCampaigns += 1;
          continue;
        }
      }

      // No URL or URL didn't match any product
      unmappedCampaigns.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        adAccountId: campaign.adAccountId,
        destinationUrls: url ? [url] : [],
      });
    }

    console.log(`[auto-discover] URL matching: ${mappedCampaignIds.size} mapped, ${unmappedCampaigns.length} unmapped (${Date.now() - startTime}ms)`);

    // ━━━ Step 4b: Meta API fallback for unmapped campaigns (only if needed) ━━━
    if (unmappedCampaigns.length > 0 && metaToken) {
      {
        console.log(`[auto-discover] Trying Meta API fallback for ${unmappedCampaigns.length} unmapped campaigns`);
        const stillUnmapped: UnmappedCampaign[] = [];

        for (const unmapped of unmappedCampaigns) {
          try {
            const adsResponse = await fetchFromMeta<{
              data: Array<{
                id: string;
                creative?: { id?: string; effective_object_story_id?: string };
              }>;
            }>(
              metaToken,
              `${unmapped.campaignId}/ads`,
              { fields: 'id,creative{id,effective_object_story_id}', limit: '1' },
              8000, 0,
            );

            let url = '';
            for (const ad of adsResponse?.data ?? []) {
              if (!ad.creative?.id) continue;
              try {
                const creative = await fetchFromMeta<{
                  object_story_spec?: {
                    link_data?: { link?: string };
                    video_data?: { call_to_action?: { value?: { link?: string } } };
                  };
                  asset_feed_spec?: { link_urls?: Array<{ website_url?: string }> };
                }>(metaToken, ad.creative.id, { fields: 'object_story_spec,asset_feed_spec' }, 8000, 0);

                url =
                  creative?.object_story_spec?.link_data?.link ||
                  creative?.object_story_spec?.video_data?.call_to_action?.value?.link ||
                  creative?.asset_feed_spec?.link_urls?.[0]?.website_url || '';

                if (url) break;

                // Try existing post
                if (!url && ad.creative.effective_object_story_id) {
                  try {
                    const post = await fetchFromMeta<{ link?: string }>(
                      metaToken, ad.creative.effective_object_story_id,
                      { fields: 'link' }, 5000, 0,
                    );
                    url = post?.link || '';
                    if (url) break;
                  } catch { /* pages_read_engagement permission may be missing */ }
                }
              } catch { /* skip */ }
            }

            if (url) {
              const handle = extractProductHandle(url);
              if (handle && handleMap.has(handle)) {
                const meta: CampaignMeta = {
                  campaignId: unmapped.campaignId,
                  campaignName: unmapped.campaignName,
                  adAccountId: unmapped.adAccountId,
                  destinationUrl: url,
                };
                const existing = matchesByHandle.get(handle);
                if (existing) existing.campaigns.push(meta);
                else matchesByHandle.set(handle, { shopifyProduct: handleMap.get(handle)!, campaigns: [meta] });
                mappedCampaignIds.add(unmapped.campaignId);
                metaApiMatchedCampaigns += 1;
                console.log(`[auto-discover] Meta API matched "${unmapped.campaignName}" → ${handle}`);
                continue;
              }
            }
          } catch { /* skip */ }

          stillUnmapped.push(unmapped);
        }

        unmappedCampaigns.length = 0;
        unmappedCampaigns.push(...stillUnmapped);
        console.log(`[auto-discover] After Meta API fallback: ${unmappedCampaigns.length} still unmapped`);
      }
    }

    // ━━━ Step 4c: Name-based matching for remaining unmapped (60% confidence threshold) ━━━
    if (unmappedCampaigns.length > 0) {
      const nameStillUnmapped: UnmappedCampaign[] = [];

      for (const unmapped of unmappedCampaigns) {
        if (mappedCampaignIds.has(unmapped.campaignId)) continue;

        const campNameNorm = unmapped.campaignName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const campWords = new Set(campNameNorm.split(' ').filter((w) => w.length >= 3));

        let bestHandle: string | null = null;
        let bestRatio = 0;
        let bestMatchedWords = 0;

        for (const product of shopifyProducts) {
          if (!product.handle) continue;
          const handle = product.handle.toLowerCase();
          const handleWords = handle.replace(/-/g, ' ').split(' ').filter((w) => w.length >= 3);
          if (handleWords.length === 0) continue;

          // Count how many handle words appear in the campaign name
          let matched = 0;
          for (const hw of handleWords) {
            if (campWords.has(hw)) matched++;
          }
          if (matched === 0) continue;

          // Confidence = matched handle words / total handle words
          const ratio = matched / handleWords.length;

          // Pick best match by ratio, then by absolute matches
          if (ratio > bestRatio || (ratio === bestRatio && matched > bestMatchedWords)) {
            bestRatio = ratio;
            bestMatchedWords = matched;
            bestHandle = handle;
          }
        }

        // 60% threshold: at least 60% of handle words must match
        if (bestHandle && bestRatio >= 0.6 && handleMap.has(bestHandle)) {
          const meta: CampaignMeta = {
            campaignId: unmapped.campaignId,
            campaignName: unmapped.campaignName,
            adAccountId: unmapped.adAccountId,
          };
          const existing = matchesByHandle.get(bestHandle);
          if (existing) existing.campaigns.push(meta);
          else matchesByHandle.set(bestHandle, { shopifyProduct: handleMap.get(bestHandle)!, campaigns: [meta] });
          mappedCampaignIds.add(unmapped.campaignId);
          nameMatchedCampaigns += 1;
          console.log(`[auto-discover] Name match: "${unmapped.campaignName}" → ${bestHandle} (${(bestRatio * 100).toFixed(0)}% confidence, ${bestMatchedWords} words)`);
        } else {
          if (bestHandle) {
            console.log(`[auto-discover] Below threshold: "${unmapped.campaignName}" → ${bestHandle} (${(bestRatio * 100).toFixed(0)}% < 60%) → unmapped`);
          }
          nameStillUnmapped.push(unmapped);
        }
      }

      unmappedCampaigns.length = 0;
      unmappedCampaigns.push(...nameStillUnmapped);
      console.log(`[auto-discover] After name matching: ${unmappedCampaigns.length} still unmapped`);
    }

    // ━━━ Step 4d: Account-based fallback — if other campaigns from same account are mapped, map this one too ━━━
    if (unmappedCampaigns.length > 0) {
      // Build map: adAccountId → product handle (from already-matched campaigns)
      const accountToHandle = new Map<string, string>();
      for (const [handle, match] of matchesByHandle) {
        for (const camp of match.campaigns) {
          // Only set if all campaigns from this account go to the same product
          const existing = accountToHandle.get(camp.adAccountId);
          if (!existing) {
            accountToHandle.set(camp.adAccountId, handle);
          } else if (existing !== handle) {
            // This account maps to multiple products — can't use as fallback
            accountToHandle.set(camp.adAccountId, '__mixed__');
          }
        }
      }

      const accountStillUnmapped: UnmappedCampaign[] = [];
      for (const unmapped of unmappedCampaigns) {
        const handle = accountToHandle.get(unmapped.adAccountId);
        if (handle && handle !== '__mixed__' && handleMap.has(handle)) {
          // Check campaign name has at least 1 word overlap with the product
          const campWords = new Set(unmapped.campaignName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3));
          const handleWords = handle.replace(/-/g, ' ').split(' ').filter(w => w.length >= 3);
          const hasOverlap = handleWords.some(hw => campWords.has(hw));

          if (hasOverlap) {
            const meta: CampaignMeta = {
              campaignId: unmapped.campaignId,
              campaignName: unmapped.campaignName,
              adAccountId: unmapped.adAccountId,
            };
            const existing = matchesByHandle.get(handle);
            if (existing) existing.campaigns.push(meta);
            mappedCampaignIds.add(unmapped.campaignId);
            accountMatchedCampaigns += 1;
            console.log(`[auto-discover] Account-based match: "${unmapped.campaignName}" → ${handle} (same account + keyword overlap)`);
            continue;
          }
        }
        accountStillUnmapped.push(unmapped);
      }

      unmappedCampaigns.length = 0;
      unmappedCampaigns.push(...accountStillUnmapped);
      if (accountStillUnmapped.length < unmappedCampaigns.length) {
        console.log(`[auto-discover] After account-based matching: ${unmappedCampaigns.length} still unmapped`);
      }
    }

    // ━━━ Step 5: Save to Supabase ━━━
    const existingProfiles = await getProductProfiles(storeId!);

    // Build set of Shopify IDs that were matched in THIS run
    const matchedShopifyIds = new Set(
      Array.from(matchesByHandle.values()).map(m => String(m.shopifyProduct.id))
    );
    const matchedProductNames = new Set(
      Array.from(matchesByHandle.values()).map(m => m.shopifyProduct.title.toLowerCase().trim())
    );

    // Clean up profiles not matched in this run:
    // If a profile has zero matched campaigns, delete it entirely.
    // Only profiles with campaigns should exist in the system.
    for (const profile of existingProfiles) {
      const isMatched =
        (profile.shopifyProductId && matchedShopifyIds.has(profile.shopifyProductId)) ||
        matchedProductNames.has(profile.productName.toLowerCase().trim());

      if (!isMatched) {
        console.log(`[auto-discover] Removing unmatched profile "${profile.productName}" (no campaigns found)`);
        await deleteAllCampaignLinksForProfile(profile.id);
        await deleteProductProfile(profile.id);
      }
    }

    const cleanProfiles = await getProductProfiles(storeId!);
    const existingByShopifyId = new Map(
      cleanProfiles.filter((p) => p.shopifyProductId).map((p) => [p.shopifyProductId!, p]),
    );
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

      const profilePageId = mostCommon(match.campaigns.map((c) => c.pageId));
      const profilePixelId = mostCommon(match.campaigns.map((c) => c.pixelId));
      const profileIgId = mostCommon(match.campaigns.map((c) => c.instagramActorId));
      const profileAdAccountId = mostCommon(match.campaigns.map((c) => c.adAccountId)) || match.campaigns[0].adAccountId;
      const account = accountLookup.get(profileAdAccountId);

      const profilePageName = profilePageId ? (pageNameMap.get(profilePageId) || match.campaigns.find(c => c.pageName)?.pageName) : undefined;
      const profilePixelName = profilePixelId ? (pixelNameMap.get(profilePixelId) || match.campaigns.find(c => c.pixelName)?.pixelName) : undefined;
      const profileIgUsername = profileIgId ? (igUsernameMap.get(profileIgId) || match.campaigns.find(c => c.instagramUsername)?.instagramUsername) : undefined;

      let profileId: string;

      if (existingProfile) {
        profileId = existingProfile.id;
        await upsertProductProfile({
          ...existingProfile,
          id: profileId,
          storeId: storeId!,
          shopifyProductId: shopifyId,
          productName: existingProfile.productName,
          productImage: match.shopifyProduct.image?.src ?? match.shopifyProduct.images?.[0]?.src ?? existingProfile.productImage,
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
        const productImage = match.shopifyProduct.image?.src ?? match.shopifyProduct.images?.[0]?.src;
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

      // Clear auto-discovered links but preserve manually mapped ones
      // Manual mappings have campaign_type = 'manual'
      await deleteAllCampaignLinksForProfile(profileId, 'testing');

      const campaignLinks: ProductCampaignLink[] = [];
      for (const camp of match.campaigns) {
        const linkId = randomUUID();
        const linkBm = accountBmMap.get(camp.adAccountId);
        const campMeta = campaignMetaInfoMap.get(camp.campaignId);
        // dailyBudget from snapshot is in cents (e.g. 50000 = $500), convert to dollars
        const dailyBudgetDollars = campMeta?.dailyBudget ? campMeta.dailyBudget / 100 : undefined;

        await upsertProductCampaignLink({
          id: linkId,
          productProfileId: profileId,
          campaignId: camp.campaignId,
          campaignName: camp.campaignName,
          campaignType: 'testing',
          adAccountId: camp.adAccountId,
          isActive: true,
          pageId: camp.pageId,
          pageName: camp.pageName || (camp.pageId ? pageNameMap.get(camp.pageId) : undefined),
          pixelId: camp.pixelId,
          pixelName: camp.pixelName || (camp.pixelId ? pixelNameMap.get(camp.pixelId) : undefined),
          instagramActorId: camp.instagramActorId,
          instagramUsername: camp.instagramUsername || (camp.instagramActorId ? igUsernameMap.get(camp.instagramActorId) : undefined),
          bmId: linkBm?.bmId,
          bmName: linkBm?.bmName,
          campaignDailyBudget: dailyBudgetDollars,
          campaignBidStrategy: campMeta?.bidStrategy,
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
          pageName: camp.pageName || (camp.pageId ? pageNameMap.get(camp.pageId) : undefined),
          pixelId: camp.pixelId,
          pixelName: camp.pixelName || (camp.pixelId ? pixelNameMap.get(camp.pixelId) : undefined),
          instagramActorId: camp.instagramActorId,
          instagramUsername: camp.instagramUsername || (camp.instagramActorId ? igUsernameMap.get(camp.instagramActorId) : undefined),
          bmId: linkBm?.bmId,
          bmName: linkBm?.bmName,
          campaignDailyBudget: dailyBudgetDollars,
          campaignBidStrategy: campMeta?.bidStrategy,
        });
      }

      savedProfiles.push({
        ...existingProfile,
        id: profileId,
        storeId: storeId!,
        shopifyProductId: shopifyId,
        productName: existingProfile?.productName ?? match.shopifyProduct.title,
        productImage: match.shopifyProduct.image?.src ?? match.shopifyProduct.images?.[0]?.src ?? existingProfile?.productImage,
        adAccountId: profileAdAccountId,
        adAccountCurrency: account?.currency ?? existingProfile?.adAccountCurrency ?? 'USD',
        destinationUrl: match.campaigns[0]?.destinationUrl || existingProfile?.destinationUrl,
        pageId: profilePageId || existingProfile?.pageId,
        pageName: profilePageName || existingProfile?.pageName,
        pixelId: profilePixelId || existingProfile?.pixelId,
        pixelName: profilePixelName || existingProfile?.pixelName,
        instagramActorId: profileIgId || existingProfile?.instagramActorId,
        instagramUsername: profileIgUsername || existingProfile?.instagramUsername,
        conversionEvent: existingProfile?.conversionEvent ?? 'PURCHASE',
        defaultBudget: existingProfile?.defaultBudget ?? 20,
        defaultDuration: existingProfile?.defaultDuration ?? 3,
        defaultBidStrategy: existingProfile?.defaultBidStrategy ?? 'LOWEST_COST_WITHOUT_CAP',
        defaultStructure: existingProfile?.defaultStructure ?? 'ABO' as const,
        defaultLaunchStatus: existingProfile?.defaultLaunchStatus ?? 'ACTIVE' as const,
        clickupListId: existingProfile?.clickupListId,
        clickupListName: existingProfile?.clickupListName,
        clickupSyncInterval: existingProfile?.clickupSyncInterval ?? 30,
        aiMinImpressions: existingProfile?.aiMinImpressions ?? 500,
        aiMinHours: existingProfile?.aiMinHours ?? 24,
        aiEvalFrequency: existingProfile?.aiEvalFrequency ?? 'every_6h',
        createdAt: existingProfile?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        campaignLinks,
      });
    }

    // Note: Only products with active campaigns are shown. No inactive profiles created.

    const diagnostics: string[] = [];
    if (shopifyProducts.length === 0) {
      diagnostics.push(
        shopifyResult.error
          ? `Shopify products could not be fetched: ${shopifyResult.error}`
          : 'No Shopify products were returned for this store.',
      );
    }
    if (allCampaigns.length === 0) {
      diagnostics.push('No active Meta campaigns were found in the latest snapshots.');
    } else if (campaignsWithDestinationUrls === 0 && savedProfiles.length === 0) {
      diagnostics.push('Active Meta campaigns were found, but none had a destination product URL in the snapshots.');
    } else if (savedProfiles.length === 0 && shopifyProducts.length > 0) {
      diagnostics.push('Shopify products were fetched, but their handles did not match active campaign destination URLs or campaign names.');
    }

    console.log(`[auto-discover] Complete: ${savedProfiles.length} active products, ${unmappedCampaigns.length} unmapped, ${Date.now() - startTime}ms total`);

    return NextResponse.json({
      profiles: savedProfiles,
      unmappedCampaigns,
      stats: {
        totalCampaigns: allCampaigns.length,
        campaignsWithAdData: campaignMetaMap.size,
        campaignsWithDestinationUrls,
        shopifyProducts: shopifyProducts.length,
        shopifyFetchStatus: shopifyResult.status,
        urlMatchedCampaigns,
        metaApiMatchedCampaigns,
        nameMatchedCampaigns,
        accountMatchedCampaigns,
        matchedProducts: savedProfiles.length,
        unmappedCount: unmappedCampaigns.length,
        source: 'supabase_snapshots',
        diagnostics,
        shopifyProductSamples: shopifyProducts.slice(0, 20).map((product) => ({
          title: product.title,
          handle: product.handle,
        })),
        campaignUrlProducts,
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
): Promise<ShopifyProductsResult> {
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
      return {
        products: products.map((p: Record<string, unknown>) => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          image: (p.images as Array<{ src: string }> | undefined)?.[0] ?? null,
          images: p.images,
        })),
        status: res.status,
      };
    }
    const data = await res.json().catch(() => null) as { error?: string } | null;
    return {
      products: [],
      status: res.status,
      error: data?.error || `Shopify products endpoint returned ${res.status}`,
    };
  } catch (err) {
    console.warn('[auto-discover] Shopify API fetch failed:', err);
    return {
      products: [],
      error: err instanceof Error ? err.message : 'Shopify API fetch failed',
    };
  }
}
