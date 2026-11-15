-- WhatsApp con botones, etapa 1: el recordatorio de 24 h trae un tercer botón «❌ No puedo» (plantilla ambar_recordatorio_confirmar_v2
-- o mensaje con botones dentro de las 24 h). «No puedo» pregunta «¿Cancelamos tu cita?» [Sí, cancelar / No, la mantengo]:
-- Sí → la cita queda cancelada (libera el cupo) y llega el botón para agendar otra; No → la cita queda confirmada.
-- Reversión: re-aplicar los cuerpos anteriores de public.respuesta_whatsapp_primera_cita y public.tomar_mensaje_primera_cita
-- (20270121120000_resenas_solicitudes.sql y anteriores).
do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.respuesta_whatsapp_primera_cita(text,text,text,text)'::regprocedure);
 d:=replace(d,$x$ elsif m.tipo='recordatorio24' and p_accion in ('rc_confirmo','rc_reagendar') and c.estado in ('agendada','confirmada') then
  if p_accion='rc_confirmo' then update public.primeras_citas set estado='confirmada',updated_at=clock_timestamp() where id=c.id and estado='agendada';
  else next_type:='reagendar';end if;$x$,
 $x$ elsif m.tipo='recordatorio24' and p_accion in ('rc_confirmo','rc_reagendar','rc_no_puedo') and c.estado in ('agendada','confirmada') then
  if p_accion='rc_confirmo' then update public.primeras_citas set estado='confirmada',updated_at=clock_timestamp() where id=c.id and estado='agendada';
  elsif p_accion='rc_no_puedo' then next_type:='confirmar_cancelacion';
  else next_type:='reagendar';end if;
 elsif m.tipo='confirmar_cancelacion' and p_accion in ('cc_si','cc_no') and c.estado in ('agendada','confirmada') then
  if p_accion='cc_si' then
   if exists(select 1 from public.contratos where primera_cita_id=c.id) then return false;end if;
   update public.primeras_citas set estado='cancelada',motivo='La clienta canceló desde el recordatorio de WhatsApp',updated_at=clock_timestamp() where id=c.id;
   select * into c from public.primeras_citas where id=c.id;
   next_type:='cita_cancelada_wa';
  else
   update public.primeras_citas set estado='confirmada',updated_at=clock_timestamp() where id=c.id and estado='agendada';
   next_type:='cita_mantenida_wa';
  end if;$x$);
 if position('confirmar_cancelacion' in d)=0 then raise exception 'respuesta_whatsapp_primera_cita: no se encontró el texto a reemplazar'; end if;
 execute d;
 d:=pg_get_functiondef('public.tomar_mensaje_primera_cita()'::regprocedure);
 d:=replace(d,$x$ if c.estado='cancelada' or$x$,$x$ if (c.estado='cancelada' and m.tipo<>'cita_cancelada_wa') or$x$);
 d:=replace(d,$x$ or (m.tipo in ('pregunta_alquiler','pregunta_motivo','reagendar') and$x$,$x$ or (m.tipo in ('pregunta_alquiler','pregunta_motivo','reagendar','confirmar_cancelacion','cita_cancelada_wa','cita_mantenida_wa') and$x$);
 if position('cita_cancelada_wa' in d)=0 or position('confirmar_cancelacion' in d)=0 then raise exception 'tomar_mensaje_primera_cita: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;
