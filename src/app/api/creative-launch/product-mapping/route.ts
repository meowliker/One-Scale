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
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { getMetaToken, getShopifyToken } from '@/app/api/lib/tokens';
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

function normalizeTextForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeForMatch(value: string): string[] {
  return normalizeTextForMatch(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function scoreAccountAffinity(params: {
  accountName: string;
  canonicalHandle: string;
  productName: string;
}): number {
  const { accountName, canonicalHandle, productName } = params;
  const normalizedAccountName = normalizeTextForMatch(accountName);
  if (!normalizedAccountName) return 0;

  let score = 0;
  const handlePhrase = normalizeTextForMatch(canonicalHandle.replace(/-/g, ' '));
  if (handlePhrase && normalizedAccountName.includes(handlePhrase)) {
    score += 120;
  }

  const handleTokens = tokenizeForMatch(canonicalHandle.replace(/-/g, ' '));
  const productTokens = tokenizeForMatch(productName);

  for (const token of handleTokens) {
    if (normalizedAccountName.includes(token)) {
      score += 18;
    }
  }
  for (const token of productTokens) {
    if (normalizedAccountName.includes(token)) {
      score += 8;
    }
  }

  return score;
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

function mergeAccountIdsMany(existing: string[] | undefined, next: string[] | undefined): string[] | undefined {
  const merged = new Set((existing || []).filter(Boolean));
  for (const id of next || []) {
    if (id) merged.add(id);
  }
  return merged.size > 0 ? [...merged] : undefined;
}

function deriveBusinessLabelFromAccountName(accountName: string): string {
  const trimmed = accountName.trim();
  if (!trimmed) return '';
  const [head] = trimmed.split('|');
  return (head || '').trim() || trimmed;
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

function extractPageIdFromStoryId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parts = trimmed.split('_');
  if (parts.length < 2) return '';
  const candidate = parts[0]?.trim() || '';
  return /^\d+$/.test(candidate) ? candidate : '';
}

function extractPageId(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const row = value as Record<string, unknown>;
  const creative = (row.creative && typeof row.creative === 'object')
    ? (row.creative as Record<string, unknown>)
    : row;
  const story = (creative.object_story_spec && typeof creative.object_story_spec === 'object')
    ? (creative.object_story_spec as Record<string, unknown>)
    : null;

  const explicitPageId =
    (typeof row.page_id === 'string' && row.page_id)
    || (typeof row.pageId === 'string' && row.pageId)
    || (typeof creative.page_id === 'string' && creative.page_id)
    || (typeof creative.pageId === 'string' && creative.pageId)
    || (story && typeof story.page_id === 'string' ? story.page_id : '')
    || '';
  if (explicitPageId) return explicitPageId;

  const storyId =
    (typeof row.object_story_id === 'string' && row.object_story_id)
    || (typeof row.effective_object_story_id === 'string' && row.effective_object_story_id)
    || (typeof creative.object_story_id === 'string' && creative.object_story_id)
    || (typeof creative.effective_object_story_id === 'string' && creative.effective_object_story_id)
    || '';
  return extractPageIdFromStoryId(storyId);
}

function isStrictHandleMatch(handle: string, candidateUrl: string): boolean {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return false;
  const normalizedCandidate = normalizeUrl(candidateUrl);
  if (!normalizedCandidate) return false;
  return normalizedCandidate.endsWith(`/products/${normalizedHandle}`);
}

function isStrictProductUrl(candidateUrl: string): boolean {
  const normalized = normalizeUrl(candidateUrl);
  return /\/products\/[^/]+$/.test(normalized);
}

function areSameStringSets(lhs: string[], rhs: string[]): boolean {
  if (lhs.length !== rhs.length) return false;
  const left = new Set(lhs);
  if (left.size !== rhs.length) return false;
  return rhs.every((row) => left.has(row));
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
    const firstProductLink = Array.isArray(product.productLinks) ? product.productLinks[0] : '';
    const explicitHandle = normalizeHandle(
      product.shopifyHandle || extractProductHandle(product.shopifyUrl || product.landingUrl || firstProductLink || '') || '',
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

async function fetchLiveBusinessForAccount(
  accessToken: string,
  adAccountId: string,
): Promise<{ id: string; name: string } | null> {
  const normalized = normalizeAccountId(adAccountId);
  if (!normalized) return null;
  const accountNode = adAccountId.startsWith('act_') ? adAccountId : `act_${normalized}`;

  try {
    const details = await fetchFromMeta<Record<string, unknown>>(
      accessToken,
      `/${accountNode}`,
      { fields: 'id,name,business{id,name},owner_business{id,name},business_name' },
      10000,
      1,
    );
    const business = (details.business && typeof details.business === 'object')
      ? (details.business as Record<string, unknown>)
      : null;
    const ownerBusiness = (details.owner_business && typeof details.owner_business === 'object')
      ? (details.owner_business as Record<string, unknown>)
      : null;
    const businessId = (business && typeof business.id === 'string' ? business.id : '')
      || (ownerBusiness && typeof ownerBusiness.id === 'string' ? ownerBusiness.id : '');
    const businessName = (business && typeof business.name === 'string' ? business.name : '')
      || (ownerBusiness && typeof ownerBusiness.name === 'string' ? ownerBusiness.name : '')
      || (typeof details.business_name === 'string' ? details.business_name : '')
      || businessId;
    if (!businessId && !businessName) {
      const fallbackName = typeof details.name === 'string' ? details.name : '';
      if (!fallbackName) return null;
      return {
        id: normalizeAccountId(adAccountId),
        name: deriveBusinessLabelFromAccountName(fallbackName),
      };
    }
    return {
      id: businessId || normalizeAccountId(adAccountId),
      name: businessName,
    };
  } catch {
    return null;
  }
}

async function fetchLivePagesForAccountAndHandle(params: {
  accessToken: string;
  adAccountId: string;
  handle?: string;
}): Promise<Array<{ id: string; name: string; count: number }>> {
  const { accessToken, adAccountId, handle } = params;
  const normalizedHandle = normalizeHandle(handle || '');
  const normalizedAccountId = normalizeAccountId(adAccountId);
  if (!normalizedAccountId) return [];
  const accountNode = adAccountId.startsWith('act_') ? adAccountId : `act_${normalizedAccountId}`;

  const pageCounts = new Map<string, number>();
  const ingestCreative = (creative: Record<string, unknown>) => {
    const destinationUrl = extractDestinationUrlFromCreative(creative);
    if (normalizedHandle && !isStrictHandleMatch(normalizedHandle, destinationUrl)) return;
    const pageId = extractPageId(creative);
    if (!pageId) return;
    pageCounts.set(pageId, (pageCounts.get(pageId) || 0) + 1);
  };

  const scanAds = async () => {
    let after: string | undefined;
    let requests = 0;
    const MAX_AD_PAGES = normalizedHandle ? 12 : 6;
    while (requests < MAX_AD_PAGES) {
      try {
        const adsResponse = await fetchFromMeta<{
          data?: Array<Record<string, unknown>>;
          paging?: { cursors?: { after?: string } };
        }>(
          accessToken,
          `/${accountNode}/ads`,
          {
            fields: 'id,creative{object_story_spec,object_url,link_url,object_story_id,effective_object_story_id,page_id}',
            limit: '200',
            ...(after ? { after } : {}),
          },
          10000,
          1,
        );
        for (const row of toArray<Record<string, unknown>>(adsResponse.data)) {
          const creative = (row.creative && typeof row.creative === 'object')
            ? (row.creative as Record<string, unknown>)
            : null;
          if (!creative) continue;
          ingestCreative(creative);
        }
        requests += 1;
        const nextAfter = adsResponse.paging?.cursors?.after;
        if (!nextAfter) break;
        after = nextAfter;
      } catch {
        break;
      }
    }
  };

  const scanAdCreatives = async () => {
    let after: string | undefined;
    let requests = 0;
    const MAX_CREATIVE_PAGES = normalizedHandle ? 10 : 5;
    while (requests < MAX_CREATIVE_PAGES) {
      try {
        const creativesResponse = await fetchFromMeta<{
          data?: Array<Record<string, unknown>>;
          paging?: { cursors?: { after?: string } };
        }>(
          accessToken,
          `/${accountNode}/adcreatives`,
          {
            fields: 'id,object_story_spec,object_url,link_url,object_story_id,effective_object_story_id,page_id',
            limit: '200',
            ...(after ? { after } : {}),
          },
          10000,
          1,
        );
        for (const row of toArray<Record<string, unknown>>(creativesResponse.data)) {
          ingestCreative(row);
        }
        requests += 1;
        const nextAfter = creativesResponse.paging?.cursors?.after;
        if (!nextAfter) break;
        after = nextAfter;
      } catch {
        break;
      }
    }
  };

  await scanAds();
  if (pageCounts.size === 0) {
    await scanAdCreatives();
  }

  if (pageCounts.size === 0) return [];

  const pageNameById = new Map<string, string>();
  await Promise.all(
    [...pageCounts.keys()].map(async (pageId) => {
      try {
        const pageRow = await fetchFromMeta<Record<string, unknown>>(
          accessToken,
          `/${pageId}`,
          { fields: 'id,name' },
          8000,
          1,
        );
        const pageName = typeof pageRow.name === 'string' ? pageRow.name : '';
        if (pageName) pageNameById.set(pageId, pageName);
      } catch {
        // best effort; keep id as fallback label
      }
    }),
  );

  return [...pageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      id,
      name: pageNameById.get(id) || id,
      count,
    }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, products, action } = body;
    const allowLiveFallback = body.liveFallback !== false;

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
    const mapAccountIdToCanonical = (value: string): string => {
      if (!value) return '';
      return normalizedAccountToCanonical.get(normalizeAccountId(value)) || value;
    };
    const extractScopedAccountIds = (row: Record<string, unknown>): string[] => {
      const bucket: string[] = [];
      const adAccountIds = row.adAccountIds;
      if (Array.isArray(adAccountIds)) {
        for (const value of adAccountIds) {
          if (typeof value === 'string') bucket.push(value);
        }
      }
      const adAccountIdsSnake = row.ad_account_ids;
      if (Array.isArray(adAccountIdsSnake)) {
        for (const value of adAccountIdsSnake) {
          if (typeof value === 'string') bucket.push(value);
        }
      }
      const singletonCandidates = [
        row.adAccountId,
        row.ad_account_id,
        row.accountId,
        row.account_id,
      ];
      for (const value of singletonCandidates) {
        if (typeof value === 'string' && value.trim()) {
          bucket.push(value);
        }
      }
      return normalizeProductLinks(bucket.map(mapAccountIdToCanonical).filter(Boolean));
    };

    const inputProducts = products as InputProduct[];
    const store = getStore(storeId);
    const storeDomain = (store?.domain || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');

    const resolvedProducts = await resolveProducts({
      storeId,
      storeDomain,
      products: inputProducts,
    });
    const catalog = await loadShopifyCatalog(storeId);
    const knownHandles = new Set(catalog.map((row) => normalizeHandle(row.handle)).filter(Boolean));

    const savedProfilesByProduct = new Map<string, ReturnType<typeof getProductLaunchProfile>>();
    for (const product of resolvedProducts) {
      savedProfilesByProduct.set(product.id, getProductLaunchProfile(storeId, product.id));
    }

    const [adsSnapshots, creativesSnapshots, adsetsSnapshots, campaignsSnapshots, accountsSnapshot] = await Promise.all([
      getRecentSnapshots<Record<string, unknown>>(storeId, 'ads'),
      getRecentSnapshots<Record<string, unknown>>(storeId, 'creatives'),
      getRecentSnapshots<Record<string, unknown>>(storeId, 'adsets'),
      getRecentSnapshots<Record<string, unknown>>(storeId, 'campaigns'),
      getLatestSnapshot<Record<string, unknown>>(storeId, 'accounts', ''),
    ]);

    const businessByAccount = new Map<string, { id: string; name: string }>();
    for (const row of toArray<Record<string, unknown>>(accountsSnapshot?.data)) {
      const rawAccountId = typeof row.id === 'string'
        ? row.id
        : (typeof row.ad_account_id === 'string' ? row.ad_account_id : '');
      const canonicalAccountId = normalizedAccountToCanonical.get(normalizeAccountId(rawAccountId)) || rawAccountId;
      if (!canonicalAccountId) continue;
      const businessObject = (row.business && typeof row.business === 'object')
        ? (row.business as Record<string, unknown>)
        : null;
      const ownerBusinessObject = (row.ownerBusiness && typeof row.ownerBusiness === 'object')
        ? (row.ownerBusiness as Record<string, unknown>)
        : (
          (row.owner_business && typeof row.owner_business === 'object')
            ? (row.owner_business as Record<string, unknown>)
            : null
        );
      const businessId = typeof row.businessId === 'string'
        ? row.businessId
        : (
          typeof row.business_id === 'string'
            ? row.business_id
            : (
              typeof businessObject?.id === 'string'
                ? businessObject.id
                : (
                  typeof ownerBusinessObject?.id === 'string'
                    ? ownerBusinessObject.id
                    : ''
                )
            )
        );
      const businessName = typeof row.businessName === 'string'
        ? row.businessName
        : (
          typeof row.business_name === 'string'
            ? row.business_name
            : (
              typeof businessObject?.name === 'string'
                ? businessObject.name
                : (
                  typeof ownerBusinessObject?.name === 'string'
                    ? ownerBusinessObject.name
                    : ''
                )
            )
        );
      if (businessId || businessName) {
        businessByAccount.set(canonicalAccountId, {
          id: businessId,
          name: businessName,
        });
      }
    }

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
    const observedPages: Array<{ id: string; name: string; adAccountId: string }> = [];
    const pageHintsByAccountAndHandle = new Map<string, Map<string, { count: number; name: string }>>();

    const trackPageHint = (accountId: string, url: string, pageId: string, pageName?: string) => {
      const normalizedAccountId = normalizeAccountId(accountId);
      const handle = normalizeHandle(extractProductHandle(url) || '');
      if (!normalizedAccountId || !handle || !pageId) return;
      const key = `${normalizedAccountId}|${handle}`;
      const pageCounts = pageHintsByAccountAndHandle.get(key) || new Map<string, { count: number; name: string }>();
      const current = pageCounts.get(pageId) || { count: 0, name: '' };
      pageCounts.set(pageId, {
        count: current.count + 1,
        name: current.name || (pageName || ''),
      });
      pageHintsByAccountAndHandle.set(key, pageCounts);
    };

    for (const snapshot of adsSnapshots) {
      for (const row of snapshot.data) {
        const creative = (row.creative && typeof row.creative === 'object')
          ? (row.creative as Record<string, unknown>)
          : null;
        const destinationUrl = extractDestinationUrlFromCreative(creative);
        const rowAdSetId =
          (typeof row.adset_id === 'string' && row.adset_id)
          || (typeof row.adsetId === 'string' && row.adsetId)
          || snapshot.scopeId;
        const campaignId =
          (typeof row.campaign_id === 'string' && row.campaign_id)
          || (typeof row.campaignId === 'string' && row.campaignId)
          || adSetToCampaign.get(rowAdSetId)
          || '';
        const rawAccountId =
          (typeof row.ad_account_id === 'string' && row.ad_account_id)
          || (typeof row.adAccountId === 'string' && row.adAccountId)
          || adSetToAccount.get(rowAdSetId)
          || (campaignId ? campaignToAccount.get(campaignId) : '')
          || '';
        const canonicalAccountId = normalizedAccountToCanonical.get(normalizeAccountId(rawAccountId)) || rawAccountId;
        const pageId = extractPageId(row);
        const pageName = typeof row.page_name === 'string'
          ? row.page_name
          : (typeof row.pageName === 'string' ? row.pageName : '');
        if (pageId) {
          observedPages.push({
            id: pageId,
            name: pageName,
            adAccountId: canonicalAccountId,
          });
        }
        if (destinationUrl && pageId) {
          trackPageHint(canonicalAccountId, destinationUrl, pageId, pageName);
        }
      }

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

        const pageId = extractPageId(row);
        const pageName = typeof row.page_name === 'string'
          ? row.page_name
          : (typeof row.pageName === 'string' ? row.pageName : '');
        if (pageId) {
          observedPages.push({
            id: pageId,
            name: pageName,
            adAccountId: canonicalAccountId,
          });
          trackPageHint(canonicalAccountId, destinationUrl, pageId, pageName);
        }
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
      const rowAccountIds = extractScopedAccountIds(row);
      const mergedAccountIds = mergeAccountIdsMany(
        existing?.adAccountIds,
        [...rowAccountIds, ...(accountId ? [mapAccountIdToCanonical(accountId)] : [])],
      );
      pageMap.set(id, {
        id,
        name: typeof row.name === 'string' ? row.name : existing?.name || id,
        instagramId: instagramId || existing?.instagramId,
        instagramUsername: instagramUsername || existing?.instagramUsername,
        adAccountIds: mergedAccountIds,
      });
    };

    for (const row of toArray<Record<string, unknown>>(pagesGlobalSnapshot?.data)) {
      upsertPage(row);
    }
    for (const observation of observedPages) {
      if (!observation.id) continue;
      upsertPage(
        { id: observation.id, name: observation.name || observation.id },
        observation.adAccountId || undefined,
      );
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
      const rowAccountIds = extractScopedAccountIds(row);
      const mergedAccountIds = mergeAccountIdsMany(
        existing?.adAccountIds,
        [...rowAccountIds, ...(accountId ? [mapAccountIdToCanonical(accountId)] : [])],
      );

      instagramMap.set(id, {
        id,
        name: typeof row.name === 'string' ? row.name : (existing?.name || username || id),
        username: username || undefined,
        linkedPageId,
        adAccountIds: mergedAccountIds,
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
      const isKnownProductLink = (url: string) => {
        if (!isStrictProductUrl(url)) return false;
        if (knownHandles.size === 0) return true;
        const handle = normalizeHandle(extractProductHandle(url) || '');
        return !!handle && knownHandles.has(handle);
      };

      const savedLinks = parseStringArray(savedProfile?.product_links).filter(isKnownProductLink);
      const incomingLinks = normalizeProductLinks(Array.isArray(product.productLinks) ? product.productLinks : []).filter(isKnownProductLink);
      const incomingLinksProvided = incomingLinks.length > 0;
      const linksChangedByUser = incomingLinksProvided && !areSameStringSets(incomingLinks, savedLinks);
      const useSavedAssetOverrides = !!savedProfile && !linksChangedByUser;
      const manualProductLinks = normalizeProductLinks([
        ...incomingLinks,
        ...savedLinks,
      ]).filter(isStrictProductUrl);

      const resolvedProductUrl = isKnownProductLink(product.resolvedShopifyUrl) ? product.resolvedShopifyUrl : '';
      const candidateLinks = normalizeProductLinks([
        ...manualProductLinks,
        resolvedProductUrl,
      ]).filter(isKnownProductLink);

      const canonicalHandle = normalizeHandle(
        product.shopifyHandle
          || extractProductHandle(candidateLinks[0] || '')
          || product.resolvedHandle
          || '',
      );

      let bestMatch: ProductMatch | null = null;
      const matchedByAccount = new Map<string, ProductMatch>();
      const matchCountByAccount = new Map<string, number>();

      for (const ad of dedupedAdUrls) {
        if (!canonicalHandle || !isStrictHandleMatch(canonicalHandle, ad.url)) continue;

        const canonicalAccountId = normalizedAccountToCanonical.get(normalizeAccountId(ad.adAccountId || '')) || ad.adAccountId || '';
        const match: ProductMatch = {
          productId: product.id,
          productName: product.name,
          shopifyUrl: candidateLinks[0] || product.resolvedShopifyUrl,
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
          matchCountByAccount.set(canonicalAccountId, (matchCountByAccount.get(canonicalAccountId) || 0) + 1);
        }
      }

      const rankAccountIds = (ids: string[]): string[] => ids
        .map((accountId, index) => ({
          accountId,
          index,
          score: scoreAccountAffinity({
            accountName: accountNameById.get(accountId) || accountId,
            canonicalHandle,
            productName: product.name,
          }),
        }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.index - b.index;
        })
        .map((row) => row.accountId);

      const matchedAccountIds = [...matchCountByAccount.entries()]
        .sort((a, b) => {
          const affinityA = scoreAccountAffinity({
            accountName: accountNameById.get(a[0]) || a[0],
            canonicalHandle,
            productName: product.name,
          });
          const affinityB = scoreAccountAffinity({
            accountName: accountNameById.get(b[0]) || b[0],
            canonicalHandle,
            productName: product.name,
          });
          if (affinityB !== affinityA) return affinityB - affinityA;
          return b[1] - a[1];
        })
        .map(([accountId]) => accountId);
      const preferredMatchedAccountId = matchedAccountIds[0] || '';
      if (preferredMatchedAccountId) {
        bestMatch = matchedByAccount.get(preferredMatchedAccountId) || bestMatch;
      }
      const candidateAccountIds = normalizeProductLinks([
        useSavedAssetOverrides ? (savedProfile?.ad_account_id || '') : '',
        ...matchedAccountIds,
      ]).map((id) => normalizedAccountToCanonical.get(normalizeAccountId(id)) || id);

      const rankedStoreAccountIds = rankAccountIds(storeAccounts.map((account) => account.id));
      const seededAccountIds = candidateAccountIds.length > 0
        ? [...new Set([...candidateAccountIds, ...rankedStoreAccountIds])]
        : rankedStoreAccountIds;
      const productAccountIds = rankAccountIds(seededAccountIds);

      const availableAdAccounts: AccountOption[] = (productAccountIds.length > 0
        ? productAccountIds
        : storeAccounts.map((account) => account.id)
      ).map((id) => ({
        id,
        name: accountNameById.get(id) || id,
      }));

      const availableBusinessManagers = availableAdAccounts.map((account) => ({
        id: businessByAccount.get(account.id)?.id
          ? `bm:${businessByAccount.get(account.id)?.id}`
          : `bm:${normalizeAccountId(account.id)}`,
        name: businessByAccount.get(account.id)?.name
          || businessByAccount.get(account.id)?.id
          || deriveBusinessLabelFromAccountName(account.name)
          || account.name
          || account.id,
        adAccountIds: [account.id],
      }));

      let availablePages = allPages.filter((page) => {
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
      if (useSavedAssetOverrides && savedProfile?.ad_account_id) {
        adAccountId = normalizedAccountToCanonical.get(normalizeAccountId(savedProfile.ad_account_id)) || savedProfile.ad_account_id;
      } else if (bestMatch?.matchedAdAccountId) {
        adAccountId = bestMatch.matchedAdAccountId;
      } else if (availableAdAccounts.length > 0) {
        adAccountId = availableAdAccounts[0].id;
      }
      if (adAccountId && !availableAdAccounts.some((row) => normalizeAccountId(row.id) === normalizeAccountId(adAccountId))) {
        adAccountId = availableAdAccounts[0]?.id || '';
      }
      if (!adAccountId && availableAdAccounts.length > 0) {
        adAccountId = availableAdAccounts[0].id;
      }
      const adAccountName = availableAdAccounts.find((row) => row.id === adAccountId)?.name
        || (useSavedAssetOverrides ? (savedProfile?.ad_account_name || '') : '');

      const igForSelectedAccount = availableInstagramAccounts.filter((row) => belongsToAccount(row.adAccountIds, adAccountId));
      const pixelsForSelectedAccount = availablePixels.filter((row) => normalizeAccountId(row.adAccountId) === normalizeAccountId(adAccountId));
      const pageHintKey = `${normalizeAccountId(adAccountId)}|${canonicalHandle}`;
      const hintedPageCounts = pageHintsByAccountAndHandle.get(pageHintKey);
      const hintedPageId = hintedPageCounts
        ? [...hintedPageCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0]?.[0]
        : '';
      const hintedPageName = (hintedPageId && hintedPageCounts?.get(hintedPageId)?.name) || '';
      if (hintedPageId && !availablePages.some((row) => row.id === hintedPageId)) {
        availablePages = [
          {
            id: hintedPageId,
            name: hintedPageName || `Matched Page (${hintedPageId})`,
            adAccountIds: [adAccountId],
          },
          ...availablePages,
        ];
      }
      const strictPagesForSelectedAccountAfterHint = availablePages.filter((row) =>
        (row.adAccountIds || []).some((id) => normalizeAccountId(id) === normalizeAccountId(adAccountId))
      );
      const pagesForSelectedAccountAfterHint = strictPagesForSelectedAccountAfterHint;

      let pageId = useSavedAssetOverrides ? (savedProfile?.page_id || '') : '';
      let pageName = useSavedAssetOverrides ? (savedProfile?.page_name || '') : '';
      if (pageId && !pagesForSelectedAccountAfterHint.some((row) => row.id === pageId)) {
        pageId = '';
        pageName = '';
      }
      if (!pageId) {
        const selectedPage = pagesForSelectedAccountAfterHint.find((row) => row.id === hintedPageId)
          || (
            strictPagesForSelectedAccountAfterHint.length > 0
              ? strictPagesForSelectedAccountAfterHint[0]
              : undefined
          );
        pageId = selectedPage?.id || '';
        pageName = selectedPage?.name || '';
      }

      let instagramId = useSavedAssetOverrides ? (savedProfile?.instagram_id || '') : '';
      let instagramUsername = '';
      if (instagramId && !igForSelectedAccount.some((row) => row.id === instagramId)) {
        instagramId = '';
      }
      if (!instagramId && pageId) {
        const selectedPage = availablePages.find((row) => row.id === pageId);
        instagramId = selectedPage?.instagramId || '';
      }
      if (!instagramId && igForSelectedAccount.length > 0) {
        instagramId = igForSelectedAccount[0].id;
      }
      if (instagramId) {
        const selectedIg = igForSelectedAccount.find((row) => row.id === instagramId) || igForSelectedAccount[0];
        instagramUsername = selectedIg?.username || selectedIg?.name || '';
      }

      let pixelId = useSavedAssetOverrides ? (savedProfile?.pixel_id || '') : '';
      let pixelName = useSavedAssetOverrides ? (savedProfile?.pixel_name || '') : '';
      if (pixelId && !pixelsForSelectedAccount.some((row) => row.id === pixelId)) {
        pixelId = '';
        pixelName = '';
      }
      if (!pixelId) {
        const selectedPixel = pixelsForSelectedAccount[0];
        pixelId = selectedPixel?.id || '';
        pixelName = selectedPixel?.name || '';
      }

      let destinationUrl = useSavedAssetOverrides ? (savedProfile?.destination_url || '') : '';
      if (!destinationUrl && bestMatch?.matchedAdUrl) {
        destinationUrl = bestMatch.matchedAdUrl;
      }
      if (!destinationUrl && manualProductLinks.length > 0) {
        destinationUrl = manualProductLinks[0];
      }
      if (!destinationUrl && resolvedProductUrl) {
        destinationUrl = resolvedProductUrl;
      }

      const suggestedMatchedUrl = isStrictProductUrl(bestMatch?.matchedAdUrl || '') ? (bestMatch?.matchedAdUrl || '') : '';
      const destinationAsProduct = isKnownProductLink(destinationUrl) ? destinationUrl : '';
      const productLinks = normalizeProductLinks([
        ...manualProductLinks,
        resolvedProductUrl,
        suggestedMatchedUrl,
        destinationAsProduct,
      ]).filter(isKnownProductLink);

      const selectedBusinessManager = availableBusinessManagers.find((row) => row.adAccountIds.includes(adAccountId));
      const selectedBusiness = businessByAccount.get(adAccountId);

      const hasMissingCache =
        availableAdAccounts.length === 0
        || availablePages.length === 0
        || availablePixels.length === 0
        || availableInstagramAccounts.length === 0;

      mappings.push({
        productId: product.id,
        productName: product.name,
        productImage: product.image || '',
        shopifyUrl: resolvedProductUrl || productLinks[0] || '',
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
        businessManagerId: selectedBusiness?.id
          ? `bm:${selectedBusiness.id}`
          : (selectedBusinessManager?.id || ''),
        businessManagerName: selectedBusiness?.name
          || selectedBusiness?.id
          || selectedBusinessManager?.name
          || deriveBusinessLabelFromAccountName(adAccountName)
          || '',
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

    if (allowLiveFallback && mappings.length > 0) {
      const requiresLiveFallback = mappings.some((mapping) => {
        const strictPagesForAccount = mapping.availablePages.filter((row) =>
          (row.adAccountIds || []).some((id) => normalizeAccountId(id) === normalizeAccountId(mapping.adAccountId)),
        );
        return !mapping.businessManagerName || !mapping.pageId || strictPagesForAccount.length === 0;
      });

      if (requiresLiveFallback) {
        const token = await getMetaToken(storeId);
        if (token?.accessToken) {
          const businessLiveCache = new Map<string, { id: string; name: string } | null>();
          const pagesLiveCache = new Map<string, Array<{ id: string; name: string; count: number }>>();

          for (const mapping of mappings) {
            const adAccountId = mapping.adAccountId;
            const handle = normalizeHandle(
              mapping.shopifyHandle
                || extractProductHandle(mapping.shopifyUrl || mapping.destinationUrl || mapping.productLinks[0] || '')
                || '',
            );
            if (!adAccountId || !handle) continue;

            const normalizeAndMergePage = (page: ProductPageOption): ProductPageOption => {
              const existing = mapping.availablePages.find((row) => row.id === page.id);
              return {
                id: page.id,
                name: page.name || existing?.name || page.id,
                instagramId: page.instagramId || existing?.instagramId,
                instagramUsername: page.instagramUsername || existing?.instagramUsername,
                adAccountIds: mergeAccountIds(existing?.adAccountIds, adAccountId),
              };
            };

            if (!mapping.businessManagerName || !mapping.businessManagerId) {
              if (!businessLiveCache.has(adAccountId)) {
                const liveBusiness = await fetchLiveBusinessForAccount(token.accessToken, adAccountId);
                businessLiveCache.set(adAccountId, liveBusiness);
              }
              const liveBusiness = businessLiveCache.get(adAccountId);
              if (liveBusiness) {
                mapping.businessManagerId = liveBusiness.id ? `bm:${liveBusiness.id}` : mapping.businessManagerId;
                mapping.businessManagerName = liveBusiness.name || liveBusiness.id || mapping.businessManagerName;

                mapping.availableBusinessManagers = mapping.availableBusinessManagers.map((row) => {
                  if (!row.adAccountIds.some((id) => normalizeAccountId(id) === normalizeAccountId(adAccountId))) {
                    return row;
                  }
                  return {
                    ...row,
                    id: liveBusiness.id ? `bm:${liveBusiness.id}` : row.id,
                    name: liveBusiness.name || liveBusiness.id || row.name,
                  };
                });
              }
            }

            const strictPagesForAccount = mapping.availablePages.filter((row) =>
              (row.adAccountIds || []).some((id) => normalizeAccountId(id) === normalizeAccountId(adAccountId)),
            );
            const selectedPageIsScoped = !!mapping.pageId
              && strictPagesForAccount.some((row) => row.id === mapping.pageId);
            const needsLivePages = !mapping.pageId || strictPagesForAccount.length === 0 || !selectedPageIsScoped;

            if (needsLivePages) {
              const pageCacheKey = `${normalizeAccountId(adAccountId)}|${handle}`;
              if (!pagesLiveCache.has(pageCacheKey)) {
                const livePages = await fetchLivePagesForAccountAndHandle({
                  accessToken: token.accessToken,
                  adAccountId,
                  handle,
                });
                pagesLiveCache.set(pageCacheKey, livePages);
              }

              const livePages = pagesLiveCache.get(pageCacheKey) || [];
              let livePagesForManualFallback: Array<{ id: string; name: string; count: number }> = [];
              if (livePages.length === 0) {
                const broadKey = `${normalizeAccountId(adAccountId)}|*`;
                if (!pagesLiveCache.has(broadKey)) {
                  const broadPages = await fetchLivePagesForAccountAndHandle({
                    accessToken: token.accessToken,
                    adAccountId,
                  });
                  pagesLiveCache.set(broadKey, broadPages);
                }
                livePagesForManualFallback = pagesLiveCache.get(broadKey) || [];
              }

              const pagesToMerge = livePages.length > 0 ? livePages : livePagesForManualFallback;
              if (pagesToMerge.length > 0) {
                const mergedPages = new Map<string, ProductPageOption>();
                for (const row of mapping.availablePages) {
                  mergedPages.set(row.id, row);
                }
                for (const row of pagesToMerge) {
                  const normalized = normalizeAndMergePage({
                    id: row.id,
                    name: row.name,
                    adAccountIds: [adAccountId],
                  });
                  mergedPages.set(row.id, normalized);
                }
                mapping.availablePages = uniqueById([...mergedPages.values()]);

                const strictPagesAfterMerge = mapping.availablePages.filter((row) =>
                  (row.adAccountIds || []).some((id) => normalizeAccountId(id) === normalizeAccountId(adAccountId)),
                );
                if (!mapping.pageId || !strictPagesAfterMerge.some((row) => row.id === mapping.pageId)) {
                  const topPage = strictPagesAfterMerge[0];
                  if (topPage) {
                    mapping.pageId = topPage.id;
                    mapping.pageName = topPage.name || mapping.pageName;
                  }
                } else if (!mapping.pageName) {
                  const selected = strictPagesAfterMerge.find((row) => row.id === mapping.pageId);
                  mapping.pageName = selected?.name || mapping.pageName;
                }
              }
            }

            const strictPagesAfterFallback = mapping.availablePages.filter((row) =>
              (row.adAccountIds || []).some((id) => normalizeAccountId(id) === normalizeAccountId(adAccountId)),
            );
            const igForAccount = mapping.availableInstagramAccounts.filter((row) =>
              belongsToAccount(row.adAccountIds, adAccountId),
            );
            const pixelsForAccount = mapping.availablePixels.filter((row) =>
              normalizeAccountId(row.adAccountId) === normalizeAccountId(adAccountId),
            );

            mapping.missingCachedAssets =
              mapping.availableAdAccounts.length === 0
              || strictPagesAfterFallback.length === 0
              || pixelsForAccount.length === 0
              || igForAccount.length === 0;
          }
        }
      }
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
