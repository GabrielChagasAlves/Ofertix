create or replace function public.has_ofertix_permission(permission_key text)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.user_id=auth.uid() and p.is_active=true
      and (
        p.role='admin'
        or coalesce(
          p.permissions #>> array[
            case when permission_key like 'screen.%' then 'screens' else 'actions' end,
            case when permission_key like 'screen.%' then substr(permission_key,8) else permission_key end
          ],
          'false'
        )='true'
      )
  );
$$;
revoke all on function public.has_ofertix_permission(text) from public;
grant execute on function public.has_ofertix_permission(text) to authenticated;
