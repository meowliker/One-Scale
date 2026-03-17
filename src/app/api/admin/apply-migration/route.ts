import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/apply-migration
 * Authorization: Bearer {CRON_SECRET}
 *
 * Creates missing tables by inserting + deleting a probe row.
 * PostgREST can't run DDL, so we use the Supabase Management API
 * or fall back to probing the table existence.
 *
 * This endpoint checks which tables are missing and reports them.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const results: Array<{ table: string; status: string }> = [];

  // Check which tables exist
  const tablesToCheck = [
    'shopify_orders_cache',
    'meta_spend_cache',
    'product_classifications',
    'product_behaviors',
    'store_behavior_profiles',
    'store_intelligence',
    'shopify_balance_transactions',
    'shopify_refunds',
    'shopify_chargebacks',
    'daily_pnl_snapshots',
    'onboarding_progress',
    'pnl_snapshots',
    'fee_structures',
    'order_attributions',
    'cron_logs',
  ];

  for (const table of tablesToCheck) {
    try {
      await rest<unknown[]>(`/${table}?select=*&limit=0`);
      results.push({ table, status: 'exists' });
    } catch {
      results.push({ table, status: 'MISSING' });
    }
  }

  const missing = results.filter(r => r.status === 'MISSING').map(r => r.table);

  return NextResponse.json({
    ok: true,
    results,
    missing,
    message: missing.length > 0
      ? `${missing.length} tables missing. Run the SQL migrations in the Supabase SQL Editor.`
      : 'All tables exist.',
    sql: missing.length > 0 ? generateMigrationSQL(missing) : null,
  });
}

function generateMigrationSQL(missing: string[]): string {
  const statements: string[] = [];

  if (missing.includes('shopify_orders_cache')) {
    statements.push(`
-- shopify_orders_cache — full schema matching orchestrator writes
CREATE TABLE IF NOT EXISTS shopify_orders_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  shopify_order_id text NOT NULL,
  order_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  cancelled_at timestamptz,
  financial_status text,
  fulfillment_status text,
  total_price numeric(12,2) DEFAULT 0,
  subtotal_price numeric(12,2) DEFAULT 0,
  total_tax numeric(12,2) DEFAULT 0,
  total_discounts numeric(12,2) DEFAULT 0,
  refund_total numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'USD',
  line_items text,
  customer_id text,
  customer_email text,
  order_status text,
  tags text,
  landing_site text,
  referring_site text,
  discount_codes text,
  total_shipping_price numeric(12,2) DEFAULT 0,
  synced_at timestamptz DEFAULT now(),
  UNIQUE(store_id, shopify_order_id)
);
CREATE INDEX IF NOT EXISTS idx_orders_cache_store ON shopify_orders_cache(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_cache_store_created ON shopify_orders_cache(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_cache_store_status ON shopify_orders_cache(store_id, financial_status);
CREATE INDEX IF NOT EXISTS idx_orders_cache_store_order_status ON shopify_orders_cache(store_id, order_status);
`);
  }

  if (missing.includes('meta_spend_cache')) {
    statements.push(`
-- meta_spend_cache — full schema matching orchestrator writes
CREATE TABLE IF NOT EXISTS meta_spend_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  ad_account_id text,
  campaign_id text NOT NULL,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  date text NOT NULL,
  spend numeric(12,2) DEFAULT 0,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  purchases integer DEFAULT 0,
  purchase_value numeric(12,2) DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id, ad_id, date)
);
CREATE INDEX IF NOT EXISTS idx_meta_spend_store_date ON meta_spend_cache(store_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_spend_campaign ON meta_spend_cache(store_id, campaign_id);
`);
  }

  if (missing.includes('store_intelligence')) {
    statements.push(`
-- store_intelligence — store type detection + health
CREATE TABLE IF NOT EXISTS store_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL UNIQUE,
  store_type text,
  store_type_confidence numeric(5,2),
  store_type_signals jsonb,
  merchant_confirmed_type text,
  has_upsell_app boolean DEFAULT false,
  has_digital_products boolean DEFAULT false,
  has_subscriptions boolean DEFAULT false,
  has_bundles boolean DEFAULT false,
  avg_products_per_order numeric(5,2),
  avg_order_value numeric(12,2),
  total_active_products int,
  store_type_detected_at timestamptz,
  init_status text,
  init_started_at timestamptz,
  init_completed_at timestamptz,
  init_error text,
  health_score int DEFAULT 0,
  health_breakdown jsonb,
  product_count int DEFAULT 0,
  main_product_count int DEFAULT 0,
  is_single_product boolean DEFAULT false,
  shop_currency text DEFAULT 'USD',
  shopify_plan text,
  shop_timezone text DEFAULT 'America/New_York',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
`);
  }

  if (missing.includes('fee_structures')) {
    statements.push(`
-- fee_structures — auto-detected payment fee rates
CREATE TABLE IF NOT EXISTS fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  gateway_name text,
  effective_rate numeric(8,6) DEFAULT 0,
  fixed_fee numeric(8,4) DEFAULT 0,
  is_active boolean DEFAULT true,
  sample_size int DEFAULT 0,
  detected_at timestamptz DEFAULT now(),
  UNIQUE(store_id, gateway_name)
);
`);
  }

  if (missing.includes('pnl_snapshots')) {
    statements.push(`
-- pnl_snapshots — enriched P&L with breakdowns
CREATE TABLE IF NOT EXISTS pnl_snapshots (
  store_id text NOT NULL,
  date text NOT NULL,
  revenue numeric(12,2) DEFAULT 0,
  net_revenue numeric(12,2) DEFAULT 0,
  ad_spend numeric(12,2) DEFAULT 0,
  cogs numeric(12,2) DEFAULT 0,
  payment_fees numeric(12,2) DEFAULT 0,
  handling_fees numeric(12,2) DEFAULT 0,
  chargebacks numeric(12,2) DEFAULT 0,
  refunds numeric(12,2) DEFAULT 0,
  net_profit numeric(12,2) DEFAULT 0,
  margin numeric(8,2) DEFAULT 0,
  order_count int DEFAULT 0,
  cancelled_count int DEFAULT 0,
  currency text DEFAULT 'USD',
  product_breakdown text,
  campaign_breakdown text,
  computed_at timestamptz DEFAULT now(),
  PRIMARY KEY (store_id, date)
);
`);
  }

  if (missing.includes('cron_logs')) {
    statements.push(`
-- cron_logs — scheduled job execution logs
CREATE TABLE IF NOT EXISTS cron_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name text NOT NULL,
  store_id text,
  status text NOT NULL,
  rows_processed integer DEFAULT 0,
  error text,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_logs_name ON cron_logs(cron_name, created_at DESC);
`);
  }

  return statements.join('\n');
}
