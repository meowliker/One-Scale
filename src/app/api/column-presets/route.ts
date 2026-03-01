import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function sbHeaders(extra?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
  if (SUPABASE_SERVICE_ROLE_KEY.split('.').length === 3) {
    out.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  }
  return out;
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: { ...sbHeaders(), ...(init?.headers || {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase request failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.text();
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId is required' }, { status: 400 });

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ data: [] });
  }

  try {
    const rows = await rest<Array<{ id: string; name: string; columns: string[] }>>(
      `/column_presets?store_id=eq.${encodeURIComponent(storeId)}&select=id,name,columns&order=created_at.asc`
    );
    return NextResponse.json({ data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load presets';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: { storeId?: string; id?: string; name?: string; columns?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { storeId, id, name, columns } = body;
  if (!storeId || !id || !name || !columns) {
    return NextResponse.json({ error: 'storeId, id, name, columns required' }, { status: 400 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ ok: true });
  }

  try {
    await rest('/column_presets?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } as Record<string, string>,
      body: JSON.stringify([{ id, store_id: storeId, name, columns }]),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save preset';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const storeId = searchParams.get('storeId');
  if (!id || !storeId) return NextResponse.json({ error: 'id and storeId required' }, { status: 400 });

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ ok: true });
  }

  try {
    await rest(
      `/column_presets?id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(storeId)}`,
      { method: 'DELETE' }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete preset';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
