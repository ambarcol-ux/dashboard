-- Fotos de vestidos: lectura para usuarios del ERP (el bucket ya es público); la carga desde Drive la necesita al subir.
-- Revert: drop policy vestidos_fotos_leer on storage.objects;
create policy vestidos_fotos_leer on storage.objects for select to authenticated using (bucket_id='vestidos_fotos');
