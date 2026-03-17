/**
 * GET /api/export/pnl?storeId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * CSV export of daily P&L data for accountants/investors.
 * One row per day with all financial columns.
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
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!storeId || !from || !to) {
    return NextResponse.json({ error: 'storeId, from, and to parameters required' }, { status: 400 });
  }

  const rows = await rest<Array<{
    date: string; revenue: number; transaction_fees: number;
    refunds: number; chargeback_loss: number; chargeback_won: number;
    ad_spend: number; cogs: number; net_profit: number;
    order_count: number; currency: string;
  }>>(
    `/daily_pnl_snapshots?store_id=eq.${enc(storeId)}` +
    `&date=gte.${from}&date=lte.${to}` +
    `&select=date,revenue,transaction_fees,refunds,chargeback_loss,chargeback_won,ad_spend,cogs,net_profit,order_count,currency` +
    `&order=date`
  ).catch(() => []);

  // Build CSV
  const headers = ['Date', 'Revenue', 'Fees', 'Refunds', 'Chargeback Loss', 'Chargeback Won', 'Ad Spend', 'COGS', 'Net Profit', 'Orders', 'Currency'];
  const csvLines = [headers.join(',')];

  for (const r of rows) {
    csvLines.push([
      r.date,
      r.revenue ?? 0,
      r.transaction_fees ?? 0,
      r.refunds ?? 0,
      r.chargeback_loss ?? 0,
      r.chargeback_won ?? 0,
      r.ad_spend ?? 0,
      r.cogs ?? 0,
      r.net_profit ?? 0,
      r.order_count ?? 0,
      r.currency ?? 'USD',
    ].join(','));
  }

  const csv = csvLines.join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="pnl-${storeId}-${from}-${to}.csv"`,
    },
  });
}
