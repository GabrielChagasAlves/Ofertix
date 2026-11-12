create table if not exists public.coupons (
 id uuid primary key default gen_random_uuid(),
 marketplace text not null check (marketplace in ('shopee','mercado_livre')),
 title text not null, discount_description text not null, coupon_code text,
 minimum_purchase numeric(12,2), activation_url text not null,
 starts_at timestamptz not null default now(), expires_at timestamptz,
 publish_at timestamptz not null default now(), auto_publish boolean not null default false,
 status text not null default 'draft' check (status in ('draft','scheduled','published','expired','cancelled')),
 published_at timestamptz, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint coupons_minimum_nonnegative check (minimum_purchase is null or minimum_purchase >= 0),
 constraint coupons_valid_window check (expires_at is null or expires_at > starts_at),
 constraint coupons_activation_https check (activation_url ~ '^https://')
);
create index if not exists coupons_status_publish_at_idx on public.coupons(status,publish_at);
alter table public.coupons enable row level security;
revoke all on public.coupons from anon;
grant select,insert,update,delete on public.coupons to authenticated;
drop policy if exists coupons_manage_channels_permission on public.coupons;
create policy coupons_manage_channels_permission on public.coupons for all to authenticated
using (public.has_ofertix_permission('screen.channels'))
with check (public.has_ofertix_permission('screen.channels'));
