// src/lib/pnl/productRollup.ts
import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

interface LineItem {
  product_id?: string | number;
  title?: string;
  price?: string;
  quantity?: number;
}

export interface OrderRow {
  shopify_order_id: string;
  total_price: number;
  subtotal_price: number;
  line_items: string | LineItem[];
  financial_status: string;
}

export interface RolledUpProduct {
  productId: string;
  productTitle: string;
  classification: 'main';
  revenue: number;
  orders: number;
  fees: number;
  unitsSold: number;
  children: Array<{
    productId: string;
    productTitle: string;
    relationship: string;
    unitsSold: number;
    lineRevenue: number; // for reporting only, not added to main revenue
  }>;
}

/**
 * Roll up all order metrics to main products.
 * - Orders with a main product: total_price → that main
 * - Orphan orders (no main): total_price → primary parent via product_families
 * - Unmatched: tracked as 'unassigned'
 */
export async function rollUpOrders(
  storeId: string,
  orders: OrderRow[],
  mainProductIds: Set<string>,
  orderFeeMap: Map<string, number>,
): Promise<{ products: Map<string, RolledUpProduct>; unassignedRevenue: number; unassignedOrders: number }> {

  // Load parent_product fallback from product_classifications
  const parentRows = await rest<Array<{ product_id: string; parent_product: string }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&parent_product=not.is.null&select=product_id,parent_product`
  ).catch(() => []);
  const parentMap = new Map(parentRows.map(r => [r.product_id, r.parent_product]));

  // Also load from product_families (highest co_occurrence per child)
  const familyRows = await rest<Array<{ child_product_id: string; parent_product_id: string; co_occurrence: number }>>(
    `/product_families?store_id=eq.${enc(storeId)}&select=child_product_id,parent_product_id,co_occurrence&order=co_occurrence.desc`
  ).catch(() => []);

  // Build best-parent map from families (first entry per child = highest co_occurrence due to sort)
  const familyParentMap = new Map<string, string>();
  for (const row of familyRows) {
    if (!familyParentMap.has(row.child_product_id)) {
      familyParentMap.set(row.child_product_id, row.parent_product_id);
    }
  }

  const products = new Map<string, RolledUpProduct>();
  let unassignedRevenue = 0;
  let unassignedOrders = 0;

  // Initialize all main products
  for (const pid of mainProductIds) {
    products.set(pid, {
      productId: pid,
      productTitle: '',
      classification: 'main',
      revenue: 0,
      orders: 0,
      fees: 0,
      unitsSold: 0,
      children: [],
    });
  }

  for (const order of orders) {
    if (order.financial_status === 'refunded' || order.financial_status === 'voided') continue;

    let items: LineItem[];
    try {
      items = typeof order.line_items === 'string'
        ? JSON.parse(order.line_items)
        : order.line_items || [];
    } catch { continue; }

    const orderRevenue = Number(order.total_price) || 0;
    const orderId = String(order.shopify_order_id);
    const orderFee = orderFeeMap.get(orderId) ?? 0;

    // Find main product in this order
    let mainInOrder: { id: string; title: string; price: number } | null = null;
    const childItems: Array<{ id: string; title: string; price: number; qty: number }> = [];

    for (const item of items) {
      const pid = item.product_id ? String(item.product_id) : '';
      if (!pid || pid === 'null' || pid === '0') continue;
      const title = item.title || '';
      const price = parseFloat(item.price ?? '0');
      const qty = item.quantity ?? 1;

      if (mainProductIds.has(pid)) {
        if (!mainInOrder || price > mainInOrder.price) {
          mainInOrder = { id: pid, title, price };
        }
      } else {
        childItems.push({ id: pid, title, price, qty });
      }
    }

    let targetMainId: string | null = null;

    if (mainInOrder) {
      // Order has a main product — attribute to it
      targetMainId = mainInOrder.id;
    } else {
      // Orphan order — find parent via families or classifications
      for (const child of childItems) {
        const parent = familyParentMap.get(child.id) || parentMap.get(child.id);
        if (parent && mainProductIds.has(parent)) {
          targetMainId = parent;
          break;
        }
      }
    }

    if (targetMainId) {
      const prod = products.get(targetMainId);
      if (prod) {
        prod.revenue += orderRevenue;
        prod.orders++;
        prod.fees += orderFee;
        if (mainInOrder) {
          prod.productTitle = mainInOrder.title;
          prod.unitsSold += items.filter(i => String(i.product_id) === targetMainId).reduce((s, i) => s + (i.quantity ?? 1), 0);
        }
        // Track children
        for (const child of childItems) {
          const existing = prod.children.find(c => c.productId === child.id);
          if (existing) {
            existing.unitsSold += child.qty;
            existing.lineRevenue += child.price * child.qty;
          } else {
            prod.children.push({
              productId: child.id,
              productTitle: child.title,
              relationship: 'upsell', // default, enriched from product_families
              unitsSold: child.qty,
              lineRevenue: child.price * child.qty,
            });
          }
        }
      }
    } else {
      // Truly unassigned
      unassignedRevenue += orderRevenue;
      unassignedOrders++;
    }
  }

  return { products, unassignedRevenue, unassignedOrders };
}
