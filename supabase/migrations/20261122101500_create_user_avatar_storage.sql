insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ofertix-user-avatars', 'ofertix-user-avatars', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own Ofertix avatar" on storage.objects;
create policy "Users can upload their own Ofertix avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'ofertix-user-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can update their own Ofertix avatar" on storage.objects;
create policy "Users can update their own Ofertix avatar"
on storage.objects for update to authenticated
using (bucket_id = 'ofertix-user-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'ofertix-user-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can delete their own Ofertix avatar" on storage.objects;
create policy "Users can delete their own Ofertix avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'ofertix-user-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
