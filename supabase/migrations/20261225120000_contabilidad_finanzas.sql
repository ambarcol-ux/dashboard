-- Contabilidad: mismos permisos financieros que administración en caja (corregir movimientos completos, reabrir, cuentas de todas las sedes,
-- inicio de caja), ventas (anular, número de factura), depósitos (editar movimientos) y multas (condonar).
-- Reversión: volver a aplicar 20261224120000_caja_permisos_sede.sql, 20261223120000_ventas_comprobante.sql, 20261222120000_condonar_multa.sql,
--   20261025120000_caja_inicio_base_depositos.sql y 20261215120000_venta_vestidos.sql; drop function private.es_finanzas().
create or replace function private.es_finanzas() returns boolean language sql stable security definer set search_path to '' as $f$
 select public.es_admin() or exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) and lower(btrim(p.rol))='contabilidad');
$f$;
revoke all on function private.es_finanzas() from public, anon;
grant execute on function private.es_finanzas() to authenticated;

do $$
declare d text; antes text; f text; pares text[][]; i int;
 cambios constant text[][]:=array[
  ['private.editar_movimiento_caja(uuid,jsonb,text)',$x$not (lower(btrim(u.rol))='admin' or private.tiene_permiso('caja.editar')) or not private.caja_operar(m.sede_id)$x$,$x$not (private.es_finanzas() or (private.tiene_permiso('caja.editar') and private.caja_operar(m.sede_id))) or not private.caja_ver(m.sede_id)$x$],
  ['private.editar_movimiento_caja(uuid,jsonb,text)',$x$if lower(btrim(u.rol))<>'admin' and (n.valor$x$,$x$if not private.es_finanzas() and (n.valor$x$],
  ['private.guardar_cuenta_dinero(jsonb)',$x$not (lower(btrim(u.rol))='admin' or (private.tiene_permiso('caja.cuentas')$x$,$x$not (private.es_finanzas() or (private.tiene_permiso('caja.cuentas')$x$],
  ['private.guardar_cuenta_dinero(jsonb)',$x$if lower(btrim(u.rol))<>'admin' and (old.sede_id$x$,$x$if not private.es_finanzas() and (old.sede_id$x$],
  ['private.guardar_inicio_caja',$x$lower(btrim(u.rol))<>'admin' then raise exception 'Solo un administrador puede cambiar el inicio de la caja.'$x$,$x$not private.es_finanzas() then raise exception 'Solo administración o contabilidad cambia el inicio de la caja.'$x$],
  ['private.reabrir_caja(uuid,date,text)',$x$not (lower(btrim(u.rol))='admin' or private.tiene_permiso('caja.reabrir'))$x$,$x$not (private.es_finanzas() or private.tiene_permiso('caja.reabrir'))$x$],
  ['public.anular_venta_vestido(uuid,text)',$x$if not public.es_admin() then raise exception 'Solo administración anula ventas.'$x$,$x$if not private.es_finanzas() then raise exception 'Solo administración o contabilidad anula ventas.'$x$],
  ['private.venta_numero_factura(uuid,text)',$x$public.es_admin() or private.tiene_permiso('ventas.registrar')$x$,$x$private.es_finanzas() or private.tiene_permiso('ventas.registrar')$x$],
  ['private.editar_movimiento_deposito(text,uuid,jsonb)',$x$if not (public.es_admin() or private.tiene_permiso('depositos.modificar_valor'))$x$,$x$if not (private.es_finanzas() or private.tiene_permiso('depositos.modificar_valor'))$x$],
  ['private.editar_movimiento_deposito(text,uuid,jsonb)',$x$if not public.es_admin() and not private.acceso_deposito(cid)$x$,$x$if not private.es_finanzas() and not private.acceso_deposito(cid)$x$],
  ['private.condonar_multa(uuid,numeric,text)',$x$if not public.es_admin() then raise exception 'Solo administración puede condonar multas.'$x$,$x$if not private.es_finanzas() then raise exception 'Solo administración o contabilidad puede condonar multas.'$x$]
 ];
begin
 for i in 1..array_length(cambios,1) loop
  f:=cambios[i][1];
  d:=pg_get_functiondef((case when position('(' in f)>0 then f::regprocedure else f::regproc end)::oid); antes:=d;
  d:=replace(d,cambios[i][2],cambios[i][3]);
  if d=antes then raise exception '%: no se encontró el texto a reemplazar (%).',f,left(cambios[i][2],60); end if;
  execute d;
 end loop;
end $$;

create or replace function public.es_finanzas() returns boolean language sql stable set search_path to '' as $f$ select private.es_finanzas(); $f$;
revoke all on function public.es_finanzas() from public, anon;
grant execute on function public.es_finanzas() to authenticated;
