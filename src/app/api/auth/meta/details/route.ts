import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { getConnection, getStoreAdAccounts } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  getPersistentConnection,
  listPersistentStoreAdAccounts,
} from '@/app/api/lib/supabase-persistence';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

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

/**
 * Fetch all pages of a paginated Graph API endpoint
 */
async function fetchAllPages<T>(url: string): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const response: Response = await fetch(nextUrl);
    if (!response.ok) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: { data?: T[]; paging?: { next?: string } } = await response.json() as any;
    if (data.data) {
      items.push(...data.data);
    }
    nextUrl = data.paging?.next || null;
  }

  return items;
}

/**
 * GET /api/auth/meta/details?storeId=xxx
 * Returns the connected Meta user info, businesses, and ALL ad accounts
 * (personal + from every Business Manager the user has access to).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not connected to Meta' }, { status: 401 });
  }

  const sb = isSupabasePersistenceEnabled();
  const conn = sb ? await getPersistentConnection(storeId, 'meta') : getConnection(storeId, 'meta');
  const at = token.accessToken;

  const adAccountFields = 'id,name,account_id,currency,timezone_name,account_status,amount_spent,business{id,name}';

  try {
    // Step 1: Fetch user info, businesses, and personal ad accounts in parallel
    const [userRes, bizRes, personalAccounts] = await Promise.all([
      fetch(`${GRAPH_BASE}/me?fields=id,name,email&access_token=${at}`),
      fetch(`${GRAPH_BASE}/me/businesses?fields=id,name&limit=100&access_token=${at}`),
      fetchAllPages<MetaAdAccountRaw>(
        `${GRAPH_BASE}/me/adaccounts?fields=${adAccountFields}&limit=100&access_token=${at}`
      ),
    ]);

    let user: MetaUserInfo | null = null;
    let businesses: MetaBusinessInfo[] = [];

    if (userRes.ok) {
      user = await userRes.json();
    }

    if (bizRes.ok) {
      const bizData = await bizRes.json();
      businesses = bizData.data || [];
    }

    // Step 2: For each Business Manager, fetch their ad accounts
    // This gets ad accounts that are owned by the BM (not just personal ones)
    const bmAccountPromises = businesses.map((biz) =>
      fetchAllPages<MetaAdAccountRaw>(
        `${GRAPH_BASE}/${biz.id}/owned_ad_accounts?fields=${adAccountFields}&limit=100&access_token=${at}`
      ).catch(() => [] as MetaAdAccountRaw[])
    );

    // Also fetch client ad accounts from each BM
    const bmClientAccountPromises = businesses.map((biz) =>
      fetchAllPages<MetaAdAccountRaw>(
        `${GRAPH_BASE}/${biz.id}/client_ad_accounts?fields=${adAccountFields}&limit=100&access_token=${at}`
      ).catch(() => [] as MetaAdAccountRaw[])
    );

    const [bmOwnedResults, bmClientResults] = await Promise.all([
      Promise.all(bmAccountPromises),
      Promise.all(bmClientAccountPromises),
    ]);

    // Step 3: Merge all ad accounts and deduplicate by ID
    const allAccountsMap = new Map<string, MetaAdAccountRaw>();

    // Add personal accounts
    for (const acc of personalAccounts) {
      allAccountsMap.set(acc.id, acc);
    }

    // Add BM owned accounts
    for (const bmAccounts of bmOwnedResults) {
      for (const acc of bmAccounts) {
        if (!allAccountsMap.has(acc.id)) {
          allAccountsMap.set(acc.id, acc);
        }
      }
    }

    // Add BM client accounts
    for (const bmAccounts of bmClientResults) {
      for (const acc of bmAccounts) {
        if (!allAccountsMap.has(acc.id)) {
          allAccountsMap.set(acc.id, acc);
        }
      }
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
      connectedAt: conn?.connected_at,
      lastSynced: conn?.last_synced,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Meta details';
    return NextResponse.json({ error: message }, { status: 500 });
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
