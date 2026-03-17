/**
 * Admin: Advanced Classification Report
 * Shows comprehensive classification results per store:
 * - Which method classified each product (by tier)
 * - Signal breakdown per product
 * - How many caught by each detection method
 * - Network archetype coverage
 * - LLM classification results
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled, listPersistentStores } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const enc = (v: string) => encodeURIComponent(v);

export async function GET(request: NextRequest) {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const report: any[] = [];

  for (const store of stores) {
    const classifications = await rest<Array<{
      product_id: string; product_title: string; classification: string;
      confidence: number; detection_method: string; classification_method: string;
      manual_override: boolean; is_post_purchase_upsell: boolean;
      upsell_app_detected: string | null; sku_pattern_signal: string | null;
      llm_classification: string | null; llm_confidence: number;
      llm_reasoning: string | null; has_own_campaigns: boolean;
      ad_landing_rate: number; price_aov_ratio: number;
      repeat_purchase_rate: number; new_customer_rate: number;
      alone_pct: number; first_position_pct: number;
    }>>(
      `/product_classifications?store_id=eq.${enc(store.id)}&select=*&order=confidence.desc`
    ).catch(() => []);

    // Count by detection method
    const byMethod: Record<string, number> = {};
    let tier1Count = 0, tier2Count = 0, tier3Count = 0, tier4Count = 0;

    for (const c of classifications) {
      const method = c.classification_method || c.detection_method || 'unknown';
      byMethod[method] = (byMethod[method] || 0) + 1;

      // Tier assignment
      if (['post_purchase_order_update', 'upsell_app_metafield'].includes(method) || c.sku_pattern_signal) {
        tier1Count++;
      } else if (['ad_campaign_detected', 'ad_traffic_landing'].includes(method) || c.llm_classification) {
        tier2Count++;
      } else if (['signal_stack', 'shopify_tag'].includes(method)) {
        tier3Count++;
      } else {
        tier4Count++;
      }
    }

    // Signal coverage
    const total = classifications.length;
    const withPostPurchase = classifications.filter(c => c.is_post_purchase_upsell).length;
    const withLLM = classifications.filter(c => c.llm_classification).length;
    const withAdCampaigns = classifications.filter(c => c.has_own_campaigns).length;
    const withSKUPattern = classifications.filter(c => c.sku_pattern_signal).length;
    const withUpsellApp = classifications.filter(c => c.upsell_app_detected).length;
    const manualOverrides = classifications.filter(c => c.manual_override).length;

    // Confidence distribution
    const highConf = classifications.filter(c => c.confidence >= 80).length;
    const medConf = classifications.filter(c => c.confidence >= 50 && c.confidence < 80).length;
    const lowConf = classifications.filter(c => c.confidence < 50).length;

    // Detailed breakdown for top 10 products
    const top10 = classifications.slice(0, 10).map(c => ({
      product_id: c.product_id,
      product_title: c.product_title,
      classification: c.classification,
      confidence: c.confidence,
      method: c.classification_method || c.detection_method,
      signals: {
        post_purchase_upsell: c.is_post_purchase_upsell,
        upsell_app: c.upsell_app_detected,
        sku_pattern: c.sku_pattern_signal,
        llm: c.llm_classification ? `${c.llm_classification} (${c.llm_confidence}%) — ${c.llm_reasoning}` : null,
        has_ad_campaigns: c.has_own_campaigns,
        ad_landing_rate: c.ad_landing_rate,
        price_aov_ratio: c.price_aov_ratio,
        repeat_purchase_rate: c.repeat_purchase_rate,
        new_customer_rate: c.new_customer_rate,
        alone_pct: c.alone_pct,
        first_position_pct: c.first_position_pct,
      },
    }));

    report.push({
      store: store.name,
      store_id: store.id,
      summary: {
        total_products: total,
        manual_overrides: manualOverrides,
        confidence: { high_80plus: highConf, medium_50_80: medConf, low_under_50: lowConf },
      },
      tier_breakdown: {
        tier1_definitive: tier1Count,
        tier2_strong: tier2Count,
        tier3_behavioral: tier3Count,
        tier4_fallback: tier4Count,
      },
      signal_coverage: {
        post_purchase_detected: withPostPurchase,
        llm_classified: withLLM,
        ad_campaigns_detected: withAdCampaigns,
        sku_pattern_detected: withSKUPattern,
        upsell_app_detected: withUpsellApp,
      },
      by_method: byMethod,
      product_details: top10,
    });
  }

  // Get network archetype stats
  const archetypes = await rest<Array<{
    archetype_name: string; predicted_classification: string;
    confidence: number; training_store_count: number;
    training_product_count: number; validation_accuracy: number;
  }>>(
    `/network_product_archetypes?select=*&order=confidence.desc`
  ).catch(() => []);

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    total_stores: report.length,
    network_intelligence: {
      archetypes: archetypes.length,
      details: archetypes.map(a => ({
        name: a.archetype_name,
        classification: a.predicted_classification,
        confidence: a.confidence,
        stores: a.training_store_count,
        products: a.training_product_count,
        accuracy: a.validation_accuracy,
      })),
    },
    stores: report,
  });
}
