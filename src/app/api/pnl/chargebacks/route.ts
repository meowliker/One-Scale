import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

/**
 * GET /api/pnl/chargebacks?storeId=xxx&startDate=2026-03-01&endDate=2026-03-13&tz=America/New_York
 *
 * Returns chargebacks from shopify_chargebacks grouped by date (in store timezone).
 * Each entry has { date, loss, won }.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const tz = searchParams.get('tz') || 'America/New_York';

  if (!storeId || !startDate || !endDate) {
    return NextResponse.json({ error: 'storeId, startDate, endDate required' }, { status: 400 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ data: [] });
  }

  // Convert date range to UTC bounds using store timezone
  const minUtc = dateStrToUtcBounds(startDate, tz).min;
  const maxUtc = dateStrToUtcBounds(endDate, tz).max;

  try {
    const rows = await rest<Array<{
      amount: number;
      status: string;
      created_at: string;
    }>>(
      `/shopify_chargebacks?store_id=eq.${encodeURIComponent(storeId)}&created_at=gte.${encodeURIComponent(minUtc)}&created_at=lte.${encodeURIComponent(maxUtc)}&select=amount,status,created_at`
    );

    // Group by date in store timezone
    // Status mapping: lost/charge_refunded/accepted → loss, won → won
    const byDate = new Map<string, { loss: number; won: number; pending: number }>();
    for (const row of rows ?? []) {
      const dateStr = formatDateInTz(new Date(row.created_at), tz);
      if (!byDate.has(dateStr)) byDate.set(dateStr, { loss: 0, won: 0, pending: 0 });
      const entry = byDate.get(dateStr)!;
      const amount = Number(row.amount);
      const s = (row.status || '').toLowerCase();
      if (s === 'lost' || s === 'charge_refunded' || s === 'accepted') {
        entry.loss += amount;
      } else if (s === 'won') {
        entry.won += amount;
      } else {
        // needs_response, under_review, pending, etc.
        entry.pending += amount;
      }
    }

    const data = Array.from(byDate.entries()).map(([date, vals]) => ({
      date,
      loss: vals.loss,
      won: vals.won,
      pending: vals.pending,
    }));

    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'DB error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function formatDateInTz(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

function dateStrToUtcBounds(dateStr: string, tz: string): { min: string; max: string } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const startLocal = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const utcDate = new Date(`${dateStr}T00:00:00Z`);
  const inTzStr = utcDate.toLocaleString('en-US', { timeZone: tz });
  const inTzDate = new Date(inTzStr);
  const offsetMs = utcDate.getTime() - inTzDate.getTime();
  const midnightUtc = new Date(startLocal.getTime() + offsetMs);
  const endUtc = new Date(midnightUtc.getTime() + 24 * 60 * 60 * 1000 - 1000);
  return {
    min: midnightUtc.toISOString(),
    max: endUtc.toISOString(),
  };
}
