import { getShopifyToken } from '@/app/api/lib/tokens';

const SHOPIFY_GRAPHQL_VERSION = '2026-01';

// ---- Response Types ----

interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }> }>;
  extensions?: {
    cost: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

// ---- Order Types ----

export interface ShopifyGraphQLOrder {
  id: string;
  createdAt: string;
  totalPrice: { amount: string; currencyCode: string };
  lineItems: Array<{
    id: string;
    title: string;
    quantity: number;
    originalUnitPrice: { amount: string };
    product: { id: string; title: string } | null;
  }>;
  customer: {
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
  landingSite: string | null;
  utmParameters: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    content: string | null;
    term: string | null;
  } | null;
  transactionFees: Array<{
    amount: string;
    flatFee: string;
    percentageFee: number;
  }>;
  refunds: Array<{
    totalRefunded: { amount: string; currencyCode: string };
  }>;
}

// ---- Dispute Types ----

export interface ShopifyDispute {
  id: string;
  status: string;
  amount: { amount: string; currencyCode: string };
  reasonMessage: string | null;
  initiatedAt: string;
  finalizedAt: string | null;
  evidenceDueBy: string;
  order: { id: string; name: string } | null;
}

// ---- Internal raw response shapes ----

interface RawOrderNode {
  id: string;
  createdAt: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        quantity: number;
        originalUnitPriceSet: { shopMoney: { amount: string } };
        product: { id: string; title: string } | null;
      };
    }>;
  };
  customer: {
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
  landingSite: string | null;
  attributionDetails: {
    utmParameters: {
      source: string | null;
      medium: string | null;
      campaign: string | null;
      content: string | null;
      term: string | null;
    } | null;
  } | null;
  transactions: Array<{
    fees: Array<{
      amount: { amount: string };
      flatFee: { amount: string };
      rate: string;
    }>;
  }>;
  refunds: Array<{
    totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } };
  }>;
}

interface RawOrdersResponse {
  orders: {
    edges: Array<{ node: RawOrderNode; cursor: string }>;
    pageInfo: { hasNextPage: boolean; endCursor: string };
  };
}

interface RawDisputeNode {
  id: string;
  status: string;
  amount: { amount: string; currencyCode: string };
  reasonMessage: string | null;
  initiatedAt: string;
  finalizedAt: string | null;
  evidenceSentOn: string;
  evidenceDueBy: string;
  order: { id: string; name: string } | null;
}

interface RawDisputesResponse {
  shopifyPaymentsAccount: {
    disputes: {
      edges: Array<{ node: RawDisputeNode }>;
    };
  } | null;
}

// ---- Rate limit helpers ----

const THROTTLE_MIN_AVAILABLE = 100;
const THROTTLE_BACKOFF_MS = 2000;

