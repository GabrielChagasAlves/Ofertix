create table if not exists public.coupon_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  marketplace text not null check (marketplace in ('shopee','mercado_livre')),
  source_name text not null,
  source_type text not null check (source_type in ('official_api','authorized_feed','partner_feed')),
  base_url text not null,
  terms_url text,
  enabled boolean not null default false,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupon_sources_base_https check (base_url ~* '^https://'),
  constraint coupon_sources_terms_https check (terms_url is null or terms_url ~* '^https://')
);
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.coupon_sources(id) on delete restrict,
  marketplace text not null check (marketplace in ('shopee','mercado_livre')),
  external_coupon_id text,
  coupon_code text not null,
  discount_type text not null check (discount_type in ('fixed_amount','percentage')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  min_purchase_amount numeric(12,2) check (min_purchase_amount is null or min_purchase_amount >= 0),
  max_discount_amount numeric(12,2) check (max_discount_amount is null or max_discount_amount >= 0),
  starts_at timestamptz,
  expires_at timestamptz not null,
  activation_url text not null,
  source_url text not null,
  source_name text not null,
  terms_text text,
  status text not null default 'active' check (status in ('active','expired','disabled','pending_review')),
  verified_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_activation_https check (activation_url ~* '^https://'),
  constraint coupons_source_https check (source_url ~* '^https://'),
  constraint coupons_expiration_after_start check (starts_at is null or expires_at > starts_at)
);
create unique index if not exists coupons_source_external_id_uidx on public.coupons(source_id, external_coupon_id) where external_coupon_id is not null;
create unique index if not exists coupons_source_market_code_uidx on public.coupons(source_id, marketplace, upper(regexp_replace(trim(coupon_code), '\\s+', '', 'g')));
create index if not exists coupons_active_expiry_idx on public.coupons(status, expires_at) where status = 'active';
create index if not exists coupons_marketplace_created_idx on public.coupons(marketplace, created_at desc);
create table if not exists public.coupon_publications (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  channel_id uuid not null references public.channels(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','publishing','published','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  external_post_id text,
  published_at timestamptz,
  error_message text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(coupon_id, channel_id)
);
create index if not exists coupon_publications_queue_idx on public.coupon_publications(status, next_retry_at, created_at) where status in ('pending','failed');
create table if not exists public.coupon_collection_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.coupon_sources(id) on delete restrict,
  status text not null check (status in ('running','succeeded','partial','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_seen integer not null default 0,
  coupons_inserted integer not null default 0,
  coupons_updated integer not null default 0,
  publications_queued integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists coupon_collection_runs_source_started_idx on public.coupon_collection_runs(source_id, started_at desc);
alter table public.coupon_sources enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_publications enable row level security;
alter table public.coupon_collection_runs enable row level security;
revoke all on public.coupon_sources, public.coupons, public.coupon_publications, public.coupon_collection_runs from anon, authenticated;
grant all on public.coupon_sources, public.coupons, public.coupon_publications, public.coupon_collection_runs to service_role;
