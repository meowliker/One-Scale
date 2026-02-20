import { NextRequest, NextResponse } from 'next/server';
import { getTrackingConfig } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getPersistentTrackingConfig } from '@/app/api/lib/supabase-tracking';
import { getShopifyToken } from '@/app/api/lib/tokens';

const SHOPIFY_API_VERSION = '2024-01';
const SNIPPET_MARKER = 'TW_TRACKING_PIXEL_SNIPPET_V2';
const LEGACY_SNIPPET_MARKERS = ['TW_TRACKING_PIXEL_SNIPPET_V1'];

interface ShopifyTheme {
  id: number;
  name: string;
  role: string;
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return `${parsed.origin}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function resolveTrackingScriptBaseUrl(request: NextRequest): string {
  const candidates = [
    process.env.TRACKING_PIXEL_BASE_URL,
    process.env.NEXT_PUBLIC_TRACKING_PIXEL_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL,
    new URL(request.url).origin,
  ];
  for (const raw of candidates) {
    const normalized = normalizeBaseUrl(String(raw || ''));
    if (normalized) return normalized;
  }
  return '';
}

function getScriptBaseUrlWarning(scriptBaseUrl: string): string | null {
  try {
    const parsed = new URL(scriptBaseUrl);
    const host = parsed.hostname.toLowerCase();
    const isLocalHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.local');
    if (parsed.protocol !== 'https:' && !isLocalHost) {
      return 'Tracking script URL is not HTTPS. Shopify storefront may block this script.';
    }
    if (isLocalHost) {
      return 'Tracking script URL points to localhost. Use a public HTTPS domain for live storefront tracking.';
    }
    return null;
  } catch {
    return 'Tracking script URL appears invalid. Verify TRACKING_PIXEL_BASE_URL / NEXT_PUBLIC_APP_URL.';
  }
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSnippet(scriptBaseUrl: string, pixelId: string): string {
  const scriptSrc = `${scriptBaseUrl}/api/tracking/pixel?pixelId=${encodeURIComponent(pixelId)}`;
  return `<!-- ${SNIPPET_MARKER} -->
<script id="tw-tracking-pixel">
  !function(t,r,a,c,k){t[k]=t[k]||function(){(t[k].q=t[k].q||[]).push(arguments)};
    var s=r.createElement('script');s.async=1;s.src=a;r.head.appendChild(s);
  }(window,document,'${scriptSrc}','${pixelId}','tw');
  tw('init','${pixelId}');
  tw('track','PageView');
</script>`;
}

function upsertSnippet(current: string, snippet: string, pixelId: string): { nextContent: string; changed: boolean; alreadyInstalled: boolean } {
  const markerCandidates = [SNIPPET_MARKER, ...LEGACY_SNIPPET_MARKERS];
  for (const marker of markerCandidates) {
    const blockRegex = new RegExp(`<!--\\s*${escapeRegex(marker)}\\s*-->[\\s\\S]*?<\\/script>`, 'i');
    if (blockRegex.test(current)) {
      const next = current.replace(blockRegex, snippet);
      return { nextContent: next, changed: next !== current, alreadyInstalled: next === current };
    }
  }

  const idRegex = /<script[^>]*id=['"]tw-tracking-pixel['"][\s\S]*?<\/script>/i;
  if (idRegex.test(current)) {
    const next = current.replace(idRegex, snippet);
    return { nextContent: next, changed: next !== current, alreadyInstalled: next === current };
  }

  const pixelPath = `/api/tracking/pixel?pixelId=${encodeURIComponent(pixelId)}`;
  if (current.includes(pixelPath)) {
    const genericRegex = new RegExp(`<script[^>]*>[\\s\\S]*?${escapeRegex(pixelPath)}[\\s\\S]*?<\\/script>`, 'i');
    if (genericRegex.test(current)) {
      const next = current.replace(genericRegex, snippet);
      return { nextContent: next, changed: next !== current, alreadyInstalled: next === current };
    }
    return { nextContent: current, changed: false, alreadyInstalled: true };
  }

  const nextContent = current.match(/<\/head>/i)
    ? current.replace(/<\/head>/i, `${snippet}\n</head>`)
    : `${current}\n${snippet}\n`;
  return { nextContent, changed: true, alreadyInstalled: false };
}

async function shopifyRequest<T>(
  token: string,
  shopDomain: string,
  endpoint: string,
  init?: RequestInit,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`);
  for (const [key, value] of Object.entries(params || {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API error (${response.status}): ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function POST(request: NextRequest) {
  let storeId = '';
  try {
    const body = (await request.json()) as { storeId?: string };
    storeId = body.storeId || '';
  } catch {
    // no-op, try query fallback
  }
  if (!storeId) {
    storeId = new URL(request.url).searchParams.get('storeId') || '';
  }
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const sb = isSupabasePersistenceEnabled();
  const cfg = sb ? await getPersistentTrackingConfig(storeId) : getTrackingConfig(storeId);
  if (!cfg?.pixel_id || !cfg?.domain) {
    return NextResponse.json({ error: 'Tracking config missing pixel/domain' }, { status: 400 });
  }
  const scriptBaseUrl = resolveTrackingScriptBaseUrl(request);
  if (!scriptBaseUrl) {
    return NextResponse.json(
      { error: 'Tracking script base URL is not configured. Set TRACKING_PIXEL_BASE_URL or NEXT_PUBLIC_APP_URL.' },
      { status: 500 }
    );
  }
  const scriptBaseUrlWarning = getScriptBaseUrlWarning(scriptBaseUrl);

  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token.shopDomain) {
    return NextResponse.json({ error: 'Shopify not connected for this store' }, { status: 401 });
  }

  try {
    const themesRes = await shopifyRequest<{ themes?: ShopifyTheme[] }>(
      token.accessToken,
      token.shopDomain,
      '/themes.json'
    );
    const themes = themesRes.themes || [];
    const mainTheme = themes.find((t) => t.role === 'main') || themes[0];
    if (!mainTheme?.id) {
      return NextResponse.json({ error: 'No Shopify theme found' }, { status: 404 });
    }

    const assetKey = 'layout/theme.liquid';
    const assetRes = await shopifyRequest<{ asset?: { value?: string } }>(
      token.accessToken,
      token.shopDomain,
      `/themes/${mainTheme.id}/assets.json`,
      undefined,
      { 'asset[key]': assetKey }
    );
    const current = assetRes.asset?.value;
    if (!current || typeof current !== 'string') {
      return NextResponse.json({ error: 'Could not read theme.liquid' }, { status: 500 });
    }

    const snippet = buildSnippet(scriptBaseUrl, cfg.pixel_id);
    const { nextContent, changed, alreadyInstalled } = upsertSnippet(current, snippet, cfg.pixel_id);

    if (!changed && alreadyInstalled) {
      return NextResponse.json({
        ok: true,
        alreadyInstalled: true,
        storeId,
        shopDomain: token.shopDomain,
        themeId: mainTheme.id,
        themeName: mainTheme.name,
        scriptBaseUrl,
        warning: scriptBaseUrlWarning,
      });
    }

    await shopifyRequest(
      token.accessToken,
      token.shopDomain,
      `/themes/${mainTheme.id}/assets.json`,
      {
        method: 'PUT',
        body: JSON.stringify({
          asset: {
            key: assetKey,
            value: nextContent,
          },
        }),
      }
    );

    return NextResponse.json({
      ok: true,
      installed: true,
      updatedExisting: current !== nextContent && (current.includes('tw-tracking-pixel') || current.includes('TW_TRACKING_PIXEL_SNIPPET_V1')),
      storeId,
      shopDomain: token.shopDomain,
      themeId: mainTheme.id,
      themeName: mainTheme.name,
      scriptBaseUrl,
      warning: scriptBaseUrlWarning,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to install pixel snippet';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
