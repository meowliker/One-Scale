import { createHash } from 'crypto';
import { getMetaToken } from '@/app/api/lib/tokens';

interface ForwardToMetaInput {
  storeId: string;
  pixelId: string;
  eventName: string;
  eventId: string;
  eventTimeIso: string;
  eventSourceUrl?: string | null;
  // Core identifiers (existing)
  fbp?: string | null;
  fbc?: string | null;
  externalId?: string | null;
  emailHash?: string | null;
  phoneHash?: string | null;
  // Enhanced identifiers (new — lift EMQ from ~5 to 8.5+)
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  // Transaction data
  value?: number | null;
  currency?: string | null;
  // Content data (optional)
  contentIds?: string[];
  contentType?: string | null;
  numItems?: number | null;
  orderId?: string | null;
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
  const token = await getMetaToken(input.storeId);
  if (!token?.accessToken) {
    throw new Error('Meta not connected');
  }

  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.pixelId)}/events?access_token=${encodeURIComponent(token.accessToken)}`;

  // Build user_data with maximum parameters for highest Event Match Quality (EMQ).
  // Meta uses these to match server events to ad clicks. More = better = higher attribution.
  // Target: EMQ 8.5+ (vs ~5-6 with basic params)
  const userData: Record<string, unknown> = {};
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  if (input.externalId) userData.external_id = hashIfPlain(input.externalId);
  if (input.emailHash) userData.em = hashIfPlain(input.emailHash);
  if (input.phoneHash) userData.ph = hashIfPlain(input.phoneHash);
  // IP and user agent sent RAW (Meta hashes server-side)
  if (input.clientIpAddress) userData.client_ip_address = input.clientIpAddress;
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent;
  // Name, location sent as SHA256 hashes
  if (input.firstName) userData.fn = hashIfPlain(input.firstName);
  if (input.lastName) userData.ln = hashIfPlain(input.lastName);
  if (input.city) userData.ct = hashIfPlain(input.city);
  if (input.state) userData.st = hashIfPlain(input.state);
  if (input.zip) userData.zp = hashIfPlain(input.zip);
  if (input.country) userData.country = hashIfPlain(input.country);

  // Build custom_data with content and transaction details
  const customData: Record<string, unknown> = {};
  if (typeof input.value === 'number') customData.value = input.value;
  if (input.currency) customData.currency = input.currency;
  if (input.contentIds && input.contentIds.length > 0) customData.content_ids = input.contentIds;
  if (input.contentType) customData.content_type = input.contentType;
  if (typeof input.numItems === 'number') customData.num_items = input.numItems;
  if (input.orderId) customData.order_id = input.orderId;

  const payload = {
    data: [
      {
        event_name: mapEventName(input.eventName),
        event_time: toUnixSeconds(input.eventTimeIso),
        event_id: input.eventId,
        action_source: 'website',
        event_source_url: input.eventSourceUrl || undefined,
        user_data: userData,
        custom_data: Object.keys(customData).length > 0 ? customData : undefined,
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
