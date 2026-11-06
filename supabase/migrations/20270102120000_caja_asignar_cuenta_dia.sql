-- Caja: asignar de una vez la cuenta a todos los movimientos de un día y medio (Transferencia, Tarjeta u Otro) que no la tienen.
-- Usa la misma edición de movimientos (permisos, día abierto, validaciones e historial de cada uno).
-- Reversión: drop function public.caja_asignar_cuenta_dia(uuid,date,text,uuid,text); drop function private.caja_asignar_cuenta_dia(uuid,date,text,uuid,text);
create or replace function private.caja_asignar_cuenta_dia(p_sede uuid, p_fecha date, p_medio text, p_cuenta uuid, p_motivo text)
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare k public.cuentas_dinero; r record; n integer:=0;
begin
 if p_medio not in ('Transferencia','Tarjeta','Otro') then raise exception 'Elige el medio: transferencia, tarjeta u otro.'; end if;
 select * into k from public.cuentas_dinero where id=p_cuenta;
 if k.id is null or not k.activo or k.tipo='efectivo' or (k.sede_id is not null and k.sede_id<>p_sede) then raise exception 'Elige una cuenta bancaria o billetera activa de esta sede.'; end if;
 for r in select id from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and medio=p_medio and cuenta_id is null and anulado_at is null order by created_at loop
  perform private.editar_movimiento_caja(r.id,jsonb_build_object('cuenta_id',p_cuenta),p_motivo);
  n:=n+1;
 end loop;
 if n=0 then raise exception 'No hay movimientos de % sin cuenta en ese día.',lower(p_medio); end if;
 return n;
end $function$;
create or replace function public.caja_asignar_cuenta_dia(p_sede uuid, p_fecha date, p_medio text, p_cuenta uuid, p_motivo text)
 returns integer language sql set search_path to '' as $function$ select private.caja_asignar_cuenta_dia(p_sede,p_fecha,p_medio,p_cuenta,p_motivo); $function$;
revoke all on function private.caja_asignar_cuenta_dia(uuid,date,text,uuid,text), public.caja_asignar_cuenta_dia(uuid,date,text,uuid,text) from public, anon;
grant execute on function private.caja_asignar_cuenta_dia(uuid,date,text,uuid,text), public.caja_asignar_cuenta_dia(uuid,date,text,uuid,text) to authenticated;
