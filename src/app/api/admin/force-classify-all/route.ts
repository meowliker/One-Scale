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

/**
 * POST /api/admin/force-classify-all
 * Authorization: Bearer {CRON_SECRET}
 *
 * Force-runs behavioral classification for ALL existing stores.
 * Synchronous — waits for each store to complete and reports results.
 * Manual overrides are never overwritten.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const stores = await listPersistentStores();
  if (!stores || stores.length === 0) {
    return NextResponse.json({ message: 'No stores found' });
  }

  const results: Array<{
    store: string;
    storeId: string;
    status: string;
    classified?: number;
    needsReview?: number;
    breakdown?: Record<string, number>;
    reason?: string;
    error?: string;
  }> = [];

  for (const store of stores) {
    try {
      // Check how many orders exist
      const orderRows = await rest<Array<{ shopify_order_id: string }>>(
        `/shopify_orders_cache?store_id=eq.${encodeURIComponent(store.id)}&select=shopify_order_id&limit=5`
      ).catch(() => []);

      // Check current classification count
      const existingClassifications = await rest<Array<{ product_id: string }>>(
        `/product_classifications?store_id=eq.${encodeURIComponent(store.id)}&select=product_id`
      ).catch(() => []);

      console.log(
        `[ForceClassify] ${store.name} (${store.id}): ${orderRows.length}+ orders, ${existingClassifications.length} existing classifications`
      );

      if (orderRows.length < 5) {
        results.push({
          store: store.name,
          storeId: store.id,
          status: 'skipped',
          reason: `Only ${orderRows.length} orders — need at least 5`,
        });
        continue;
      }

      // 1. Run signal-stack classifier (persists to product_classifications)
      const result = await classifyAllProducts(store.id);

      // 2. Run behavioral analysis on top (same as cron/classify-products)
      let behavioralCount = 0;
      try {
        const behaviors = await extractAllProductBehaviors(store.id);
        if (behaviors.length > 0) {
          const storeProfile = await buildStoreProfile(store.id, behaviors);

          // Get manual overrides — never overwrite these
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
          await rest('/store_behavior_profiles?on_conflict=store_id', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates' },
            body: JSON.stringify({ ...storeProfile }),
          }).catch(() => null);

          // Persist product behaviors
          for (const b of behaviors) {
            await rest('/product_behaviors?on_conflict=store_id,product_id', {
              method: 'POST',
              headers: { Prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify({
                store_id: b.store_id, product_id: b.product_id, product_title: b.product_title,
                total_orders: b.total_orders, alone_orders: b.alone_orders, alone_rate: b.alone_rate,
                first_position_orders: b.first_position_orders, first_rate: b.first_rate,
                avg_position: b.avg_position, total_revenue: b.total_revenue,
                revenue_share: b.revenue_share, avg_order_value_with: b.avg_order_value_with,
                avg_order_value_without: b.avg_order_value_without, co_occurrence_rate: b.co_occurrence_rate,
                value_lift: b.value_lift, top_companions: b.top_companions,
                mutual_exclusions: b.mutual_exclusions,
                first_seen: b.first_seen, last_seen: b.last_seen, active_days: b.active_days,
                computed_at: new Date().toISOString(),
              }),
            }).catch(() => null);
          }

          // Persist behavioral classifications (skip manual overrides)
          for (const r of behavioralResults) {
            if (r.method === 'manual_override') continue;
            await rest('/product_classifications?on_conflict=store_id,product_id', {
              method: 'POST',
              headers: { Prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify({
                store_id: store.id, product_id: r.product_id, product_title: r.product_title,
                classification: r.classification, confidence: r.confidence,
                classification_method: r.method, behavioral_signals: r.signals,
                parent_product: r.parent_product, downsell_of: r.downsell_of,
                needs_review: r.needs_review,
                manual_override: false, last_analyzed: new Date().toISOString(),
              }),
            }).catch(() => null);
          }
        }
      } catch (e) {
        console.warn(`[ForceClassify] Behavioral failed for ${store.name}:`, e instanceof Error ? e.message : e);
      }

      // Get final breakdown
      const finalClassifications = await rest<Array<{ classification: string }>>(
        `/product_classifications?store_id=eq.${encodeURIComponent(store.id)}&select=classification`
      ).catch(() => []);

      const breakdown: Record<string, number> = {};
      for (const c of finalClassifications) {
        breakdown[c.classification] = (breakdown[c.classification] ?? 0) + 1;
      }

      results.push({
        store: store.name,
        storeId: store.id,
        status: 'success',
        classified: finalClassifications.length,
        needsReview: result.needsReview,
        breakdown,
      });

      console.log(
        `[ForceClassify] ${store.name}: ${finalClassifications.length} classified — ${JSON.stringify(breakdown)}`
      );
    } catch (err) {
      console.error(`[ForceClassify] Failed for ${store.name}:`, err);
      results.push({
        store: store.name,
        storeId: store.id,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    success: true,
    totalStores: stores.length,
    results,
  });
}
