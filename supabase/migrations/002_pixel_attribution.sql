-- Pixel & Attribution tables migration
-- Run this in Supabase SQL editor after schema.sql

-- ── 1. pixel_events — raw first-party pixel hits ─────────────────────────
create table if not exists pixel_events (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  visitor_id text not null,
  session_id text not null,
  event_type text not null check (event_type in ('page_view', 'add_to_cart', 'purchase', 'view_content')),
  page_url text,
  referrer text,
  order_id text,
  order_value numeric(12,2),
  fbclid text,
  gclid text,
  ttclid text,
  _fbc text,
  _fbp text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pixel_events_store_visitor
  on pixel_events(store_id, visitor_id, created_at desc);

create index if not exists idx_pixel_events_store_session
  on pixel_events(store_id, session_id);

create index if not exists idx_pixel_events_store_date
  on pixel_events(store_id, created_at desc);

create index if not exists idx_pixel_events_purchases
  on pixel_events(store_id, event_type, order_id)
  where event_type = 'purchase';

-- ── 2. Alter visitor_identities for pixel-based tracking ─────────────────
-- Add visitor_id column (pixel uses visitor_id, not email_hash)
alter table visitor_identities
  add column if not exists visitor_id text;

-- Pixel attribution columns
alter table visitor_identities
  add column if not exists first_fbclid text;
alter table visitor_identities
  add column if not exists first_utm_campaign text;
alter table visitor_identities
  add column if not exists first_utm_source text;
alter table visitor_identities
  add column if not exists first_seen_at timestamptz;
alter table visitor_identities
  add column if not exists last_fbclid text;
alter table visitor_identities
  add column if not exists last_utm_campaign text;
alter table visitor_identities
  add column if not exists last_utm_source text;
alter table visitor_identities
  add column if not exists last_seen_at timestamptz;
alter table visitor_identities
  add column if not exists total_pageviews integer not null default 0;
alter table visitor_identities
  add column if not exists total_sessions integer not null default 0;

-- Unique constraint for pixel-based visitor lookup
create unique index if not exists idx_visitor_identities_store_visitor
  on visitor_identities(store_id, visitor_id)
  where visitor_id is not null;

-- ── 3. order_attributions — pixel-driven order attribution ───────────────
create table if not exists order_attributions (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  order_id text not null,
  attribution_method text not null default 'pixel'
    check (attribution_method in ('pixel', 'utm_only', 'server_side', 'manual')),
  visitor_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  _fbc text,
  _fbp text,
  first_touch_source text,
  first_touch_campaign text,
  first_touch_at timestamptz,
  days_to_convert integer not null default 0,
  sessions_before_purchase integer not null default 0,
  order_value numeric(12,2),
  attributed_at timestamptz not null default now(),
  unique (store_id, order_id)
);

create index if not exists idx_order_attributions_store_date
  on order_attributions(store_id, attributed_at desc);

create index if not exists idx_order_attributions_campaign
  on order_attributions(store_id, utm_campaign)
  where utm_campaign is not null;

-- ── 4. pixel_settings — pixel installation state per store ───────────────
create table if not exists pixel_settings (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  enabled boolean not null default false,
  script_tag_id text,
  shopify_domain text,
  installed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (store_id)
);

-- ── 5. Alter daily_pnl_snapshots — add attribution_rate column ───────────
-- This table is upserted by pnl/sync/route.ts
create table if not exists daily_pnl_snapshots (
  id bigserial primary key,
  store_id text not null references stores(id) on delete cascade,
  date date not null,
  revenue numeric(12,2) not null default 0,
  order_count integer not null default 0,
  cogs numeric(12,2) not null default 0,
  ad_spend numeric(12,2) not null default 0,
  shipping_cost numeric(12,2) not null default 0,
  transaction_fees numeric(12,2) not null default 0,
  refunds numeric(12,2) not null default 0,
  full_refund_count integer not null default 0,
  partial_refund_count integer not null default 0,
  full_refund_amount numeric(12,2) not null default 0,
  partial_refund_amount numeric(12,2) not null default 0,
  chargeback_loss numeric(12,2) not null default 0,
  chargeback_won numeric(12,2) not null default 0,
  net_profit numeric(12,2) not null default 0,
  margin numeric(5,2) not null default 0,
  attribution_rate integer not null default 0,
  shopify_synced boolean not null default false,
  meta_synced boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (store_id, date)
);

create index if not exists idx_daily_pnl_snapshots_store_date
  on daily_pnl_snapshots(store_id, date desc);
