import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { recordCorrection } from '@/lib/intelligence/platformLearning';

export const dynamic = 'force-dynamic';

/**
 * GET /api/intelligence/classifications?storeId=xxx
 * Returns all product classifications for a store.
 */
export async function GET(request: NextRequest) {
  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const enc = (v: string) => encodeURIComponent(v);
  const rows = await rest<Array<Record<string, unknown>>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&select=*&order=revenue_share.desc.nullslast`
  ).catch(() => []);

  return NextResponse.json({ ok: true, data: rows });
}

/**
 * PATCH /api/intelligence/classifications?storeId=xxx
 * Update a single product's classification (manual override — permanent).
 */
export async function PATCH(request: NextRequest) {
  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const body = await request.json();
  const { productId, classification, userEmail, previousClassification, signals } = body as {
    productId: string;
    classification: string;
    userEmail?: string;
    previousClassification?: string;
    signals?: Record<string, unknown>;
  };

  if (!productId || !classification) {
    return NextResponse.json({ error: 'productId and classification required' }, { status: 400 });
  }

  const validClassifications = ['main', 'upsell', 'bundle', 'excluded', 'pending', 'unknown'];
  if (!validClassifications.includes(classification)) {
    return NextResponse.json({ error: 'Invalid classification' }, { status: 400 });
  }

  const enc = (v: string) => encodeURIComponent(v);
  await rest(
    `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(productId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        classification,
        manual_override: true,
        manual_override_by: userEmail || null,
        manual_override_at: new Date().toISOString(),
        needs_review: false,
        classification_method: 'manual',
        detection_method: 'manual',
        updated_at: new Date().toISOString(),
      }),
    }
  );

  // Also update product_intelligence table if it exists
  await rest(
    `/product_intelligence?store_id=eq.${enc(storeId)}&product_id=eq.${enc(productId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        manual_override: true,
        manual_classification: classification,
        updated_at: new Date().toISOString(),
      }),
    }
  ).catch(() => { /* product_intelligence might not have this row */ });

  // Record correction for platform learning
  if (previousClassification && previousClassification !== classification) {
    await recordCorrection(
      storeId,
      productId,
      previousClassification,
      classification,
      signals || {}
    ).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
