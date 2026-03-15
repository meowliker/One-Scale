/**
 * GET /api/prism/app-fees?storeId=X
 *
 * GAP 3 — Shopify app subscription fees.
 * Fetches recurring app charges from Shopify Admin API.
 * Shows monthly overhead that reduces real profit.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchFromShopify } from '@/app/api/lib/shopify-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token?.shopDomain) {
    return NextResponse.json({ error: 'No Shopify connection' }, { status: 404 });
  }

  let monthlyTotal = 0;
  const apps: Array<{ name: string; price: number; status: string }> = [];

  try {
    // Recurring charges (monthly app subscriptions)
    const recurring = await fetchFromShopify(
      token.accessToken, token.shopDomain,
      '/admin/api/2024-01/recurring_application_charges.json'
    ) as { recurring_application_charges?: Array<{ name: string; price: string; status: string }> };

    for (const charge of recurring?.recurring_application_charges ?? []) {
      if (charge.status === 'active') {
        const price = parseFloat(charge.price || '0');
        monthlyTotal += price;
        apps.push({ name: charge.name, price, status: charge.status });
      }
    }
  } catch {
    // API scope may not include read_all_orders or billing
  }

  // Get Shopify plan from shop data
  let shopifyPlan = '';
  let shopifyPlanCost = 0;
  try {
    const shop = await fetchFromShopify(
      token.accessToken, token.shopDomain,
      '/admin/api/2024-01/shop.json'
    ) as { shop?: { plan_name?: string } };
    shopifyPlan = shop?.shop?.plan_name || '';

    // Approximate plan costs (Shopify doesn't expose exact billing)
    const planCosts: Record<string, number> = {
      'basic': 39, 'shopify': 105, 'advanced': 399,
      'plus': 2300, 'starter': 5, 'retail': 89,
    };
    shopifyPlanCost = planCosts[shopifyPlan.toLowerCase()] || 0;
  } catch { /* skip */ }

  const totalMonthly = monthlyTotal + shopifyPlanCost;
  const dailyCost = totalMonthly / 30;

  return NextResponse.json({
    store_id: storeId,
    shopify_plan: shopifyPlan,
    shopify_plan_cost: shopifyPlanCost,
    app_subscriptions: apps,
    app_total_monthly: Math.round(monthlyTotal * 100) / 100,
    total_monthly_overhead: Math.round(totalMonthly * 100) / 100,
    daily_deduction: Math.round(dailyCost * 100) / 100,
  });
}
