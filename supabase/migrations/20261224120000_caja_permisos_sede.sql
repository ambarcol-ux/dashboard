-- Caja: permisos por sede para editar movimientos (cuenta, medio, descripción), reabrir cajas y configurar las cuentas de su sede.
-- Se otorgan a asesora líder y franquiciado (editable en Roles). Valor y categoría siguen siendo solo de administración.
-- Reversión: delete from public.roles_permisos where permiso in ('caja.editar','caja.reabrir','caja.cuentas'); delete from public.permisos where codigo in (...);
--   y volver a aplicar las funciones de 20261024120000_caja_cuentas_y_edicion.sql / 20261014200000_cierres_de_caja.sql.
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden) values
 ('caja.editar','Finanzas','Corregir movimientos de caja','Cambiar la cuenta, el medio y la descripción de un movimiento de su sede (el valor y la categoría solo administración)',false,31),
 ('caja.reabrir','Finanzas','Reabrir caja','Reabrir el cierre de caja de un día de su sede, con motivo',false,32),
 ('caja.cuentas','Finanzas','Configurar cuentas de la sede','Registrar y editar las cuentas (banco, billetera, caja menor) de su sede',false,33)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso,activo)
 select r,p,true from unnest(array['asesora_lider','franquiciado']) r cross join unnest(array['caja.editar','caja.reabrir','caja.cuentas']) p where exists(select 1 from public.roles where id=r)
on conflict do nothing;

do $$
declare d text; antes text;
begin
 d:=pg_get_functiondef('private.reabrir_caja(uuid,date,text)'::regprocedure); antes:=d;
 d:=replace(d,$x$lower(btrim(u.rol))<>'admin' or not private.caja_ver(p_sede) then raise exception 'Solo un administrador puede reabrir una caja.'$x$,
  $x$not (lower(btrim(u.rol))='admin' or private.tiene_permiso('caja.reabrir')) or not private.caja_ver(p_sede) then raise exception 'No tienes permiso para reabrir la caja de esta sede.'$x$);
 if d=antes then raise exception 'reabrir_caja: no se encontró el texto a reemplazar'; end if;
 execute d;

 d:=pg_get_functiondef('private.editar_movimiento_caja(uuid,jsonb,text)'::regprocedure); antes:=d;
 d:=replace(d,$x$lower(btrim(u.rol))<>'admin' or not private.caja_ver(m.sede_id) then raise exception 'Solo un administrador puede editar movimientos de caja.'$x$,
  $x$not (lower(btrim(u.rol))='admin' or private.tiene_permiso('caja.editar')) or not private.caja_operar(m.sede_id) then raise exception 'No tienes permiso para corregir movimientos de caja de esta sede.'$x$);
 d:=replace(d,$x$ if n.medio not in ('Efectivo','Transferencia','Tarjeta','Otro')$x$,
  $x$ if lower(btrim(u.rol))<>'admin' and (n.valor is distinct from m.valor or n.categoria is distinct from m.categoria) then raise exception 'Solo administración cambia el valor o la categoría; tú puedes corregir la cuenta, el medio y la descripción.' using errcode='42501'; end if;
 if n.medio not in ('Efectivo','Transferencia','Tarjeta','Otro')$x$);
 if d=antes or position('tiene_permiso(''caja.editar'')' in d)=0 or position('Solo administración cambia el valor' in d)=0 then raise exception 'editar_movimiento_caja: no se encontró el texto a reemplazar'; end if;
 execute d;

 d:=pg_get_functiondef('private.guardar_cuenta_dinero(jsonb)'::regprocedure); antes:=d;
 d:=replace(d,$x$if u.id is null or lower(btrim(u.rol))<>'admin' then raise exception 'Solo un administrador puede configurar las cuentas.'$x$,
  $x$if u.id is null or not (lower(btrim(u.rol))='admin' or (private.tiene_permiso('caja.cuentas') and v_sede is not null and private.caja_operar(v_sede))) then raise exception 'Solo puedes configurar cuentas de tu sede (las cuentas de todas las sedes las configura administración).'$x$);
 d:=replace(d,$x$  if old.id is null then raise exception 'Cuenta no encontrada.'; end if;$x$,
  $x$  if old.id is null then raise exception 'Cuenta no encontrada.'; end if;
  if lower(btrim(u.rol))<>'admin' and (old.sede_id is null or not private.caja_operar(old.sede_id)) then raise exception 'Solo puedes editar las cuentas de tu sede.' using errcode='42501'; end if;$x$);
 if d=antes or position('caja.cuentas' in d)=0 or position('Solo puedes editar las cuentas de tu sede' in d)=0 then raise exception 'guardar_cuenta_dinero: no se encontró el texto a reemplazar'; end if;
 execute d;
end $$;
