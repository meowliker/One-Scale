-- OneScale launch schema (Supabase/Postgres)
-- Run this in Supabase SQL editor for production DB bootstrap.

create table if not exists stores (
  id text primary key,
  name text not null,
  domain text not null,
  platform text not null default 'shopify',
  api_key text,
  api_secret text,
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  full_name text,
  is_active boolean not null default true,
  must_reset_password boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  id bigserial primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null references app_users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists connections (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  platform text not null check (platform in ('meta', 'shopify')),
  access_token text not null,
  refresh_token text,
  expires_at bigint,
  account_id text,
  account_name text,
  shop_domain text,
  shop_name text,
  scopes text,
  connected_at timestamptz not null default now(),
  last_synced timestamptz,
  unique (store_id, platform)
);

create table if not exists store_ad_accounts (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  ad_account_id text not null,
  ad_account_name text not null,
  platform text not null default 'meta',
  currency text,
  timezone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, ad_account_id)
);

create table if not exists workspace_stores (
  id bigserial primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  store_id text not null references stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workspace_id, store_id),
  unique (store_id)
);

create table if not exists meta_endpoint_snapshots (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  endpoint text not null check (endpoint in ('creatives', 'adsets', 'ads', 'campaigns', 'insights')),
  scope_id text not null default '',
  variant_key text not null default '',
  row_count integer not null default 0,
  payload_json text not null,
  updated_at timestamptz not null default now(),
  unique (store_id, endpoint, scope_id, variant_key)
);

create index if not exists idx_store_ad_accounts_store
  on store_ad_accounts(store_id);

create index if not exists idx_workspace_members_user
  on workspace_members(user_id);

create index if not exists idx_workspace_stores_workspace
  on workspace_stores(workspace_id);

create index if not exists idx_meta_endpoint_snapshots_lookup
  on meta_endpoint_snapshots(store_id, endpoint, scope_id, updated_at desc);

-- Daily command-center tables (phase A baseline)
create table if not exists decision_rulesets (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  name text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  rule_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists decision_queue_runs (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  run_date date not null,
  status text not null default 'planned'
    check (status in ('planned', 'approved', 'executing', 'completed', 'failed')),
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (store_id, run_date)
);

create table if not exists decision_queue_items (
  id bigserial primary key,
  run_id bigint not null references decision_queue_runs(id) on delete cascade,
  store_id text not null references stores(id) on delete cascade,
  entity_level text not null check (entity_level in ('campaign', 'adset', 'ad', 'creative')),
  entity_id text not null,
  campaign_id text,
  adset_id text,
  ad_id text,
  action_type text not null,
  reason_code text not null,
  reason_text text,
  metrics_json jsonb not null default '{}'::jsonb,
  confidence numeric(5,2) not null default 0,
  risk_score numeric(5,2) not null default 0,
  impact_score numeric(5,2) not null default 0,
  requires_approval boolean not null default true,
  state text not null default 'suggested'
    check (state in ('suggested', 'approved', 'rejected', 'executed', 'failed')),
  executed_at timestamptz,
  execution_result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_decision_queue_items_state
  on decision_queue_items(store_id, state, risk_score desc, impact_score desc);

create table if not exists action_execution_log (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  queue_item_id bigint references decision_queue_items(id) on delete set null,
  action_type text not null,
  request_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  success boolean not null default false,
  error_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_action_execution_log_store_time
  on action_execution_log(store_id, created_at desc);

-- Visitor identity graph (Triple Whale-style session stitching)
-- Links anonymous sessions to known customers for cross-session attribution.
create table if not exists visitor_identities (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  email_hash text not null,
  -- First-touch attribution (from first ad click)
  first_click_id text,
  first_fbc text,
  first_fbp text,
  first_campaign_id text,
  first_adset_id text,
  first_ad_id text,
  first_touch_at timestamptz,
  -- Last-touch attribution (from most recent ad click)
  last_click_id text,
  last_fbc text,
  last_fbp text,
  last_campaign_id text,
  last_adset_id text,
  last_ad_id text,
  last_touch_at timestamptz,
  -- Customer identity
  customer_id text,
  phone_hash text,
  -- Aggregates
  total_orders integer not null default 0,
  total_revenue numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, email_hash)
);

create index if not exists idx_visitor_identities_store_email
  on visitor_identities(store_id, email_hash);

create index if not exists idx_visitor_identities_store_customer
  on visitor_identities(store_id, customer_id)
  where customer_id is not null;
