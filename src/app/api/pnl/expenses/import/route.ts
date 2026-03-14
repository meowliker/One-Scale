import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled, type PersistentCustomExpense } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const VALID_CATEGORIES = ['fixed', 'variable'];
const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly', 'one_time'];

interface ParsedRow {
  name: string;
  category: string;
  amount: number;
  frequency: string;
  distribution: string;
  startDate: string | null;
  endDate: string | null;
}

function parseCSV(csv: string): { rows: ParsedRow[]; errors: string[] } {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return { rows: [], errors: ['CSV must have a header row and at least one data row'] };

  // Parse header
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
  const nameIdx = header.indexOf('name');
  const catIdx = header.indexOf('category');
  const amtIdx = header.indexOf('amount');
  const freqIdx = header.indexOf('frequency');
  const distIdx = header.indexOf('distribution');
  const startIdx = header.indexOf('start_date');
  const endIdx = header.indexOf('end_date');

  if (nameIdx === -1 || amtIdx === -1) {
    return { rows: [], errors: ['CSV must have "name" and "amount" columns'] };
  }

  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(',').map((c) => c.trim());
    const name = cols[nameIdx] || '';
    const amountStr = cols[amtIdx] || '';
    const category = (catIdx >= 0 ? cols[catIdx] : 'fixed') || 'fixed';
    const frequency = (freqIdx >= 0 ? cols[freqIdx] : 'monthly') || 'monthly';
    const distribution = (distIdx >= 0 ? cols[distIdx] : 'daily') || 'daily';
    const startDate = startIdx >= 0 ? cols[startIdx] || null : null;
    const endDate = endIdx >= 0 ? cols[endIdx] || null : null;

    if (!name) { errors.push(`Row ${i + 1}: name is required`); continue; }

    const amount = parseFloat(amountStr.replace(/[$,]/g, ''));
    if (isNaN(amount) || amount <= 0) { errors.push(`Row ${i + 1}: amount must be > 0`); continue; }

    if (!VALID_CATEGORIES.includes(category.toLowerCase())) {
      errors.push(`Row ${i + 1}: invalid category "${category}"`); continue;
    }
    if (!VALID_FREQUENCIES.includes(frequency.toLowerCase())) {
      errors.push(`Row ${i + 1}: invalid frequency "${frequency}"`); continue;
    }

    rows.push({
      name,
      category: category.toLowerCase(),
      amount,
      frequency: frequency.toLowerCase(),
      distribution: distribution.toLowerCase() || 'daily',
      startDate: startDate || null,
      endDate: endDate || null,
    });
  }

  return { rows, errors };
}

export async function POST(req: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ ok: false, error: 'Persistence not configured' }, { status: 503 });
  }

  const storeId = req.nextUrl.searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ ok: false, error: 'storeId required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const csv = body.csv;
    if (!csv || typeof csv !== 'string') {
      return NextResponse.json({ ok: false, error: 'csv field required (string)' }, { status: 400 });
    }

    const { rows, errors } = parseCSV(csv);
    if (rows.length === 0 && errors.length > 0) {
      return NextResponse.json({ ok: false, imported: 0, updated: 0, errors }, { status: 400 });
    }

    // Fetch existing expenses for idempotent upsert
    const existing = await rest<PersistentCustomExpense[]>(
      `/pnl_custom_expenses?store_id=eq.${encodeURIComponent(storeId)}&select=*`
    );

    const existingByName = new Map<string, PersistentCustomExpense>();
    for (const e of existing) {
      existingByName.set(e.name.toLowerCase(), e);
    }

    let imported = 0;
    let updated = 0;

    for (const row of rows) {
      const match = existingByName.get(row.name.toLowerCase());

      if (match) {
        // Update existing
        await rest(
          `/pnl_custom_expenses?id=eq.${match.id}&store_id=eq.${encodeURIComponent(storeId)}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              category: row.category,
              amount: row.amount,
              frequency: row.frequency,
              distribution: row.distribution,
              start_date: row.startDate,
              end_date: row.endDate,
            }),
          }
        );
        updated++;
      } else {
        // Insert new
        await rest('/pnl_custom_expenses', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            store_id: storeId,
            name: row.name,
            category: row.category,
            amount: row.amount,
            frequency: row.frequency,
            distribution: row.distribution,
            start_date: row.startDate,
            end_date: row.endDate,
            is_active: true,
          }),
        });
        imported++;
      }
    }

    return NextResponse.json({ ok: true, imported, updated, errors });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
