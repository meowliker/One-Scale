import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { rest } from '@/app/api/lib/supabase-persistence';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface PixelPayload {
  store_id: string;
  visitor_id: string;
  session_id: string;
  event_type: 'page_view' | 'add_to_cart' | 'purchase' | 'view_content';
  page_url?: string;
  referrer?: string;
  order_id?: string;
  order_value?: number;
  product_id?: string;
  product_title?: string;
  variant_id?: string;
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  _fbc?: string;
  _fbp?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  user_agent?: string;
}

interface VisitorIdentity {
  first_fbclid: string | null;
  first_utm_campaign: string | null;
  first_utm_source: string | null;
  first_seen_at: string | null;
  last_fbclid: string | null;
  last_utm_campaign: string | null;
  last_utm_source: string | null;
  last_seen_at: string | null;
  _fbc: string | null;
  _fbp: string | null;
  total_pageviews: number;
  total_orders: number;
  total_sessions: number;
}

function enc(v: string): string {
  return encodeURIComponent(v);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest) {
  let body: PixelPayload;
  try {
    body = await request.json() as PixelPayload;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: CORS });
  }

  if (!body.store_id || !body.visitor_id || !body.event_type) {
    return NextResponse.json({ ok: false }, { status: 400, headers: CORS });
  }

  // Hash IP — never store raw
  const rawIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip') ?? '';
  const ipHash = rawIp
    ? createHash('sha256').update(rawIp + body.store_id).digest('hex').slice(0, 16)
    : null;

  const now = new Date().toISOString();

  try {
    // ── 1. Insert raw pixel event ────────────────────────────────────────
    await rest('/pixel_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        store_id: body.store_id,
        visitor_id: body.visitor_id,
        session_id: body.session_id,
        event_type: body.event_type,
        page_url: body.page_url?.slice(0, 500) ?? null,
        referrer: body.referrer?.slice(0, 500) ?? null,
        order_id: body.order_id ?? null,
        order_value: body.order_value ?? null,
        product_id: body.product_id ?? null,
        product_title: body.product_title?.slice(0, 200) ?? null,
        variant_id: body.variant_id ?? null,
        fbclid: body.fbclid ?? null,
        gclid: body.gclid ?? null,
        ttclid: body.ttclid ?? null,
        _fbc: body._fbc ?? null,
        _fbp: body._fbp ?? null,
        utm_source: body.utm_source ?? null,
        utm_medium: body.utm_medium ?? null,
        utm_campaign: body.utm_campaign ?? null,
        utm_content: body.utm_content ?? null,
        utm_term: body.utm_term ?? null,
        user_agent: body.user_agent?.slice(0, 200) ?? null,
        ip_hash: ipHash,
      }),
    });

    // ── 2. Fetch existing visitor identity ──────────────────────────────
    const visitorRows = await rest<VisitorIdentity[]>(
      `/visitor_identities?store_id=eq.${enc(body.store_id)}&visitor_id=eq.${enc(body.visitor_id)}&select=*&limit=1`
    );
    const existingVisitor = visitorRows?.[0] ?? null;

    const isNew = !existingVisitor;
    const hasAttribution = !!(body.fbclid || body.utm_campaign || body.utm_source);

    // ── 3. Upsert visitor identity ───────────────────────────────────────
    const visitorPayload: Record<string, unknown> = {
      store_id: body.store_id,
      visitor_id: body.visitor_id,
      // First touch — preserve existing, fill gaps
      first_fbclid: isNew
        ? (body.fbclid ?? null)
        : (existingVisitor?.first_fbclid ?? body.fbclid ?? null),
      first_utm_campaign: isNew
        ? (body.utm_campaign ?? null)
        : (existingVisitor?.first_utm_campaign ?? body.utm_campaign ?? null),
      first_utm_source: isNew
        ? (body.utm_source ?? null)
        : (existingVisitor?.first_utm_source ?? body.utm_source ?? null),
      first_seen_at: isNew
        ? now
        : (existingVisitor?.first_seen_at ?? now),
      last_seen_at: now,
      _fbc: body._fbc ?? null,
      _fbp: body._fbp ?? null,
      total_pageviews: (existingVisitor?.total_pageviews ?? 0) + 1,
      updated_at: now,
    };

    // Last touch — only update when we have attribution data
    if (hasAttribution) {
      visitorPayload.last_fbclid = body.fbclid ?? null;
      visitorPayload.last_utm_campaign = body.utm_campaign ?? null;
      visitorPayload.last_utm_source = body.utm_source ?? null;
    }

    await rest(
      '/visitor_identities?on_conflict=store_id,visitor_id',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([visitorPayload]),
      }
    );

    // ── 4. Build visitor_attribution session record ───────────────────────
    if (body.event_type === 'view_content' || body.event_type === 'add_to_cart' || body.event_type === 'purchase') {
      await upsertVisitorAttribution(body, now);
    }

    // ── 5. Purchase: write order attribution ─────────────────────────────
    if (body.event_type === 'purchase' && body.order_id) {
      // Get full visitor record (just upserted above)
      const vRows = await rest<VisitorIdentity[]>(
        `/visitor_identities?store_id=eq.${enc(body.store_id)}&visitor_id=eq.${enc(body.visitor_id)}&select=*&limit=1`
      );
      const visitor = vRows?.[0] ?? null;

      // Count distinct sessions before this one
      const sessionRows = await rest<Array<{ session_id: string }>>(
        `/pixel_events?store_id=eq.${enc(body.store_id)}&visitor_id=eq.${enc(body.visitor_id)}&session_id=neq.${enc(body.session_id)}&select=session_id`
      );
      const uniqueSessions = new Set(
        (sessionRows ?? []).map(r => r.session_id)
      ).size;

      const daysToConvert = visitor?.first_seen_at
        ? Math.round((Date.now() - new Date(visitor.first_seen_at).getTime()) / 864e5)
        : 0;

      await rest(
        '/order_attributions?on_conflict=store_id,order_id',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{
            store_id: body.store_id,
            order_id: body.order_id,
            attribution_method:
              body.fbclid || body.utm_campaign ? 'pixel' : 'utm_only',
            visitor_id: body.visitor_id,
            utm_source: body.utm_source ?? visitor?.last_utm_source ?? null,
            utm_medium: body.utm_medium ?? null,
            utm_campaign: body.utm_campaign ?? visitor?.last_utm_campaign ?? null,
            utm_content: body.utm_content ?? null,
            utm_term: body.utm_term ?? null,
            fbclid: body.fbclid ?? visitor?.last_fbclid ?? null,
            _fbc: body._fbc ?? visitor?._fbc ?? null,
            _fbp: body._fbp ?? visitor?._fbp ?? null,
            first_touch_source: visitor?.first_utm_source ?? null,
            first_touch_campaign: visitor?.first_utm_campaign ?? null,
            first_touch_at: visitor?.first_seen_at ?? null,
            days_to_convert: daysToConvert,
            sessions_before_purchase: uniqueSessions,
            order_value: body.order_value ?? null,
            attributed_at: now,
          }]),
        }
      );

      // Update total_orders on visitor
      await rest(
        `/visitor_identities?store_id=eq.${enc(body.store_id)}&visitor_id=eq.${enc(body.visitor_id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            total_orders: (visitor?.total_orders ?? 0) + 1,
            updated_at: now,
          }),
        }
      );
    }

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (err) {
    console.error('[Pixel] Event write failed:', err);
    return NextResponse.json({ ok: true }, { headers: CORS }); // silent fail
  }
}

/**
 * Upsert visitor_attribution to track the session journey:
 * - view_content: update products viewed
 * - add_to_cart: record which product was added
 * - purchase: link order to session, populate products_viewed from pixel_events
 */
async function upsertVisitorAttribution(body: PixelPayload, now: string): Promise<void> {
  const storeId = body.store_id;
  const visitorId = body.visitor_id;
  const sessionId = body.session_id;

  // Fetch existing session record
  const existing = await rest<Array<{
    products_viewed: string[] | null;
    first_product_viewed_id: string | null;
  }>>(
    `/visitor_attribution?store_id=eq.${enc(storeId)}&visitor_id=eq.${enc(visitorId)}&session_id=eq.${enc(sessionId)}&select=products_viewed,first_product_viewed_id&limit=1`
  ).catch(() => []);

  const prev = existing?.[0] ?? null;

  const payload: Record<string, unknown> = {
    store_id: storeId,
    visitor_id: visitorId,
    session_id: sessionId,
    fbclid: body.fbclid ?? null,
    gclid: body.gclid ?? null,
    ttclid: body.ttclid ?? null,
    utm_source: body.utm_source ?? null,
    utm_medium: body.utm_medium ?? null,
    utm_campaign: body.utm_campaign ?? null,
    utm_content: body.utm_content ?? null,
    utm_term: body.utm_term ?? null,
    landing_page_url: prev ? undefined : body.page_url?.slice(0, 500) ?? null,
    last_seen_at: now,
  };

  // Don't overwrite landing_page_url on subsequent events
  if (prev) delete payload.landing_page_url;

  if (body.event_type === 'view_content' && body.product_id) {
    const currentViewed: string[] = Array.isArray(prev?.products_viewed) ? [...prev.products_viewed] : [];
    if (!currentViewed.includes(body.product_id)) {
      currentViewed.push(body.product_id);
    }
    payload.products_viewed = currentViewed;
    payload.last_product_viewed_id = body.product_id;
    if (!prev?.first_product_viewed_id) {
      payload.first_product_viewed_id = body.product_id;
      payload.first_product_viewed_title = body.product_title ?? null;
    }
  }

  if (body.event_type === 'add_to_cart' && body.product_id) {
    payload.product_added_to_cart_id = body.product_id;
  }

  if (body.event_type === 'purchase' && body.order_id) {
    payload.order_id = body.order_id;
    payload.order_total = body.order_value ?? null;
    payload.attributed_at = now;

    // Populate products_viewed from all view_content events in this session
    const viewEvents = await rest<Array<{ product_id: string }>>(
      `/pixel_events?store_id=eq.${enc(storeId)}&visitor_id=eq.${enc(visitorId)}&session_id=eq.${enc(sessionId)}&event_type=eq.view_content&product_id=not.is.null&select=product_id`
    ).catch(() => []);

    const allViewed = new Set<string>(
      Array.isArray(prev?.products_viewed) ? prev.products_viewed : []
    );
    for (const ev of viewEvents ?? []) {
      if (ev.product_id) allViewed.add(ev.product_id);
    }
    payload.products_viewed = Array.from(allViewed);
  }

  await rest(
    '/visitor_attribution?on_conflict=store_id,visitor_id,session_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([payload]),
    }
  ).catch(() => null);
}