async function throttleIfNeeded<T>(response: GraphQLResponse<T>): Promise<void> {
  const cost = response.extensions?.cost;
  if (!cost) return;
  const { currentlyAvailable, restoreRate } = cost.throttleStatus;
  const { requestedQueryCost } = cost;

  if (currentlyAvailable < requestedQueryCost || currentlyAvailable < THROTTLE_MIN_AVAILABLE) {
    // Wait for enough points to restore
    const pointsNeeded = Math.max(requestedQueryCost - currentlyAvailable, 0);
    const waitMs = Math.max((pointsNeeded / restoreRate) * 1000, THROTTLE_BACKOFF_MS);
    console.log(`[Shopify GraphQL] Throttling: ${currentlyAvailable} available, need ${requestedQueryCost}. Waiting ${Math.round(waitMs)}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

// ---- Core GraphQL executor ----

export async function shopifyGraphQL<T>(
  storeId: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const tokens = await getShopifyToken(storeId);
  if (!tokens || !tokens.accessToken || !tokens.shopDomain) {
    throw new Error(`No Shopify credentials found for store ${storeId}`);
  }

  const url = `https://${tokens.shopDomain}/admin/api/${SHOPIFY_GRAPHQL_VERSION}/graphql.json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': tokens.accessToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Shopify GraphQL error (${response.status}): ${errBody}`);
    }

    const result = (await response.json()) as GraphQLResponse<T>;

    if (result.errors && result.errors.length > 0) {
      const messages = result.errors.map((e) => e.message).join('; ');
      throw new Error(`Shopify GraphQL query errors: ${messages}`);
    }

    // Proactively throttle if running low on points
    await throttleIfNeeded(result);

    return result.data;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Shopify GraphQL request timed out for store ${storeId}`);
    }
    throw err;
  }
}

// ---- Map raw order node to clean type ----

function mapOrderNode(node: RawOrderNode): ShopifyGraphQLOrder {
  return {
    id: node.id,
    createdAt: node.createdAt,
    totalPrice: {
      amount: node.totalPriceSet.shopMoney.amount,
      currencyCode: node.totalPriceSet.shopMoney.currencyCode,
    },
    lineItems: node.lineItems.edges.map((e) => ({
      id: e.node.id,
      title: e.node.title,
      quantity: e.node.quantity,
      originalUnitPrice: { amount: e.node.originalUnitPriceSet.shopMoney.amount },
      product: e.node.product,
    })),
    customer: node.customer,
    landingSite: node.landingSite,
    utmParameters: node.attributionDetails?.utmParameters ?? null,
    transactionFees: (node.transactions || []).flatMap((t) =>
      (t.fees || []).map((f) => ({
        amount: f.amount.amount,
        flatFee: f.flatFee.amount,
        percentageFee: parseFloat(f.rate || '0'),
      }))
    ),
    refunds: (node.refunds || []).map((r) => ({
      totalRefunded: {
        amount: r.totalRefundedSet.shopMoney.amount,
        currencyCode: r.totalRefundedSet.shopMoney.currencyCode,
      },
    })),
  };
}

// ---- Fetch orders with cursor-based pagination ----

const ORDERS_QUERY = `
query FetchOrders($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
    edges {
      cursor
      node {
        id
        createdAt
        totalPriceSet { shopMoney { amount currencyCode } }
        lineItems(first: 50) {
          edges {
            node {
              id
              title
              quantity
              originalUnitPriceSet { shopMoney { amount } }
              product { id title }
            }
          }
        }
        customer { email phone firstName lastName }
        landingSite
        attributionDetails {
          utmParameters { source medium campaign content term }
        }
        transactions(first: 10) {
          fees { amount { amount } flatFee { amount } rate }
        }
        refunds(first: 20) {
          totalRefundedSet { shopMoney { amount currencyCode } }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`;

export async function fetchOrdersGraphQL(
  storeId: string,
  options: {
    since?: string;
    until?: string;
    financialStatus?: string;
    cursor?: string;
    first?: number;
  } = {}
): Promise<{
  orders: ShopifyGraphQLOrder[];
  pageInfo: { hasNextPage: boolean; endCursor: string };
}> {
  const first = Math.min(options.first || 250, 250);

  // Build Shopify search query string
  const queryParts: string[] = [];
  if (options.since) queryParts.push(`created_at:>='${options.since}'`);
  if (options.until) queryParts.push(`created_at:<='${options.until}'`);
  if (options.financialStatus) queryParts.push(`financial_status:${options.financialStatus}`);

  const variables: Record<string, unknown> = {
    first,
    after: options.cursor || null,
    query: queryParts.length > 0 ? queryParts.join(' AND ') : null,
  };

  const data = await shopifyGraphQL<RawOrdersResponse>(storeId, ORDERS_QUERY, variables);

  const orders = data.orders.edges.map((edge) => mapOrderNode(edge.node));
  const pageInfo = data.orders.pageInfo;

  return { orders, pageInfo };
}

// ---- Fetch disputes/chargebacks ----

const DISPUTES_QUERY = `
query FetchDisputes {
  shopifyPaymentsAccount {
    disputes(first: 250) {
      edges {
        node {
          id
          status
          amount { amount currencyCode }
          reasonMessage
          initiatedAt
          finalizedAt
          evidenceSentOn
          evidenceDueBy
          order { id name }
        }
      }
    }
  }
}
`;

/**
 * Normalize Shopify dispute status to simplified categories.
 * Shopify statuses: needs_response, under_review, charge_refunded, accepted, won, lost
 */
export function normalizeDisputeStatus(status: string): 'lost' | 'won' | 'pending' {
  const s = status.toLowerCase().replace(/_/g, '');
  if (s === 'lost' || s === 'chargerefunded' || s === 'accepted') return 'lost';
  if (s === 'won') return 'won';
  return 'pending'; // needs_response, under_review, or any unknown
}

export async function fetchDisputesGraphQL(storeId: string): Promise<ShopifyDispute[]> {
  const data = await shopifyGraphQL<RawDisputesResponse>(storeId, DISPUTES_QUERY);

  if (!data.shopifyPaymentsAccount) {
    return [];
  }

  return data.shopifyPaymentsAccount.disputes.edges.map((edge) => ({
    id: edge.node.id,
    status: edge.node.status,
    amount: edge.node.amount,
    reasonMessage: edge.node.reasonMessage,
    initiatedAt: edge.node.initiatedAt,
    finalizedAt: edge.node.finalizedAt,
    evidenceDueBy: edge.node.evidenceDueBy,
    order: edge.node.order,
  }));
}
