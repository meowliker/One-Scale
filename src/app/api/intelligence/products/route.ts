import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getProductIntelligence, setManualClassification } from '@/lib/intelligence/productIntelligence';
import type { ProductClassificationType } from '@/lib/intelligence/types';

/**
 * GET /api/intelligence/products?storeId=xxx
 *
 * Get all product intelligence data for a store.
 */
export async function GET(request: NextRequest) {
  const storeId = request.nextUrl.searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const products = await getProductIntelligence(storeId);
    return NextResponse.json({ data: products });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH /api/intelligence/products
 *
 * Set manual classification override for a product.
 * Body: { storeId, productId, classification }
 */
export async function PATCH(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const body = await request.json() as {
    storeId?: string;
    productId?: string;
    classification?: ProductClassificationType;
  };

  if (!body.storeId || !body.productId || !body.classification) {
    return NextResponse.json({ error: 'storeId, productId, and classification required' }, { status: 400 });
  }

  const validClassifications: ProductClassificationType[] = [
    'main', 'upsell', 'downsell', 'bundle', 'subscription', 'gift', 'unknown',
  ];
  if (!validClassifications.includes(body.classification)) {
    return NextResponse.json({ error: `Invalid classification. Must be one of: ${validClassifications.join(', ')}` }, { status: 400 });
  }

  try {
    await setManualClassification(body.storeId, body.productId, body.classification);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
