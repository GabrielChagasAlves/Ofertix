create or replace function public.delete_duplicate_products_batch(p_candidate_ids uuid[])
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_deleted_ids uuid[] := array[]::uuid[];
  v_protected_ids uuid[] := array[]::uuid[];
  v_kept_ids uuid[] := array[]::uuid[];
  v_missing_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;
  if not public.has_ofertix_permission('products.delete') then
    raise exception 'Seu usuário não possui permissão para excluir produtos.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_candidate_ids), 0) = 0 then
    raise exception 'Informe ao menos um produto para processar.' using errcode = '22023';
  end if;
  if cardinality(p_candidate_ids) > 100 then
    raise exception 'O limite por lote é de 100 produtos.' using errcode = '22023';
  end if;

  with candidates as (
    select distinct p.id, p.marketplace_id,
      trim(regexp_replace(translate(lower(coalesce(p.title, '')),
        'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        '[^a-z0-9]+', ' ', 'g')) as normalized_title
    from public.products p
    where p.id = any(p_candidate_ids)
  ),
  target_groups as (
    select distinct marketplace_id, normalized_title
    from candidates
    where normalized_title <> ''
  ),
  group_products as (
    select p.id, p.marketplace_id,
      trim(regexp_replace(translate(lower(coalesce(p.title, '')),
        'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        '[^a-z0-9]+', ' ', 'g')) as normalized_title,
      p.price, p.created_at
    from public.products p
    join target_groups g
      on g.marketplace_id = p.marketplace_id
     and g.normalized_title = trim(regexp_replace(translate(lower(coalesce(p.title, '')),
        'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        '[^a-z0-9]+', ' ', 'g'))
  ),
  ranked as (
    select gp.*,
      row_number() over (
        partition by gp.marketplace_id, gp.normalized_title
        order by gp.price asc nulls last, gp.created_at asc, gp.id asc
      ) as price_rank
    from group_products gp
  ),
  candidate_status as (
    select c.id, r.price_rank
    from candidates c
    join ranked r on r.id = c.id
  ),
  deleted as (
    delete from public.products p
    using candidate_status cs
    where p.id = cs.id
      and cs.price_rank > 1
    returning p.id
  )
  select
    coalesce((select array_agg(id order by id) from deleted), array[]::uuid[]),
    array[]::uuid[],
    coalesce((select array_agg(id order by id) from candidate_status where price_rank = 1), array[]::uuid[]),
    coalesce((
      select array_agg(input_id order by input_id)
      from unnest(p_candidate_ids) as input_ids(input_id)
      where not exists (select 1 from public.products p where p.id = input_id)
        and not exists (select 1 from deleted d where d.id = input_id)
    ), array[]::uuid[])
  into v_deleted_ids, v_protected_ids, v_kept_ids, v_missing_ids;

  return jsonb_build_object(
    'deleted_ids', to_jsonb(v_deleted_ids),
    'protected_ids', to_jsonb(v_protected_ids),
    'kept_ids', to_jsonb(v_kept_ids),
    'missing_ids', to_jsonb(v_missing_ids),
    'deleted_count', cardinality(v_deleted_ids)
  );
end;
$function$;
