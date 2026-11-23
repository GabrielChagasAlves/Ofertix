create index if not exists idx_products_marketplace_normalized_title
on public.products (
  marketplace_id,
  (trim(regexp_replace(
    translate(lower(coalesce(title, '')),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+', ' ', 'g'
  )))
);

create index if not exists idx_offers_product_approval_status
on public.offers (product_id, approval_status);

create or replace function public.get_duplicate_product_groups(
  p_search text default null,
  p_marketplace_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  with normalized as (
    select p.id, p.marketplace_id, p.external_id, p.title, p.price, p.image_url, p.product_url, p.created_at,
      trim(regexp_replace(translate(lower(coalesce(p.title, '')),
        'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        '[^a-z0-9]+', ' ', 'g')) as normalized_title,
      exists (select 1 from public.offers o where o.product_id = p.id and o.approval_status = 'approved') as approved
    from public.products p
    where p_marketplace_id is null or p.marketplace_id = p_marketplace_id
  ),
  grouped as (
    select n.marketplace_id, n.normalized_title, min(n.title) as title, count(*)::integer as item_count,
      count(*) filter (where n.approved)::integer as approved_count,
      bool_or(n.price is not null) as has_price,
      (array_agg(n.id order by n.price asc nulls last, n.created_at asc, n.id asc))[1] as cheapest_id,
      min(n.price) as min_price
    from normalized n
    where n.normalized_title <> ''
    group by n.marketplace_id, n.normalized_title
    having count(*) > 1
  ),
  filtered as (
    select g.* from grouped g
    where nullif(trim(coalesce(p_search, '')), '') is null
      or g.normalized_title ilike '%' || trim(regexp_replace(
        translate(lower(p_search), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        '[^a-z0-9]+', ' ', 'g')) || '%'
  ),
  page_groups as (
    select f.* from filtered f
    order by f.min_price asc nulls last, f.item_count desc, f.title asc
    offset greatest(coalesce(p_page, 1) - 1, 0) * least(greatest(coalesce(p_page_size, 20), 1), 50)
    limit least(greatest(coalesce(p_page_size, 20), 1), 50)
  )
  select jsonb_build_object(
    'total_groups', (select count(*) from filtered),
    'page', greatest(coalesce(p_page, 1), 1),
    'page_size', least(greatest(coalesce(p_page_size, 20), 1), 50),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', pg.marketplace_id::text || '::' || pg.normalized_title,
        'title', pg.title, 'marketplace_id', pg.marketplace_id, 'marketplace_name', m.name,
        'item_count', pg.item_count, 'approved_count', pg.approved_count, 'cheapest_id', pg.cheapest_id, 'has_price', pg.has_price,
        'items', (
          select jsonb_agg(jsonb_build_object(
            'id', n.id, 'title', n.title, 'price', n.price, 'image_url', n.image_url,
            'product_url', n.product_url, 'external_id', n.external_id,
            'created_at', n.created_at, 'approved', n.approved
          ) order by n.price asc nulls last, n.created_at asc, n.id asc)
          from normalized n
          where n.marketplace_id = pg.marketplace_id and n.normalized_title = pg.normalized_title
        )
      ) order by pg.min_price asc nulls last, pg.item_count desc, pg.title asc)
      from page_groups pg left join public.marketplaces m on m.id = pg.marketplace_id
    ), '[]'::jsonb)
  );
$function$;

revoke all on function public.get_duplicate_product_groups(text, uuid, integer, integer) from public;
grant execute on function public.get_duplicate_product_groups(text, uuid, integer, integer) to authenticated;

create or replace function public.delete_duplicate_products_batch(p_candidate_ids uuid[])
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_deleted_ids uuid[] := array[]::uuid[];
  v_protected_ids uuid[] := array[]::uuid[];
  v_kept_ids uuid[] := array[]::uuid[];
  v_missing_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null then raise exception 'Autenticação necessária.' using errcode = '42501'; end if;
  if not public.has_ofertix_permission('products.delete') then raise exception 'Seu usuário não possui permissão para excluir produtos.' using errcode = '42501'; end if;
  if coalesce(cardinality(p_candidate_ids), 0) = 0 then raise exception 'Informe ao menos um produto para processar.' using errcode = '22023'; end if;
  if cardinality(p_candidate_ids) > 100 then raise exception 'O limite por lote é de 100 produtos.' using errcode = '22023'; end if;

  with candidates as (
    select distinct p.id, p.marketplace_id,
      trim(regexp_replace(translate(lower(coalesce(p.title, '')),
        'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        '[^a-z0-9]+', ' ', 'g')) as normalized_title
    from public.products p where p.id = any(p_candidate_ids)
  ),
  target_groups as (
    select distinct marketplace_id, normalized_title from candidates where normalized_title <> ''
  ),
  group_products as (
    select p.id, p.marketplace_id,
      trim(regexp_replace(translate(lower(coalesce(p.title, '')),
        'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        '[^a-z0-9]+', ' ', 'g')) as normalized_title,
      p.price, p.created_at,
      exists (select 1 from public.offers o where o.product_id = p.id and o.approval_status = 'approved') as product_approved
    from public.products p
    join target_groups g on g.marketplace_id = p.marketplace_id
      and g.normalized_title = trim(regexp_replace(translate(lower(coalesce(p.title, '')),
        'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        '[^a-z0-9]+', ' ', 'g'))
  ),
  ranked as (
    select gp.*,
      bool_or(gp.product_approved) over (partition by gp.marketplace_id, gp.normalized_title) as group_has_approved,
      bool_or(gp.price is not null) over (partition by gp.marketplace_id, gp.normalized_title) as group_has_price,
      row_number() over (partition by gp.marketplace_id, gp.normalized_title
        order by gp.price asc nulls last, gp.created_at asc, gp.id asc) as price_rank
    from group_products gp
  ),
  candidate_status as (
    select c.id, r.product_approved, r.group_has_approved, r.group_has_price, r.price_rank
    from candidates c join ranked r on r.id = c.id
  ),
  deleted as (
    delete from public.products p using candidate_status cs
    where p.id = cs.id and (
      (cs.group_has_approved and not cs.product_approved)
      or (not cs.group_has_approved and cs.group_has_price and cs.price_rank > 1)
    )
    returning p.id
  )
  select
    coalesce((select array_agg(id order by id) from deleted), array[]::uuid[]),
    coalesce((select array_agg(id order by id) from candidate_status where product_approved), array[]::uuid[]),
    coalesce((select array_agg(id order by id) from candidate_status where not group_has_approved and (not group_has_price or price_rank = 1)), array[]::uuid[]),
    coalesce((
      select array_agg(input_id order by input_id) from unnest(p_candidate_ids) as input_ids(input_id)
      where not exists (select 1 from public.products p where p.id = input_id)
        and not exists (select 1 from deleted d where d.id = input_id)
    ), array[]::uuid[])
  into v_deleted_ids, v_protected_ids, v_kept_ids, v_missing_ids;

  return jsonb_build_object('deleted_ids', to_jsonb(v_deleted_ids), 'protected_ids', to_jsonb(v_protected_ids),
    'kept_ids', to_jsonb(v_kept_ids), 'missing_ids', to_jsonb(v_missing_ids), 'deleted_count', cardinality(v_deleted_ids));
end;
$function$;

revoke all on function public.delete_duplicate_products_batch(uuid[]) from public;
revoke all on function public.delete_duplicate_products_batch(uuid[]) from anon;
grant execute on function public.delete_duplicate_products_batch(uuid[]) to authenticated;
