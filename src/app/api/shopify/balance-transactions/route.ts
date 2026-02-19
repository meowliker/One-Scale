import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchBalanceTransactions } from '@/app/api/lib/shopify-client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const limit = searchParams.get('limit');
  const sinceId = searchParams.get('since_id');
  const lastId = searchParams.get('last_id');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = await getShopifyToken(storeId);
  if (!token || !token.shopDomain) {
    return NextResponse.json({ error: 'Not authenticated with Shopify' }, { status: 401 });
  }

  try {
    const transactions = await fetchBalanceTransactions(token.accessToken, token.shopDomain, {
      limit: limit ? parseInt(limit, 10) : 250,
      sinceId: sinceId || undefined,
      lastId: lastId || undefined,
    });
    return NextResponse.json({ data: transactions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch balance transactions';
    // If the scope is not available, return empty array with a warning
    if (message.includes('403') || message.includes('401')) {
      console.warn('[Shopify] Balance transactions not accessible — scope may be missing');
      return NextResponse.json({ data: [], warning: 'Shopify Payments data not accessible' });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
