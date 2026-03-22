import { NextRequest, NextResponse } from 'next/server';
import { getDb, getThirdPartyToken, upsertThirdPartyToken } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  hydrateStoreFromSupabase,
} from '@/app/api/lib/supabase-persistence';

interface ProductMapping {
  productId: string;
  listId: string;
  listName: string;
}

interface ClickUpMetadata {
  workspaceId?: string;
  workspaceName?: string;
  listId?: string;
  listIds?: string[];
  listNames?: string[];
  readyStatus?: string;
  productMappings?: ProductMapping[];
}

interface StoreProduct {
  id: string;
  name: string;
  image?: string;
  linkedListId?: string;
  linkedListName?: string;
}

// GET — fetch products with their ClickUp list mappings
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
  const meta: ClickUpMetadata = clickupRow?.metadata ? JSON.parse(clickupRow.metadata) : {};
  const productMappings = meta.productMappings || [];

  // Get products from pnl_product_costs table (these are the store's products)
  const db = getDb();
  const dbProducts = db.prepare(`
    SELECT DISTINCT product_id, product_name 
    FROM pnl_product_costs 
    WHERE store_id = ?
    ORDER BY product_name ASC
  `).all(storeId) as Array<{ product_id: string; product_name: string }>;

  // If no products in pnl_product_costs, try to get from Shopify orders
  let products: StoreProduct[] = [];

  if (dbProducts.length > 0) {
    products = dbProducts.map((p) => {
      const mapping = productMappings.find((m) => m.productId === p.product_id);
      return {
        id: p.product_id,
        name: p.product_name,
        linkedListId: mapping?.listId,
        linkedListName: mapping?.listName,
      };
    });
  } else {
    // Try to get unique products from tracking_events or orders
    const trackingProducts = db.prepare(`
      SELECT DISTINCT 
        json_extract(event_data, '$.product_id') as product_id,
        json_extract(event_data, '$.product_name') as product_name
      FROM tracking_events 
      WHERE store_id = ? 
        AND json_extract(event_data, '$.product_id') IS NOT NULL
      ORDER BY product_name ASC
      LIMIT 100
    `).all(storeId) as Array<{ product_id: string; product_name: string }>;

    products = trackingProducts
      .filter((p) => p.product_id && p.product_name)
      .map((p) => {
        const mapping = productMappings.find((m) => m.productId === p.product_id);
        return {
          id: p.product_id,
          name: p.product_name,
          linkedListId: mapping?.listId,
          linkedListName: mapping?.listName,
        };
      });
  }

  return NextResponse.json({ products });
}

// POST — link a product to a ClickUp list
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    storeId?: string;
    productId?: string;
    listId?: string;
    listName?: string;
  };

  if (!body.storeId || !body.productId || !body.listId) {
    return NextResponse.json({ error: 'storeId, productId, and listId required' }, { status: 400 });
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
  const productMappings = meta.productMappings || [];

  // Update or add the mapping
  const existingIndex = productMappings.findIndex((m) => m.productId === body.productId);
  if (existingIndex >= 0) {
    productMappings[existingIndex] = {
      productId: body.productId,
      listId: body.listId,
      listName: body.listName || body.listId,
    };
  } else {
    productMappings.push({
      productId: body.productId,
      listId: body.listId,
      listName: body.listName || body.listId,
    });
  }

  // Also ensure this list is in the listIds array
  const listIds = meta.listIds || [];
  if (!listIds.includes(body.listId)) {
    listIds.push(body.listId);
  }

  const listNames = meta.listNames || [];
  if (body.listName && !listNames.includes(body.listName)) {
    listNames.push(body.listName);
  }

  // Save updated metadata
  await upsertThirdPartyToken({
    storeId: body.storeId,
    platform: 'clickup',
    accessToken: clickupRow.access_token,
    metadata: { ...meta, productMappings, listIds, listNames },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — unlink a product from its ClickUp list
export async function DELETE(request: NextRequest) {
  const body = await request.json() as {
    storeId?: string;
    productId?: string;
  };

  if (!body.storeId || !body.productId) {
    return NextResponse.json({ error: 'storeId and productId required' }, { status: 400 });
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
  const productMappings = (meta.productMappings || []).filter(
    (m) => m.productId !== body.productId
  );

  // Save updated metadata
  await upsertThirdPartyToken({
    storeId: body.storeId,
    platform: 'clickup',
    accessToken: clickupRow.access_token,
    metadata: { ...meta, productMappings },
  });

  return NextResponse.json({ ok: true });
}
