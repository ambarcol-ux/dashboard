-- IA de WhatsApp: sabe si el evento de la clienta ya pasó (contrato entregado/finalizado, días desde el evento) y, si no hay contrato,
-- se lo pregunta a ella: con una fecha nueva actualiza la fecha del evento de su cita (y su plan de seguimiento); si ya fue su evento,
-- cierra el seguimiento como «EVENTO FINALIZADO». Ya no lo manda a «Lo que le falta a la IA».
-- Reversión: volver a aplicar private.whatsapp_contexto y private.seguimiento_cerrar_por_chat anteriores;
--   drop function public.cita_evento_por_chat(text,date), private.cita_evento_por_chat(text,date);
do $do$
declare d text;
begin
 d:=pg_get_functiondef('private.whatsapp_contexto(text)'::regprocedure);
 d:=replace(d,$x$pc.tipo_vestido,pc.fecha_evento,pc.created_at$x$,
  $x$pc.tipo_vestido,pc.fecha_evento,(pc.fecha_evento<(now() at time zone 'America/Bogota')::date) evento_ya_paso,pc.resultado_comercial,pc.cierre_seguimiento,pc.created_at$x$);
 d:=replace(d,$x$c.fecha_evento,c.cliente_nombre,c.sede_id,s.nombre sede,c.valor_total,c.created_at$x$,
  $x$c.fecha_evento,(c.fecha_evento<(now() at time zone 'America/Bogota')::date) evento_ya_paso,c.entregado_evento,c.fecha_entrega_evento,c.finalizado_at,c.cliente_nombre,c.sede_id,s.nombre sede,c.valor_total,c.created_at$x$);
 if position('evento_ya_paso,pc.resultado_comercial' in d)=0 or position('c.entregado_evento,c.fecha_entrega_evento' in d)=0 then raise exception 'whatsapp_contexto: texto no encontrado'; end if;
 execute d;

 d:=pg_get_functiondef('private.seguimiento_cerrar_por_chat(text,text)'::regprocedure);
 d:=replace(d,$x$if p_motivo not in ('alquilo_otro','no_interesa','no_contactar')$x$,$x$if p_motivo not in ('alquilo_otro','no_interesa','no_contactar','evento_realizado')$x$);
 d:=replace(d,$x$case p_motivo when 'alquilo_otro' then 'Alquiló en otro lugar' when 'no_contactar' then 'No contactar' else 'Desistió: Otro' end,
   case p_motivo when 'no_contactar' then 'NO CONTACTAR' else 'DESISTIÓ' end$x$,
  $x$case p_motivo when 'alquilo_otro' then 'Alquiló en otro lugar' when 'no_contactar' then 'No contactar' when 'evento_realizado' then 'Su evento ya pasó' else 'Desistió: Otro' end,
   case p_motivo when 'no_contactar' then 'NO CONTACTAR' when 'evento_realizado' then 'EVENTO FINALIZADO' else 'DESISTIÓ' end$x$);
 d:=replace(d,$x$when 'no_contactar' then 'La clienta pidió no recibir más mensajes.'$x$,$x$when 'no_contactar' then 'La clienta pidió no recibir más mensajes.' when 'evento_realizado' then 'La clienta dijo en el chat que su evento ya pasó.'$x$);
 if position('''EVENTO FINALIZADO''' in d)=0 or position('su evento ya pasó.' in d)=0 then raise exception 'seguimiento_cerrar_por_chat: texto no encontrado'; end if;
 execute d;
end $do$;

-- The customer gives her (new) event date in the chat: it is saved on her latest open visit and her follow-up plan is recalculated.
create or replace function private.cita_evento_por_chat(p_tel text,p_fecha date) returns boolean
language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; t text:=right(regexp_replace(coalesce(p_tel,''),'\D','','g'),10);
begin
 if length(t)<10 or p_fecha is null or p_fecha<(now() at time zone 'America/Bogota')::date or p_fecha>(now() at time zone 'America/Bogota')::date+1095 then return false; end if;
 select * into c from public.primeras_citas
 where right(regexp_replace(coalesce(telefono,''),'\D','','g'),10)=t and estado<>'cancelada'
  and not exists(select 1 from public.contratos k where k.primera_cita_id=primeras_citas.id)
 order by created_at desc limit 1 for update;
 if c.id is null or c.fecha_evento is not distinct from p_fecha then return false; end if;
 update public.primeras_citas set fecha_evento=p_fecha,updated_at=clock_timestamp() where id=c.id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,null,'Fecha del evento actualizada por la IA',
  'La clienta dijo en el chat que su evento es el '||to_char(p_fecha,'DD/MM/YYYY')||coalesce(' (antes: '||to_char(c.fecha_evento,'DD/MM/YYYY')||')','')||'.');
 perform private.replanificar_seguimientos(c.id);
 return true;
end $$;
create or replace function public.cita_evento_por_chat(p_tel text,p_fecha date) returns boolean
language sql security definer set search_path='' as $$ select private.cita_evento_por_chat(p_tel,p_fecha) $$;
revoke all on function private.cita_evento_por_chat(text,date), public.cita_evento_por_chat(text,date) from public, anon, authenticated;
grant execute on function private.cita_evento_por_chat(text,date), public.cita_evento_por_chat(text,date) to service_role;

-- Automatic follow-ups are not sent to customers whose event date already passed (their plan stays open for administration).
do $do$
declare d text;
begin
 d:=pg_get_functiondef('private.seguimientos_auto_tomar(int)'::regprocedure);
 d:=replace(d,$x$and c.cierre_seguimiento is null and length(regexp_replace(coalesce(c.telefono,''),'\D','','g'))>=10$x$,
  $x$and c.cierre_seguimiento is null and length(regexp_replace(coalesce(c.telefono,''),'\D','','g'))>=10 and (c.fecha_evento is null or c.fecha_evento>=hoy)$x$);
 if position('c.fecha_evento>=hoy' in d)=0 then raise exception 'seguimientos_auto_tomar: texto no encontrado'; end if;
 execute d;
end $do$;
