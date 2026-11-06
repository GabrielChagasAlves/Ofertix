-- Keep a manually selected commercial category when automatic classification runs.
create or replace function public.sync_product_commercial_category(p_product_id uuid)
returns void
language plpgsql
set search_path = ''
as $function$
begin
  update public.products p
  set commercial_category_id = coalesce(
    (
      select oc.id
      from public.product_rule_matches prm
      join public.offer_rules r on r.id = prm.rule_id
      join public.offer_categories oc on lower(oc.name) = lower(r.category)
      where prm.product_id = p_product_id
        and prm.status <> 'rejected'
        and oc.active = true
      order by oc.priority asc, prm.matched_at desc
      limit 1
    ),
    public.classify_product_commercial_category(p.title, p.category)
  ),
  commercial_category_source = 'automatic',
  updated_at = now()
  where p.id = p_product_id
    and p.commercial_category_source <> 'manual';
end;
$function$;
