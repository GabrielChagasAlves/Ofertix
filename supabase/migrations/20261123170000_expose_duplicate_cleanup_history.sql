-- Expose read-only duplicate cleanup history to signed-in users.
-- The underlying table remains inaccessible through the Data API; this RPC
-- returns only operational counters and timestamps and requires a valid user.
create or replace function public.get_duplicate_cleanup_history(p_limit integer default 2500)
returns table (
  id bigint,
  started_at timestamptz,
  finished_at timestamptz,
  deleted_count integer,
  kept_count integer,
  status text,
  details jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória' using errcode = '42501';
  end if;

  return query
  select r.id, r.started_at, r.finished_at, r.deleted_count,
         r.kept_count, r.status, r.details
  from public.duplicate_cleanup_runs r
  order by r.started_at desc
  limit greatest(1, least(coalesce(p_limit, 2500), 3000));
end;
$$;

revoke all on function public.get_duplicate_cleanup_history(integer) from public, anon;
grant execute on function public.get_duplicate_cleanup_history(integer) to authenticated, service_role;
