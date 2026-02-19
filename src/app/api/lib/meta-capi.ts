import { createHash } from 'crypto';
import { getMetaToken } from '@/app/api/lib/tokens';

interface ForwardToMetaInput {
  storeId: string;
  pixelId: string;
  eventName: string;
  eventId: string;
  eventTimeIso: string;
  eventSourceUrl?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  externalId?: string | null;
  emailHash?: string | null;
  phoneHash?: string | null;
  value?: number | null;
  currency?: string | null;
}

function toUnixSeconds(iso: string): number {
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : Math.floor(Date.now() / 1000);
}

function hashIfPlain(value?: string | null): string | null {
  if (!value) return null;
  if (/^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function mapEventName(name: string): string {
  const normalized = name.trim();
  const map: Record<string, string> = {
    PageView: 'PageView',
    ViewContent: 'ViewContent',
    AddToCart: 'AddToCart',
    InitiateCheckout: 'InitiateCheckout',
    Purchase: 'Purchase',
    Refund: 'Refund',
  };
  return map[normalized] || normalized;
}

export async function forwardToMetaCapi(input: ForwardToMetaInput): Promise<void> {
  const token = getMetaToken(input.storeId);
  if (!token?.accessToken) {
    throw new Error('Meta not connected');
  }

  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.pixelId)}/events?access_token=${encodeURIComponent(token.accessToken)}`;
  const payload = {
    data: [
      {
        event_name: mapEventName(input.eventName),
        event_time: toUnixSeconds(input.eventTimeIso),
        event_id: input.eventId,
        action_source: 'website',
        event_source_url: input.eventSourceUrl || undefined,
        user_data: {
          fbp: input.fbp || undefined,
          fbc: input.fbc || undefined,
          external_id: hashIfPlain(input.externalId) || undefined,
          em: hashIfPlain(input.emailHash) || undefined,
          ph: hashIfPlain(input.phoneHash) || undefined,
        },
        custom_data: {
          value: typeof input.value === 'number' ? input.value : undefined,
          currency: input.currency || undefined,
        },
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meta CAPI failed (${res.status}): ${body}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
