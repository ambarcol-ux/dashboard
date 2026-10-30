-- Copied from Supabase (applied as 20261029154733): dress photos columns and bucket. Placed after equipo_fase_b2 (permissions).
alter table public.vestidos add column if not exists foto_frente text, add column if not exists foto_espalda text, add column if not exists foto_detalle text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('vestidos_fotos','vestidos_fotos',true,3145728,array['image/jpeg','image/webp','image/png'])
on conflict (id) do nothing;
create policy vestidos_fotos_subir on storage.objects for insert to authenticated
 with check (bucket_id='vestidos_fotos' and (public.es_admin() or private.tiene_permiso('registros.editar_guardados')));
create policy vestidos_fotos_reemplazar on storage.objects for update to authenticated
 using (bucket_id='vestidos_fotos' and (public.es_admin() or private.tiene_permiso('registros.editar_guardados')));
