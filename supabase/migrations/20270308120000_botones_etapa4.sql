-- WhatsApp con botones, etapa 4:
-- · confirmación [Confirmo · Cambiar hora], recordatorio del día [Ver ubicación · Cambiar hora],
-- · reagendar con los 2 horarios libres más cercanos como botones (+ «Otro día», que sigue la IA),
-- · CRM [Agendar cita · Ver vestidos · No me interesa] y promociones [Quiero mi cita · No recibir más] (se manejan en el webhook),
-- · respondido_at en cada mensaje y reporte de respuesta por tipo de mensaje.
-- Reversión: alter table public.primeras_citas_mensajes drop column respondido_at;
--   drop function public.whatsapp_respuesta_por_tipo(int), public.revocar_comercial_por_telefono(text,text), public.crm_cerrar_por_clienta(uuid);
--   re-aplicar los cuerpos anteriores de public.respuesta_whatsapp_primera_cita y public.tomar_mensaje_primera_cita (20270307120000).
alter table public.primeras_citas_mensajes add column if not exists respondido_at timestamptz;

do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.respuesta_whatsapp_primera_cita(text,text,text,text)'::regprocedure);
 -- Every tapped button marks its message as answered (response rate per message type).
 d:=replace(d,$x$ if not found then return true;end if;$x$,$x$ if not found then return true;end if;
 update public.primeras_citas_mensajes set respondido_at=coalesce(respondido_at,now()) where id=m.id;$x$);
 d:=replace(d,$x$ elsif m.tipo='resena' and p_accion='rs_no' then$x$,$x$ elsif m.tipo='confirmacion' and p_accion in ('cf_confirmo','cf_cambiar') and c.estado in ('agendada','confirmada') then
  if p_accion='cf_confirmo' then update public.primeras_citas set estado='confirmada',updated_at=clock_timestamp() where id=c.id and estado='agendada';
  else next_type:='reagendar';end if;
 elsif m.tipo='recordatorio2' and p_accion in ('r2_ubicacion','r2_cambiar') and c.estado in ('agendada','confirmada') then
  next_type:=case when p_accion='r2_ubicacion' then 'ubicacion' else 'reagendar' end;
 elsif m.tipo='reagendar' and p_accion like 'rg\_%' then
  if p_accion='rg_otro_dia' then next_type:='reagendar_otro_dia';
  elsif p_accion ~ '^rg_\d{4}-\d{2}-\d{2}_\d{2}:\d{2}$' then
   begin
    perform public.accion_cliente_primera_cita(c.id,'reprogramar',jsonb_build_object('fecha',substr(p_accion,4,10),'hora',substr(p_accion,15,5),'modalidad',c.modalidad,'sede',c.sede_id,
     'motivo','Reprogramada por la clienta desde WhatsApp'));
    reason:='Reprogramó a '||substr(p_accion,4,10)||' '||substr(p_accion,15,5);
   exception when others then next_type:='reagendar_ocupado';
   end;
  else return false;
  end if;
 elsif m.tipo='resena' and p_accion='rs_no' then$x$);
 if position('reagendar_ocupado' in d)=0 or position('respondido_at' in d)=0 then raise exception 'respuesta_whatsapp_primera_cita: no se encontró el texto a reemplazar'; end if;
 execute d;
 d:=pg_get_functiondef('public.tomar_mensaje_primera_cita()'::regprocedure);
 d:=replace(d,$x$'satisfaccion','satisfaccion_falla','satisfaccion_gracias') and$x$,$x$'satisfaccion','satisfaccion_falla','satisfaccion_gracias','ubicacion','reagendar_otro_dia','reagendar_ocupado') and$x$);
 if position('reagendar_ocupado' in d)=0 then raise exception 'tomar_mensaje_primera_cita: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;

-- «No recibir más» from a WhatsApp promotion: revokes the commercial authorization of that phone (Ley 1581), like the email unsubscribe.
create or replace function public.revocar_comercial_por_telefono(p_telefono text, p_origen text) returns integer
language plpgsql security definer set search_path='' as $$
declare n int:=0; a record; t text:=right(regexp_replace(coalesce(p_telefono,''),'\D','','g'),10);
begin
 if length(t)<10 then return 0; end if;
 for a in select id from public.autorizaciones_datos where comercial and right(regexp_replace(coalesce(telefono,''),'\D','','g'),10)=t for update loop
  update public.autorizaciones_datos set comercial=false,comercial_revocada_at=now(),actualizado_en=now() where id=a.id;
  insert into public.autorizaciones_eventos(autorizacion_id,accion,origen) values(a.id,'revocar_comercial','whatsapp:'||left(coalesce(p_origen,''),20));
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.revocar_comercial_por_telefono(text,text) from public, anon, authenticated;
grant execute on function public.revocar_comercial_por_telefono(text,text) to service_role;

-- «No me interesa» from a CRM follow-up: the lead closes now (it reopens only if she writes again).
create or replace function public.crm_cerrar_por_clienta(p_conv uuid) returns void
language sql security definer set search_path='' as $$
 update public.whatsapp_conversaciones set cierre_crm_at=now()+interval '1 second' where id=p_conv;
$$;
revoke all on function public.crm_cerrar_por_clienta(uuid) from public, anon, authenticated;
grant execute on function public.crm_cerrar_por_clienta(uuid) to service_role;

-- Response rate of the automatic first-visit messages, per week and type (administration and the Primeras visitas panel).
create or replace function public.whatsapp_respuesta_por_tipo(p_semanas int default 8)
returns table(semana date, tipo text, plantilla text, enviados bigint, respondidos bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not (public.es_admin() or private.tiene_permiso('panel.primeras-citas')) then raise exception 'Sin permiso.' using errcode='42501'; end if;
 return query
 select date_trunc('week',m.updated_at at time zone 'America/Bogota')::date,m.tipo,coalesce(m.plantilla,'mensaje con botones (24 h)'),count(*),count(*) filter (where m.respondido_at is not null)
 from public.primeras_citas_mensajes m
 where m.estado='enviado' and m.tipo<>'correo_interno' and m.updated_at>now()-make_interval(weeks=>greatest(1,least(coalesce(p_semanas,8),26)))
 group by 1,2,3 order by 1 desc,2,3;
end $$;
revoke all on function public.whatsapp_respuesta_por_tipo(int) from public, anon;
grant execute on function public.whatsapp_respuesta_por_tipo(int) to authenticated;
