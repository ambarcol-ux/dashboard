-- Close anonymous access. Old "public" policies (roles {public}, qual true) let anyone holding the
-- browser key read/insert/update contracts, dresses, delivery and transfer logs, staff profiles and
-- contract clauses. Every public page now goes through server routes (/api/firma, /api/entrega,
-- /api/aliados, /api/primeras-citas), so the anon role needs no table access at all.
-- Signed-in users keep exactly the access they had: policies are untouched, only anon loses grants.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- Functions anon never needs (coupon burning runs signed in from the contract form).
revoke execute on function public.validar_y_quemar_codigo(text,text) from anon,public;
revoke execute on function public.validar_y_quemar_codigo(text,text,numeric) from anon,public;
revoke execute on function public.es_admin() from anon,public;
grant execute on function public.validar_y_quemar_codigo(text,text),public.validar_y_quemar_codigo(text,text,numeric),public.es_admin() to authenticated;

-- Delivery photos: anyone could upload or overwrite them. Uploads and edits now need a session;
-- the bucket stays public for viewing the photo links already shared.
alter policy "Permitir subir fotos" on storage.objects to authenticated;
alter policy "Permitir editar fotos" on storage.objects to authenticated;
alter policy "Permitir ver fotos" on storage.objects to authenticated;

-- Contract clauses: everyone signed in still reads them, only administrators change them.
alter policy "Permitir cambios totales" on public.plantillas_contratos to authenticated using (public.es_admin()) with check (public.es_admin());
