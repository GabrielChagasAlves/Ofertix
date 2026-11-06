-- Manual origin override and fallback commercial category.
alter table public.products
  add column if not exists origin_type_source text not null default 'automatic';

alter table public.products
  drop constraint if exists products_origin_type_source_check;
alter table public.products
  add constraint products_origin_type_source_check
  check (origin_type_source in ('automatic', 'manual'));

create or replace function public.preserve_manual_product_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.commercial_category_source = 'manual'
       and new.commercial_category_source <> 'manual' then
      new.commercial_category_id := old.commercial_category_id;
      new.commercial_category_source := 'manual';
      new.commercial_category_set_at := old.commercial_category_set_at;
    end if;

    if old.origin_type_source = 'manual'
       and (
         new.origin_type_source <> 'manual'
         or new.origin_type is distinct from old.origin_type
         or new.origin_country is distinct from old.origin_country
         or new.origin_source is distinct from old.origin_source
       ) then
      new.origin_type := old.origin_type;
      new.origin_type_source := 'manual';
      new.origin_country := old.origin_country;
      new.origin_source := old.origin_source;
    end if;
  end if;
  return new;
end;
$$;

insert into public.offer_categories (name, slug, keywords, excluded_keywords, priority, active)
select 'Outros', 'outros',
       array['sapato','sapatos','tenis','calcado','calcados','roupa','roupas','bolsa','bolsas','acessorio','acessorios','chinelo','sandalia'],
       array[]::text[],
       coalesce((select max(priority) + 100 from public.offer_categories), 100),
       true
where not exists (
  select 1 from public.offer_categories
  where lower(name) = 'outros' or lower(slug) = 'outros'
);
