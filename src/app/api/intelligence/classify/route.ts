import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { classifyAllProducts } from '@/lib/intelligence/classificationRouter';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/intelligence/classify?storeId=xxx
 * Triggers full product classification for a store.
 */
export async function POST(request: NextRequest) {
  const storeId = new URL(request.url).searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const result = await classifyAllProducts(storeId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
