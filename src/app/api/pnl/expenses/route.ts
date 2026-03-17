import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  type PersistentCustomExpense,
} from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const VALID_CATEGORIES = ['fixed', 'variable'] as const;
const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly', 'one_time'] as const;
const VALID_DISTRIBUTIONS = ['daily', 'hourly', 'smart'] as const;

// GET — list expenses for a store
export async function GET(req: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ ok: false, error: 'Persistence not configured' }, { status: 503 });
  }

  const storeId = req.nextUrl.searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ ok: false, error: 'storeId required' }, { status: 400 });
  }

  try {
    const data = await rest<PersistentCustomExpense[]>(
      `/pnl_custom_expenses?store_id=eq.${encodeURIComponent(storeId)}&select=*&order=created_at.desc`
    );
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST — create a new expense
export async function POST(req: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ ok: false, error: 'Persistence not configured' }, { status: 503 });
  }

  try {
    const body = await req.json();
    const { storeId, name, category, amount, frequency, distribution, startDate, endDate } = body;

    // Validation
    if (!storeId) return NextResponse.json({ ok: false, error: 'storeId required' }, { status: 400 });
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 });
    }
    if (amount === undefined || amount === null || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ ok: false, error: 'amount must be > 0' }, { status: 400 });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ ok: false, error: `Invalid category. Must be: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
    }
    if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
      return NextResponse.json({ ok: false, error: `Invalid frequency. Must be: ${VALID_FREQUENCIES.join(', ')}` }, { status: 400 });
    }
    if (distribution && !VALID_DISTRIBUTIONS.includes(distribution)) {
      return NextResponse.json({ ok: false, error: `Invalid distribution. Must be: ${VALID_DISTRIBUTIONS.join(', ')}` }, { status: 400 });
    }

    const payload = {
      store_id: storeId,
      name: name.trim(),
      category: category || 'fixed',
      amount,
      frequency: frequency || 'monthly',
      distribution: distribution || 'daily',
      start_date: startDate || null,
      end_date: endDate || null,
      is_active: true,
    };

    await rest('/pnl_custom_expenses', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PATCH — update an expense by id + storeId
export async function PATCH(req: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ ok: false, error: 'Persistence not configured' }, { status: 503 });
  }

  try {
    const body = await req.json();
    const { id, storeId, ...fields } = body;

    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    if (!storeId) return NextResponse.json({ ok: false, error: 'storeId required' }, { status: 400 });

    const payload: Record<string, unknown> = {};
    if (fields.name !== undefined) payload.name = fields.name;
    if (fields.category !== undefined) {
      if (!VALID_CATEGORIES.includes(fields.category)) {
        return NextResponse.json({ ok: false, error: 'Invalid category' }, { status: 400 });
      }
      payload.category = fields.category;
    }
    if (fields.amount !== undefined) {
      if (typeof fields.amount !== 'number' || fields.amount <= 0) {
        return NextResponse.json({ ok: false, error: 'amount must be > 0' }, { status: 400 });
      }
      payload.amount = fields.amount;
    }
    if (fields.frequency !== undefined) {
      if (!VALID_FREQUENCIES.includes(fields.frequency)) {
        return NextResponse.json({ ok: false, error: 'Invalid frequency' }, { status: 400 });
      }
      payload.frequency = fields.frequency;
    }
    if (fields.distribution !== undefined) {
      if (!VALID_DISTRIBUTIONS.includes(fields.distribution)) {
        return NextResponse.json({ ok: false, error: 'Invalid distribution' }, { status: 400 });
      }
      payload.distribution = fields.distribution;
    }
    if (fields.startDate !== undefined) payload.start_date = fields.startDate;
    if (fields.endDate !== undefined) payload.end_date = fields.endDate;
    if (fields.isActive !== undefined) payload.is_active = !!fields.isActive;

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ ok: false, error: 'No fields to update' }, { status: 400 });
    }

    await rest(
      `/pnl_custom_expenses?id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(storeId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(payload),
      }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE — delete an expense by id + storeId
export async function DELETE(req: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ ok: false, error: 'Persistence not configured' }, { status: 503 });
  }

  const id = req.nextUrl.searchParams.get('id');
  const storeId = req.nextUrl.searchParams.get('storeId');

  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  if (!storeId) return NextResponse.json({ ok: false, error: 'storeId required' }, { status: 400 });

  try {
    await rest(
      `/pnl_custom_expenses?id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(storeId)}`,
      { method: 'DELETE' }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
