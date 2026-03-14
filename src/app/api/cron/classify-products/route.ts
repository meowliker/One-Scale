import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import { classifyAllProducts } from '@/lib/intelligence/classificationRouter';
import { extractAllProductBehaviors } from '@/lib/intelligence/behaviorExtractor';
import { buildStoreProfile } from '@/lib/intelligence/storeProfiler';
import { classifyAllProducts as behavioralClassify } from '@/lib/intelligence/relativeClassifier';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CRON_NAME = 'classify-products';

async function logCron(
  storeId: string,
  status: string,
  rowsProcessed: number,
  error: string | null,
  durationMs: number,
) {
  try {
    await rest('/cron_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cron_name: CRON_NAME,
        store_id: storeId,
        status,
        rows_processed: rowsProcessed,
        error,
        duration_ms: durationMs,
        created_at: new Date().toISOString(),
      }),
    });
  } catch { /* don't let logging failures break the cron */ }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const stores = await listPersistentStores();
  const results: Array<{ storeId: string; status: string; classified?: number; needsReview?: number; error?: string }> = [];

  for (const store of stores) {
    const start = Date.now();
    try {
      // Check if re-classification is due
      const intel = await rest<Array<{ store_type_detected_at: string; created_at: string }>>(
        `/store_intelligence?store_id=eq.${encodeURIComponent(store.id)}&select=store_type_detected_at,created_at`
      ).catch(() => []);

      const row = intel[0];
      if (row?.store_type_detected_at) {
        const lastRun = new Date(row.store_type_detected_at).getTime();
        const storeAge = Date.now() - new Date(row.created_at).getTime();
        const isYoung = storeAge < 90 * 86400000; // < 90 days
        const interval = isYoung ? 7 * 86400000 : 30 * 86400000;
        if (Date.now() - lastRun < interval) {
          results.push({ storeId: store.id, status: 'skipped' });
          continue;
        }
      }

      const result = await classifyAllProducts(store.id);

      // Run behavioral classification (relative signals engine)
      let behavioralCount = 0;
      try {
        const behaviors = await extractAllProductBehaviors(store.id);
        if (behaviors.length > 0) {
          const storeProfile = await buildStoreProfile(store.id, behaviors);

          // Get manual overrides
          const stored = await rest<Array<{ product_id: string; classification: string; manual_override: boolean }>>(
            `/product_classifications?store_id=eq.${encodeURIComponent(store.id)}&select=product_id,classification,manual_override`
          ).catch(() => []);
          const manualOverrides = new Map<string, string>();
          for (const sc of stored) {
            if (sc.manual_override) manualOverrides.set(sc.product_id, sc.classification);
          }

          const behavioralResults = behavioralClassify(behaviors, storeProfile, manualOverrides, new Map());
          behavioralCount = behavioralResults.length;

          // Persist store profile
          await rest(`/store_behavior_profiles?on_conflict=store_id`, {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify({ ...storeProfile }),
          }).catch(() => null);

          // Persist product behaviors
          for (const b of behaviors) {
            await rest(`/product_behaviors?on_conflict=store_id,product_id`, {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify({
                store_id: b.store_id, product_id: b.product_id, product_title: b.product_title,
                total_orders: b.total_orders, alone_orders: b.alone_orders, alone_rate: b.alone_rate,
                first_position_orders: b.first_position_orders, first_rate: b.first_rate,
                avg_position: b.avg_position, total_revenue: b.total_revenue,
                revenue_share: b.revenue_share, avg_order_value_with: b.avg_order_value_with,
                avg_order_value_without: b.avg_order_value_without, co_occurrence_rate: b.co_occurrence_rate,
                value_lift: b.value_lift, top_companions: b.top_companions,
                first_seen: b.first_seen, last_seen: b.last_seen, active_days: b.active_days,
                computed_at: new Date().toISOString(),
              }),
            }).catch(() => null);
          }

          // Persist behavioral classifications (skip manual overrides)
          for (const r of behavioralResults) {
            if (r.method === 'manual_override') continue;
            await rest(`/product_classifications?on_conflict=store_id,product_id`, {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify({
                store_id: store.id, product_id: r.product_id, product_title: r.product_title,
                classification: r.classification, confidence: r.confidence,
                classification_method: r.method, behavioral_signals: r.signals,
                parent_product: r.parent_product, needs_review: r.needs_review,
                manual_override: false, last_analyzed: new Date().toISOString(),
              }),
            }).catch(() => null);
          }
        }
      } catch (e) {
        console.warn(`[classify-products] Behavioral classification failed for ${store.id}:`, e instanceof Error ? e.message : e);
      }

      await logCron(store.id, 'completed', result.classified + behavioralCount, null, Date.now() - start);
      results.push({
        storeId: store.id,
        status: 'completed',
        classified: result.classified + behavioralCount,
        needsReview: result.needsReview,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await logCron(store.id, 'failed', 0, msg, Date.now() - start);
      results.push({ storeId: store.id, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}
