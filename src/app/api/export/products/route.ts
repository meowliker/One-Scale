/**
 * GET /api/export/products?storeId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * CSV export of product performance data.
 * One row per product with classification, revenue, and costs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

export async function GET(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId parameter required' }, { status: 400 });
  }

  const products = await rest<Array<{
    product_id: string; product_title: string; product_type: string;
    classification: string; confidence: number; detection_method: string;
    manual_override: boolean; alone_pct: number; first_position_pct: number;
    revenue_share: number; has_own_campaigns: boolean;
  }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}` +
    `&select=product_id,product_title,product_type,classification,confidence,detection_method,manual_override,alone_pct,first_position_pct,revenue_share,has_own_campaigns` +
    `&order=classification,confidence.desc`
  ).catch(() => []);

  const headers = ['Product ID', 'Title', 'Type', 'Classification', 'Confidence', 'Method', 'Manual Override', 'Alone %', 'First Position %', 'Revenue Share %', 'Has Ad Campaigns'];
  const csvLines = [headers.join(',')];

  for (const p of products) {
    csvLines.push([
      p.product_id,
      `"${(p.product_title || '').replace(/"/g, '""')}"`,
      `"${(p.product_type || '').replace(/"/g, '""')}"`,
      p.classification,
      p.confidence,
      p.detection_method || '',
      p.manual_override ? 'YES' : 'NO',
      (p.alone_pct ?? 0).toFixed(1),
      (p.first_position_pct ?? 0).toFixed(1),
      (p.revenue_share ?? 0).toFixed(1),
      p.has_own_campaigns ? 'YES' : 'NO',
    ].join(','));
  }

  return new Response(csvLines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="products-${storeId}.csv"`,
    },
  });
}
