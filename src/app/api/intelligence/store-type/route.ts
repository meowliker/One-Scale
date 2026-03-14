import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { detectStoreType } from '@/lib/intelligence/storeTypeDetector';
import { getStoreIntelligence } from '@/lib/intelligence/storeIntelligence';

export const dynamic = 'force-dynamic';

/**
 * GET /api/intelligence/store-type?storeId=xxx
 * Returns store intelligence including detected store type.
 */
export async function GET(request: NextRequest) {
  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  let intel = await getStoreIntelligence(storeId);
  if (!intel) {
    await detectStoreType(storeId);
    intel = await getStoreIntelligence(storeId);
  }
  return NextResponse.json({ ok: true, data: intel });
}

/**
 * POST /api/intelligence/store-type?storeId=xxx
 * Sets merchant_confirmed_type. Permanently overrides auto-detection.
 */
export async function POST(request: NextRequest) {
  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const body = await request.json();
  const { merchantConfirmedType } = body as { merchantConfirmedType: string };

  const validTypes = ['single_product', 'funnel', 'general', 'subscription', 'mixed'];
  if (!validTypes.includes(merchantConfirmedType)) {
    return NextResponse.json({ error: 'Invalid store type' }, { status: 400 });
  }

  const enc = (v: string) => encodeURIComponent(v);
  await rest(
    '/store_intelligence?on_conflict=store_id',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([{
        store_id: storeId,
        merchant_confirmed_type: merchantConfirmedType,
        updated_at: new Date().toISOString(),
      }]),
    }
  );

  return NextResponse.json({ ok: true });
}
