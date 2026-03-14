import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchShopifyProducts } from '@/app/api/lib/shopify-client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const limit = searchParams.get('limit');
  const sinceId = searchParams.get('since_id');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = await getShopifyToken(storeId);
  if (!token || !token.shopDomain) {
    return NextResponse.json({ error: 'Not authenticated with Shopify' }, { status: 401 });
  }

  try {
    const products = await fetchShopifyProducts(token.accessToken, token.shopDomain, {
      limit: limit ? parseInt(limit, 10) : 50,
      sinceId: sinceId || undefined,
    });

    // Deduplicate by product ID (Shopify can return duplicates across pages)
    const seen = new Set<number>();
    const unique = products.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    return NextResponse.json({ data: unique });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch products';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
