/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * OneScale's behavioral intelligence and data infrastructure engine
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
} from '@/app/api/lib/supabase-persistence';
import { classifyAllProducts } from '@/lib/intelligence/classificationRouter';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/intelligence/run-classification
 * Body: { storeId: string }
 *
 * Runs the full behavioral classification pipeline for a store.
 * Requires at least 5 orders in shopify_orders_cache.
 * Manual overrides in product_classifications are never overwritten.
 */
export async function POST(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body: { storeId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const storeId = body.storeId;
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  try {
    // Verify store exists
    const stores = await rest<Array<{ id: string; name: string }>>(
      `/stores?id=eq.${encodeURIComponent(storeId)}&select=id,name&limit=1`
    ).catch(() => []);

    if (stores.length === 0) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Check orders exist — classification needs order data
    const orderRows = await rest<Array<{ shopify_order_id: string }>>(
      `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}&select=shopify_order_id&limit=5`
    ).catch(() => []);

    if (orderRows.length < 5) {
      return NextResponse.json({
        success: false,
        message: 'Not enough orders to classify — need at least 5',
        orderCount: orderRows.length,
      });
    }

    // Run the real behavioral classifier
    const result = await classifyAllProducts(storeId);

    // Confirm results
    const classifications = await rest<Array<{ classification: string }>>(
      `/product_classifications?store_id=eq.${encodeURIComponent(storeId)}&select=classification`
    ).catch(() => []);

    const summary: Record<string, number> = {};
    for (const c of classifications) {
      summary[c.classification] = (summary[c.classification] ?? 0) + 1;
    }

    console.log(
      `[PRISM:Classify] ${stores[0].name}: ${classifications.length} products classified — ${JSON.stringify(summary)}`
    );

    return NextResponse.json({
      success: true,
      storeId,
      storeName: stores[0].name,
      totalClassified: classifications.length,
      needsReview: result.needsReview,
      summary,
    });
  } catch (err) {
    console.error('[PRISM:Classify] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
