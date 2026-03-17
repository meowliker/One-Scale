/**
 * POST /api/admin/master-classify?storeId=xxx
 * Authorization: Bearer {CRON_SECRET}
 *
 * Run the master classification engine for a specific store.
 * Returns detailed signal breakdown for each product.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled, listPersistentStores } from '@/app/api/lib/supabase-persistence';
import { masterClassifyAll, fetchProductSignals } from '@/lib/intelligence/masterClassifier';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const requestedStoreId = new URL(request.url).searchParams.get('storeId');

  const stores = requestedStoreId
    ? [{ id: requestedStoreId, name: requestedStoreId }]
    : await listPersistentStores();

  const results: Array<{
    store: string;
    storeId: string;
    status: string;
    products?: number;
    breakdown?: Record<string, number>;
    details?: Array<{
      product_id: string;
      title: string;
      classification: string;
      confidence: number;
      score: number;
      method: string;
      signals: string[];
    }>;
    rawSignals?: Array<{
      product_id: string;
      title: string;
      avg_price: number;
      alone_rate: number;
      revenue_share: number;
      price_gap_class: string;
      total_orders: number;
    }>;
    error?: string;
  }> = [];

  for (const store of stores) {
    try {
      // Fetch raw signals for debugging
      const rawSignals = await fetchProductSignals(store.id);

      // Run master classifier
      const classResults = await masterClassifyAll(store.id);

      // Build breakdown
      const breakdown: Record<string, number> = {};
      for (const r of classResults) {
        breakdown[r.classification] = (breakdown[r.classification] ?? 0) + 1;
      }

      results.push({
        store: store.name ?? store.id,
        storeId: store.id,
        status: rawSignals.length > 0 ? 'success' : 'no_signals',
        products: classResults.length,
        breakdown,
        details: classResults.map(r => ({
          product_id: r.product_id,
          title: r.product_title,
          classification: r.classification,
          confidence: r.confidence,
          score: r.score,
          method: r.method,
          signals: r.signals,
        })),
        rawSignals: rawSignals.slice(0, 20).map(s => ({
          product_id: s.product_id,
          title: s.title,
          avg_price: s.avg_price,
          alone_rate: s.alone_rate,
          revenue_share: s.revenue_share,
          price_gap_class: s.price_gap_class,
          total_orders: Number(s.total_orders),
        })),
      });
    } catch (err) {
      results.push({
        store: store.name ?? store.id,
        storeId: store.id,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    success: true,
    engine: 'master_combined_v1',
    totalStores: results.length,
    results,
  });
}
