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

create table if not exists app_credentials (
  id bigserial primary key,
  platform text not null check (platform in ('meta', 'shopify')),
  workspace_id text not null default '__global__',
  app_id text not null,
  app_secret text not null,
  redirect_uri text not null,
  scopes text,
  updated_at timestamptz not null default now(),
  unique (platform, workspace_id)
);

create table if not exists workspace_stores (
  id bigserial primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  store_id text not null references stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workspace_id, store_id),
  unique (store_id)
);

create index if not exists idx_store_ad_accounts_store
  on store_ad_accounts(store_id);

create index if not exists idx_workspace_members_user
  on workspace_members(user_id);

create index if not exists idx_workspace_stores_workspace
  on workspace_stores(workspace_id);

-- Per-store snapshot table helper (used by Supabase persistence mode)
create or replace function ensure_meta_snapshot_store_table(p_store_id text)
returns text
language plpgsql
security definer
as $$
declare
  normalized_store text;
  table_suffix text;
  table_name text;
  idx_lookup text;
  idx_variant text;
begin
  if p_store_id is null or btrim(p_store_id) = '' then
    raise exception 'store_id is required';
  end if;

  normalized_store := regexp_replace(lower(p_store_id), '[^a-z0-9]+', '_', 'g');
  normalized_store := regexp_replace(normalized_store, '^_+|_+$', '', 'g');
  if normalized_store = '' then
    normalized_store := 'store';
  end if;

  table_suffix := substr(md5(p_store_id), 1, 8);
  table_name := format('meta_snapshots_store_%s_%s', left(normalized_store, 24), table_suffix);

  execute format(
    'create table if not exists %I (
      id bigserial primary key,
      store_id text not null references stores(id) on delete cascade,
      endpoint text not null check (endpoint in (''creatives'', ''adsets'', ''ads'', ''campaigns'', ''insights'', ''pages'', ''pixels'', ''instagram'', ''accounts'')),
      scope_id text not null default '''',
      variant_key text not null default '''',
      row_count integer not null default 0,
      payload_json text not null,
      updated_at timestamptz not null default now(),
      unique (store_id, endpoint, scope_id, variant_key),
      check (store_id = %L)
    )',
    table_name,
    p_store_id
  );

  idx_lookup := format('idx_meta_snap_ep_scope_%s', table_suffix);
  idx_variant := format('idx_meta_snap_variant_%s', table_suffix);

  execute format(
    'create index if not exists %I on %I(endpoint, scope_id, updated_at desc)',
    idx_lookup,
    table_name
  );
  execute format(
    'create index if not exists %I on %I(variant_key, endpoint, updated_at desc)',
    idx_variant,
    table_name
  );

  execute format('grant select, insert, update, delete on table %I to service_role', table_name);
  execute format('grant usage, select on sequence %I to service_role', table_name || '_id_seq');

  return table_name;
end;
$$;

grant execute on function ensure_meta_snapshot_store_table(text) to service_role;

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

-- OAuth state tokens (must survive across serverless instances)
create table if not exists oauth_states (
  id bigserial primary key,
  state_token text not null unique,
  store_id text not null,
  platform text not null check (platform in ('meta', 'shopify')),
  shop_domain text,
  workspace_id text,
  created_at timestamptz not null default now(),
  used boolean not null default false
);

create index if not exists idx_oauth_states_token
  on oauth_states(state_token) where not used;

-- Transaction fees from Shopify Payments webhooks
-- Replaces paginated balance-transactions API calls
create table if not exists shopify_transaction_fees (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  order_id text not null,
  transaction_type text not null,
  amount numeric(12,2) not null,
  fee numeric(12,2) not null,
  net numeric(12,2) not null,
  processed_at timestamptz not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (store_id, order_id, transaction_type)
);

create index if not exists idx_txn_fees_store_order
  on shopify_transaction_fees(store_id, order_id);

create index if not exists idx_txn_fees_store_date
  on shopify_transaction_fees(store_id, processed_at desc);

