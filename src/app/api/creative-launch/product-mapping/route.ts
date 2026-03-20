import { NextRequest, NextResponse } from 'next/server';
import {
  getStoreAdAccounts,
  getStore,
  getProductLaunchProfile,
  upsertProductLaunchProfile,
  getLatestMetaEndpointSnapshot,
  getRecentMetaEndpointSnapshots,
} from '@/app/api/lib/db';
import {
  hydrateStoreFromSupabase,
  isSupabasePersistenceEnabled,
  listPersistentStoreAdAccounts,
} from '@/app/api/lib/supabase-persistence';
import {
  getLatestPersistentMetaEndpointSnapshot,
  getRecentPersistentMetaEndpointSnapshots,
} from '@/app/api/lib/supabase-tracking';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchShopifyProducts } from '@/app/api/lib/shopify-client';
import {
  extractAdUrlsFromSnapshot,
  extractProductHandle,
  normalizeHandle,
  normalizeUrl,
  type MetaAdUrl,
  type ProductMatch,
} from '@/app/api/lib/url-matcher';
import {
  resolveProductIdentity,
  type ShopifyCatalogProduct,
} from '@/app/api/lib/product-url-resolver';
import type {
  ProductInstagramOption,
  ProductMapping,
  ProductPageOption,
  ProductPixelOption,
} from '@/types/creativeLaunch';

interface InputProduct {
  id: string;
  name: string;
  image?: string;
  shopifyUrl?: string;
  landingUrl?: string;
  shopifyHandle?: string;
  productLinks?: string[];
}

interface ResolvedInputProduct extends InputProduct {
  resolvedShopifyUrl: string;
  resolvedHandle: string;
  needsUrlReview: boolean;
}

interface SnapshotResult<T> {
  scopeId: string;
  data: T[];
}

interface AccountOption {
  id: string;
  name: string;
}

