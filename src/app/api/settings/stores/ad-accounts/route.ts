import { NextRequest, NextResponse } from 'next/server';
import {
  getStoreAdAccounts,
  addStoreAdAccount,
  removeStoreAdAccount,
  toggleStoreAdAccount,
  getStore,
} from '@/app/api/lib/db';
import {
  deletePersistentStoreAdAccount,
  isSupabasePersistenceEnabled,
  listPersistentStoreAdAccounts,
  togglePersistentStoreAdAccount,
  upsertPersistentStoreAdAccount,
} from '@/app/api/lib/supabase-persistence';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    const accounts = isSupabasePersistenceEnabled()
      ? await listPersistentStoreAdAccounts(storeId)
      : getStoreAdAccounts(storeId);
    return NextResponse.json({
      accounts: accounts.map((a) => ({
        id: a.ad_account_id,
        name: a.ad_account_name,
        platform: a.platform,
        accountId: a.ad_account_id,
        currency: a.currency || 'USD',
        timezone: a.timezone || 'UTC',
        isActive: a.is_active === 1,
        createdAt: a.created_at,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, adAccountId, adAccountName, platform, currency, timezone } = body as {
      storeId?: string;
      adAccountId?: string;
      adAccountName?: string;
      platform?: string;
      currency?: string;
      timezone?: string;
    };

    if (!storeId || !adAccountId || !adAccountName) {
      return NextResponse.json(
        { error: 'storeId, adAccountId, and adAccountName are required' },
        { status: 400 }
      );
    }

    // Verify store exists
    const store = getStore(storeId);
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const account = addStoreAdAccount({
      storeId,
      adAccountId,
      adAccountName,
      platform: platform || 'meta',
      currency,
      timezone,
    });

    if (isSupabasePersistenceEnabled()) {
      await upsertPersistentStoreAdAccount({
        storeId,
        adAccountId,
        adAccountName,
        platform: platform || 'meta',
        currency,
        timezone,
      });
    }

    return NextResponse.json({
      account: {
        id: account.ad_account_id,
        name: account.ad_account_name,
        platform: account.platform,
        accountId: account.ad_account_id,
        currency: account.currency || 'USD',
        timezone: account.timezone || 'UTC',
        isActive: account.is_active === 1,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, adAccountId } = body as {
      storeId?: string;
      adAccountId?: string;
    };

    if (!storeId || !adAccountId) {
      return NextResponse.json(
        { error: 'storeId and adAccountId are required' },
        { status: 400 }
      );
    }

    removeStoreAdAccount(storeId, adAccountId);
    if (isSupabasePersistenceEnabled()) {
      await deletePersistentStoreAdAccount(storeId, adAccountId);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, adAccountId, isActive } = body as {
      storeId?: string;
      adAccountId?: string;
      isActive?: boolean;
    };

    if (!storeId || !adAccountId || typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'storeId, adAccountId, and isActive (boolean) are required' },
        { status: 400 }
      );
    }

    toggleStoreAdAccount(storeId, adAccountId, isActive);
    if (isSupabasePersistenceEnabled()) {
      await togglePersistentStoreAdAccount(storeId, adAccountId, isActive);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
