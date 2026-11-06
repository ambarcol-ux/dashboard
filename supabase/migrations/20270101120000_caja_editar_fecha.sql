-- Caja: corregir la fecha de un movimiento (p. ej. una venta registrada días después). Mismo permiso que corregir movimientos
-- (administración, contabilidad, asesora líder y franquiciado de su sede). Ambos días deben estar abiertos; la fecha no puede ser futura
-- ni anterior al inicio de la caja. Abonos y depósitos conservan su fecha. Si el movimiento es de una venta de vestido,
-- la venta (y su comprobante) toma la misma fecha, medio y cuenta. Queda en el historial del movimiento.
-- Reversión: volver a aplicar la definición de private.editar_movimiento_caja de 20261225120000_contabilidad_finanzas.sql.
do $do$
declare d text; antes text;
begin
 d:=pg_get_functiondef('private.editar_movimiento_caja(uuid,jsonb,text)'::regprocedure); antes:=d;
 d:=replace(d,$x$ if p_datos ? 'cuenta_id' then n.cuenta_id:=nullif(p_datos->>'cuenta_id','')::uuid; end if;$x$,
  $x$ if p_datos ? 'cuenta_id' then n.cuenta_id:=nullif(p_datos->>'cuenta_id','')::uuid; end if;
 if p_datos ? 'fecha' then n.fecha:=nullif(p_datos->>'fecha','')::date; end if;$x$);
 d:=replace(d,$x$ if m.origen='pago' then
  if n.valor<>m.valor then$x$,
  $x$ if n.fecha is distinct from m.fecha then
  if m.origen in ('pago','deposito','devolucion') then raise exception 'La fecha de un abono o depósito no se cambia aquí: se corrige en el contrato o en Depósitos.'; end if;
  if n.fecha is null or n.fecha>private.caja_hoy() then raise exception 'La fecha no puede quedar vacía ni ser futura.'; end if;
  if private.caja_inicio(m.sede_id) is not null and n.fecha<private.caja_inicio(m.sede_id) then raise exception 'La caja de esta sede empieza el %: elige una fecha desde ese día.',to_char(private.caja_inicio(m.sede_id),'DD/MM/YYYY'); end if;
  if private.caja_dia_cerrado(m.sede_id,n.fecha) then raise exception 'La caja del % está cerrada: reábrela primero para pasar el movimiento a ese día.',to_char(n.fecha,'DD/MM/YYYY'); end if;
 end if;
 if m.origen='pago' then
  if n.valor<>m.valor then$x$);
 d:=replace(d,$x$update public.caja_movimientos set medio=n.medio,valor=n.valor,$x$,$x$update public.caja_movimientos set fecha=n.fecha,medio=n.medio,valor=n.valor,$x$);
 d:=replace(d,$x$and n.cuenta_id is not distinct from m.cuenta_id then
  raise exception 'No hay cambios para guardar.';$x$,$x$and n.cuenta_id is not distinct from m.cuenta_id and n.fecha=m.fecha then
  raise exception 'No hay cambios para guardar.';$x$);
 d:=replace(d,$x$values(p_id,jsonb_build_object('medio',m.medio,$x$,$x$values(p_id,jsonb_build_object('fecha',m.fecha,'medio',m.medio,$x$);
 d:=replace(d,$x$  jsonb_build_object('medio',n.medio,$x$,$x$  jsonb_build_object('fecha',n.fecha,'medio',n.medio,$x$);
 d:=replace(d,$x$   'cuenta',(select nombre from public.cuentas_dinero where id=n.cuenta_id)),reason,u.id);
end $function$$x$,$x$   'cuenta',(select nombre from public.cuentas_dinero where id=n.cuenta_id)),reason,u.id);
 -- A dress sale follows its cash movement: same date (also on the receipt), method and account.
 update public.ventas_vestidos set fecha=n.fecha,medio_pago=n.medio,cuenta_id=n.cuenta_id where caja_movimiento_id=p_id and estado='registrada';
end $function$$x$);
 if position('n.fecha:=nullif' in d)=0 or position('set fecha=n.fecha,medio=n.medio' in d)=0 or position('n.fecha=m.fecha then' in d)=0
  or position('''fecha'',m.fecha' in d)=0 or position('''fecha'',n.fecha' in d)=0 or position('update public.ventas_vestidos set fecha=n.fecha' in d)=0
  or position('La fecha no puede quedar vacía' in d)=0 then
  raise exception 'editar_movimiento_caja: no se encontró el texto a reemplazar';
 end if;
 execute d;
end $do$;
