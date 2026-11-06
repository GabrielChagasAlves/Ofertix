alter table public.marketplace_listings
  add column if not exists price_synced_at timestamptz;

alter table public.offers
  add column if not exists product_variation_id uuid,
  add column if not exists price_snapshot numeric(14,2),
  add column if not exists original_price_snapshot numeric(14,2),
  add column if not exists variation_label text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'offers_product_variation_id_fkey'
      and conrelid = 'public.offers'::regclass
  ) then
    alter table public.offers
      add constraint offers_product_variation_id_fkey
      foreign key (product_variation_id)
      references public.product_variations(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists offers_product_variation_idx
  on public.offers(product_variation_id);
