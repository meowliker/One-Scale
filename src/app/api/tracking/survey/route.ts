import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled, rest } from '@/app/api/lib/supabase-persistence';

const ALLOWED_RESPONSES = [
  'Facebook/Instagram Ad',
  'Google Search',
  'Friend/Family',
  'TikTok',
  'YouTube',
  'Organic Search',
  'Other',
] as const;

type SurveyResponse = (typeof ALLOWED_RESPONSES)[number];

interface SurveyRow {
  order_id: string;
  store_id: string;
  response: string;
  created_at: string;
}

function withCors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

// ── POST: Record a survey response ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    if (!isSupabasePersistenceEnabled()) {
      return withCors(NextResponse.json({ error: 'Persistence not configured' }, { status: 503 }));
    }

    const body = await req.json();
    const { orderId, storeId, response } = body as {
      orderId?: string;
      storeId?: string;
      response?: string;
    };

    if (!orderId || !storeId || !response) {
      return withCors(
        NextResponse.json({ error: 'Missing required fields: orderId, storeId, response' }, { status: 400 }),
      );
    }

    if (!ALLOWED_RESPONSES.includes(response as SurveyResponse)) {
      return withCors(
        NextResponse.json(
          { error: `Invalid response. Allowed: ${ALLOWED_RESPONSES.join(', ')}` },
          { status: 400 },
        ),
      );
    }

    await rest<undefined>('/survey_responses', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        order_id: orderId,
        store_id: storeId,
        response,
        created_at: new Date().toISOString(),
      }),
    });

    return withCors(NextResponse.json({ ok: true }));
  } catch (err) {
    console.error('[survey/POST]', err);
    return withCors(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}

// ── GET: Aggregated survey data ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    if (!isSupabasePersistenceEnabled()) {
      return withCors(NextResponse.json({ error: 'Persistence not configured' }, { status: 503 }));
    }

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const days = parseInt(searchParams.get('days') || '30', 10);

    if (!storeId) {
      return withCors(NextResponse.json({ error: 'Missing required param: storeId' }, { status: 400 }));
    }

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceIso = since.toISOString();

    const rows = await rest<SurveyRow[]>(
      `/survey_responses?store_id=eq.${encodeURIComponent(storeId)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=response`,
    );

    // Aggregate counts per channel
    const counts: Record<string, number> = {};
    for (const row of rows ?? []) {
      counts[row.response] = (counts[row.response] || 0) + 1;
    }

    const totalResponses = rows?.length ?? 0;

    const responses = Object.entries(counts)
      .map(([channel, count]) => ({
        channel,
        count,
        percentage: totalResponses > 0 ? Math.round((count / totalResponses) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return withCors(NextResponse.json({ responses, totalResponses }));
  } catch (err) {
    console.error('[survey/GET]', err);
    return withCors(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}

// ── OPTIONS: CORS preflight ─────────────────────────────────────────────────

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}
