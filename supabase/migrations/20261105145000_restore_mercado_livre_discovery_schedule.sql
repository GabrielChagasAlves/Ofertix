-- Restores the Mercado Livre product discovery schedule.
-- Applied in production on 2026-11-05.
select cron.alter_job(
  3,
  schedule := '*/30 * * * *',
  command := $cmd$
    select net.http_post(
      url := 'https://pndbombvfrxpyqnraqsy.supabase.co/functions/v1/mercado-livre-product-discovery',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ofertix-cron-secret',
        (select secret from public.automation_secrets where name = 'mercado_livre_product_discovery')
      ),
      body := jsonb_build_object('source', 'scheduled', 'term_limit', 10, 'result_limit', 50),
      timeout_milliseconds := 60000
    );
  $cmd$,
  active := true
);