import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchShopifyOrders, fetchShopifyOrderCount } from '@/app/api/lib/shopify-client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const action = searchParams.get('action');
  const limit = searchParams.get('limit');
  const sinceId = searchParams.get('since_id');
  const createdAtMin = searchParams.get('created_at_min');
  const createdAtMax = searchParams.get('created_at_max');
  const updatedAtMin = searchParams.get('updated_at_min');
  const updatedAtMax = searchParams.get('updated_at_max');
  const financialStatus = searchParams.get('financial_status');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = await getShopifyToken(storeId);
  if (!token || !token.shopDomain) {
    return NextResponse.json({ error: 'Not authenticated with Shopify' }, { status: 401 });
  }

  try {
    // Return order count only
    if (action === 'count') {
      const count = await fetchShopifyOrderCount(token.accessToken, token.shopDomain, {
        createdAtMin: createdAtMin || undefined,
        createdAtMax: createdAtMax || undefined,
        updatedAtMin: updatedAtMin || undefined,
        updatedAtMax: updatedAtMax || undefined,
        financialStatus: financialStatus || undefined,
      });
      return NextResponse.json({ count });
    }

    const orders = await fetchShopifyOrders(token.accessToken, token.shopDomain, {
      limit: limit ? parseInt(limit, 10) : 250,
      sinceId: sinceId || undefined,
      createdAtMin: createdAtMin || undefined,
      createdAtMax: createdAtMax || undefined,
      updatedAtMin: updatedAtMin || undefined,
      updatedAtMax: updatedAtMax || undefined,
      financialStatus: financialStatus || undefined,
    });
    return NextResponse.json({ data: orders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch orders';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
