import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getAllStores, createStore, deleteStore, getStore } from '@/app/api/lib/db';
import { upsertConnection } from '@/app/api/lib/db';
import { fetchFromShopify, getShopifyAccessToken } from '@/app/api/lib/shopify-client';

export async function GET() {
  try {
    const stores = getAllStores();

    // Map to frontend-friendly shape
    const result = stores.map((s) => ({
      id: s.id,
      name: s.name,
      domain: s.domain,
      platform: s.platform,
      createdAt: s.created_at,
      shopifyConnected: s.shopifyConnected,
      metaConnected: s.metaConnected,
      adAccounts: s.adAccounts.map((a) => ({
        id: a.ad_account_id,
        name: a.ad_account_name,
        platform: a.platform,
        accountId: a.ad_account_id,
        currency: a.currency || 'USD',
        timezone: a.timezone || 'UTC',
        isActive: a.is_active === 1,
      })),
    }));

    return NextResponse.json({ stores: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, domain, platform, shopifyApiKey, shopifyApiSecret } = body as {
      name?: string;
      domain?: string;
      platform?: string;
      shopifyApiKey?: string;
      shopifyApiSecret?: string;
    };

    if (!name || !domain) {
      return NextResponse.json(
        { error: 'Name and domain are required' },
        { status: 400 }
      );
    }

    if (!shopifyApiKey || !shopifyApiSecret) {
      return NextResponse.json(
        { error: 'Client ID and Client Secret are required' },
        { status: 400 }
      );
    }

    // Clean domain — ensure it ends with .myshopify.com
    let cleanDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .trim();
    if (!cleanDomain.includes('.')) {
      cleanDomain = `${cleanDomain}.myshopify.com`;
    }

    // Step 1: Use Client Credentials Grant to get an access token
    console.log('[Stores] Connecting Shopify store:', cleanDomain);
    let accessToken: string;
    let expiresIn: number;
    try {
      const tokenData = await getShopifyAccessToken(cleanDomain, shopifyApiKey, shopifyApiSecret);
      accessToken = tokenData.access_token;
      expiresIn = tokenData.expires_in;
      console.log('[Stores] Got access token, expires_in:', expiresIn);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Stores] Token exchange failed:', msg);
      return NextResponse.json(
        { error: `Could not authenticate with Shopify: ${msg}` },
        { status: 400 }
      );
    }

    // Step 2: Validate by fetching shop info
    let shopName: string | null = null;
    try {
      const shopData = await fetchFromShopify<{ shop: { name: string } }>(
        accessToken,
        cleanDomain,
        '/shop.json'
      );
      shopName = shopData.shop?.name || name;
    } catch {
      return NextResponse.json(
        { error: 'Got access token but could not fetch shop data. Check your app permissions.' },
        { status: 400 }
      );
    }

    // Generate a unique store ID
    const storeId = `store-${randomBytes(6).toString('hex')}`;

    // Create the store in DB (save client ID + secret for token refresh)
    const store = createStore({
      id: storeId,
      name: shopName || name,
      domain: cleanDomain,
      platform: platform || 'shopify',
      apiKey: shopifyApiKey,
      apiSecret: shopifyApiSecret,
    });

    // Save the access token in connections (with expiry)
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    upsertConnection({
      storeId: store.id,
      platform: 'shopify',
      accessToken,
      expiresAt,
      shopDomain: cleanDomain,
      shopName: shopName || name,
    });

    return NextResponse.json({
      store: {
        id: store.id,
        name: store.name,
        domain: store.domain,
        platform: store.platform,
        createdAt: store.created_at,
        shopifyConnected: true,
        metaConnected: false,
        adAccounts: [],
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('UNIQUE constraint failed')) {
      return NextResponse.json(
        { error: 'A store with this domain already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json(
        { error: 'storeId is required' },
        { status: 400 }
      );
    }

    const store = getStore(storeId);
    if (!store) {
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404 }
      );
    }

    deleteStore(storeId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