const DEFAULT_UTM_TEMPLATE =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}';

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is string => typeof row === 'string')
      .map((row) => row.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeProductLinks(urls: string[]): string[] {
  const out = new Set<string>();
  for (const url of urls) {
    const cleaned = url.trim();
    if (!cleaned) continue;
    out.add(cleaned);
  }
  return [...out];
}

function normalizeAccountId(value: string): string {
  return value.replace(/^act_/, '').trim();
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const out = new Map<string, T>();
  for (const row of rows) {
    if (!row.id) continue;
    if (!out.has(row.id)) {
      out.set(row.id, row);
    }
  }
  return [...out.values()];
}

function mergeAccountIds(existing: string[] | undefined, next: string | undefined): string[] | undefined {
  if (!next) return existing;
  const merged = new Set([...(existing || []), next]);
  return merged.size > 0 ? [...merged] : undefined;
}

function belongsToAccount(optionAccountIds: string[] | undefined, adAccountId: string): boolean {
  if (!optionAccountIds || optionAccountIds.length === 0) return true;
  const normalizedTarget = normalizeAccountId(adAccountId);
  return optionAccountIds.some((row) => normalizeAccountId(row) === normalizedTarget);
}

function extractDestinationUrlFromCreative(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const creative = value as Record<string, unknown>;

  const direct =
    (typeof creative.destinationUrl === 'string' && creative.destinationUrl)
    || (typeof creative.object_url === 'string' && creative.object_url)
    || (typeof creative.link_url === 'string' && creative.link_url)
    || '';
  if (direct) return direct;

  const storySpec = (creative.object_story_spec && typeof creative.object_story_spec === 'object')
    ? (creative.object_story_spec as Record<string, unknown>)
    : null;
  if (!storySpec) return '';

  const linkData = (storySpec.link_data && typeof storySpec.link_data === 'object')
    ? (storySpec.link_data as Record<string, unknown>)
    : null;
  const videoData = (storySpec.video_data && typeof storySpec.video_data === 'object')
    ? (storySpec.video_data as Record<string, unknown>)
    : null;

  const linkFromLinkData = linkData && typeof linkData.link === 'string' ? linkData.link : '';
  if (linkFromLinkData) return linkFromLinkData;

  const callToAction = (videoData?.call_to_action && typeof videoData.call_to_action === 'object')
    ? (videoData.call_to_action as Record<string, unknown>)
    : null;
  const ctaValue = (callToAction?.value && typeof callToAction.value === 'object')
    ? (callToAction.value as Record<string, unknown>)
    : null;

  return ctaValue && typeof ctaValue.link === 'string' ? ctaValue.link : '';
}

function isStrictHandleMatch(handle: string, candidateUrl: string): boolean {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return false;
  const normalizedCandidate = normalizeUrl(candidateUrl);
  if (!normalizedCandidate) return false;
  return normalizedCandidate.endsWith(`/products/${normalizedHandle}`);
}

function dedupeMetaAdUrls(rows: MetaAdUrl[]): MetaAdUrl[] {
  const out = new Map<string, MetaAdUrl>();
  for (const row of rows) {
    const key = `${row.adId || 'na'}|${normalizeUrl(row.url)}|${row.campaignId}|${normalizeAccountId(row.adAccountId || '')}`;
    if (!out.has(key)) out.set(key, row);
  }
  return [...out.values()];
}

async function getRecentSnapshots<T>(
  storeId: string,
  endpoint: 'ads' | 'creatives' | 'adsets' | 'campaigns',
): Promise<Array<SnapshotResult<T>>> {
  const useSupabase = isSupabasePersistenceEnabled();
  if (useSupabase) {
    const rows = await getRecentPersistentMetaEndpointSnapshots<T[]>(storeId, endpoint, 180);
    return rows.map((row) => ({ scopeId: row.scopeId, data: toArray<T>(row.data) }));
  }
  const rows = getRecentMetaEndpointSnapshots<T[]>(storeId, endpoint, 180);
  return rows.map((row) => ({ scopeId: row.scopeId, data: toArray<T>(row.data) }));
}

async function getLatestSnapshot<T>(
  storeId: string,
  endpoint: 'pages' | 'pixels' | 'instagram' | 'accounts',
  scopeId: string,
): Promise<{ data: T[] } | null> {
  const useSupabase = isSupabasePersistenceEnabled();
  if (useSupabase) {
    const row = await getLatestPersistentMetaEndpointSnapshot<T[]>(storeId, endpoint, scopeId);
    if (!row) return null;
    return { data: toArray<T>(row.data) };
  }

  const row = getLatestMetaEndpointSnapshot<T[]>(storeId, endpoint, scopeId);
  if (!row) return null;
  return { data: toArray<T>(row.data) };
}

async function resolveProducts(params: {
  storeId: string;
  storeDomain: string;
  products: InputProduct[];
}): Promise<ResolvedInputProduct[]> {
  const { storeId, storeDomain, products } = params;

  const unresolved = products.filter((product) => {
    const explicitHandle = normalizeHandle(
      product.shopifyHandle || extractProductHandle(product.shopifyUrl || product.landingUrl || '') || '',
    );
    return !explicitHandle;
  });

  let catalog: ShopifyCatalogProduct[] = [];
  if (unresolved.length > 0) {
    try {
      const token = await getShopifyToken(storeId);
      if (token?.accessToken && token.shopDomain) {
        const rows = await fetchShopifyProducts(token.accessToken, token.shopDomain, { limit: 250 });
        catalog = rows
          .filter((row) => !!row.handle)
          .map((row) => ({
            id: row.id,
            title: row.title,
            handle: normalizeHandle(row.handle),
          }))
          .filter((row) => !!row.handle);
      }
    } catch {
      // Best effort only; manual links still work.
    }
  }

  const cleanStoreDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  return products.map((product) => {
    const primaryLink = normalizeProductLinks(Array.isArray(product.productLinks) ? product.productLinks : [])[0] || '';
    const identity = resolveProductIdentity(
      {
        ...product,
        shopifyUrl: product.shopifyUrl || primaryLink,
        landingUrl: product.landingUrl || primaryLink,
      },
      {
        storeDomain: cleanStoreDomain,
        catalog,
      },
    );

    return {
      ...product,
      resolvedShopifyUrl: identity.shopifyUrl,
      resolvedHandle: identity.handle,
      needsUrlReview: identity.needsUrlReview,
    };
  });
}

async function loadShopifyCatalog(storeId: string): Promise<ShopifyCatalogProduct[]> {
  try {
    const token = await getShopifyToken(storeId);
    if (!token?.accessToken || !token.shopDomain) return [];
    const rows = await fetchShopifyProducts(token.accessToken, token.shopDomain, { limit: 250 });
    return rows
      .filter((row) => !!row.handle)
      .map((row) => ({
        id: row.id,
        title: row.title,
        handle: normalizeHandle(row.handle),
      }))
      .filter((row) => !!row.handle);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, products, action } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const useSupabase = isSupabasePersistenceEnabled();
    if (useSupabase) {
      try {
        await hydrateStoreFromSupabase(storeId);
      } catch {
        // Hydration is best effort.
      }
    }

    if (action === 'save') {
      const { productId, mapping } = body;
      if (!productId || !mapping) {
        return NextResponse.json({ error: 'productId and mapping are required for save' }, { status: 400 });
      }

      upsertProductLaunchProfile(storeId, productId, {
        product_name: mapping.productName,
        ad_account_id: mapping.adAccountId,
        ad_account_name: mapping.adAccountName,
        page_id: mapping.pageId,
        page_name: mapping.pageName,
        instagram_id: mapping.instagramId,
        pixel_id: mapping.pixelId,
        pixel_name: mapping.pixelName,
        destination_url: mapping.destinationUrl,
        product_links: JSON.stringify(normalizeProductLinks(Array.isArray(mapping.productLinks) ? mapping.productLinks : [])),
        utm_template: mapping.utmTemplate,
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'save-links') {
      const { productId, productName, productLinks } = body;
      if (!productId) {
        return NextResponse.json({ error: 'productId is required for save-links' }, { status: 400 });
      }
      upsertProductLaunchProfile(storeId, productId, {
        product_name: productName || productId,
        product_links: JSON.stringify(normalizeProductLinks(Array.isArray(productLinks) ? productLinks : [])),
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'get-links') {
      const { productIds } = body as { productIds?: string[] };
      const ids = Array.isArray(productIds) ? productIds : [];
      const linksByProduct: Record<string, string[]> = {};
      for (const productId of ids) {
        const profile = getProductLaunchProfile(storeId, productId);
        linksByProduct[productId] = parseStringArray(profile?.product_links);
      }
      return NextResponse.json({ linksByProduct });
    }

    if (action === 'suggest-links') {
      const { productName } = body as { productName?: string };
      if (!productName || !productName.trim()) {
        return NextResponse.json({ links: [] });
      }
      const store = getStore(storeId);
      const storeDomain = (store?.domain || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
      const catalog = await loadShopifyCatalog(storeId);
      const suggestions = catalog
        .filter(
          (row) =>
            row.title.toLowerCase().includes(productName.toLowerCase())
            || productName.toLowerCase().includes(row.title.toLowerCase()),
        )
        .slice(0, 5)
        .map((row) => (storeDomain ? `https://${storeDomain}/products/${row.handle}` : ''))
        .filter(Boolean);
      return NextResponse.json({ links: suggestions });
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: 'products array is required', mappings: [] }, { status: 200 });
    }

    const storeAccountsRaw = useSupabase
      ? await listPersistentStoreAdAccounts(storeId)
      : getStoreAdAccounts(storeId);

    const storeAccounts = storeAccountsRaw
      .filter((row) => (row.platform || 'meta') === 'meta' && !!row.is_active)
      .map((row) => ({
        id: row.ad_account_id,
        name: row.ad_account_name || row.ad_account_id,
      }));

    const normalizedAccountToCanonical = new Map<string, string>();
    const accountNameById = new Map<string, string>();
    for (const account of storeAccounts) {
      normalizedAccountToCanonical.set(normalizeAccountId(account.id), account.id);
      accountNameById.set(account.id, account.name);
    }

    const inputProducts = products as InputProduct[];
    const store = getStore(storeId);
    const storeDomain = (store?.domain || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');

    const resolvedProducts = await resolveProducts({
      storeId,
      storeDomain,
      products: inputProducts,
    });

    const savedProfilesByProduct = new Map<string, ReturnType<typeof getProductLaunchProfile>>();
    for (const product of resolvedProducts) {
      savedProfilesByProduct.set(product.id, getProductLaunchProfile(storeId, product.id));
    }

    const [adsSnapshots, creativesSnapshots, adsetsSnapshots, campaignsSnapshots] = await Promise.all([
      getRecentSnapshots<Record<string, unknown>>(storeId, 'ads'),
      getRecentSnapshots<Record<string, unknown>>(storeId, 'creatives'),
      getRecentSnapshots<Record<string, unknown>>(storeId, 'adsets'),
      getRecentSnapshots<Record<string, unknown>>(storeId, 'campaigns'),
    ]);

    const campaignToAccount = new Map<string, string>();
    for (const snapshot of campaignsSnapshots) {
      for (const row of snapshot.data) {
        const campaignId = typeof row.id === 'string'
          ? row.id
          : (typeof row.campaign_id === 'string' ? row.campaign_id : '');
        if (!campaignId) continue;
        const rawAccountId =
          (typeof row.ad_account_id === 'string' && row.ad_account_id)
          || (typeof row.adAccountId === 'string' && row.adAccountId)
          || (typeof row.account_id === 'string' && row.account_id)
          || (typeof row.accountId === 'string' && row.accountId)
          || '';
        const canonical = normalizedAccountToCanonical.get(normalizeAccountId(rawAccountId)) || rawAccountId;
        if (canonical) {
          campaignToAccount.set(campaignId, canonical);
        }
      }
    }

    const adSetToCampaign = new Map<string, string>();
    const adSetToAccount = new Map<string, string>();
    for (const snapshot of adsetsSnapshots) {
      for (const row of snapshot.data) {
        const adSetId = typeof row.id === 'string'
          ? row.id
          : (typeof row.adset_id === 'string' ? row.adset_id : '');
        if (!adSetId) continue;
        const campaignId =
          (typeof row.campaignId === 'string' && row.campaignId)
          || (typeof row.campaign_id === 'string' && row.campaign_id)
          || snapshot.scopeId;
        if (campaignId) {
          adSetToCampaign.set(adSetId, campaignId);
        }
        const rawAccountId =
          (typeof row.ad_account_id === 'string' && row.ad_account_id)
          || (typeof row.adAccountId === 'string' && row.adAccountId)
          || (campaignId ? campaignToAccount.get(campaignId) : '')
          || '';
        const canonical = normalizedAccountToCanonical.get(normalizeAccountId(rawAccountId)) || rawAccountId;
        if (canonical) {
          adSetToAccount.set(adSetId, canonical);
        }
      }
    }

    const allAdUrls: MetaAdUrl[] = [];

    for (const snapshot of adsSnapshots) {
      const extracted = extractAdUrlsFromSnapshot(snapshot.data, '');
      const snapshotAdSetId = snapshot.scopeId;
      for (const row of extracted) {
        const campaignId = row.campaignId || adSetToCampaign.get(snapshotAdSetId) || '';
        const rawAccountId =
          row.adAccountId
          || adSetToAccount.get(snapshotAdSetId)
          || (campaignId ? campaignToAccount.get(campaignId) : '')
          || '';
        const canonicalAccountId = normalizedAccountToCanonical.get(normalizeAccountId(rawAccountId)) || rawAccountId;
        allAdUrls.push({
          ...row,
          campaignId,
          adAccountId: canonicalAccountId,
        });
      }
    }

    for (const snapshot of creativesSnapshots) {
      for (const row of snapshot.data) {
        const creative = (row.creative && typeof row.creative === 'object')
          ? (row.creative as Record<string, unknown>)
          : null;

        const destinationUrl = extractDestinationUrlFromCreative(creative);
        if (!destinationUrl) continue;

        const rowAdSetId =
          (typeof row.adset_id === 'string' && row.adset_id)
          || (typeof row.adsetId === 'string' && row.adsetId)
          || snapshot.scopeId;
        const campaignId =
          (typeof row.campaignId === 'string' && row.campaignId)
          || (typeof row.campaign_id === 'string' && row.campaign_id)
          || adSetToCampaign.get(rowAdSetId)
          || '';
        const rawAccountId =
          (typeof row.adAccountId === 'string' && row.adAccountId)
          || (typeof row.ad_account_id === 'string' && row.ad_account_id)
          || adSetToAccount.get(rowAdSetId)
          || (campaignId ? campaignToAccount.get(campaignId) : '')
          || '';
        const canonicalAccountId = normalizedAccountToCanonical.get(normalizeAccountId(rawAccountId)) || rawAccountId;

        allAdUrls.push({
          campaignId,
          campaignName: (row.campaignName as string) || (row.campaign_name as string) || '',
          adAccountId: canonicalAccountId,
          adId: (row.id as string) || '',
          adName: (row.name as string) || '',
          url: destinationUrl,
        });
      }
    }

    const dedupedAdUrls = dedupeMetaAdUrls(allAdUrls);

    const pagesGlobalSnapshot = await getLatestSnapshot<Record<string, unknown>>(storeId, 'pages', '');
    const globalPixelsSnapshot = await getLatestSnapshot<Record<string, unknown>>(storeId, 'pixels', '');
    const globalInstagramSnapshot = await getLatestSnapshot<Record<string, unknown>>(storeId, 'instagram', '');

    const pageMap = new Map<string, ProductPageOption>();
    const instagramMap = new Map<string, ProductInstagramOption>();
    const pixelMap = new Map<string, ProductPixelOption>();

    const upsertPage = (row: Record<string, unknown>, accountId?: string) => {
      const id = typeof row.id === 'string' ? row.id : '';
      if (!id) return;
      const instagramId = typeof row.instagramId === 'string'
        ? row.instagramId
        : (typeof row.instagram_business_account_id === 'string' ? row.instagram_business_account_id : undefined);
      const instagramUsername = typeof row.instagramUsername === 'string'
        ? row.instagramUsername
        : (typeof row.instagram_username === 'string' ? row.instagram_username : undefined);

      const existing = pageMap.get(id);
      pageMap.set(id, {
        id,
        name: typeof row.name === 'string' ? row.name : existing?.name || id,
        instagramId: instagramId || existing?.instagramId,
        instagramUsername: instagramUsername || existing?.instagramUsername,
        adAccountIds: mergeAccountIds(existing?.adAccountIds, accountId),
      });
    };

    for (const row of toArray<Record<string, unknown>>(pagesGlobalSnapshot?.data)) {
      upsertPage(row);
    }

    const upsertInstagram = (row: Record<string, unknown>, accountId?: string) => {
      const id = typeof row.id === 'string' ? row.id : '';
      if (!id) return;
      const existing = instagramMap.get(id);
      const username = typeof row.username === 'string'
        ? row.username
        : (typeof row.name === 'string' ? row.name : existing?.username || '');
      const linkedPageId = typeof row.linkedPageId === 'string'
        ? row.linkedPageId
        : (typeof row.linked_page_id === 'string' ? row.linked_page_id : existing?.linkedPageId);

      instagramMap.set(id, {
        id,
        name: typeof row.name === 'string' ? row.name : (existing?.name || username || id),
        username: username || undefined,
        linkedPageId,
        adAccountIds: mergeAccountIds(existing?.adAccountIds, accountId),
      });
    };

    for (const row of toArray<Record<string, unknown>>(globalInstagramSnapshot?.data)) {
      upsertInstagram(row);
    }

    for (const account of storeAccounts) {
      const scopedPages = await getLatestSnapshot<Record<string, unknown>>(storeId, 'pages', account.id);
      for (const row of toArray<Record<string, unknown>>(scopedPages?.data)) {
        upsertPage(row, account.id);
      }

      const scopedInstagram = await getLatestSnapshot<Record<string, unknown>>(storeId, 'instagram', account.id);
      for (const row of toArray<Record<string, unknown>>(scopedInstagram?.data)) {
        upsertInstagram(row, account.id);
      }

      const scopedPixels = await getLatestSnapshot<Record<string, unknown>>(storeId, 'pixels', account.id);
      for (const row of toArray<Record<string, unknown>>(scopedPixels?.data)) {
        const id = typeof row.id === 'string' ? row.id : '';
        if (!id) continue;
        const key = `${account.id}:${id}`;
        pixelMap.set(key, {
          id,
          name: typeof row.name === 'string' ? row.name : (typeof row.pixel_name === 'string' ? row.pixel_name : id),
          adAccountId: account.id,
        });
      }
    }

    for (const page of pageMap.values()) {
      if (!page.instagramId) continue;
      const existing = instagramMap.get(page.instagramId);
      instagramMap.set(page.instagramId, {
        id: page.instagramId,
        name: existing?.name || page.instagramUsername || page.instagramId,
        username: existing?.username || page.instagramUsername,
        linkedPageId: existing?.linkedPageId || page.id,
        adAccountIds: page.adAccountIds && page.adAccountIds.length > 0
          ? [...new Set([...(existing?.adAccountIds || []), ...page.adAccountIds])]
          : existing?.adAccountIds,
      });
    }

    for (const row of toArray<Record<string, unknown>>(globalPixelsSnapshot?.data)) {
      const id = typeof row.id === 'string' ? row.id : '';
      if (!id) continue;
      const rawAccountId =
        (typeof row.adAccountId === 'string' && row.adAccountId)
        || (typeof row.ad_account_id === 'string' && row.ad_account_id)
        || '';
      const mapped = normalizedAccountToCanonical.get(normalizeAccountId(rawAccountId));

      if (mapped) {
        pixelMap.set(`${mapped}:${id}`, {
          id,
          name: typeof row.name === 'string' ? row.name : (typeof row.pixel_name === 'string' ? row.pixel_name : id),
          adAccountId: mapped,
        });
        continue;
      }

      if (storeAccounts.length === 1) {
        pixelMap.set(`${storeAccounts[0].id}:${id}`, {
          id,
          name: typeof row.name === 'string' ? row.name : (typeof row.pixel_name === 'string' ? row.pixel_name : id),
          adAccountId: storeAccounts[0].id,
        });
      }
    }

    const allPages = uniqueById([...pageMap.values()]);
    const allInstagramAccounts = uniqueById([...instagramMap.values()]);
    const allPixels = [...pixelMap.values()];

    const mappings: ProductMapping[] = [];

    for (const product of resolvedProducts) {
      const savedProfile = savedProfilesByProduct.get(product.id);
      const savedLinks = parseStringArray(savedProfile?.product_links);
      const incomingLinks = normalizeProductLinks(Array.isArray(product.productLinks) ? product.productLinks : []);
      const candidateLinks = normalizeProductLinks([
        ...incomingLinks,
        ...savedLinks,
        product.resolvedShopifyUrl,
        product.shopifyUrl || '',
        product.landingUrl || '',
      ]);

      const handleCandidates = new Set<string>();
      for (const link of candidateLinks) {
        const extracted = normalizeHandle(product.shopifyHandle || extractProductHandle(link) || product.resolvedHandle || '');
        if (extracted) handleCandidates.add(extracted);
      }
      if (product.resolvedHandle) {
        handleCandidates.add(normalizeHandle(product.resolvedHandle));
      }

      let bestMatch: ProductMatch | null = null;
      const matchedByAccount = new Map<string, ProductMatch>();

      for (const ad of dedupedAdUrls) {
        let matchedHandle = '';
        for (const handle of handleCandidates) {
          if (isStrictHandleMatch(handle, ad.url)) {
            matchedHandle = handle;
            break;
          }
        }
        if (!matchedHandle) continue;

        const canonicalAccountId = normalizedAccountToCanonical.get(normalizeAccountId(ad.adAccountId || '')) || ad.adAccountId || '';
        const match: ProductMatch = {
          productId: product.id,
          productName: product.name,
          shopifyUrl: product.resolvedShopifyUrl,
          matchedCampaignId: ad.campaignId,
          matchedCampaignName: ad.campaignName,
          matchedAdAccountId: canonicalAccountId,
          matchedAdId: ad.adId,
          matchedAdUrl: ad.url,
          matchReason: 'exact_handle_path',
          matchScore: 100,
        };

        if (!bestMatch || match.matchScore > bestMatch.matchScore) {
          bestMatch = match;
        }

        if (canonicalAccountId) {
          const existing = matchedByAccount.get(canonicalAccountId);
          if (!existing || match.matchScore > existing.matchScore) {
            matchedByAccount.set(canonicalAccountId, match);
          }
        }
      }

      const matchedAccountIds = [...matchedByAccount.keys()];
      const candidateAccountIds = normalizeProductLinks([
        savedProfile?.ad_account_id || '',
        ...matchedAccountIds,
      ]).map((id) => normalizedAccountToCanonical.get(normalizeAccountId(id)) || id);

      const productAccountIds = candidateAccountIds.length > 0
        ? [...new Set(candidateAccountIds)]
        : storeAccounts.map((account) => account.id);

      const availableAdAccounts: AccountOption[] = (productAccountIds.length > 0
        ? productAccountIds
        : storeAccounts.map((account) => account.id)
      ).map((id) => ({
        id,
        name: accountNameById.get(id) || id,
      }));

      const availableBusinessManagers = availableAdAccounts.map((account) => ({
        id: `bm:${account.id}`,
        name: account.name,
        adAccountIds: [account.id],
      }));

      const availablePages = allPages.filter((page) => {
        if (!page.adAccountIds || page.adAccountIds.length === 0) return true;
        return page.adAccountIds.some((id) => productAccountIds.some((target) => normalizeAccountId(target) === normalizeAccountId(id)));
      });

      const availableInstagramAccounts = allInstagramAccounts.filter((instagram) => {
        if (!instagram.adAccountIds || instagram.adAccountIds.length === 0) return true;
        return instagram.adAccountIds.some((id) => productAccountIds.some((target) => normalizeAccountId(target) === normalizeAccountId(id)));
      });

      const availablePixels = allPixels.filter((pixel) => {
        if (!pixel.adAccountId) return false;
        return productAccountIds.some((id) => normalizeAccountId(id) === normalizeAccountId(pixel.adAccountId));
      });

      let adAccountId = '';
      if (savedProfile?.ad_account_id) {
        adAccountId = normalizedAccountToCanonical.get(normalizeAccountId(savedProfile.ad_account_id)) || savedProfile.ad_account_id;
      } else if (bestMatch?.matchedAdAccountId) {
        adAccountId = bestMatch.matchedAdAccountId;
      } else if (availableAdAccounts.length > 0) {
        adAccountId = availableAdAccounts[0].id;
      }
      const adAccountName = availableAdAccounts.find((row) => row.id === adAccountId)?.name || savedProfile?.ad_account_name || '';

      const pagesForSelectedAccount = availablePages.filter((row) => belongsToAccount(row.adAccountIds, adAccountId));
      const igForSelectedAccount = availableInstagramAccounts.filter((row) => belongsToAccount(row.adAccountIds, adAccountId));
      const pixelsForSelectedAccount = availablePixels.filter((row) => normalizeAccountId(row.adAccountId) === normalizeAccountId(adAccountId));

      let pageId = savedProfile?.page_id || '';
      let pageName = savedProfile?.page_name || '';
      if (!pageId) {
        const selectedPage = pagesForSelectedAccount[0] || availablePages[0];
        pageId = selectedPage?.id || '';
        pageName = selectedPage?.name || '';
      }

      let instagramId = savedProfile?.instagram_id || '';
      let instagramUsername = '';
      if (!instagramId && pageId) {
        const selectedPage = availablePages.find((row) => row.id === pageId);
        instagramId = selectedPage?.instagramId || '';
      }
      if (instagramId) {
        const selectedIg = availableInstagramAccounts.find((row) => row.id === instagramId) || igForSelectedAccount[0];
        instagramUsername = selectedIg?.username || selectedIg?.name || '';
      }

      let pixelId = savedProfile?.pixel_id || '';
      let pixelName = savedProfile?.pixel_name || '';
      if (!pixelId) {
        const selectedPixel = pixelsForSelectedAccount[0] || availablePixels[0];
        pixelId = selectedPixel?.id || '';
        pixelName = selectedPixel?.name || '';
      }

      let destinationUrl = savedProfile?.destination_url || '';
      if (!destinationUrl && bestMatch?.matchedAdUrl) {
        destinationUrl = bestMatch.matchedAdUrl;
      }
      if (!destinationUrl) {
        destinationUrl = candidateLinks[0] || product.resolvedShopifyUrl;
      }

      const productLinks = normalizeProductLinks([
        ...incomingLinks,
        ...savedLinks,
        product.resolvedShopifyUrl,
        product.shopifyUrl || '',
        product.landingUrl || '',
        bestMatch?.matchedAdUrl || '',
        destinationUrl,
      ]);

      const selectedBusinessManager = availableBusinessManagers.find((row) => row.adAccountIds.includes(adAccountId));

      const hasMissingCache =
        availableAdAccounts.length === 0
        || availablePages.length === 0
        || availablePixels.length === 0
        || availableInstagramAccounts.length === 0;

      mappings.push({
        productId: product.id,
        productName: product.name,
        productImage: product.image || '',
        shopifyUrl: product.resolvedShopifyUrl,
        shopifyHandle: product.resolvedHandle,
        isAutoMatched: !!bestMatch,
        matchScore: bestMatch?.matchScore || 0,
        matchReason: savedProfile ? 'saved_profile' : (bestMatch?.matchReason || 'no_match'),
        needsUrlReview: product.needsUrlReview,
        missingCachedAssets: hasMissingCache,
        matchedCampaignId: bestMatch?.matchedCampaignId,
        matchedCampaignName: bestMatch?.matchedCampaignName,
        adAccountId,
        adAccountName,
        businessManagerId: selectedBusinessManager?.id || (adAccountId ? `bm:${adAccountId}` : ''),
        businessManagerName: selectedBusinessManager?.name || adAccountName,
        pageId,
        pageName,
        instagramId,
        instagramUsername,
        pixelId,
        pixelName,
        destinationUrl,
        productLinks,
        utmTemplate: savedProfile?.utm_template || DEFAULT_UTM_TEMPLATE,
        availableAdAccounts,
        availableBusinessManagers,
        availablePages,
        availableInstagramAccounts,
        availablePixels,
      });
    }

    return NextResponse.json({ mappings });
  } catch (err) {
    console.error('[Product Mapping] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch product mappings' },
      { status: 500 },
    );
  }
}
