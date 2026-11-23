-- Photos for merch items. A public-read bucket; only people who can edit Merch in that workspace can add, change or
-- remove them. Objects live at {workspace_id}/{file}: the first folder decides who may write.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merch-photos', 'merch-photos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists merch_photo_insert on storage.objects;
create policy merch_photo_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'merch-photos'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then public.section_level(((storage.foldername(name))[1])::uuid, 'merch') = 'edit' else false end
  );

drop policy if exists merch_photo_update on storage.objects;
create policy merch_photo_update on storage.objects for update to authenticated
  using (
    bucket_id = 'merch-photos'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then public.section_level(((storage.foldername(name))[1])::uuid, 'merch') = 'edit' else false end
  );

drop policy if exists merch_photo_delete on storage.objects;
create policy merch_photo_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'merch-photos'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then public.section_level(((storage.foldername(name))[1])::uuid, 'merch') = 'edit' else false end
  );
