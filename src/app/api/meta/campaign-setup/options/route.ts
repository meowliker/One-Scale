import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { getStoreAdAccounts } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled, listPersistentStoreAdAccounts } from '@/app/api/lib/supabase-persistence';
import type {
  CampaignConversionEvent,
  CampaignSetupOptions,
  CampaignSetupAccountOption,
  CampaignSetupPageOption,
  CampaignSetupInstagramOption,
  CampaignSetupPixelOption,
  CampaignSetupCustomConversionOption,
} from '@/types/campaignCreate';

type MetaRow = Record<string, unknown>;
const SETUP_CACHE_TTL_MS = 10 * 60 * 1000;
const META_FETCH_TIMEOUT_MS = 9000;
const setupOptionsCache = new Map<string, { at: number; data: CampaignSetupOptions }>();

const CONVERSION_EVENTS: CampaignConversionEvent[] = [
  'PURCHASE',
  'ADD_TO_CART',
  'INITIATE_CHECKOUT',
  'LEAD',
  'COMPLETE_REGISTRATION',
  'VIEW_CONTENT',
  'SEARCH',
];

function toStringSafe(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeAccountNode(value: string): string {
  const node = value.trim();
  if (!node) return '';
  if (node.startsWith('act_')) return node;
  const numeric = node.replace(/^act_/, '');
  return `act_${numeric}`;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!item.id) continue;
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()];
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<{ data?: MetaRow[]; paging?: { next?: string } }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { data: [], paging: undefined };
    return response.json() as Promise<{ data?: MetaRow[]; paging?: { next?: string } }>;
  } catch {
    return { data: [], paging: undefined };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchPaged(token: string, endpoint: string, params: Record<string, string>): Promise<MetaRow[]> {
  const first = await fetchFromMeta<{ data?: MetaRow[]; paging?: { next?: string } }>(
    token,
    endpoint,
    params,
    META_FETCH_TIMEOUT_MS,
    1
  )
    .catch(() => ({ data: [], paging: undefined }));

  const rows: MetaRow[] = [...(first.data || [])];
  let nextUrl = first.paging?.next;
  let pages = 0;

  while (nextUrl && pages < 3) {
    pages += 1;
    const body = await fetchJsonWithTimeout(nextUrl, META_FETCH_TIMEOUT_MS);
    rows.push(...(body.data || []));
    nextUrl = body.paging?.next;
  }

  return rows;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const selectedAccountId = searchParams.get('accountId') || '';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const allStoreAccounts = isSupabasePersistenceEnabled()
    ? await listPersistentStoreAdAccounts(storeId)
    : getStoreAdAccounts(storeId);
  const linkedAccounts = allStoreAccounts
    .filter((account) => account.platform === 'meta')
    .sort((a, b) => (b.is_active - a.is_active))
    .map((account) => ({
      id: normalizeAccountNode(account.ad_account_id),
      name: account.ad_account_name,
      accountId: account.ad_account_id.replace(/^act_/, ''),
    } satisfies CampaignSetupAccountOption));

  const token = await getMetaToken(storeId);
  const defaultAccountId = normalizeAccountNode(
    selectedAccountId ||
      linkedAccounts.find((account) => account.id)?.id ||
      token?.accountId ||
      ''
  );
  if (!defaultAccountId) {
    return NextResponse.json({ error: 'No active ad account linked to this store' }, { status: 400 });
  }

  const baseOptions: CampaignSetupOptions = {
    accounts: linkedAccounts.length > 0 ? linkedAccounts : [{ id: defaultAccountId, name: defaultAccountId }],
    pages: [],
    instagramAccounts: [],
    pixels: [],
    customConversions: [],
    conversionEvents: CONVERSION_EVENTS,
    defaultAccountId,
    fetchedAt: new Date().toISOString(),
  };

  const cacheKey = `${storeId}|${defaultAccountId}`;
  const cached = setupOptionsCache.get(cacheKey);
  const hasStrongCachedData = Boolean(
    cached &&
    (
      cached.data.pages.length > 0 ||
      cached.data.pixels.length > 0 ||
      cached.data.customConversions.length > 0 ||
      cached.data.instagramAccounts.length > 0
    )
  );
  if (cached && Date.now() - cached.at < SETUP_CACHE_TTL_MS && hasStrongCachedData) {
    return NextResponse.json({ ...cached.data, cached: true });
  }

  if (!token) {
    if (cached) {
      return NextResponse.json({ ...cached.data, cached: true, stale: true, metaDisconnected: true });
    }
    return NextResponse.json({ ...baseOptions, stale: true, metaDisconnected: true });
  }

  try {
    const [pagesRaw, pixelsRaw, customConversionsRaw, instagramRaw] = await Promise.all([
      fetchPaged(token.accessToken, '/me/accounts', {
        fields: 'id,name,instagram_business_account{id,username}',
        limit: '100',
      }).catch(() => []),
      fetchPaged(token.accessToken, `/${defaultAccountId}/adspixels`, {
        fields: 'id,name,status',
        limit: '200',
      }).catch(() => []),
      fetchPaged(token.accessToken, `/${defaultAccountId}/customconversions`, {
        fields: 'id,name,custom_event_type,event_source_type',
        limit: '200',
      }).catch(() => []),
      fetchPaged(token.accessToken, `/${defaultAccountId}/instagram_accounts`, {
        fields: 'id,username,name',
        limit: '200',
      }).catch(() => []),
    ]);

    const pages: CampaignSetupPageOption[] = uniqueById(
      pagesRaw.map((row) => {
        const igObj = (row.instagram_business_account && typeof row.instagram_business_account === 'object')
          ? row.instagram_business_account as Record<string, unknown>
          : null;

        return {
          id: toStringSafe(row.id),
          name: toStringSafe(row.name),
          instagramAccountId: igObj ? toStringSafe(igObj.id) : undefined,
          instagramUsername: igObj ? toStringSafe(igObj.username) : undefined,
        };
      }).filter((row) => row.id)
    );

    const instagramAccounts: CampaignSetupInstagramOption[] = uniqueById([
      ...instagramRaw.map((row) => ({
        id: toStringSafe(row.id),
        username: toStringSafe(row.username) || toStringSafe(row.name) || toStringSafe(row.id),
      })),
      ...pages
        .filter((page) => page.instagramAccountId)
        .map((page) => ({
          id: page.instagramAccountId as string,
          username: page.instagramUsername || page.instagramAccountId as string,
        })),
    ].filter((row) => row.id && row.username));

    const pixels: CampaignSetupPixelOption[] = uniqueById(
      pixelsRaw
        .map((row) => ({ id: toStringSafe(row.id), name: toStringSafe(row.name) || toStringSafe(row.id) }))
        .filter((row) => row.id)
    );

    const customConversions: CampaignSetupCustomConversionOption[] = uniqueById(
      customConversionsRaw
        .map((row) => ({
          id: toStringSafe(row.id),
          name: toStringSafe(row.name) || toStringSafe(row.id),
          customEventType: toStringSafe(row.custom_event_type) || undefined,
        }))
        .filter((row) => row.id)
    );

    const fetchedAnyRows =
      pagesRaw.length > 0 ||
      pixelsRaw.length > 0 ||
      customConversionsRaw.length > 0 ||
      instagramRaw.length > 0;
    if (!fetchedAnyRows) {
      if (cached) {
        return NextResponse.json({ ...cached.data, cached: true, stale: true });
      }
      return NextResponse.json({
        ...baseOptions,
        stale: true,
        warning: 'Meta setup sync timed out. Showing linked account defaults.',
      });
    }

    const options: CampaignSetupOptions = {
      accounts: baseOptions.accounts,
      pages: uniqueById([...(cached?.data.pages || []), ...pages]),
      instagramAccounts: uniqueById([...(cached?.data.instagramAccounts || []), ...instagramAccounts]),
      pixels: uniqueById([...(cached?.data.pixels || []), ...pixels]),
      customConversions: uniqueById([...(cached?.data.customConversions || []), ...customConversions]),
      conversionEvents: CONVERSION_EVENTS,
      defaultAccountId,
      fetchedAt: new Date().toISOString(),
    };

    setupOptionsCache.set(cacheKey, { at: Date.now(), data: options });
    return NextResponse.json(options);
  } catch (err) {
    if (cached) {
      return NextResponse.json({ ...cached.data, cached: true, stale: true });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch campaign setup options';
    return NextResponse.json({ ...baseOptions, stale: true, warning: message });
  }
}
