drop policy if exists "Users with product update permission insert availability history" on public.product_availability_history;
create policy "Users with product update permission insert availability history"
  on public.product_availability_history for insert to authenticated
  with check (has_ofertix_permission('products.update'::text));