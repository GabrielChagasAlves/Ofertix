-- Corrige views que poderiam contornar RLS e fixa search_path de funções de trigger.
alter view public.dashboard_offer_summary set (security_invoker = true);
alter view public.dashboard_product_summary set (security_invoker = true);
alter view public.dashboard_click_summary set (security_invoker = true);

alter function public.set_marketplace_connections_updated_at() set search_path = public;
alter function public.trg_sync_product_commercial_category() set search_path = public;
alter function public.trg_classify_product_on_change() set search_path = public;
