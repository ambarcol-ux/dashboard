-- WhatsApp con botones, etapa 3: satisfacción, alerta a administración y reseña.
-- Después de «Fui y alquilé», o del motivo si «Aún no decide»: «¿Cómo te sentiste con la atención en Ámbar?»
-- [😍 Excelente · 🙂 Bien · 😕 Puede mejorar]. «Puede mejorar» → lista de fallas (fa_*) → se guarda la falla, queda un caso abierto
-- para administración (no para la asesora que la atendió) y la clienta recibe «la administración te contactará».
-- Reseña de Google a TODAS las que asistieron (política de Google: no se filtra por satisfacción): sale al responder la satisfacción,
-- o 3 horas después de reportar la asistencia si no responde; con «Puede mejorar», cuando administración cierra el caso o a las 72 h.
-- Reversión: alter table public.primeras_citas drop column satisfaccion_cerrada_at, drop column satisfaccion_cerrada_por;
--   drop function public.satisfaccion_casos(), public.satisfaccion_cerrar(uuid,text);
--   re-aplicar los cuerpos anteriores de public.respuesta_whatsapp_primera_cita y public.tomar_mensaje_primera_cita.
alter table public.primeras_citas add column if not exists satisfaccion_cerrada_at timestamptz,
 add column if not exists satisfaccion_cerrada_por uuid references public.profiles(id) on delete set null;

create or replace function public.respuesta_whatsapp_primera_cita(p_message_id text, p_context_id text, p_telefono text, p_accion text)
 returns boolean language plpgsql set search_path to '' as $function$
declare c public.primeras_citas; m public.primeras_citas_mensajes; next_type text; reason text; resena_en interval;
begin
 if p_message_id is null or length(p_message_id)>250 or p_context_id is null or length(p_context_id)>250 then return false;end if;
 select * into m from public.primeras_citas_mensajes where provider_id=p_context_id and estado='enviado' limit 1;
 if not found then return false;end if;
 select * into c from public.primeras_citas where id=m.cita_id for update;
 if (case when length(c.telefono)=10 then '57'||c.telefono else c.telefono end)<>p_telefono or c.revision<>m.revision or c.estado='cancelada' or c.resultado_comercial='NO CONTACTAR' then return false;end if;
 insert into private.primeras_citas_webhooks(id) values(p_message_id) on conflict do nothing;
 if not found then return true;end if;
 if m.tipo='post_cita' and c.respuesta_asistencia is null and p_accion in ('pc_asisti','pc_no_asisti') then
  update public.primeras_citas set respuesta_asistencia=p_accion='pc_asisti',asistencia_reportada=p_accion='pc_asisti',updated_at=clock_timestamp() where id=c.id;
  next_type:=case when p_accion='pc_asisti' then 'pregunta_alquiler' else 'reagendar' end;
 elsif m.tipo='post_cita' and c.respuesta_asistencia is null and p_accion in ('pc_alquile','pc_no_decido') then
  update public.primeras_citas set respuesta_asistencia=true,asistencia_reportada=true,respuesta_alquiler=p_accion='pc_alquile',updated_at=clock_timestamp() where id=c.id;
  next_type:=case when p_accion='pc_no_decido' then 'pregunta_motivo' else 'satisfaccion' end;
 elsif m.tipo='pregunta_alquiler' and c.respuesta_asistencia is true and c.respuesta_alquiler is null and p_accion in ('pc_alquile','pc_no_alquile') then
  update public.primeras_citas set respuesta_alquiler=p_accion='pc_alquile',updated_at=clock_timestamp() where id=c.id;
  next_type:=case when p_accion='pc_no_alquile' then 'pregunta_motivo' else 'satisfaccion' end;
 elsif m.tipo='pregunta_motivo' and c.respuesta_alquiler is false and c.motivo_no_alquiler='' then
  reason:=case p_accion when 'mot_precio' then 'Precio' when 'mot_no_vestido' then 'No encontré vestido' when 'mot_otras_tiendas' then 'Visitaré otras tiendas' when 'mot_consultar' then 'Debo consultarlo' when 'mot_fecha_evento' then 'Fecha del evento' when 'mot_talla_diseno' then 'Talla / diseño / ajuste' when 'mot_otro' then 'Otro' end;
  if reason is null then return false;end if;
  update public.primeras_citas set motivo_no_alquiler=reason,updated_at=clock_timestamp() where id=c.id;
  next_type:='satisfaccion';
 elsif m.tipo='satisfaccion' and c.satisfaccion is null and p_accion in ('sat_excelente','sat_bien','sat_mejorar') then
  reason:=case p_accion when 'sat_excelente' then 'Excelente' when 'sat_bien' then 'Bien' else 'Puede mejorar' end;
  update public.primeras_citas set satisfaccion=reason,updated_at=clock_timestamp() where id=c.id;
  if p_accion='sat_mejorar' then next_type:='satisfaccion_falla'; resena_en:=interval '72 hours'; else resena_en:=interval '1 minute'; end if;
  update public.primeras_citas_mensajes set programado_at=now()+resena_en where cita_id=c.id and tipo='resena' and estado='pendiente';
 elsif m.tipo='satisfaccion_falla' and c.satisfaccion='Puede mejorar' and c.satisfaccion_falla is null and p_accion like 'fa\_%' then
  reason:=case p_accion when 'fa_atencion' then 'Atención' when 'fa_espera' then 'Tiempo de espera' when 'fa_vestidos' then 'Vestidos' when 'fa_precio' then 'Precio'
   when 'fa_instalaciones' then 'Instalaciones' when 'fa_otro' then 'Otro' end;
  if reason is null then return false;end if;
  update public.primeras_citas set satisfaccion_falla=reason,updated_at=clock_timestamp() where id=c.id;
  next_type:='satisfaccion_gracias';
 elsif m.tipo='resena' and p_accion='rs_no' then
  null;
 elsif m.tipo='recordatorio24' and p_accion in ('rc_confirmo','rc_reagendar','rc_no_puedo') and c.estado in ('agendada','confirmada') then
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
  end if;
 else return false;
 end if;
 if next_type is not null then insert into public.primeras_citas_mensajes(cita_id,revision,tipo,programado_at) values(c.id,c.revision,next_type,now()) on conflict do nothing;end if;
 -- Review request for everyone who reports attending: 3 hours later unless the satisfaction answer moves it (see above).
 if p_accion in ('pc_asisti','pc_alquile','pc_no_decido') and private.resena_permitida(c.telefono,c.email) then
  insert into public.primeras_citas_mensajes(cita_id,revision,tipo,programado_at) values(c.id,c.revision,'resena',now()+interval '3 hours') on conflict do nothing;
 end if;
 insert into public.primeras_citas_historial(cita_id,accion,detalle) values(c.id,'Respuesta WhatsApp',coalesce(reason,p_accion));
 return true;