-- Chargebacks from Shopify webhooks
create table if not exists shopify_chargebacks (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  order_id text not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  reason text,
  status text not null,
  created_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (store_id, order_id)
);
-- Creative assets cache (for instant loading of ad previews)
create table if not exists creative_assets (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  ad_id text not null,
  creative_type text not null check (creative_type in ('image', 'video')),
  media_url text,
  thumbnail_url text,
  video_id text,
  headline text,
  body text,
  cta_type text,
  destination_url text,
  cached_at timestamptz not null default now(),
  unique (store_id, ad_id)
);

create index if not exists idx_creative_assets_store_ad
  on creative_assets(store_id, ad_id);

-- Meta entity warehouse (latest-only, query-friendly)
create table if not exists meta_campaign_entities (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  campaign_id text not null,
  campaign_name text not null,
  ad_account_id text,
  ad_account_name text,
  business_manager_id text,
  business_manager_name text,
  facebook_page_id text,
  facebook_page_name text,
  instagram_id text,
  instagram_username text,
  pixel_id text,
  pixel_name text,
  objective text,
  status text,
  daily_budget numeric(12,2),
  lifetime_budget numeric(12,2),
  bid_strategy text,
  start_date text,
  end_date text,
  meta_updated_time text,
  policy_json jsonb not null default '{}'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  source_window_start date,
  source_window_end date,
  source_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (store_id, campaign_id)
);

create table if not exists meta_adset_entities (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  adset_id text not null,
  campaign_id text not null,
  adset_name text not null,
  ad_account_id text,
  ad_account_name text,
  business_manager_id text,
  business_manager_name text,
  facebook_page_id text,
  facebook_page_name text,
  instagram_id text,
  instagram_username text,
  pixel_id text,
  pixel_name text,
  status text,
  daily_budget numeric(12,2),
  bid_amount numeric(12,2),
  start_date text,
  end_date text,
  meta_updated_time text,
  targeting_age_min integer,
  targeting_age_max integer,
  targeting_genders jsonb not null default '[]'::jsonb,
  targeting_locations jsonb not null default '[]'::jsonb,
  targeting_interests jsonb not null default '[]'::jsonb,
  targeting_custom_audiences jsonb not null default '[]'::jsonb,
  targeting_json jsonb not null default '{}'::jsonb,
  policy_json jsonb not null default '{}'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  source_window_start date,
  source_window_end date,
  source_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (store_id, adset_id)
);

create table if not exists meta_ad_entities (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  ad_id text not null,
  adset_id text not null,
  campaign_id text not null,
  ad_name text not null,
  ad_account_id text,
  ad_account_name text,
  business_manager_id text,
  business_manager_name text,
  facebook_page_id text,
  facebook_page_name text,
  instagram_id text,
  instagram_username text,
  pixel_id text,
  pixel_name text,
  status text,
  creative_id text,
  creative_type text,
  primary_text text,
  headline text,
  cta_type text,
  media_url text,
  thumbnail_url text,
  video_id text,
  destination_url text,
  url_tags text,
  policy_json jsonb not null default '{}'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  source_window_start date,
  source_window_end date,
  source_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (store_id, ad_id)
);

create index if not exists idx_meta_campaign_entities_store_status
  on meta_campaign_entities(store_id, status);
create index if not exists idx_meta_campaign_entities_store_account
  on meta_campaign_entities(store_id, ad_account_id);

create index if not exists idx_meta_adset_entities_store_campaign
  on meta_adset_entities(store_id, campaign_id);
create index if not exists idx_meta_adset_entities_store_status
  on meta_adset_entities(store_id, status);
create index if not exists idx_meta_adset_entities_store_account
  on meta_adset_entities(store_id, ad_account_id);

create index if not exists idx_meta_ad_entities_store_adset
  on meta_ad_entities(store_id, adset_id);
create index if not exists idx_meta_ad_entities_store_campaign
  on meta_ad_entities(store_id, campaign_id);
create index if not exists idx_meta_ad_entities_store_status
  on meta_ad_entities(store_id, status);
