import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchShopifyOrders } from '@/app/api/lib/shopify-client';

/**
 * GET /api/shopify/payment-gateways?storeId=xxx
 *
 * Scans recent Shopify orders to detect which payment gateways are in use.
 * Returns a deduplicated list of gateway names found across orders.
 * This helps auto-populate the Payment Fees configuration in P&L settings.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = await getShopifyToken(storeId);
  if (!token || !token.shopDomain) {
    return NextResponse.json({ error: 'Not authenticated with Shopify' }, { status: 401 });
  }

  try {
    // Fetch last 250 orders to detect gateways
    const orders = await fetchShopifyOrders(token.accessToken, token.shopDomain, {
      limit: 250,
    });

    // Collect unique gateway names and count usage
    const gatewayCounts = new Map<string, number>();
    for (const order of orders) {
      for (const gateway of order.paymentGatewayNames) {
        const name = normalizeGatewayName(gateway);
        gatewayCounts.set(name, (gatewayCounts.get(name) || 0) + 1);
      }
    }

    // Sort by usage count (most used first)
    const gateways = Array.from(gatewayCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        rawName: name,
        orderCount: count,
        percentage: orders.length > 0 ? Math.round((count / orders.length) * 100) : 0,
      }));

    return NextResponse.json({
      data: gateways,
      totalOrders: orders.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to detect payment gateways';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Normalize Shopify gateway names to friendly display names.
 * e.g. "shopify_payments" → "Shopify Payments"
 */
function normalizeGatewayName(raw: string): string {
  const map: Record<string, string> = {
    shopify_payments: 'Shopify Payments',
    paypal: 'PayPal',
    stripe: 'Stripe',
    manual: 'Manual Payment',
    cash_on_delivery: 'Cash on Delivery',
    money_order: 'Money Order',
    bank_deposit: 'Bank Deposit',
    gift_card: 'Gift Card',
    afterpay: 'Afterpay',
    klarna: 'Klarna',
    apple_pay: 'Apple Pay',
    google_pay: 'Google Pay',
  };
  return map[raw.toLowerCase()] || raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
