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

  with candidate_products as (
    select distinct
      p.id,
      p.marketplace_id,
      trim(regexp_replace(
        translate(lower(coalesce(p.title, '')),
          'áàâãäéèêëíìîïóòôõöúùûüç',
          'aaaaaeeeeiiiiooooouuuuc'),
        '[^a-z0-9]+', ' ', 'g'
      )) as normalized_title
    from public.products p
    where p.id = any(p_candidate_ids)
  ),
  target_groups as (
    select distinct marketplace_id, normalized_title
    from candidate_products
    where normalized_title <> ''
  ),
  group_products as (
    select
      p.id,
      p.marketplace_id,
      trim(regexp_replace(
        translate(lower(coalesce(p.title, '')),
          'áàâãäéèêëíìîïóòôõöúùûüç',
          'aaaaaeeeeiiiiooooouuuuc'),
        '[^a-z0-9]+', ' ', 'g'
      )) as normalized_title,
      p.price,
      p.created_at,
      exists (
        select 1
        from public.offers o
        where o.product_id = p.id
          and (
            o.published_at is not null
            or exists (
              select 1 from public.channel_publications cp
              where cp.offer_id = o.id and cp.status = 'published'
            )
            or exists (
              select 1 from public.offer_publications op
              where op.offer_id = o.id and op.sent_at is not null
            )
          )
      ) as has_publication,
      (
        select count(*)
        from public.offers o
        where o.product_id = p.id
          and (
            o.published_at is not null
            or exists (
              select 1 from public.channel_publications cp
              where cp.offer_id = o.id and cp.status = 'published'
            )
            or exists (
              select 1 from public.offer_publications op
              where op.offer_id = o.id and op.sent_at is not null
            )
          )
      ) as published_offer_count,
      (
        select min(least(o.published_at, op.first_sent_at, cp.first_published_at))
        from public.offers o
        left join lateral (
          select min(opub.sent_at) as first_sent_at
          from public.offer_publications opub
          where opub.offer_id = o.id
        ) op on true
        left join lateral (
          select min(cpub.published_at) as first_published_at
          from public.channel_publications cpub
          where cpub.offer_id = o.id and cpub.status = 'published'
        ) cp on true
        where o.product_id = p.id
          and (
            o.published_at is not null
            or cp.first_published_at is not null
            or op.first_sent_at is not null
          )
      ) as first_published_at,
      (
        nullif(trim(coalesce(p.affiliate_url, '')), '') is not null
        or exists (
          select 1
          from public.affiliate_links al
          where al.product_id = p.id
            and al.status = 'ready'
            and nullif(trim(coalesce(al.affiliate_url, '')), '') is not null
        )
        or exists (
          select 1
          from public.offers o
          where o.product_id = p.id
            and nullif(trim(coalesce(o.affiliate_url, '')), '') is not null
        )
      ) as has_ready_link
    from public.products p
    join target_groups g
      on g.marketplace_id = p.marketplace_id
     and g.normalized_title = trim(regexp_replace(
       translate(lower(coalesce(p.title, '')),
         'áàâãäéèêëíìîïóòôõöúùûüç',
         'aaaaaeeeeiiiiooooouuuuc'),
       '[^a-z0-9]+', ' ', 'g'
     ))
  ),
  ranked_products as (
    select
      gp.*,
      row_number() over (
        partition by gp.marketplace_id, gp.normalized_title
        order by
          gp.has_publication desc,
          gp.published_offer_count desc,
          gp.first_published_at asc nulls last,
          gp.has_ready_link desc,
          gp.price asc nulls last,
          gp.created_at asc,
          gp.id asc
      ) as duplicate_rank
    from group_products gp
  ),
  candidate_status as (
    select
      cp.id,
      rp.duplicate_rank,
      rp.has_publication
    from candidate_products cp
    join ranked_products rp on rp.id = cp.id
  ),
  deleted as (
    delete from public.products p
    using candidate_status cs
    where p.id = cs.id
      and cs.duplicate_rank > 1
      and not cs.has_publication
    returning p.id
  )
  select
    coalesce((select array_agg(id order by id) from deleted), array[]::uuid[]),
    coalesce((select array_agg(id order by id) from candidate_status where has_publication), array[]::uuid[]),
    coalesce((select array_agg(id order by id) from candidate_status where duplicate_rank = 1 and not has_publication), array[]::uuid[]),
    coalesce((
      select array_agg(candidates.candidate_id order by candidates.candidate_id)
      from unnest(p_candidate_ids) as candidates(candidate_id)
      where not exists (select 1 from public.products p where p.id = candidates.candidate_id)
        and not exists (select 1 from deleted d where d.id = candidates.candidate_id)
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

revoke all on function public.delete_duplicate_products_batch(uuid[]) from public;
revoke all on function public.delete_duplicate_products_batch(uuid[]) from anon;
grant execute on function public.delete_duplicate_products_batch(uuid[]) to authenticated;
