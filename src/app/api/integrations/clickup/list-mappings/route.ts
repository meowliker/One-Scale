import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken, upsertThirdPartyToken } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  hydrateStoreFromSupabase,
  rest,
  upsertPersistentThirdPartyToken,
} from '@/app/api/lib/supabase-persistence';

interface ListMapping {
  listId: string;
  listName: string;
  productId?: string;
  productName?: string;
}

interface ClickUpMetadata {
  workspaceId?: string;
  workspaceName?: string;
  listId?: string;
  listIds?: string[];
  listNames?: string[];
  readyStatus?: string;
  listMappings?: ListMapping[];
}

interface StoreProduct {
  id: string;
  name: string;
}

// Cache for store products to avoid repeated Supabase calls
const storeProductsCache = new Map<string, { data: StoreProduct[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedStoreProducts(storeId: string): StoreProduct[] | null {
  const cached = storeProductsCache.get(storeId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  return null;
}

function setCachedStoreProducts(storeId: string, products: StoreProduct[]): void {
  storeProductsCache.set(storeId, { data: products, timestamp: Date.now() });
}

// GET — fetch lists with their product assignments and store products
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  // Hydrate from Supabase if needed
  if (isSupabasePersistenceEnabled()) {
    await hydrateStoreFromSupabase(storeId);
  }

  // Get ClickUp connection data
  const clickupRow = getThirdPartyToken(storeId, 'clickup');
  if (!clickupRow) {
    return NextResponse.json({ connected: false });
  }

  const meta: ClickUpMetadata = clickupRow.metadata ? JSON.parse(clickupRow.metadata) : {};
  const listIds = meta.listIds || (meta.listId ? [meta.listId] : []);
  const listNames = meta.listNames || [];
  const listMappings = meta.listMappings || [];

  // Build lists array with assignments
  const lists = listIds.map((id, idx) => {
    const mapping = listMappings.find((m) => m.listId === id);
    return {
      id,
      name: listNames[idx] || id,
      assignedProductId: mapping?.productId,
      assignedProductName: mapping?.productName,
    };
  });

  // Get MAIN products from product_config (same source as P&L Product Performance)
  // This is the source of truth for main products shown in P&L
  // Use cache to avoid repeated Supabase calls
  let storeProducts: StoreProduct[] = getCachedStoreProducts(storeId) || [];

  if (storeProducts.length === 0) {
    try {
      const enc = encodeURIComponent;
      // product_config is the source used by P&L Product Performance
      // is_active=true means it's a main product (not upsell)
      const mainProducts = await rest<Array<{ 
        product_id: string; 
        product_name: string;
      }>>(
        `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id,product_name&order=product_name.asc`
      );

      if (mainProducts && mainProducts.length > 0) {
        storeProducts = mainProducts.map((p) => ({ 
          id: p.product_id, 
          name: p.product_name 
        }));
        setCachedStoreProducts(storeId, storeProducts);
      }
    } catch {
      // Supabase query failed, continue with empty
    }
  }

  return NextResponse.json({
    connected: true,
    workspaceId: meta.workspaceId,
    workspaceName: meta.workspaceName,
    readyStatus: meta.readyStatus || 'ready to launch',
    lists,
    storeProducts,
  });
}

// POST — assign a product to a list
export async function POST(request: NextRequest) {
  let body: { storeId?: string; listId?: string; productId?: string | null; productName?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.storeId || !body.listId) {
    return NextResponse.json({ error: 'storeId and listId required' }, { status: 400 });
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
  const listMappings = meta.listMappings || [];
  const listNames = meta.listNames || [];
  const listIds = meta.listIds || [];

  // Find the list name
  const listIdx = listIds.indexOf(body.listId);
  const listName = listIdx >= 0 ? listNames[listIdx] : body.listId;

  // Update or add the mapping
  const existingIndex = listMappings.findIndex((m) => m.listId === body.listId);
  
  if (body.productId) {
    // Assign product
    const newMapping: ListMapping = {
      listId: body.listId,
      listName,
      productId: body.productId,
      productName: body.productName || undefined,
    };

    if (existingIndex >= 0) {
      listMappings[existingIndex] = newMapping;
    } else {
      listMappings.push(newMapping);
    }
  } else {
    // Unassign product
    if (existingIndex >= 0) {
      listMappings.splice(existingIndex, 1);
    }
  }

  // Save updated metadata to SQLite
  upsertThirdPartyToken({
    storeId: body.storeId,
    platform: 'clickup',
    accessToken: clickupRow.access_token,
    metadata: { ...meta, listMappings },
  });

  // Also persist to Supabase if enabled
  if (isSupabasePersistenceEnabled()) {
    await upsertPersistentThirdPartyToken({
      storeId: body.storeId,
      platform: 'clickup',
      accessToken: clickupRow.access_token,
      metadata: { ...meta, listMappings },
    });
  }

  return NextResponse.json({ ok: true });
}

// DELETE — remove a list from the connection
export async function DELETE(request: NextRequest) {
  let body: { storeId?: string; listId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.storeId || !body.listId) {
    return NextResponse.json({ error: 'storeId and listId required' }, { status: 400 });
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
  
  // Remove from listIds and listNames
  const listIds = meta.listIds || [];
  const listNames = meta.listNames || [];
  const listMappings = meta.listMappings || [];

  const listIdx = listIds.indexOf(body.listId);
  if (listIdx >= 0) {
    listIds.splice(listIdx, 1);
    listNames.splice(listIdx, 1);
  }

  // Remove from listMappings
  const mappingIdx = listMappings.findIndex((m) => m.listId === body.listId);
  if (mappingIdx >= 0) {
    listMappings.splice(mappingIdx, 1);
  }

  // Save updated metadata to SQLite
  upsertThirdPartyToken({
    storeId: body.storeId,
    platform: 'clickup',
    accessToken: clickupRow.access_token,
    metadata: { ...meta, listIds, listNames, listMappings },
  });

  // Also persist to Supabase if enabled
  if (isSupabasePersistenceEnabled()) {
    await upsertPersistentThirdPartyToken({
      storeId: body.storeId,
      platform: 'clickup',
      accessToken: clickupRow.access_token,
      metadata: { ...meta, listIds, listNames, listMappings },
    });
  }

  return NextResponse.json({ ok: true });
}
