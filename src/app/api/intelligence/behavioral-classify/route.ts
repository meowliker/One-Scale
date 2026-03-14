import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { extractAllProductBehaviors } from '@/lib/intelligence/behaviorExtractor';
import { buildStoreProfile } from '@/lib/intelligence/storeProfiler';
import { classifyAllProducts } from '@/lib/intelligence/relativeClassifier';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/intelligence/behavioral-classify?storeId=xxx
 * Runs the full behavioral classification pipeline:
 * 1. Extract product behaviors from order data
 * 2. Build store profile
 * 3. Classify all products relative to store
 * 4. Store results in product_classifications + product_behaviors tables
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    // Step 1: Extract behaviors
    const behaviors = await extractAllProductBehaviors(storeId);
    if (behaviors.length === 0) {
      return NextResponse.json({ ok: true, message: 'No order data found', classified: 0 });
    }

    // Step 2: Build store profile
    const storeProfile = await buildStoreProfile(storeId, behaviors);

    // Step 3: Get manual overrides and tag overrides
    const storedClassifications = await rest<Array<{
      product_id: string;
      classification: string;
      manual_override: boolean;
    }>>(
      `/product_classifications?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,classification,manual_override`
    ).catch(() => []);

    const manualOverrides = new Map<string, string>();
    for (const sc of storedClassifications) {
      if (sc.manual_override) {
        manualOverrides.set(sc.product_id, sc.classification);
      }
    }

    // Tag overrides from Shopify product tags (via orders data)
    const tagOverrides = new Map<string, string>();

    // Step 4: Classify all products
    const results = classifyAllProducts(behaviors, storeProfile, manualOverrides, tagOverrides);

    // Step 5: Persist store profile
    await rest(
      `/store_behavior_profiles?on_conflict=store_id`,
      {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          ...storeProfile,
        }),
      }
    ).catch(() => null);

    // Step 6: Persist product behaviors (upsert)
    for (const b of behaviors) {
      await rest(
        `/product_behaviors?on_conflict=store_id,product_id`,
        {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            store_id: b.store_id,
            product_id: b.product_id,
            product_title: b.product_title,
            total_orders: b.total_orders,
            alone_orders: b.alone_orders,
            alone_rate: b.alone_rate,
            first_position_orders: b.first_position_orders,
            first_rate: b.first_rate,
            avg_position: b.avg_position,
            total_revenue: b.total_revenue,
            revenue_share: b.revenue_share,
            avg_order_value_with: b.avg_order_value_with,
            avg_order_value_without: b.avg_order_value_without,
            co_occurrence_rate: b.co_occurrence_rate,
            value_lift: b.value_lift,
            top_companions: b.top_companions,
            first_seen: b.first_seen,
            last_seen: b.last_seen,
            active_days: b.active_days,
            computed_at: new Date().toISOString(),
          }),
        }
      ).catch(() => null);
    }

    // Step 7: Persist classifications (skip manual overrides)
    for (const r of results) {
      if (r.method === 'manual_override') continue;
      await rest(
        `/product_classifications?on_conflict=store_id,product_id`,
        {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            store_id: storeId,
            product_id: r.product_id,
            product_title: r.product_title,
            classification: r.classification,
            confidence: r.confidence,
            classification_method: r.method,
            signals_used: null,
            behavioral_signals: r.signals,
            parent_product: r.parent_product,
            needs_review: r.needs_review,
            manual_override: false,
            last_analyzed: new Date().toISOString(),
          }),
        }
      ).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      classified: results.length,
      storeProfile: {
        structure: storeProfile.inferred_structure,
        avgItemsPerOrder: storeProfile.avg_items_per_order,
        funnelStrength: storeProfile.funnel_signal_strength,
      },
      breakdown: {
        main: results.filter(r => r.classification === 'main').length,
        upsell: results.filter(r => r.classification === 'upsell').length,
        addon: results.filter(r => r.classification === 'addon').length,
        pending: results.filter(r => r.classification === 'pending').length,
        unknown: results.filter(r => r.classification === 'unknown').length,
        excluded: results.filter(r => r.classification === 'excluded').length,
      },
      results: results.map(r => ({
        product_id: r.product_id,
        product_title: r.product_title,
        classification: r.classification,
        confidence: r.confidence,
        method: r.method,
        signals: r.signals,
        parent_product: r.parent_product,
        needs_review: r.needs_review,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * GET /api/intelligence/behavioral-classify?storeId=xxx
 * Returns current classification state without re-running.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId || !isSupabasePersistenceEnabled()) {
    return NextResponse.json({ ok: false, data: [] });
  }

  const [classifications, profile] = await Promise.all([
    rest<Array<{
      product_id: string;
      product_title: string;
      classification: string;
      confidence: number;
      classification_method: string;
      behavioral_signals: string[] | null;
      parent_product: string | null;
      needs_review: boolean;
      manual_override: boolean;
      last_analyzed: string;
    }>>(
      `/product_classifications?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,product_title,classification,confidence,classification_method,behavioral_signals,parent_product,needs_review,manual_override,last_analyzed`
    ).catch(() => []),
    rest<Array<{ inferred_structure: string; computed_at: string }>>(
      `/store_behavior_profiles?store_id=eq.${encodeURIComponent(storeId)}&select=inferred_structure,computed_at`
    ).catch(() => []),
  ]);

  return NextResponse.json({
    ok: true,
    data: classifications,
    storeProfile: profile[0] || null,
  });
}
