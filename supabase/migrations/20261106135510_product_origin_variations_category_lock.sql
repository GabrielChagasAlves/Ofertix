-- Product origin, immutable manual commercial category, and Shopee variation pricing.
alter table public.products
  add column if not exists origin_type text not null default 'unknown',
  add column if not exists origin_country text,
  add column if not exists origin_source text,
  add column if not exists commercial_category_source text not null default 'automatic',
  add column if not exists commercial_category_set_at timestamptz,
  add column if not exists price_synced_at timestamptz;

alter table public.products
  drop constraint if exists products_origin_type_check;
alter table public.products
  add constraint products_origin_type_check
  check (origin_type in ('national', 'imported', 'unknown'));

alter table public.products
  drop constraint if exists products_commercial_category_source_check;
alter table public.products
  add constraint products_commercial_category_source_check
  check (commercial_category_source in ('automatic', 'manual'));

create or replace function public.preserve_manual_product_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.commercial_category_source = 'manual'
     and new.commercial_category_source <> 'manual' then
    new.commercial_category_id := old.commercial_category_id;
    new.commercial_category_source := 'manual';
    new.commercial_category_set_at := old.commercial_category_set_at;
  end if;
  return new;
end;
$$;

drop trigger if exists products_preserve_manual_category on public.products;
create trigger products_preserve_manual_category
before update on public.products
for each row
execute function public.preserve_manual_product_category();

create table if not exists public.product_variations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  external_variation_id text not null,
  name text not null,
  unit_quantity integer,
  price numeric(14,2) not null check (price > 0),
  original_price numeric(14,2),
  currency text not null default 'BRL',
  attributes jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, external_variation_id)
);

create index if not exists product_variations_product_active_idx
  on public.product_variations (product_id, active);

alter table public.product_variations enable row level security;
grant select on public.product_variations to anon, authenticated;
grant insert, update, delete on public.product_variations to authenticated;
grant all on public.product_variations to service_role;

drop policy if exists "public can read active product variations" on public.product_variations;
create policy "public can read active product variations"
  on public.product_variations for select
  to anon, authenticated
  using (
    active = true
    and exists (
      select 1 from public.products p
      where p.id = product_variations.product_id and p.active = true
    )
  );

drop policy if exists "authenticated users can manage product variations" on public.product_variations;
create policy "authenticated users can manage product variations"
  on public.product_variations for all
  to authenticated
  using (true)
  with check (true);
