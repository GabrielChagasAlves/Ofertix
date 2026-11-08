-- Detailed per-item audit trail for Ofertix automation executions.
create table if not exists public.automation_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.automation_runs(id) on delete cascade,
  function_name text not null,
  item_type text not null default 'product',
  item_id uuid null,
  external_id text null,
  title text null,
  status text not null,
  action text null,
  message text null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists automation_run_items_run_id_created_at_idx
  on public.automation_run_items(run_id, created_at desc);
create index if not exists automation_run_items_status_idx
  on public.automation_run_items(status);
alter table public.automation_run_items enable row level security;
drop policy if exists "automation run items readable" on public.automation_run_items;
create policy "automation run items readable"
  on public.automation_run_items for select to anon, authenticated using (true);
comment on table public.automation_run_items is
  'Detalhamento por item de cada execução de automação do Ofertix; escrita exclusiva por backend privilegiado.';
