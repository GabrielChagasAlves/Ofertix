alter table public.products
  add column if not exists availability_retry_count integer not null default 0,
  add column if not exists availability_next_retry_at timestamptz,
  add column if not exists availability_review_required boolean not null default false,
  add column if not exists availability_reviewed_at timestamptz,
  add column if not exists availability_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists availability_review_status text,
  add column if not exists availability_review_note text;
create index if not exists products_availability_retry_idx on public.products (marketplace_id, availability_next_retry_at) where active = true and availability_review_required = false;
create index if not exists products_availability_review_idx on public.products (availability_review_required, updated_at desc) where availability_review_required = true;
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null default 'system',
  title text not null,
  message text,
  run_id uuid references public.automation_runs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists user_notifications_user_unread_idx on public.user_notifications (user_id, created_at desc) where read_at is null;
alter table public.user_notifications enable row level security;
drop policy if exists "Users read own notifications" on public.user_notifications;
create policy "Users read own notifications" on public.user_notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users update own notifications" on public.user_notifications;
create policy "Users update own notifications" on public.user_notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, update on public.user_notifications to authenticated;
grant all on public.user_notifications to service_role;
