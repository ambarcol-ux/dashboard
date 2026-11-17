-- Gastos › «A quién se pagó»: list of active suppliers (name and service only, never their bank data) for whoever registers expenses.
-- Reversible: drop the function.
create or replace function public.gastos_proveedores() returns table(nombre text,tipo_servicio text)
language sql stable security definer set search_path='' as $$
 select p.nombre::text,p.tipo_servicio::text from public.proveedores p
 where (private.es_finanzas() or private.tiene_permiso('panel.gastos')) and coalesce(p.estado,'activo') not in ('inactivo','bloqueado','archivado')
 order by p.nombre;
$$;
revoke all on function public.gastos_proveedores() from public, anon;
grant execute on function public.gastos_proveedores() to authenticated;
