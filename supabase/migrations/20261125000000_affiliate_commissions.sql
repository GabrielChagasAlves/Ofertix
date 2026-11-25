-- Comissões de afiliado por marketplace (primeiro: Shopee). Leitura restrita à permissão da tela do dashboard.
create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  marketplace_id uuid not null references public.marketplaces(id) on delete restrict,
  external_id text not null,
  purchase_time timestamptz not null,
  click_time timestamptz,
  status text not null default 'pending',
  total_commission numeric(14,2) not null default 0,
  net_commission numeric(14,2),
  sub_ids text,
  items jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint affiliate_commissions_unique unique (marketplace_id, external_id)
);
create index if not exists affiliate_commissions_purchase_idx on public.affiliate_commissions (purchase_time desc);
create index if not exists affiliate_commissions_market_status_idx on public.affiliate_commissions (marketplace_id, status);

alter table public.affiliate_commissions enable row level security;
revoke all on public.affiliate_commissions from anon, authenticated;
grant select on public.affiliate_commissions to authenticated;
create policy "dashboard users read commissions" on public.affiliate_commissions
  for select to authenticated
  using ((select public.has_ofertix_permission('screen.dashboard')));

alter publication supabase_realtime add table public.affiliate_commissions;

create or replace function public.affiliate_commission_summary(p_days int default 30)
returns table(marketplace_id uuid, status text, conversions bigint, total_commission numeric)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select c.marketplace_id, c.status, count(*), coalesce(sum(c.total_commission),0)
  from public.affiliate_commissions c
  where c.purchase_time >= now() - make_interval(days => greatest(1, least(p_days, 365)))
  group by 1,2
$$;
revoke all on function public.affiliate_commission_summary(int) from public, anon;
grant execute on function public.affiliate_commission_summary(int) to authenticated;
