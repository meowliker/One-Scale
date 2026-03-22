import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken, upsertThirdPartyToken } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  hydrateStoreFromSupabase,
  upsertPersistentThirdPartyToken,
} from '@/app/api/lib/supabase-persistence';

interface ClickUpMetadata {
  workspaceId?: string;
  workspaceName?: string;
  listId?: string;
  listIds?: string[];
  listNames?: string[];
  readyStatus?: string;
  listMappings?: Array<{ listId: string; listName: string; productId?: string; productName?: string }>;
}

// POST — add a list to the connection
export async function POST(request: NextRequest) {
  let body: { storeId?: string; listId?: string; listName?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.storeId || !body.listId || !body.listName) {
    return NextResponse.json({ error: 'storeId, listId, and listName required' }, { status: 400 });
  }

  // Hydrate from Supabase if needed
  if (isSupabasePersistenceEnabled()) {
    await hydrateStoreFromSupabase(body.storeId);
  }

  const clickupRow = getThirdPartyToken(body.storeId, 'clickup');
  if (!clickupRow) {
    return NextResponse.json({ error: 'ClickUp not connected' }, { status: 400 });
  }

  const meta: ClickUpMetadata = clickupRow.metadata ? JSON.parse(clickupRow.metadata) : {};
  const listIds = meta.listIds || [];
  const listNames = meta.listNames || [];

  // Check if already added
  if (listIds.includes(body.listId)) {
    return NextResponse.json({ error: 'List already added' }, { status: 400 });
  }

  // Add the new list
  listIds.push(body.listId);
  listNames.push(body.listName);

  // Save updated metadata to SQLite
  upsertThirdPartyToken({
    storeId: body.storeId,
    platform: 'clickup',
    accessToken: clickupRow.access_token,
    metadata: { ...meta, listIds, listNames },
  });

  // Also persist to Supabase if enabled
  if (isSupabasePersistenceEnabled()) {
    await upsertPersistentThirdPartyToken({
      storeId: body.storeId,
      platform: 'clickup',
      accessToken: clickupRow.access_token,
      metadata: { ...meta, listIds, listNames },
    });
  }

  return NextResponse.json({ ok: true });
}
