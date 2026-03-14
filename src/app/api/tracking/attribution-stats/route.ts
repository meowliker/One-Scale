import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled, rest } from '@/app/api/lib/supabase-persistence';

interface OrderAttributionRow {
  attribution_method: string;
  campaign_id: string | null;
  campaign_name: string | null;
  confidence_score: number | null;
}

interface CapiLogRow {
  emq_score: number | null;
}

interface AttributionBreakdown {
  method: string;
  count: number;
  percentage: number;
}

interface CampaignConfidence {
  campaignId: string;
  campaignName: string;
  method: string;
  confidence: number;
}

interface AttributionStatsResponse {
  emqScore: number;
  pixelCoverage: number;
  capiCoverage: number;
  iosRecoveryRate: number;
  attributionBreakdown: AttributionBreakdown[];
  campaignConfidence: CampaignConfidence[];
}

export async function GET(req: NextRequest) {
  try {
    if (!isSupabasePersistenceEnabled()) {
      return NextResponse.json({ error: 'Persistence not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json({ error: 'Missing required param: storeId' }, { status: 400 });
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    // Fetch order attributions for the last 30 days
    const attributionRows = await rest<OrderAttributionRow[]>(
      `/order_attribution?store_id=eq.${encodeURIComponent(storeId)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=attribution_method,campaign_id,campaign_name,confidence_score`,
    );

    // Fetch CAPI logs for EMQ score
    const capiRows = await rest<CapiLogRow[]>(
      `/capi_logs?store_id=eq.${encodeURIComponent(storeId)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=emq_score&emq_score=not.is.null`,
    );

    // Fetch total orders for coverage calculations
    const totalOrderRows = await rest<{ id: string }[]>(
      `/shopify_orders?store_id=eq.${encodeURIComponent(storeId)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`,
    );

    const rows = attributionRows ?? [];
    const capiLogs = capiRows ?? [];
    const totalOrders = totalOrderRows?.length ?? 0;

    // Calculate EMQ score (average of all CAPI EMQ scores)
    const emqScores = capiLogs.map((r) => r.emq_score).filter((s): s is number => s != null);
    const emqScore = emqScores.length > 0
      ? Math.round((emqScores.reduce((sum, s) => sum + s, 0) / emqScores.length) * 10) / 10
      : 0;

    // Pixel coverage: orders with any attribution vs total orders
    const pixelCoverage = totalOrders > 0
      ? Math.round((rows.length / totalOrders) * 1000) / 10
      : 0;

    // CAPI coverage: orders with CAPI events vs total
    const capiCoverage = totalOrders > 0
      ? Math.round((capiLogs.length / totalOrders) * 1000) / 10
      : 0;

    // iOS recovery rate: estimate based on non-fbclid attributions that still got matched
    const fbclidCount = rows.filter((r) => r.attribution_method === 'fbclid_match').length;
    const recoveredCount = rows.filter((r) =>
      r.attribution_method === 'session_match' ||
      r.attribution_method === 'utm_match' ||
      r.attribution_method === 'survey_calibrated'
    ).length;
    const iosRecoveryRate = (fbclidCount + recoveredCount) > 0
      ? Math.round((recoveredCount / (fbclidCount + recoveredCount)) * 1000) / 10
      : 0;

    // Attribution breakdown by method
    const methodCounts: Record<string, number> = {};
    for (const row of rows) {
      const method = row.attribution_method || 'unknown';
      methodCounts[method] = (methodCounts[method] || 0) + 1;
    }
    const totalAttributions = rows.length || 1;
    const attributionBreakdown: AttributionBreakdown[] = Object.entries(methodCounts)
      .map(([method, count]) => ({
        method,
        count,
        percentage: Math.round((count / totalAttributions) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);

    // Campaign confidence scores (group by campaign, take average confidence)
    const campaignMap = new Map<string, { name: string; methods: string[]; scores: number[] }>();
    for (const row of rows) {
      if (!row.campaign_id) continue;
      const entry = campaignMap.get(row.campaign_id) || { name: row.campaign_name || 'Unknown', methods: [], scores: [] };
      entry.methods.push(row.attribution_method);
      if (row.confidence_score != null) entry.scores.push(row.confidence_score);
      campaignMap.set(row.campaign_id, entry);
    }

    const campaignConfidence: CampaignConfidence[] = Array.from(campaignMap.entries())
      .map(([campaignId, data]) => {
        // Most common method for this campaign
        const methodFreq: Record<string, number> = {};
        for (const m of data.methods) {
          methodFreq[m] = (methodFreq[m] || 0) + 1;
        }
        const topMethod = Object.entries(methodFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
        const avgConfidence = data.scores.length > 0
          ? Math.round(data.scores.reduce((s, v) => s + v, 0) / data.scores.length)
          : 0;
        return {
          campaignId,
          campaignName: data.name,
          method: topMethod,
          confidence: avgConfidence,
        };
      })
      .sort((a, b) => b.confidence - a.confidence);

    const payload: AttributionStatsResponse = {
      emqScore,
      pixelCoverage,
      capiCoverage,
      iosRecoveryRate,
      attributionBreakdown,
      campaignConfidence,
    };

    return NextResponse.json({ data: payload });
  } catch (err) {
    console.error('[attribution-stats/GET]', err);
    const message = err instanceof Error ? err.message : 'Failed to load attribution stats';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