end; $function$;

do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.tomar_mensaje_primera_cita()'::regprocedure);
 d:=replace(d,$x$'confirmar_cancelacion','cita_cancelada_wa','cita_mantenida_wa') and$x$,$x$'confirmar_cancelacion','cita_cancelada_wa','cita_mantenida_wa','satisfaccion','satisfaccion_falla','satisfaccion_gracias') and$x$);
 d:=replace(d,$x$ or (m.tipo='resena' and (m.programado_at<now()-interval '23 hours' or$x$,$x$ or (m.tipo='resena' and (m.programado_at<now()-interval '23 hours' or exists(select 1 from public.primeras_citas_mensajes r where r.cita_id=m.cita_id and r.tipo='resena' and r.estado='enviado') or$x$);
 if position('satisfaccion_gracias' in d)=0 or position('r.tipo=''resena''' in d)=0 then raise exception 'tomar_mensaje_primera_cita: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;

-- Administration: open «Puede mejorar» cases (not shown to advisers).
create or replace function public.satisfaccion_casos() returns table(id uuid,cliente text,telefono text,sede text,fecha date,asesora text,falla text,respondida timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.es_admin() then return; end if;
 return query select c.id,c.cliente_nombre::text,c.telefono::text,s.nombre::text,c.fecha,coalesce(p.nombre,'—')::text,c.satisfaccion_falla,c.updated_at
 from public.primeras_citas c left join public.sedes s on s.id=c.sede_id left join public.profiles p on p.id=c.asesora_id
 where c.satisfaccion='Puede mejorar' and c.satisfaccion_cerrada_at is null order by c.updated_at;
end $$;

-- Administration closes the case; the review request (if still pending) goes out now.
create or replace function public.satisfaccion_cerrar(p_id uuid,p_nota text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración cierra estos casos.' using errcode='42501'; end if;
 update public.primeras_citas set satisfaccion_cerrada_at=now(),satisfaccion_cerrada_por=auth.uid(),updated_at=clock_timestamp() where id=p_id and satisfaccion='Puede mejorar';
 if not found then raise exception 'Caso no encontrado.'; end if;
 update public.primeras_citas_mensajes set programado_at=now() where cita_id=p_id and tipo='resena' and estado='pendiente';
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(p_id,auth.uid(),'Satisfacción','Caso atendido por administración'||coalesce(' · '||nullif(btrim(p_nota),''),''));
end $$;
revoke all on function public.satisfaccion_casos(), public.satisfaccion_cerrar(uuid,text) from public, anon;
grant execute on function public.satisfaccion_casos(), public.satisfaccion_cerrar(uuid,text) to authenticated;
