create or replace function public.list_automation_crons()
returns table(jobid bigint, jobname text, schedule text, active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select j.jobid, j.jobname, j.schedule, j.active
  from cron.job as j
  where j.jobname like 'ofertix-%'
  order by j.jobname;
$$;

revoke all on function public.list_automation_crons() from public, anon, authenticated;
grant execute on function public.list_automation_crons() to service_role;
