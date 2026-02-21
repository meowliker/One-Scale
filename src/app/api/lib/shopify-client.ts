import type {
  ShopifyOrder,
  ShopifyProduct,
  ShopifyCustomer,
  ShopifyLineItem,
  ShopifyVariant,
  ShopifyImage,
  ShopifyCustomerRef,
  ShopifyRefund,
} from '@/types/shopify';

const SHOPIFY_API_VERSION = '2024-01';

// ------ Client Credentials Grant ------

interface ShopifyTokenResponse {
  access_token: string;
  scope: string;
  expires_in: number;
}

/**
 * Obtain an access token using Shopify's Client Credentials Grant.
 * POST https://{shop}/admin/oauth/access_token
 * with grant_type=client_credentials, client_id, client_secret
 *
 * The token expires after ~24 hours (expires_in = 86399).
 */
export async function getShopifyAccessToken(
  shopDomain: string,
  clientId: string,
  clientSecret: string
): Promise<ShopifyTokenResponse> {
  const tokenUrl = `https://${shopDomain}/admin/oauth/access_token`;

  console.log('[Shopify] Requesting access token from:', tokenUrl);

  // 15-second timeout to prevent hanging requests
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[Shopify] Token exchange failed:', response.status, errBody);
      throw new Error(`Shopify token exchange failed (${response.status}): ${errBody}`);
    }

    const data = await response.json() as ShopifyTokenResponse;
    console.log('[Shopify] Token obtained successfully, expires_in:', data.expires_in);
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Shopify token request timed out after 15 seconds. Check your store domain.');
    }
    throw err;
  }
}

// ------ Generic Fetch ------

