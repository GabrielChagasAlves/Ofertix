-- Índices para as ordenações usadas no carregamento inicial das telas.
-- As tabelas são pequenas o suficiente para criação normal durante a migration.
create index if not exists products_created_at_desc_idx
  on public.products (created_at desc);

create index if not exists offers_created_at_desc_idx
  on public.offers (created_at desc);

create index if not exists automation_runs_started_at_desc_idx
  on public.automation_runs (started_at desc);

create index if not exists affiliate_links_updated_at_desc_idx
  on public.affiliate_links (updated_at desc);

create index if not exists channel_publications_created_at_desc_idx
  on public.channel_publications (created_at desc);

-- Evita reavaliar auth.uid() para cada linha verificada pelas políticas.
drop policy if exists "Users read own notifications" on public.user_notifications;
create policy "Users read own notifications"
  on public.user_notifications
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users update own notifications" on public.user_notifications;
create policy "Users update own notifications"
  on public.user_notifications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "user_profiles_self_or_admin_read" on public.user_profiles;
create policy "user_profiles_self_or_admin_read"
  on public.user_profiles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or has_ofertix_permission('users.manage'::text)
  );
