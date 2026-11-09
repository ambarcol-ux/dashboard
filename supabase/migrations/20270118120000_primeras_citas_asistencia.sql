-- Primeras citas: más clientas llegan a su cita.
-- 1) Recordatorio de 24 h con botones «Confirmo» / «Reagendar»: confirmar deja la cita en «confirmada»; reagendar envía el enlace.
--    Inicio muestra «Citas por confirmar» (hoy y mañana, sin confirmar después del recordatorio).
-- 4) Cuando una cita queda en «no_asistio», se programa el mensaje «recuperar» para ofrecerle una nueva fecha.
-- 6) Se guarda el código y el motivo exacto con que Meta rechaza un mensaje.
-- Reversión: drop trigger recuperar_no_asistio on public.primeras_citas; drop function private.recuperar_no_asistio();
--   drop function public.estado_whatsapp_primera_cita(text,text,text,timestamptz,integer,text);
--   alter table public.primeras_citas_mensajes drop column error_codigo, drop column error_detalle;
--   volver a aplicar respuesta_whatsapp_primera_cita, tomar_mensaje_primera_cita y private.alertas_inicio_sede sin los fragmentos de abajo.

alter table public.primeras_citas_mensajes add column if not exists error_codigo integer, add column if not exists error_detalle text;

-- 6) Same as the 4-argument version, plus Meta's error code and reason for failed deliveries.
create or replace function public.estado_whatsapp_primera_cita(p_provider_id text, p_telefono text, p_estado text, p_fecha timestamptz, p_error_codigo integer, p_error_detalle text)
returns boolean language plpgsql set search_path='' as $$
declare ok boolean;
begin
 ok:=public.estado_whatsapp_primera_cita(p_provider_id,p_telefono,p_estado,p_fecha);
 if ok and p_estado='failed' then
  update public.primeras_citas_mensajes set error_codigo=p_error_codigo,error_detalle=left(p_error_detalle,300),
   error=coalesce('WhatsApp no pudo entregar el mensaje: '||left(nullif(p_error_detalle,''),250),error)
  where provider_id=p_provider_id and entrega_estado='failed';
 end if;
 return ok;
end $$;
revoke all on function public.estado_whatsapp_primera_cita(text,text,text,timestamptz,integer,text) from public, anon, authenticated;
grant execute on function public.estado_whatsapp_primera_cita(text,text,text,timestamptz,integer,text) to service_role;

-- 1) Buttons of the 24-hour reminder.
do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.respuesta_whatsapp_primera_cita(text,text,text,text)'::regprocedure);
 d:=replace(d,$x$ else return false;
 end if;$x$,$x$ elsif m.tipo='recordatorio24' and p_accion in ('rc_confirmo','rc_reagendar') and c.estado in ('agendada','confirmada') then
  if p_accion='rc_confirmo' then update public.primeras_citas set estado='confirmada',updated_at=clock_timestamp() where id=c.id and estado='agendada';
  else next_type:='reagendar';end if;
 else return false;
 end if;$x$);
 if position('rc_confirmo' in d)=0 then raise exception 'respuesta_whatsapp_primera_cita: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;

-- 4) «recuperar» goes out only while the visit is still a no-show and within 3 days.
do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.tomar_mensaje_primera_cita()'::regprocedure);
 d:=replace(d,$x$ or (m.tipo in ('pregunta_alquiler','pregunta_motivo','reagendar') and m.programado_at<now()-interval '23 hours') then$x$,
  $x$ or (m.tipo in ('pregunta_alquiler','pregunta_motivo','reagendar') and m.programado_at<now()-interval '23 hours')
 or (m.tipo='recuperar' and (c.estado<>'no_asistio' or m.programado_at<now()-interval '3 days')) then$x$);
 if position('recuperar' in d)=0 then raise exception 'tomar_mensaje_primera_cita: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;

create or replace function private.recuperar_no_asistio() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.origen='vitrina' or new.resultado_comercial='NO CONTACTAR' or (new.crm_origen_id is not null and not new.crm_mensajes_activos) then return new; end if;
 insert into public.primeras_citas_mensajes(cita_id,revision,tipo,programado_at) values(new.id,new.revision,'recuperar',now()) on conflict do nothing;
 return new;
end $$;
create trigger recuperar_no_asistio after update of estado on public.primeras_citas
 for each row when (new.estado='no_asistio' and old.estado is distinct from 'no_asistio') execute function private.recuperar_no_asistio();

-- 1) Inicio: visits today or tomorrow still unconfirmed 2 hours after the 24-hour reminder (or today with no reminder).
do $do$
declare d text;
begin
 d:=pg_get_functiondef('private.alertas_inicio_sede(uuid)'::regprocedure);
 d:=replace(d,$x$  'citas_hoy',$x$,$x$  'citas_por_confirmar',(select count(*) from public.primeras_citas p where (lim is null or p.sede_id=any(lim)) and coalesce(p.origen,'cita')='cita' and p.estado='agendada'
   and p.fecha between hoy and hoy+1 and ((p.fecha+p.hora) at time zone 'America/Bogota')>now()
   and (exists(select 1 from public.primeras_citas_mensajes m where m.cita_id=p.id and m.revision=p.revision and m.tipo='recordatorio24' and m.programado_at<=now()-interval '2 hours')
    or (p.fecha=hoy and not exists(select 1 from public.primeras_citas_mensajes m where m.cita_id=p.id and m.revision=p.revision and m.tipo='recordatorio24')))),
  'citas_hoy',$x$);
 if position('citas_por_confirmar' in d)=0 then raise exception 'alertas_inicio_sede: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;
