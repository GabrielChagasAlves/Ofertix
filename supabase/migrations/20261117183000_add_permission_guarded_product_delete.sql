grant delete on table public.products to authenticated;

drop policy if exists "authenticated can delete products with permission" on public.products;
create policy "authenticated can delete products with permission"
on public.products
for delete
to authenticated
using (public.has_ofertix_permission('products.delete'));
