import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getMetaToken } from '@/app/api/lib/tokens';

export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function hashIfPlain(value?: string | null): string | null {
  if (!value) return null;
  if (/^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
  return sha256(value);
}

function toUnix(iso: string): number {
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : Math.floor(Date.now() / 1000);
}

interface CAPIEventInput {
  storeId: string;
  pixelId: string;
  orderId: string;
  eventName?: string;
  eventTime: string;
  eventSourceUrl?: string;
  customer: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    zip?: string;
    countryCode?: string;
    ip?: string;
    userAgent?: string;
  };
  fbclid?: string;
  fbp?: string;
  fbc?: string;
  totalPrice: number;
  currency?: string;
  lineItems?: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
}

// ---------------------------------------------------------------------------
// POST /api/tracking/capi
// Send a verified purchase event to Meta Conversions API
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const input = (await request.json()) as CAPIEventInput;

    if (!input.storeId || !input.pixelId || !input.orderId) {
      return NextResponse.json({ error: 'storeId, pixelId, orderId required' }, { status: 400 });
    }

    const token = await getMetaToken(input.storeId);
    if (!token?.accessToken) {
      return NextResponse.json({ error: 'Meta not connected' }, { status: 401 });
    }

    // Build user_data with SHA-256 hashed PII
    const userData: Record<string, unknown> = {};
    if (input.customer.email) userData.em = hashIfPlain(input.customer.email);
    if (input.customer.phone) userData.ph = hashIfPlain(input.customer.phone);
    if (input.customer.firstName) userData.fn = hashIfPlain(input.customer.firstName);
    if (input.customer.lastName) userData.ln = hashIfPlain(input.customer.lastName);
    if (input.customer.city) userData.ct = hashIfPlain(input.customer.city);
    if (input.customer.zip) userData.zp = hashIfPlain(input.customer.zip);
    if (input.customer.countryCode) userData.country = hashIfPlain(input.customer.countryCode);
    if (input.customer.ip) userData.client_ip_address = input.customer.ip;
    if (input.customer.userAgent) userData.client_user_agent = input.customer.userAgent;
    if (input.fbc || input.fbclid) {
      userData.fbc = input.fbc || `fb.1.${Date.now()}.${input.fbclid}`;
    }
    if (input.fbp) userData.fbp = input.fbp;

    // Build custom_data with order details
    const customData: Record<string, unknown> = {
      currency: input.currency || 'USD',
      value: input.totalPrice,
      order_id: input.orderId,
    };

    if (input.lineItems && input.lineItems.length > 0) {
      customData.contents = input.lineItems.map((item) => ({
        id: item.productId,
        quantity: item.quantity,
        item_price: item.price,
      }));
      customData.content_type = 'product';
      customData.num_items = input.lineItems.reduce((s, i) => s + i.quantity, 0);
    }

    const payload = {
      data: [
        {
          event_name: input.eventName || 'Purchase',
          event_time: toUnix(input.eventTime),
          event_id: input.orderId,
          action_source: 'website' as const,
          event_source_url: input.eventSourceUrl || undefined,
          user_data: userData,
          custom_data: customData,
        },
      ],
    };

    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(input.pixelId)}/events?access_token=${encodeURIComponent(token.accessToken)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let status = 'success';
    let emqScore: number | null = null;
    let errorMsg: string | null = null;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        status = 'failed';
        errorMsg = body?.error?.message || `HTTP ${res.status}`;
      } else {
        // Extract EMQ score if available
        if (body?.events_received) {
          emqScore = body.events_received;
        }
        // Meta returns fbtrace_id and events data
        if (body?.data) {
          const eventData = Array.isArray(body.data) ? body.data[0] : body.data;
          if (eventData?.event_match_quality) {
            emqScore = eventData.event_match_quality;
          }
        }
      }
    } catch (err) {
      status = 'failed';
      errorMsg = err instanceof Error ? err.message : 'CAPI request failed';
    } finally {
      clearTimeout(timeout);
    }

    // Log to capi_logs table
    if (isSupabasePersistenceEnabled()) {
      try {
        await rest('/capi_logs', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            store_id: input.storeId,
            order_id: input.orderId,
            status,
            emq_score: emqScore,
            error: errorMsg,
          }),
        });
      } catch {
        // Don't fail the response for logging errors
      }

      // Alert via Slack if EMQ drops below 6.0
      if (emqScore !== null && emqScore < 6.0 && process.env.SLACK_WEBHOOK_URL) {
        try {
          await fetch(process.env.SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `⚠️ OneScale CAPI Alert: EMQ score dropped to ${emqScore} for store ${input.storeId}, order ${input.orderId}. Target is 7.0+.`,
            }),
          });
        } catch {
          // best-effort
        }
      }
    }

    return NextResponse.json({
      ok: status === 'success',
      status,
      emqScore,
      error: errorMsg,
      orderId: input.orderId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