export async function fetchFromShopify<T>(
  token: string,
  shopDomain: string,
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`
  );
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[Shopify] Retry ${attempt}/${MAX_RETRIES} for ${endpoint}`);
    } else {
      console.log('[Shopify] Fetching:', url.toString());
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Retry on 429 (rate limit) and 503 (service unavailable)
      if (response.status === 429 || response.status === 503) {
        if (attempt < MAX_RETRIES) {
          const retryAfter = response.headers.get('Retry-After');
          const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : Math.min(1000 * Math.pow(2, attempt), 8000);
          console.warn(`[Shopify] Rate limited (${response.status}) on ${endpoint}, waiting ${Math.round(waitMs)}ms`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Shopify API error (${response.status}): ${errorBody}`);
      }

      return response.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        if (attempt < MAX_RETRIES) {
          console.warn(`[Shopify] Timeout on ${endpoint}, retrying...`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`Shopify API request timed out for ${endpoint}`);
      }
      throw err;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error(`Shopify API failed after ${MAX_RETRIES} retries for ${endpoint}`);
}

// ------ Mappers (snake_case to camelCase) ------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLineItem(raw: Record<string, any>): ShopifyLineItem {
  return {
    id: raw.id,
    title: raw.title,
    quantity: raw.quantity,
    price: raw.price,
    sku: raw.sku || '',
    productId: raw.product_id,
    variantId: raw.variant_id,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCustomerRef(raw: Record<string, any> | null): ShopifyCustomerRef | null {
  if (!raw) return null;
  return {
    id: raw.id,
    firstName: raw.first_name || '',
    lastName: raw.last_name || '',
    email: raw.email || '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRefund(raw: Record<string, any>): ShopifyRefund {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refundLineItems = (raw.refund_line_items || []).map((rli: any) => ({
    lineItemId: rli.line_item_id,
    quantity: rli.quantity,
    subtotal: rli.subtotal || '0',
  }));

  // Calculate total refund amount from multiple sources (in priority order):
  // 1. order_adjustments with kind 'refund_discrepancy' or total_amount (most reliable for the actual money)
  // 2. refund transactions (actual money refunded to customer)
  // 3. refund_line_items subtotals (may be empty in /orders.json default response)
  // 4. raw.total_amount or raw.total_refunded — Shopify includes this on the refund object
  //
  // BUG FIX: The standard /orders.json endpoint does NOT include transactions inside refund
  // objects unless explicitly requested. The refund object itself has `total_amount` (Shopify
  // REST) or we can sum `refund_line_items[].subtotal` + `refund_line_items[].total_tax`.
  // We must also check `order_adjustments` for adjustments-based refunds.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactions = (raw.transactions || []).filter((t: any) => t.kind === 'refund');

  // Order adjustments can represent the actual cash refunded (negative amounts = refund to customer)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderAdjustments = (raw.order_adjustments || []).filter((a: any) => a.kind === 'refund_discrepancy' || parseFloat(a.amount || '0') < 0);

  let totalAmount = 0;

  if (transactions.length > 0) {
    // Sum up refund transaction amounts — most reliable source
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    totalAmount = transactions.reduce((sum: number, t: any) => sum + parseFloat(t.amount || '0'), 0);
  } else if (refundLineItems.length > 0) {
    // Sum refund line item subtotals + their taxes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    totalAmount = refundLineItems.reduce((sum: number, rli: any) => {
      const subtotal = parseFloat(rli.subtotal || '0');
      const totalTax = parseFloat(rli.total_tax || '0');
      return sum + subtotal + totalTax;
    }, 0);
  } else if (orderAdjustments.length > 0) {
    // Use order adjustments — negative amounts = money back to customer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    totalAmount = orderAdjustments.reduce((sum: number, a: any) => sum + Math.abs(parseFloat(a.amount || '0')), 0);
  } else if (raw.total_amount != null) {
    // Shopify REST includes total_amount on each refund object (absolute value)
    totalAmount = Math.abs(parseFloat(raw.total_amount || '0'));
  }

  return {
    id: raw.id,
    createdAt: raw.created_at,
    totalAmount,
    refundLineItems,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrder(raw: Record<string, any>): ShopifyOrder {
  // Extract total shipping from shipping_lines array
  const totalShippingPrice = (raw.shipping_lines || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((sum: number, line: any) => sum + parseFloat(line.price || '0'), 0)
    .toFixed(2);

  return {
    id: raw.id,
    orderNumber: raw.order_number,
    name: raw.name,
    email: raw.email || '',
    totalPrice: raw.total_price,
    subtotalPrice: raw.subtotal_price,
    totalTax: raw.total_tax,
    totalDiscounts: raw.total_discounts,
    totalShippingPrice,
    currency: raw.currency,
    financialStatus: raw.financial_status,
    fulfillmentStatus: raw.fulfillment_status,
    createdAt: raw.created_at,
    lineItems: (raw.line_items || []).map(mapLineItem),
    customer: mapCustomerRef(raw.customer),
    paymentGatewayNames: raw.payment_gateway_names || [],
    refunds: (raw.refunds || []).map(mapRefund),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapVariant(raw: Record<string, any>): ShopifyVariant {
  return {
    id: raw.id,
    title: raw.title,
    price: raw.price,
    compareAtPrice: raw.compare_at_price,
    sku: raw.sku || '',
    inventoryQuantity: raw.inventory_quantity || 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapImage(raw: Record<string, any>): ShopifyImage {
  return {
    id: raw.id,
    src: raw.src,
    alt: raw.alt,
    position: raw.position,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProduct(raw: Record<string, any>): ShopifyProduct {
  return {
    id: raw.id,
    title: raw.title,
    bodyHtml: raw.body_html || '',
    vendor: raw.vendor || '',
    productType: raw.product_type || '',
    status: raw.status,
    tags: typeof raw.tags === 'string'
      ? raw.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : (raw.tags || []),
    variants: (raw.variants || []).map(mapVariant),
    images: (raw.images || []).map(mapImage),
    createdAt: raw.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCustomer(raw: Record<string, any>): ShopifyCustomer {
  return {
    id: raw.id,
    firstName: raw.first_name || '',
    lastName: raw.last_name || '',
    email: raw.email || '',
    phone: raw.phone,
    ordersCount: raw.orders_count || 0,
    totalSpent: raw.total_spent || '0.00',
    currency: raw.currency || 'USD',
    tags: typeof raw.tags === 'string'
      ? raw.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : (raw.tags || []),
  };
}

// ------ Fetchers ------

/**
 * Get the count of orders matching the given filters.
 * Uses Shopify's /orders/count.json endpoint.
 */
export async function fetchShopifyOrderCount(
  token: string,
  shopDomain: string,
  opts: {
    status?: string;
    createdAtMin?: string;
    createdAtMax?: string;
    updatedAtMin?: string;
    updatedAtMax?: string;
    financialStatus?: string;
  } = {}
): Promise<number> {
  const params: Record<string, string> = {
    status: opts.status || 'any',
  };
  if (opts.createdAtMin) params.created_at_min = opts.createdAtMin;
  if (opts.createdAtMax) params.created_at_max = opts.createdAtMax;
  if (opts.updatedAtMin) params.updated_at_min = opts.updatedAtMin;
  if (opts.updatedAtMax) params.updated_at_max = opts.updatedAtMax;
  if (opts.financialStatus) params.financial_status = opts.financialStatus;

  const data = await fetchFromShopify<{ count: number }>(
    token, shopDomain, '/orders/count.json', params
  );
  return data.count;
}

export async function fetchShopifyOrders(
  token: string,
  shopDomain: string,
  opts: {
    limit?: number;
    sinceId?: string;
    status?: string;
    createdAtMin?: string;
    createdAtMax?: string;
    updatedAtMin?: string;
    updatedAtMax?: string;
    financialStatus?: string;
  } = {}
): Promise<ShopifyOrder[]> {
  const pageSize = Math.min(opts.limit || 250, 250); // Shopify max per page is 250
  const params: Record<string, string> = {
    limit: String(pageSize),
    status: opts.status || 'any',
  };
  if (opts.sinceId) {
    params.since_id = opts.sinceId;
  }
  if (opts.createdAtMin) {
    params.created_at_min = opts.createdAtMin;
  }
  if (opts.createdAtMax) {
    params.created_at_max = opts.createdAtMax;
  }
  if (opts.updatedAtMin) {
    params.updated_at_min = opts.updatedAtMin;
  }
  if (opts.updatedAtMax) {
    params.updated_at_max = opts.updatedAtMax;
  }
  if (opts.financialStatus) {
    params.financial_status = opts.financialStatus;
  }

  const data = await fetchFromShopify<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orders: Record<string, any>[];
  }>(token, shopDomain, '/orders.json', params);

  return data.orders.map(mapOrder);
}

export async function fetchShopifyProducts(
  token: string,
  shopDomain: string,
  opts: { limit?: number; sinceId?: string } = {}
): Promise<ShopifyProduct[]> {
  const params: Record<string, string> = {
    limit: String(opts.limit || 50),
  };
  if (opts.sinceId) {
    params.since_id = opts.sinceId;
  }

  const data = await fetchFromShopify<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    products: Record<string, any>[];
  }>(token, shopDomain, '/products.json', params);

  return data.products.map(mapProduct);
}

export async function fetchShopifyCustomers(
  token: string,
  shopDomain: string,
  opts: { limit?: number; sinceId?: string } = {}
): Promise<ShopifyCustomer[]> {
  const params: Record<string, string> = {
    limit: String(opts.limit || 50),
  };
  if (opts.sinceId) {
    params.since_id = opts.sinceId;
  }

  const data = await fetchFromShopify<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customers: Record<string, any>[];
  }>(token, shopDomain, '/customers.json', params);

  return data.customers.map(mapCustomer);
}

// ------ Shopify Payments Balance Transactions ------

export interface BalanceTransaction {
  id: number;
  type: string;          // 'charge' | 'refund' | 'dispute' | 'reserve' | 'payout' | etc.
  amount: string;        // gross amount (e.g. "18.25")
  fee: string;           // processing fee (e.g. "0.79")
  net: string;           // net after fees (e.g. "17.46")
  currency: string;
  sourceOrderId: number | null;
  processedAt: string;   // ISO timestamp
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBalanceTransaction(raw: Record<string, any>): BalanceTransaction {
  return {
    id: raw.id,
    type: raw.type,
    amount: raw.amount,
    fee: raw.fee,
    net: raw.net,
    currency: raw.currency,
    sourceOrderId: raw.source_order_id,
    processedAt: raw.processed_at,
  };
}

/**
 * Fetch Shopify Payments balance transactions.
 * Returns real payment processing fees per transaction.
 * Requires `read_shopify_payments_payouts` scope.
 */
export async function fetchBalanceTransactions(
  token: string,
  shopDomain: string,
  opts: {
    limit?: number;
    sinceId?: string;
    lastId?: string;
    payoutStatus?: string;
  } = {}
): Promise<BalanceTransaction[]> {
  const params: Record<string, string> = {
    limit: String(opts.limit || 250),
  };
  if (opts.sinceId) params.since_id = opts.sinceId;
  if (opts.lastId) params.last_id = opts.lastId;
  if (opts.payoutStatus) params.payout_status = opts.payoutStatus;

  const data = await fetchFromShopify<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transactions: Record<string, any>[];
  }>(token, shopDomain, '/shopify_payments/balance/transactions.json', params);

  return data.transactions.map(mapBalanceTransaction);
}
