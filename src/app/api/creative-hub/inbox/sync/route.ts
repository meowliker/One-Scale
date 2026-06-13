import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken, upsertThirdPartyToken } from '@/app/api/lib/db';
import { getProductProfiles } from '@/app/api/lib/creative-hub-db';
import {
  isSupabasePersistenceEnabled,
  getPersistentThirdPartyToken,
  hydrateStoreFromSupabase,
} from '@/app/api/lib/supabase-persistence';

/** Resolve ClickUp token, hydrating from Supabase on Vercel if needed */
async function getClickUpToken(storeId: string) {
  if (isSupabasePersistenceEnabled()) {
    await hydrateStoreFromSupabase(storeId);
    const row = getThirdPartyToken(storeId, 'clickup');
    if (row) return row;
    const persistent = await getPersistentThirdPartyToken(storeId, 'clickup');
    if (persistent) {
      upsertThirdPartyToken({
        storeId,
        platform: 'clickup',
        accessToken: persistent.access_token,
        metadata: persistent.metadata
          ? (JSON.parse(persistent.metadata) as Record<string, unknown>)
          : undefined,
      });
      return getThirdPartyToken(storeId, 'clickup');
    }
    return null;
  }
  return getThirdPartyToken(storeId, 'clickup');
}

/**
 * POST /api/creative-hub/inbox/sync?storeId=X
 *
 * Triggers a fresh sync from ClickUp by fetching tasks from all mapped
 * product profile ClickUp lists and returning the updated creatives list.
 * Delegates to the GET /api/creative-hub/inbox endpoint internally.
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';
  const productId = searchParams.get('productId') || '';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  // Verify ClickUp is connected (with Supabase hydration for Vercel)
  const row = await getClickUpToken(storeId);
  if (!row) {
    return NextResponse.json(
      { error: 'ClickUp not connected', notConnected: true },
      { status: 200 }
    );
  }

  // Verify at least one profile has a ClickUp list
  const profiles = await getProductProfiles(storeId);
  const hasClickupList = profiles.some((p) => p.clickupListId);
  if (!hasClickupList) {
    return NextResponse.json(
      { error: 'No product profiles have a ClickUp list configured', notConfigured: true },
      { status: 200 }
    );
  }

  // Perform fresh fetch by calling our own inbox GET endpoint
  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    storeId,
    refresh: '1',
  });
  if (productId) params.set('productId', productId);
  const inboxUrl = `${origin}/api/creative-hub/inbox?${params.toString()}`;
  const authorization = request.headers.get('authorization') || '';

  try {
    const res = await fetch(inboxUrl, {
      method: 'GET',
      headers: {
        cookie: request.headers.get('cookie') || '',
        ...(authorization ? { authorization } : {}),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Sync failed: ${text}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as { creatives: unknown[]; cacheMeta?: unknown };

    return NextResponse.json({
      creatives: data.creatives,
      cacheMeta: data.cacheMeta,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
