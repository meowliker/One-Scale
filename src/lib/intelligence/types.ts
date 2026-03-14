/**
 * Shared types for the Adaptive Intelligence system.
 * All intelligence modules reference these types.
 */

// ── Store Type Detection ──────────────────────────────────────

export type StoreType = 'single_product' | 'funnel' | 'general' | 'subscription' | 'mixed';

// ── Product Intelligence ──────────────────────────────────────

export type ProductClassificationType =
  | 'main'
  | 'upsell'
  | 'downsell'
  | 'bundle'
  | 'subscription'
  | 'gift'
  | 'excluded'
  | 'pending'
  | 'unknown';

export type ClassificationMethod =
  | 'manual'
  | 'subscription'
  | 'tag'
  | 'gift_card'
  | 'alone_percentage'
  | 'first_percentage'
  | 'price'
  | 'order_position'
  | 'auto'
  | 'default';

export interface ProductIntelligenceRow {
  id: number;
  store_id: string;
  product_id: string;
  product_title: string;
  product_type: string;
  vendor: string;
  tags: string;
  is_digital: boolean;
  is_subscription: boolean;
  is_bundle: boolean;
  is_gift_card: boolean;
  requires_shipping: boolean;
  classification: ProductClassificationType;
  classification_confidence: number;
  detection_method: ClassificationMethod;
  alone_percentage: number;
  first_percentage: number;
  average_price: number;
  total_units_sold: number;
  total_revenue: number;
  order_count: number;
  variant_count: number;
  bundle_keywords: boolean;
  paired_product_id: string | null;
  paired_frequency: number;
  manual_override: boolean;
  manual_classification: string | null;
  last_analyzed_at: string;
  created_at: string;
  updated_at: string;
}

// ── Fee Intelligence ──────────────────────────────────────────

export interface FeeStructureRow {
  id: number;
  store_id: string;
  gateway_name: string;
  effective_rate: number;
  fixed_fee: number;
  currency: string;
  sample_size: number;
  min_rate: number;
  max_rate: number;
  std_deviation: number;
  detection_method: string;
  is_active: boolean;
  last_detected_at: string;
  created_at: string;
}

// ── Store Intelligence ────────────────────────────────────────

export type InitStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface StoreIntelligenceRow {
  id: number;
  store_id: string;
  health_score: number;
  health_breakdown: Record<string, number>;
  init_status: InitStatus;
  init_started_at: string | null;
  init_completed_at: string | null;
  init_error: string | null;
  products_analyzed_at: string | null;
  fees_detected_at: string | null;
  campaigns_mapped_at: string | null;
  currency_detected_at: string | null;
  cogs_suggested_at: string | null;
  product_count: number;
  main_product_count: number;
  has_subscriptions: boolean;
  has_bundles: boolean;
  has_digital_products: boolean;
  is_single_product: boolean;
  primary_category: string;
  shopify_plan: string;
  shop_currency: string;
  shop_timezone: string;
  created_at: string;
  updated_at: string;
}

// ── COGS Suggestions ─────────────────────────────────────────

export type CogsSuggestionReason =
  | 'digital_product'
  | 'category_average'
  | 'margin_estimate'
  | 'zero_cost'
  | 'unknown';

export type CogsSuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'ignored';

export interface CogsSuggestionRow {
  id: number;
  store_id: string;
  product_id: string;
  product_title: string;
  suggested_cost: number;
  suggested_type: 'fixed' | 'percentage';
  confidence: number;
  reason: CogsSuggestionReason;
  reasoning_detail: string;
  status: CogsSuggestionStatus;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Currency Config ──────────────────────────────────────────

export interface CurrencyConfigRow {
  id: number;
  store_id: string;
  shop_currency: string;
  presentment_currencies: string;
  meta_currencies: Record<string, string>;
  has_markets: boolean;
  auto_convert: boolean;
  display_currency: string;
  rate_source: string;
  detected_at: string;
  updated_at: string;
}

// ── Campaign Mapping ─────────────────────────────────────────

export interface CampaignMappingRow {
  store_id: string;
  campaign_id: string;
  campaign_name: string;
  product_id: string;
  product_name: string;
  confidence: number;
  method: string;
  last_updated_at: string;
}

// ── P&L Calculator Types ─────────────────────────────────────

export interface PnLWarning {
  type: 'missing_cogs' | 'estimated_fees' | 'no_fee_data' | 'unattributed_spend'
    | 'no_products' | 'stale_data' | 'missing_shipping' | 'currency_mismatch';
  message: string;
  severity: 'info' | 'warning' | 'error';
  productIds?: string[];
  amount?: number;
}

export interface ProductPnL {
  productId: string;
  productTitle: string;
  classification: ProductClassificationType;
  revenue: number;
  unitsSold: number;
  cogs: number;
  cogsSource: 'configured' | 'suggested' | 'zero';
  adSpend: number;
  adSpendConfidence: number;
  fees: number;
  feeMethod: 'actual' | 'detected_rate' | 'configured_rate' | 'estimated';
  shipping: number;
  refunds: number;
  netProfit: number;
  margin: number;
}

export interface PnLResult {
  storeId: string;
  dateFrom: string;
  dateTo: string;
  timezone: string;

  // Totals
  totalRevenue: number;
  totalCogs: number;
  totalAdSpend: number;
  totalFees: number;
  totalShipping: number;
  totalRefunds: number;
  totalChargebackLoss: number;
  totalChargebackWon: number;
  totalChargebackPending: number;
  totalNetProfit: number;
  totalMargin: number;
  orderCount: number;

  // Breakdowns
  mainRevenue: number;
  upsellRevenue: number;
  unattributedSpend: number;
  products: ProductPnL[];

  // Data quality
  warnings: PnLWarning[];
  feeMethod: 'actual' | 'detected_rate' | 'configured_rate' | 'estimated';
  dataCompleteness: number; // 0-100
}

// ── Signal Stack Classifier ─────────────────────────────────

export type SignalStackMethod = 'signal_stack' | 'store_type_rule' | 'manual' | 'edge_case' | 'shopify_tag';

export interface ClassificationSignals {
  alone_pct_score: number;
  position_score: number;
  revenue_score: number;
  tag_score: number;
  type_score: number;
  title_score: number;
  price_score: number;
  app_score: number;
  subscription_score: number;
  main_score: number;
  upsell_score: number;
  confidence: number;
}

export interface SignalStackResult {
  product_id: string;
  product_title: string;
  product_type: string;
  classification: ProductClassificationType;
  confidence: number;
  method: SignalStackMethod;
  signals: ClassificationSignals | null;
  alone_pct: number;
  first_position_pct: number;
  avg_position: number;
  revenue_share: number;
  total_orders_analyzed: number;
  needs_review: boolean;
}

export interface ProductOrderPattern {
  product_id: string;
  product_title: string;
  product_type: string;
  tags: string;
  price: number;
  total_orders: number;
  alone_orders: number;
  alone_pct: number;
  first_position_orders: number;
  first_position_pct: number;
  avg_position: number;
  avg_units_per_order: number;
  revenue_share: number;
  co_purchased_products: Array<{
    product_id: string;
    product_title: string;
    co_purchase_count: number;
    co_purchase_pct: number;
  }>;
  added_programmatically_pct: number;
  requires_selling_plan: boolean;
}
