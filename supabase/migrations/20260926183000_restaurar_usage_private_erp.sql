-- Corrige el acceso a funciones internas ya usadas por el ERP.
-- USAGE permite resolver funciones del esquema, pero NO leer tablas privadas.
grant usage on schema private to authenticated;
revoke all on private.credenciales_siigo from public,anon,authenticated;
revoke all on function public.siigo_credencial_servidor(uuid) from public,anon,authenticated;
grant execute on function public.siigo_credencial_servidor(uuid) to service_role;
notify pgrst,'reload schema';
