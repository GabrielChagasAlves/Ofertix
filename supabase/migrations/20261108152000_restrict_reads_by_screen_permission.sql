-- Restringe leituras autenticadas por tela, mantendo políticas públicas anônimas já existentes.
drop policy if exists "affiliate links readable" on public.affiliate_links;
create policy "anon can read affiliate links" on public.affiliate_links for select to anon using (true);
create policy "users read affiliate links by screen" on public.affiliate_links for select to authenticated
using (public.has_ofertix_permission('screen.affiliate_links'));

drop policy if exists "automation run items readable" on public.automation_run_items;
create policy "anon can read automation run items" on public.automation_run_items for select to anon using (true);
create policy "users read automation run items by screen" on public.automation_run_items for select to authenticated
using (public.has_ofertix_permission('screen.executions'));

drop policy if exists "automation runs readable" on public.automation_runs;
create policy "anon can read automation runs" on public.automation_runs for select to anon using (true);
create policy "users read automation runs by screen" on public.automation_runs for select to authenticated
using (public.has_ofertix_permission('screen.executions'));

drop policy if exists "channel_publications_select_public" on public.channel_publications;
create policy "anon can read channel publications" on public.channel_publications for select to anon using (true);
create policy "users read channel publications by screen" on public.channel_publications for select to authenticated
using (public.has_ofertix_permission('screen.publications'));

drop policy if exists "channels_select_public" on public.channels;
create policy "anon can read channels" on public.channels for select to anon using (true);
create policy "users read channels by screen" on public.channels for select to authenticated
using (public.has_ofertix_permission('screen.channels'));

drop policy if exists "public can read active marketplaces" on public.marketplaces;
create policy "anon can read active marketplaces" on public.marketplaces for select to anon using (active=true);
create policy "users read marketplaces by screen" on public.marketplaces for select to authenticated
using (active=true and (public.has_ofertix_permission('screen.integrations') or public.has_ofertix_permission('screen.origin_classification')));

drop policy if exists "offer_categories_public_select" on public.offer_categories;
create policy "anon can read active offer categories" on public.offer_categories for select to anon using (active=true);
create policy "users read offer categories by screen" on public.offer_categories for select to authenticated
using (active=true and (public.has_ofertix_permission('screen.rules') or public.has_ofertix_permission('screen.approval')));

drop policy if exists "public can read offers" on public.offers;
create policy "anon can read offers" on public.offers for select to anon using (true);
create policy "users read offers by screen" on public.offers for select to authenticated
using (public.has_ofertix_permission('screen.approval'));

drop policy if exists "offer rule search terms readable" on public.offer_rule_search_terms;
create policy "anon can read offer rule search terms" on public.offer_rule_search_terms for select to anon using (true);
create policy "users read offer rule search terms by screen" on public.offer_rule_search_terms for select to authenticated
using (public.has_ofertix_permission('screen.rules'));

drop policy if exists "product availability history readable" on public.product_availability_history;
create policy "anon can read product availability history" on public.product_availability_history for select to anon using (true);
create policy "users read product availability by screen" on public.product_availability_history for select to authenticated
using (public.has_ofertix_permission('screen.products'));

drop policy if exists "product rule matches readable" on public.product_rule_matches;
create policy "anon can read product rule matches" on public.product_rule_matches for select to anon using (true);
create policy "users read product rule matches by screen" on public.product_rule_matches for select to authenticated
using (public.has_ofertix_permission('screen.products'));

drop policy if exists "public can read active product variations" on public.product_variations;
create policy "anon can read active product variations" on public.product_variations for select to anon
using (active=true and exists(select 1 from public.products p where p.id=product_variations.product_id and p.active=true));
create policy "users read product variations by screen" on public.product_variations for select to authenticated
using (active=true and (public.has_ofertix_permission('screen.products') or public.has_ofertix_permission('screen.approval')));

drop policy if exists "public can read active search terms" on public.search_terms;
create policy "anon can read active search terms" on public.search_terms for select to anon using (active=true);
create policy "users read search terms by screen" on public.search_terms for select to authenticated
using (active=true and public.has_ofertix_permission('screen.rules'));

-- Tabelas sem leitura pública: disponibiliza leitura somente na tela correspondente.
create policy "users read offer rules by screen" on public.offer_rules for select to authenticated
using (public.has_ofertix_permission('screen.rules'));
create policy "users read integration configs by screen" on public.integration_configs for select to authenticated
using (public.has_ofertix_permission('screen.integrations'));
create policy "users read clicks by screen" on public.clicks for select to authenticated
using (public.has_ofertix_permission('screen.clicks'));
create policy "users read offer publications by screen" on public.offer_publications for select to authenticated
using (public.has_ofertix_permission('screen.publications'));
create policy "users read whatsapp groups by screen" on public.whatsapp_groups for select to authenticated
using (public.has_ofertix_permission('screen.channels'));
