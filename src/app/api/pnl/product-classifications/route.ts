import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

interface ClassificationRow {
  product_id: string;
  classification: string;
  confidence: number;
  classification_method: string;
  manual_override: boolean;
  needs_review: boolean;
  last_analyzed: string;
}

/**
 * GET /api/pnl/product-classifications?storeId=xxx
 *
 * Returns all product classifications for a store.
 */
export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 });
    }

    if (!isSupabasePersistenceEnabled()) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }

    const classifications = await rest<ClassificationRow[]>(
      `/product_classifications?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,classification,confidence,classification_method,manual_override,needs_review,last_analyzed`
    ).catch(() => [] as ClassificationRow[]);

    return NextResponse.json({
      classifications: classifications ?? [],
      count: classifications?.length ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[product-classifications] Error:', message);
    return NextResponse.json(
      { error: 'Internal server error', details: message, classifications: [], count: 0 },
      { status: 500 },
    );
  }
}
