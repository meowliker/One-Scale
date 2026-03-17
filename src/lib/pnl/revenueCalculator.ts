/**
 * Revenue Calculator
 *
 * Calculates revenue breakdowns from Shopify order data, separating
 * main product revenue from upsell revenue. Handles discounts at the
 * line-item level and applies refunds by matching to original line items.
 */

import type { ClassificationResult } from '@/lib/attribution/productClassifier';

export interface ShopifyOrderData {
  orderId: string;
  lineItems: Array<{
    productId: string;
    productTitle: string;
    price: number;       // per-unit price
    quantity: number;
    totalDiscount: number; // line-item level discount
  }>;
  refunds: Array<{
    lineItems: Array<{
      productId: string;
      quantity: number;
      amount: number; // refund amount for this line item
    }>;
  }>;
}

export interface ProductRevenue {
  productId: string;
  revenue: number;
  units: number;
  avgPrice: number;
}

export interface RevenueBreakdown {
  grossRevenue: number;
  discounts: number;
  refunds: number;
  netRevenue: number;
  perProduct: ProductRevenue[];
  mainRevenue: number;
  upsellRevenue: number;
}

/**
 * Calculate revenue from orders with product classifications.
 *
 * Logic (from V4.4):
 * - Sum line item prices x quantities for each product
 * - Handle discounts at line-item level
 * - Separate main vs upsell revenue using classifications
 * - Apply refunds by matching refund line items to original line items
 */
export function calculateRevenue(
  orders: ShopifyOrderData[],
  classifications: ClassificationResult[]
): RevenueBreakdown {
  const classMap = new Map<string, ClassificationResult>();
  for (const c of classifications) {
    classMap.set(c.productId, c);
  }

  // Accumulate per-product data
  const productAcc = new Map<string, { revenue: number; units: number }>();
  let totalGross = 0;
  let totalDiscounts = 0;
  let totalRefunds = 0;

  for (const order of orders) {
    // Sum line item revenue
    for (const item of order.lineItems) {
      const lineGross = item.price * item.quantity;
      const lineDiscount = item.totalDiscount || 0;
      const lineNet = lineGross - lineDiscount;

      totalGross += lineGross;
      totalDiscounts += lineDiscount;

      const acc = productAcc.get(item.productId) || { revenue: 0, units: 0 };
      acc.revenue += lineNet;
      acc.units += item.quantity;
      productAcc.set(item.productId, acc);
    }

    // Apply refunds by matching to original line items
    for (const refund of order.refunds) {
      for (const refundItem of refund.lineItems) {
        totalRefunds += refundItem.amount;

        const acc = productAcc.get(refundItem.productId);
        if (acc) {
          acc.revenue -= refundItem.amount;
          acc.units -= refundItem.quantity;
        }
      }
    }
  }

  // Build per-product breakdown
  const perProduct: ProductRevenue[] = [];
  let mainRevenue = 0;
  let upsellRevenue = 0;

  for (const [productId, acc] of productAcc) {
    const avgPrice = acc.units > 0 ? acc.revenue / acc.units : 0;
    perProduct.push({
      productId,
      revenue: acc.revenue,
      units: acc.units,
      avgPrice,
    });

    const classification = classMap.get(productId);
    if (classification?.classification === 'main') {
      mainRevenue += acc.revenue;
    } else {
      // upsell, downsell, addon all count as upsell revenue
      upsellRevenue += acc.revenue;
    }
  }

  const netRevenue = totalGross - totalDiscounts - totalRefunds;

  return {
    grossRevenue: totalGross,
    discounts: totalDiscounts,
    refunds: totalRefunds,
    netRevenue,
    perProduct,
    mainRevenue,
    upsellRevenue,
  };
}
