-- Caja: se puede reabrir cualquier día cerrado (antes había que reabrir del más reciente hacia atrás).
-- Los cierres posteriores siguen cerrados; si la corrección cambia el efectivo con que arrancan, quedan «por revisar»
-- (su saldo inicial guardado ya no coincide con el actual) y salen como alerta en el Inicio.
-- Reversión: volver a poner en private.reabrir_caja la validación de cierres posteriores y aplicar 20261228120000 para alertas_inicio_sede.
do $do$
declare d text;
begin
 d:=pg_get_functiondef('private.reabrir_caja(uuid,date,text)'::regprocedure);
 d:=replace(d,$x$ if exists(select 1 from public.caja_cierres where sede_id=p_sede and fecha>p_fecha and reabierto_at is null) then raise exception 'Hay cierres posteriores en esta sede: reabre primero el más reciente.'; end if;
$x$,'');
 if position('reabre primero el más reciente' in d)>0 then raise exception 'reabrir_caja: no se encontró el texto a reemplazar'; end if;
 execute d;

 d:=pg_get_functiondef('private.alertas_inicio_sede(uuid)'::regprocedure);
 d:=replace(d,$x$  'caja_diferencias',$x$,$x$  'cierres_por_revisar',(select count(*) from public.caja_cierres k where private.caja_ver(k.sede_id) and (p_sede is null or k.sede_id=p_sede) and k.reabierto_at is null
     and coalesce(k.saldo_inicial,0)<>private.caja_saldo_inicial(k.sede_id,k.fecha)),
  'caja_diferencias',$x$);
 if position('cierres_por_revisar' in d)=0 then raise exception 'alertas_inicio_sede: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;
