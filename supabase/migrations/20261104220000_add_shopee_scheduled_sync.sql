create table if not exists public.shopee_sync_state (
  singleton boolean primary key default true check (singleton),
  feed_id text,
  next_offset integer not null default 0 check (next_offset >= 0),
  last_success_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.shopee_sync_state enable row level security;

insert into public.shopee_sync_state (singleton)
values (true)
on conflict (singleton) do nothing;

insert into public.automation_secrets (name, secret)
select 'shopee_sync', replace(gen_random_uuid()::text, '-', '')
where not exists (
  select 1 from public.automation_secrets where name = 'shopee_sync'
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'ofertix-shopee-sync';

select cron.schedule(
  'ofertix-shopee-sync',
  '*/30 * * * *',
  $cron$
    select net.http_post(
      url := 'https://pndbombvfrxpyqnraqsy.supabase.co/functions/v1/shopee-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ofertix-cron-secret',
        (select secret from public.automation_secrets where name = 'shopee_sync')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
