import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getStoreIntelligence } from '@/lib/intelligence/storeIntelligence';

/**
 * GET /api/intelligence/status?storeId=xxx
 *
 * Get full store intelligence status — initialization progress,
 * last analysis timestamps, store characteristics.
 */
export async function GET(request: NextRequest) {
  const storeId = request.nextUrl.searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const intel = await getStoreIntelligence(storeId);

    if (!intel) {
      return NextResponse.json({
        initialized: false,
        status: 'pending',
        message: 'Store intelligence not initialized. Call POST /api/intelligence/init to start.',
      });
    }

    return NextResponse.json({
      initialized: intel.init_status === 'complete',
      status: intel.init_status,
      healthScore: intel.health_score,
      healthBreakdown: intel.health_breakdown,
      timestamps: {
        initStarted: intel.init_started_at,
        initCompleted: intel.init_completed_at,
        productsAnalyzed: intel.products_analyzed_at,
        feesDetected: intel.fees_detected_at,
        campaignsMapped: intel.campaigns_mapped_at,
        currencyDetected: intel.currency_detected_at,
        cogsSuggested: intel.cogs_suggested_at,
      },
      storeProfile: {
        productCount: intel.product_count,
        mainProductCount: intel.main_product_count,
        hasSubscriptions: intel.has_subscriptions,
        hasBundles: intel.has_bundles,
        hasDigitalProducts: intel.has_digital_products,
        isSingleProduct: intel.is_single_product,
        primaryCategory: intel.primary_category,
        shopifyPlan: intel.shopify_plan,
        shopCurrency: intel.shop_currency,
        shopTimezone: intel.shop_timezone,
      },
      error: intel.init_error,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
