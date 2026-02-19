export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  sku: string;
  productId: number | null;
  variantId: number | null;
}

export interface ShopifyCustomerRef {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface ShopifyRefundLineItem {
  lineItemId: number;
  quantity: number;
  subtotal: string;      // Amount refunded for this line item (excl tax)
}

export interface ShopifyRefund {
  id: number;
  createdAt: string;
  /** Sum of all refund line item subtotals (amount refunded excl tax) */
  totalAmount: number;
  refundLineItems: ShopifyRefundLineItem[];
}

export interface ShopifyOrder {
  id: number;
  orderNumber: number;
  name: string;
  email: string;
  totalPrice: string;
  subtotalPrice: string;
  totalTax: string;
  totalDiscounts: string;
  totalShippingPrice: string;
  currency: string;
  financialStatus: string;
  fulfillmentStatus: string | null;
  createdAt: string;
  lineItems: ShopifyLineItem[];
  customer: ShopifyCustomerRef | null;
  paymentGatewayNames: string[];
  refunds: ShopifyRefund[];
}

export interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  compareAtPrice: string | null;
  sku: string;
  inventoryQuantity: number;
}

export interface ShopifyImage {
  id: number;
  src: string;
  alt: string | null;
  position: number;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  status: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  createdAt: string;
}

export interface ShopifyCustomer {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  ordersCount: number;
  totalSpent: string;
  currency: string;
  tags: string[];
}
