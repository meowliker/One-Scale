import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { getConnection, getStoreAdAccounts } from '@/app/api/lib/db';
import { canWorkspaceAccessStore } from '@/app/api/lib/auth-users';
import {
  isSupabasePersistenceEnabled,
  getPersistentConnection,
  listPersistentStoreAdAccounts,
} from '@/app/api/lib/supabase-persistence';
import { readSessionFromRequest } from '@/lib/auth/request-session';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const META_FETCH_TIMEOUT_MS = 6_000;
const META_PAGE_LIMIT = 5;

interface MetaUserInfo {
  id: string;
  name: string;
  email?: string;
}

interface MetaBusinessInfo {
  id: string;
  name: string;
}

interface MetaAdAccountRaw {
  id: string;
  name: string;
  account_id: string;
  currency: string;
  timezone_name: string;
  account_status: number;
  amount_spent: string;
  business?: { id: string; name: string };
}

class MetaGraphError extends Error {
  constructor(message: string, public status: number, public code?: number) {
    super(message);
  }
}

function parseMetaError(label: string, status: number, body: string): MetaGraphError {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: number; error_user_msg?: string; error_user_title?: string };
    };
    const fbError = parsed.error;
    if (fbError?.code === 190) {
      return new MetaGraphError('Meta connection expired or was revoked. Please reconnect Meta Ads.', 401, fbError.code);
    }
    const message = fbError?.error_user_msg || fbError?.message || body || `HTTP ${status}`;
    return new MetaGraphError(`${label} failed: ${message}`, status, fbError?.code);
  } catch {
    return new MetaGraphError(`${label} failed: ${body || `HTTP ${status}`}`, status);
  }
}

async function fetchGraphJson<T>(url: string, label: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    const text = await response.text();
    if (!response.ok) {
      throw parseMetaError(label, response.status, text);
    }
    return text ? JSON.parse(text) as T : {} as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new MetaGraphError(`${label} timed out. Try refreshing or reconnecting Meta Ads.`, 504);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAllPages<T>(url: string, label: string): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | null = url;
  let pageCount = 0;

  while (nextUrl && pageCount < META_PAGE_LIMIT) {
    const pageUrl = nextUrl;
    const data: { data?: T[]; paging?: { next?: string } } = await fetchGraphJson(pageUrl, label);
    if (data.data) {
      items.push(...data.data);
    }
    nextUrl = data.paging?.next || null;
    pageCount += 1;
  }

  return items;
}

/**
 * GET /api/auth/meta/details?storeId=xxx
 * Returns the connected Meta user info, businesses, and accessible ad accounts.
 */
export async function GET(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session.authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  if (!session.legacy && session.workspaceId && !(await canWorkspaceAccessStore(session.workspaceId, storeId))) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not connected to Meta' }, { status: 401 });
  }

  const sb = isSupabasePersistenceEnabled();
  const conn = sb ? await getPersistentConnection(storeId, 'meta') : getConnection(storeId, 'meta');
  const at = token.accessToken;

  const adAccountFields = 'id,name,account_id,currency,timezone_name,account_status,amount_spent,business{id,name}';
  const tokenParam = encodeURIComponent(at);

  try {
    // /me/adaccounts returns the ad accounts this user can access, including
    // business info. Avoid per-business fan-out, which can time out on Vercel.
    const [user, businessData, personalAccounts] = await Promise.all([
      fetchGraphJson<MetaUserInfo>(`${GRAPH_BASE}/me?fields=id,name,email&access_token=${tokenParam}`, 'Meta user'),
      fetchGraphJson<{ data?: MetaBusinessInfo[] }>(
        `${GRAPH_BASE}/me/businesses?fields=id,name&limit=100&access_token=${tokenParam}`,
        'Meta businesses'
      ).catch(() => ({ data: [] as MetaBusinessInfo[] })),
      fetchAllPages<MetaAdAccountRaw>(
        `${GRAPH_BASE}/me/adaccounts?fields=${encodeURIComponent(adAccountFields)}&limit=100&access_token=${tokenParam}`,
        'Meta ad accounts'
      ),
    ]);

    const businesses = businessData.data || [];
    const allAccountsMap = new Map<string, MetaAdAccountRaw>();

    for (const acc of personalAccounts) {
      allAccountsMap.set(acc.id, acc);
    }

    const allAccounts = Array.from(allAccountsMap.values());

    // Get selected ad accounts from store_ad_accounts table
    const selectedAdAccounts = sb
      ? await listPersistentStoreAdAccounts(storeId)
      : getStoreAdAccounts(storeId);

    return NextResponse.json({
      connected: true,
      user,
      businesses,
      adAccounts: allAccounts.map((acc) => ({
        id: acc.id,
        name: acc.name,
        accountId: acc.account_id,
        currency: acc.currency,
        timezone: acc.timezone_name,
        status: acc.account_status,
        statusLabel: getStatusLabel(acc.account_status),
        amountSpent: acc.amount_spent,
        business: acc.business || null,
      })),
      // Return all linked ad accounts from the store_ad_accounts table
      selectedAccounts: selectedAdAccounts
        .filter((a) => a.platform === 'meta')
        .map((a) => ({ id: a.ad_account_id, name: a.ad_account_name })),
      connectedAt: conn?.connected_at ?? null,
      lastSynced: conn?.last_synced ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Meta details';
    const status = err instanceof MetaGraphError && [401, 504].includes(err.status) ? err.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function getStatusLabel(status: number): string {
  switch (status) {
    case 1: return 'Active';
    case 2: return 'Disabled';
    case 3: return 'Unsettled';
    case 7: return 'Pending Review';
    case 9: return 'Grace Period';
    case 100: return 'Pending Closure';
    case 101: return 'Closed';
    default: return 'Unknown';
  }
}