create index if not exists idx_meta_ad_entities_store_account
  on meta_ad_entities(store_id, ad_account_id);

create table if not exists meta_entity_daily_metrics (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  entity_level text not null check (entity_level in ('campaign', 'adset', 'ad')),
  entity_id text not null,
  campaign_id text,
  adset_id text,
  ad_id text,
  ad_account_id text,
  metric_date date not null,
  metrics_json jsonb not null default '{}'::jsonb,
  source_window_start date,
  source_window_end date,
  source_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (store_id, entity_level, entity_id, metric_date)
);

create index if not exists idx_meta_daily_metrics_store_date
  on meta_entity_daily_metrics(store_id, metric_date desc);

create index if not exists idx_meta_daily_metrics_store_level
  on meta_entity_daily_metrics(store_id, entity_level, metric_date desc);

create index if not exists idx_meta_daily_metrics_store_campaign
  on meta_entity_daily_metrics(store_id, campaign_id, metric_date desc)
  where campaign_id is not null;

create index if not exists idx_meta_daily_metrics_store_adset
  on meta_entity_daily_metrics(store_id, adset_id, metric_date desc)
  where adset_id is not null;

create index if not exists idx_meta_daily_metrics_store_ad
  on meta_entity_daily_metrics(store_id, ad_id, metric_date desc)
  where ad_id is not null;

create or replace view meta_entities_flat_v as
select
  a.store_id,
  c.campaign_id,
  s.adset_id,
  a.ad_id,
  c.campaign_name,
  s.adset_name,
  a.ad_name,
  c.status as campaign_status,
  s.status as adset_status,
  a.status as ad_status,
  coalesce(a.ad_account_id, s.ad_account_id, c.ad_account_id) as ad_account_id,
  coalesce(a.ad_account_name, s.ad_account_name, c.ad_account_name) as ad_account_name,
  coalesce(a.business_manager_id, s.business_manager_id, c.business_manager_id) as business_manager_id,
  coalesce(a.business_manager_name, s.business_manager_name, c.business_manager_name) as business_manager_name,
  coalesce(a.facebook_page_id, s.facebook_page_id, c.facebook_page_id) as facebook_page_id,
  coalesce(a.facebook_page_name, s.facebook_page_name, c.facebook_page_name) as facebook_page_name,
  coalesce(a.instagram_id, s.instagram_id, c.instagram_id) as instagram_id,
  coalesce(a.instagram_username, s.instagram_username, c.instagram_username) as instagram_username,
  coalesce(a.pixel_id, s.pixel_id, c.pixel_id) as pixel_id,
  coalesce(a.pixel_name, s.pixel_name, c.pixel_name) as pixel_name,
  c.objective,
  c.daily_budget as campaign_daily_budget,
  c.lifetime_budget as campaign_lifetime_budget,
  c.bid_strategy,
  c.start_date as campaign_start_date,
  c.end_date as campaign_end_date,
  s.daily_budget as adset_daily_budget,
  s.bid_amount as adset_bid_amount,
  s.start_date as adset_start_date,
  s.end_date as adset_end_date,
  s.targeting_json,
  a.creative_id,
  a.creative_type,
  a.primary_text,
  a.headline,
  a.cta_type,
  a.media_url,
  a.thumbnail_url,
  a.video_id,
  a.destination_url,
  a.url_tags,
  c.metrics_json as campaign_metrics_json,
  s.metrics_json as adset_metrics_json,
  a.metrics_json as ad_metrics_json,
  c.policy_json as campaign_policy_json,
  s.policy_json as adset_policy_json,
  a.policy_json as ad_policy_json,
  a.raw_json as ad_raw_json,
  a.source_window_start,
  a.source_window_end,
  a.source_synced_at,
  a.updated_at
from meta_ad_entities a
join meta_adset_entities s
  on s.store_id = a.store_id
 and s.adset_id = a.adset_id
join meta_campaign_entities c
  on c.store_id = a.store_id
 and c.campaign_id = a.campaign_id;
