-- Controle granular de usuários e permissões do Ofertix
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'operator' check (role in ('admin','operator')),
  is_active boolean not null default true,
  permissions jsonb not null default '{"screens":{},"actions":{}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;

-- O primeiro usuário já existente mantém o controle administrativo.
insert into public.user_profiles(user_id, role, is_active, permissions)
select id, 'admin', true, '{"screens":{"dashboard":true,"products":true,"origin_classification":true,"integrations":true,"rules":true,"affiliate_links":true,"approval":true,"executions":true,"publications":true,"channels":true,"clicks":true,"settings":true,"users":true},"actions":{"products.origin.update":true,"products.update":true,"offers.approve":true,"offers.reject":true,"users.manage":true}}'::jsonb
from auth.users
on conflict (user_id) do update set role='admin', is_active=true;

create or replace function public.handle_new_auth_user_profile()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.user_profiles(user_id, role, is_active, permissions)
  values (new.id, 'operator', true, '{"screens":{},"actions":{}}'::jsonb)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute procedure public.handle_new_auth_user_profile();

create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'role', coalesce(p.role,'operator'),
    'is_active', coalesce(p.is_active,false),
    'permissions', coalesce(p.permissions,'{"screens":{},"actions":{}}'::jsonb)
  )
  from (select auth.uid() as uid) u
  left join public.user_profiles p on p.user_id=u.uid;
$$;
revoke all on function public.get_my_access() from public;
grant execute on function public.get_my_access() to authenticated;

create or replace function public.has_ofertix_permission(permission_key text)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.user_id=auth.uid() and p.is_active=true
      and (p.role='admin' or coalesce(p.permissions #>> array[
        case when permission_key like 'screen.%' then 'screens' else 'actions' end,
        regexp_replace(permission_key, '^screen\\.', '')
      ], 'false')='true')
  );
$$;
revoke all on function public.has_ofertix_permission(text) from public;
grant execute on function public.has_ofertix_permission(text) to authenticated;

drop policy if exists "user_profiles_admin_all" on public.user_profiles;
create policy "user_profiles_self_or_admin_read" on public.user_profiles
for select to authenticated
using (user_id=auth.uid() or public.has_ofertix_permission('users.manage'));

-- O catálogo continua público para leitura anônima dos itens ativos, mas
-- sessões autenticadas passam a respeitar permissões explícitas.
drop policy if exists "public can read active products" on public.products;
create policy "anon can read active products" on public.products
for select to anon using (active=true);
drop policy if exists "authenticated users can manage products" on public.products;
create policy "authenticated can read products with permission" on public.products
for select to authenticated using (
  public.has_ofertix_permission('screen.products')
  or public.has_ofertix_permission('screen.origin_classification')
);
create policy "authenticated can update products with permission" on public.products
for update to authenticated
using (public.has_ofertix_permission('products.update') or public.has_ofertix_permission('products.origin.update'))
with check (public.has_ofertix_permission('products.update') or public.has_ofertix_permission('products.origin.update'));

create or replace function public.guard_product_origin_operator_updates()
returns trigger language plpgsql set search_path=public
as $$
begin
  if auth.uid() is null or public.has_ofertix_permission('products.update') then
    return new;
  end if;
  if not public.has_ofertix_permission('products.origin.update') then
    raise exception 'Você não tem permissão para alterar produtos.';
  end if;
  if (to_jsonb(new) - array['origin_type','origin_type_source','origin_source','origin_country','updated_at'])
     is distinct from
     (to_jsonb(old) - array['origin_type','origin_type_source','origin_source','origin_country','updated_at']) then
    raise exception 'Este usuário só pode alterar a classificação de origem do produto.';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_product_origin_operator_updates on public.products;
create trigger guard_product_origin_operator_updates
before update on public.products
for each row execute function public.guard_product_origin_operator_updates();

-- RLS das permissões: somente a Edge Function administrativa usa service role.
