/**
 * Admin: Ad Attribution Report
 * Shows detailed attribution results per store:
 * - Which method detected each campaign's product
 * - Confidence scores
 * - Total spend attributed per product
 * - How much spend is still unattributed
 * - Signal score breakdown for top 5 products
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

  const ninetyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const report: any[] = [];

  for (const store of stores) {
    // Get attributions
    const attributions = await rest<Array<{
      campaign_id: string; campaign_name: string; product_id: string;
      product_title: string; confidence: number; method: string;
      sessions_tracked: number; conversions_tracked: number;
      correlation_score: number; creative_url: string | null;
    }>>(
      `/campaign_product_attributions?store_id=eq.${enc(store.id)}&select=*&order=confidence.desc`
    ).catch(() => []);

    // Get total spend per campaign
    const spendRows = await rest<Array<{ campaign_id: string; spend: number }>>(
      `/meta_spend_cache?store_id=eq.${enc(store.id)}&date=gte.${ninetyDaysAgo}&select=campaign_id,spend`
    ).catch(() => []);

    const spendByCampaign = new Map<string, number>();
    for (const r of spendRows) {
      spendByCampaign.set(r.campaign_id, (spendByCampaign.get(r.campaign_id) ?? 0) + Number(r.spend));
    }

    // Calculate spend per product and unattributed
    const spendByProduct = new Map<string, { title: string; spend: number; campaigns: number }>();
    let attributedSpend = 0;
    const attributedCampaignIds = new Set<string>();

    for (const a of attributions) {
      const campSpend = spendByCampaign.get(a.campaign_id) ?? 0;
      attributedSpend += campSpend;
      attributedCampaignIds.add(a.campaign_id);

      const existing = spendByProduct.get(a.product_id) ?? { title: a.product_title, spend: 0, campaigns: 0 };
      existing.spend += campSpend;
      existing.campaigns++;
      spendByProduct.set(a.product_id, existing);
    }

    const totalSpend = Array.from(spendByCampaign.values()).reduce((s, v) => s + v, 0);
    const unattributedSpend = totalSpend - attributedSpend;

    // Get signal scores for top 5 products
    const signalScores = await rest<Array<{
      product_id: string; classification: string; confidence: number;
      primary_signal: string; total_score: number; signal_count: number;
      score_own_campaigns: number; score_ad_landing: number;
      score_alone_rate: number; score_title_keywords: number;
      score_position: number; score_product_type_tags: number;
    }>>(
      `/product_signal_scores?store_id=eq.${enc(store.id)}&select=*&order=confidence.desc&limit=5`
    ).catch(() => []);

    // Method distribution
    const byMethod: Record<string, { count: number; total_spend: number; avg_confidence: number }> = {};
    for (const a of attributions) {
      if (!byMethod[a.method]) byMethod[a.method] = { count: 0, total_spend: 0, avg_confidence: 0 };
      byMethod[a.method].count++;
      byMethod[a.method].total_spend += spendByCampaign.get(a.campaign_id) ?? 0;
      byMethod[a.method].avg_confidence += a.confidence;
    }
    for (const m of Object.values(byMethod)) {
      m.avg_confidence = m.count > 0 ? Math.round(m.avg_confidence / m.count) : 0;
      m.total_spend = Math.round(m.total_spend * 100) / 100;
    }

    // Confidence tiers
    const highConfidence = attributions.filter(a => a.confidence >= 70).length;
    const medConfidence = attributions.filter(a => a.confidence >= 40 && a.confidence < 70).length;
    const lowConfidence = attributions.filter(a => a.confidence < 40).length;

    report.push({
      store: store.name,
      store_id: store.id,
      summary: {
        total_campaigns: spendByCampaign.size,
        attributed_campaigns: attributions.length,
        unattributed_campaigns: spendByCampaign.size - attributedCampaignIds.size,
        total_spend_30d: Math.round(totalSpend * 100) / 100,
        attributed_spend: Math.round(attributedSpend * 100) / 100,
        unattributed_spend: Math.round(unattributedSpend * 100) / 100,
        attribution_rate: totalSpend > 0 ? Math.round(attributedSpend / totalSpend * 100) + '%' : 'N/A',
      },
      confidence_tiers: { high_70plus: highConfidence, medium_40_70: medConfidence, low_under_40: lowConfidence },
      by_method: byMethod,
      spend_per_product: Array.from(spendByProduct.entries()).map(([pid, data]) => ({
        product_id: pid, product_title: data.title,
        spend: Math.round(data.spend * 100) / 100, campaigns: data.campaigns,
      })).sort((a, b) => b.spend - a.spend),
      signal_breakdown_top5: signalScores.map(s => ({
        product_id: s.product_id, classification: s.classification,
        confidence: s.confidence, primary_signal: s.primary_signal,
        total_score: s.total_score,
        signals: {
          ad_campaigns: s.score_own_campaigns, ad_landing: s.score_ad_landing,
          alone_rate: s.score_alone_rate, position: s.score_position,
          title_keywords: s.score_title_keywords, product_type: s.score_product_type_tags,
        },
      })),
      attributions: attributions.map(a => ({
        campaign: a.campaign_name, product: a.product_title,
        confidence: a.confidence, method: a.method,
        sessions: a.sessions_tracked, conversions: a.conversions_tracked,
        correlation: a.correlation_score, creative_url: a.creative_url,
      })),
    });
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    total_stores: report.length,
    stores: report,
  });
}
