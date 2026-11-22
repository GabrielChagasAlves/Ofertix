create index if not exists products_title_id_preview_idx on public.products (title, id);
drop index if exists public.products_title_preview_idx;

create or replace function public.get_product_category_classification_preview_page(
  p_after_title text default null,
  p_after_id uuid default null,
  p_limit integer default 1000
)
returns table (
  product_id uuid,
  title text,
  marketplace_category text,
  current_category_id uuid,
  current_category text,
  commercial_category_source text,
  suggested_category_id uuid,
  suggested_category text,
  classification_reason text,
  confidence numeric,
  active boolean
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    preview.product_id,
    preview.title,
    preview.marketplace_category,
    preview.current_category_id,
    preview.current_category,
    preview.commercial_category_source,
    preview.suggested_category_id,
    preview.suggested_category,
    preview.classification_reason,
    preview.confidence,
    preview.active
  from public.product_category_classification_preview as preview
  where p_after_title is null
     or (preview.title, preview.product_id) > (p_after_title, p_after_id)
  order by preview.title asc, preview.product_id asc
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
$function$;

revoke all on function public.get_product_category_classification_preview_page(text, uuid, integer) from public, anon;
grant execute on function public.get_product_category_classification_preview_page(text, uuid, integer) to authenticated;
