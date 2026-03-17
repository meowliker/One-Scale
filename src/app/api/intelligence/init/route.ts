import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { initializeStore } from '@/lib/intelligence/storeIntelligence';

/**
 * POST /api/intelligence/init
 *
 * Initialize store intelligence. Call after Shopify connects.
 * Runs all intelligence modules: product classification, fee detection,
 * campaign mapping, COGS suggestions, currency detection.
 *
 * Body: { storeId: string }
 */
export async function POST(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const body = await request.json() as { storeId?: string };
  if (!body.storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  if (!baseUrl) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_BASE_URL not configured' }, { status: 500 });
  }

  try {
    const result = await initializeStore(body.storeId, baseUrl);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
