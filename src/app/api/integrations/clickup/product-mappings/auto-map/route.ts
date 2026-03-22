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

interface ClickUpList {
  id: string;
  name: string;
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

// Normalize string for matching (lowercase, remove special chars)
function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Calculate similarity score between two strings (0-1)
function similarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  
  if (normA === normB) return 1;
  if (normA.includes(normB) || normB.includes(normA)) return 0.8;
  
  // Check for word overlap
  const wordsA = a.toLowerCase().split(/\s+/);
  const wordsB = b.toLowerCase().split(/\s+/);
  const commonWords = wordsA.filter((w) => wordsB.some((wb) => wb.includes(w) || w.includes(wb)));
  
  if (commonWords.length > 0) {
    return 0.5 + (commonWords.length / Math.max(wordsA.length, wordsB.length)) * 0.3;
  }
  
  return 0;
}

// POST — auto-map products to ClickUp lists based on name matching
export async function POST(request: NextRequest) {
  let body: { storeId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
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
  const token = clickupRow.access_token;
  const listIds = meta.listIds || [];

  if (listIds.length === 0) {
    return NextResponse.json({ error: 'No ClickUp lists configured' }, { status: 400 });
  }

  // Fetch list details from ClickUp
  const lists: ClickUpList[] = [];
  await Promise.all(
    listIds.map(async (listId) => {
      try {
        const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}`, {
          headers: { Authorization: token },
        });
        if (res.ok) {
          const data = await res.json() as { id: string; name: string };
          lists.push({ id: data.id, name: data.name });
        }
      } catch {
        // Ignore fetch errors
      }
    })
  );

  // Get products from database
  const db = getDb();
  let products: Array<{ id: string; name: string }> = [];
  
  try {
    const dbProducts = db.prepare(`
      SELECT DISTINCT product_id, product_name 
      FROM pnl_product_costs 
      WHERE store_id = ?
      ORDER BY product_name ASC
    `).all(body.storeId) as Array<{ product_id: string; product_name: string }>;

    if (dbProducts.length > 0) {
      products = dbProducts.map((p) => ({ id: p.product_id, name: p.product_name }));
    }
  } catch {
    // Table might not exist, continue with empty products
  }

  // If no products in pnl_product_costs, try tracking_events
  if (products.length === 0) {
    try {
      const trackingProducts = db.prepare(`
        SELECT DISTINCT 
          json_extract(event_data, '$.product_id') as product_id,
          json_extract(event_data, '$.product_name') as product_name
        FROM tracking_events 
        WHERE store_id = ? 
          AND json_extract(event_data, '$.product_id') IS NOT NULL
        ORDER BY product_name ASC
        LIMIT 100
      `).all(body.storeId) as Array<{ product_id: string; product_name: string }>;

      products = trackingProducts
        .filter((p) => p.product_id && p.product_name)
        .map((p) => ({ id: p.product_id, name: p.product_name }));
    } catch {
      // Table might not exist, continue with empty products
    }
  }

  // If still no products, return success with 0 mapped
  if (products.length === 0) {
    return NextResponse.json({ 
      ok: true, 
      mappedCount: 0,
      totalProducts: 0,
      totalLists: lists.length,
      message: 'No products found to map. Add products via Shopify sync or P&L settings first.',
    });
  }

  // Auto-map products to lists based on name similarity
  const existingMappings = meta.productMappings || [];
  const newMappings: ProductMapping[] = [...existingMappings];
  let mappedCount = 0;

  for (const product of products) {
    // Skip if already mapped
    if (existingMappings.some((m) => m.productId === product.id)) {
      continue;
    }

    // Find best matching list
    let bestMatch: ClickUpList | null = null;
    let bestScore = 0;

    for (const list of lists) {
      const score = similarity(product.name, list.name);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = list;
      }
    }

    if (bestMatch) {
      newMappings.push({
        productId: product.id,
        listId: bestMatch.id,
        listName: bestMatch.name,
      });
      mappedCount++;
    }
  }

  // Save updated mappings
  if (mappedCount > 0) {
    await upsertThirdPartyToken({
      storeId: body.storeId,
      platform: 'clickup',
      accessToken: token,
      metadata: { ...meta, productMappings: newMappings },
    });
  }

  return NextResponse.json({ 
    ok: true, 
    mappedCount,
    totalProducts: products.length,
    totalLists: lists.length,
  });
}
