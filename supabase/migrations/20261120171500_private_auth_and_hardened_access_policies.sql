-- Ofertix: cadastro privado e endurecimento das políticas de acesso.
-- Usuários só podem ser criados pelo fluxo administrativo de convite.

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invited_at is null then
    raise exception 'Cadastro fechado. Solicite um convite a um administrador.'
      using errcode = '42501';
  end if;

  insert into public.user_profiles(user_id, role, is_active, permissions)
  values (new.id, 'operator', true, '{"screens":{},"actions":{}}'::jsonb)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- O painel é privado: nenhuma tabela do schema public fica acessível à role anon.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Remove políticas de escrita excessivamente permissivas.
drop policy if exists "channel_publications_insert_authenticated" on public.channel_publications;
drop policy if exists "channel_publications_update_authenticated" on public.channel_publications;
drop policy if exists "channels_delete_authenticated" on public.channels;
drop policy if exists "channels_insert_authenticated" on public.channels;
drop policy if exists "channels_update_authenticated" on public.channels;
drop policy if exists "authenticated users can manage clicks" on public.clicks;
drop policy if exists "authenticated users can manage integration configs" on public.integration_configs;
drop policy if exists "authenticated users can manage publications" on public.offer_publications;
drop policy if exists "offer rule search terms manage" on public.offer_rule_search_terms;
drop policy if exists "authenticated users can manage offer rules" on public.offer_rules;
drop policy if exists "anon can manage offer rules" on public.offer_rules;
drop policy if exists "public can create search terms" on public.search_terms;
drop policy if exists "public can delete search terms" on public.search_terms;
drop policy if exists "public can update search terms" on public.search_terms;
drop policy if exists "authenticated users can manage whatsapp groups" on public.whatsapp_groups;

-- Escrita administrativa: somente administradores gerenciam dados operacionais.
create policy "admins manage channel publications" on public.channel_publications
for all to authenticated
using (public.has_ofertix_permission('users.manage'))
with check (public.has_ofertix_permission('users.manage'));

create policy "admins manage channels" on public.channels
for all to authenticated
using (public.has_ofertix_permission('users.manage'))
with check (public.has_ofertix_permission('users.manage'));

create policy "admins manage clicks" on public.clicks
for all to authenticated
using (public.has_ofertix_permission('users.manage'))
with check (public.has_ofertix_permission('users.manage'));

create policy "admins manage integration configs" on public.integration_configs
for all to authenticated
using (public.has_ofertix_permission('users.manage'))
with check (public.has_ofertix_permission('users.manage'));

create policy "admins manage offer publications" on public.offer_publications
for all to authenticated
using (public.has_ofertix_permission('users.manage'))
with check (public.has_ofertix_permission('users.manage'));

create policy "admins manage offer rule search terms" on public.offer_rule_search_terms
for all to authenticated
using (public.has_ofertix_permission('users.manage'))
with check (public.has_ofertix_permission('users.manage'));

create policy "admins manage offer rules" on public.offer_rules
for all to authenticated
using (public.has_ofertix_permission('users.manage'))
with check (public.has_ofertix_permission('users.manage'));

create policy "admins manage search terms" on public.search_terms
for all to authenticated
using (public.has_ofertix_permission('users.manage'))
with check (public.has_ofertix_permission('users.manage'));

create policy "admins manage whatsapp groups" on public.whatsapp_groups
for all to authenticated
using (public.has_ofertix_permission('users.manage'))
with check (public.has_ofertix_permission('users.manage'));

-- O disparo manual dos workers não é uma função RPC para qualquer usuário.
revoke all on function public.force_ofertix_cron(text) from public, anon, authenticated;
grant execute on function public.force_ofertix_cron(text) to service_role;
