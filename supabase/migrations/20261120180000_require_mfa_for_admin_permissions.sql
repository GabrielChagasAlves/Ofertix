-- Require a verified Supabase MFA session (AAL2) for every admin permission.
-- Operators continue to use their individual screen/action permissions.
create or replace function public.has_ofertix_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.user_profiles p
    where p.user_id = auth.uid()
      and p.is_active = true
      and (
        (p.role = 'admin' and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
        or
        (
          p.role <> 'admin'
          and coalesce(
            p.permissions #>> array[
              case when permission_key like 'screen.%' then 'screens' else 'actions' end,
              case when permission_key like 'screen.%' then substr(permission_key, 8) else permission_key end
            ],
            'false'
          ) = 'true'
        )
      )
  );
$function$;
