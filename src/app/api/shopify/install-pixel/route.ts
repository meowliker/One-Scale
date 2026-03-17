import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { rest } from '@/app/api/lib/supabase-persistence';

const SHOPIFY_API_VERSION = '2024-01';

// POST: Install pixel on a connected Shopify store
export async function POST(request: NextRequest) {
  let storeId = '';
  try {
    const body = await request.json() as { storeId?: string };
    if (body.storeId) storeId = body.storeId;
  } catch { /* body parse failed */ }

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token.shopDomain) {
    return NextResponse.json({ error: 'Shopify not connected for this store' }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  const pixelSnippetUrl = `${baseUrl}/api/pixel/serve?storeId=${encodeURIComponent(storeId)}`;

  const shopifyBase = `https://${token.shopDomain}/admin/api/${SHOPIFY_API_VERSION}`;
  const shopifyHeaders = {
    'X-Shopify-Access-Token': token.accessToken,
    'Content-Type': 'application/json',
  };

  try {
    // ── Step 1: Register Script Tag (auto-injects on all storefront pages) ──
    const existingRes = await fetch(`${shopifyBase}/script_tags.json`, {
      headers: shopifyHeaders,
    });
    if (!existingRes.ok) {
      const text = await existingRes.text();
      throw new Error(`Failed to list script tags (${existingRes.status}): ${text}`);
    }
    const existing = await existingRes.json() as {
      script_tags: Array<{ id: number; src: string }>;
    };

    const alreadyInstalled = existing.script_tags.some(s =>
      s.src.includes('api/pixel/serve')
    );

    let scriptTagId: number | null = null;

    if (!alreadyInstalled) {
      const createRes = await fetch(`${shopifyBase}/script_tags.json`, {
        method: 'POST',
        headers: shopifyHeaders,
        body: JSON.stringify({
          script_tag: {
            event: 'onload',
            src: pixelSnippetUrl,
            display_scope: 'online_store',
          },
        }),
      });
      if (createRes.ok) {
        const created = await createRes.json() as {
          script_tag: { id: number; src: string };
        };
        scriptTagId = created.script_tag?.id ?? null;
      } else {
        const errText = await createRes.text();
        console.error(`[Pixel] Script tag creation failed (${createRes.status}):`, errText);
      }
    } else {
      scriptTagId = existing.script_tags.find(s =>
        s.src.includes('api/pixel/serve')
      )?.id ?? null;
    }

    // ── Step 2: Record installation in DB ────────────────────────────────
    const now = new Date().toISOString();
    try {
      await rest(
        '/pixel_settings?on_conflict=store_id',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{
            store_id: storeId,
            enabled: true,
            script_tag_id: String(scriptTagId ?? ''),
            shopify_domain: token.shopDomain,
            installed_at: now,
            updated_at: now,
          }]),
        }
      );
    } catch (err) {
      console.error('[Pixel] Failed to save pixel_settings:', err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      ok: true,
      scriptTagId,
      alreadyInstalled,
      message: alreadyInstalled
        ? 'Pixel already installed on storefront'
        : 'Pixel installed on storefront',
      checkoutSnippetRequired: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to install pixel';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: Uninstall pixel (clean removal)
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token.shopDomain) {
    return NextResponse.json({ error: 'Shopify not connected' }, { status: 401 });
  }

  // Get script tag ID from DB
  let scriptTagId: string | null = null;
  try {
    const rows = await rest<Array<{ script_tag_id: string | null }>>(
      `/pixel_settings?store_id=eq.${encodeURIComponent(storeId)}&select=script_tag_id&limit=1`
    );
    scriptTagId = rows?.[0]?.script_tag_id ?? null;
  } catch { /* no settings row */ }

  // Remove script tag from Shopify
  if (scriptTagId) {
    try {
      await fetch(
        `https://${token.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/script_tags/${scriptTagId}.json`,
        {
          method: 'DELETE',
          headers: { 'X-Shopify-Access-Token': token.accessToken },
        }
      );
    } catch (err) {
      console.error('[Pixel] Script tag deletion failed:', err instanceof Error ? err.message : err);
    }
  }

  // Mark as disabled in DB
  try {
    await rest(
      `/pixel_settings?store_id=eq.${encodeURIComponent(storeId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ enabled: false, updated_at: new Date().toISOString() }),
      }
    );
  } catch { /* best effort */ }

  return NextResponse.json({ ok: true, message: 'Pixel removed from store' });
}
