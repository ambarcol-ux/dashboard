-- Seguimientos automáticos por WhatsApp (304): cada etapa del plan que vence se envía sola (asistió sin alquilar, no asistió y vitrina).
-- Mensaje de servicio para todas; promociones solo con autorización comercial. Si la clienta responde, la IA sigue el chat.
-- Se cierra solo: sin respuesta 7 días después de la última etapa, o cuando en el chat dice que ya alquiló, no le interesa o no quiere mensajes.
-- Reversión: select cron.unschedule('seguimientos-automaticos'); drop function private.seguimientos_auto_tomar(int), public.seguimientos_auto_tomar(int),
--   private.seguimiento_auto_registrar(uuid,boolean,text,text), public.seguimiento_auto_registrar(uuid,boolean,text,text),
--   private.seguimiento_cerrar_por_chat(text,text), public.seguimiento_cerrar_por_chat(text,text), private.seguimiento_info_chat(text), public.seguimiento_info_chat(text);
--   alter table public.primeras_citas_seguimientos drop column auto_at, drop column auto_error;
alter table public.primeras_citas_seguimientos add column if not exists auto_at timestamptz, add column if not exists auto_error text;

-- Takes the due stages to send now (one per person, oldest first) and closes plans that got no answer.
create or replace function private.seguimientos_auto_tomar(p_limite int)
returns table(seguimiento_id uuid,cita_id uuid,etapa int,total int,nombre text,telefono text,sede text,tipo text,motivo text,tipo_vestido text,fecha_evento date,comercial boolean)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare hoy date:=(now() at time zone 'America/Bogota')::date; x record;
begin
 -- No answer 7 days after the last automatic stage: closed.
 for x in select c.id,(select count(*) from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.realizado_at is not null) n
  from public.primeras_citas c
  where coalesce(c.resultado_comercial,'EN SEGUIMIENTO')='EN SEGUIMIENTO' and c.estado<>'cancelada' and c.cierre_seguimiento is null
   and exists(select 1 from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.auto_at is not null)
   and not exists(select 1 from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.realizado_at is null and s.anulado_at is null)
   and (select max(s.realizado_at) from public.primeras_citas_seguimientos s where s.cita_id=c.id)<now()-interval '7 days'
   and not exists(select 1 from public.whatsapp_conversaciones w where right(w.telefono,10)=right(regexp_replace(coalesce(c.telefono,''),'\D','','g'),10)
     and w.ultimo_entrante_at>(select max(s.realizado_at) from public.primeras_citas_seguimientos s where s.cita_id=c.id))
 loop
  perform private.cerrar_plan(x.id,'Sin respuesta tras '||x.n||' intentos','CERRADO SIN RESPUESTA','No necesario');
 end loop;
 return query
 with due as (
  select s.id from public.primeras_citas_seguimientos s join public.primeras_citas c on c.id=s.cita_id
  where s.realizado_at is null and s.anulado_at is null and s.fecha<=hoy and (s.auto_at is null or s.auto_at<now()-interval '20 hours')
   and coalesce(c.resultado_comercial,'EN SEGUIMIENTO')='EN SEGUIMIENTO' and c.estado<>'cancelada' and not coalesce(c.alquilo,false)
   and c.cierre_seguimiento is null and length(regexp_replace(coalesce(c.telefono,''),'\D','','g'))>=10
   and s.etapa=(select min(y.etapa) from public.primeras_citas_seguimientos y where y.cita_id=c.id and y.realizado_at is null and y.anulado_at is null)
   -- Late plans do not get several messages in a row: at least 3 days between contacts.
   and not exists(select 1 from public.primeras_citas_seguimientos z where z.cita_id=c.id and z.realizado_at>now()-interval '3 days')
   -- An active chat (she wrote in the last 48 h), a complaint or a chat a person must take is left to the conversation.
   and not exists(select 1 from public.whatsapp_conversaciones w where right(w.telefono,10)=right(regexp_replace(c.telefono,'\D','','g'),10)
     and (w.ia_atender or w.etiqueta='reclamo' or w.ultimo_entrante_at>now()-interval '48 hours'))
   and not exists(select 1 from public.primeras_citas_seguimientos z join public.primeras_citas cc on cc.id=z.cita_id
     where z.id<>s.id and right(regexp_replace(coalesce(cc.telefono,''),'\D','','g'),10)=right(regexp_replace(c.telefono,'\D','','g'),10) and z.auto_at>now()-interval '20 hours')
  order by s.fecha,s.etapa limit greatest(1,least(p_limite,100))
  for update of s skip locked),
 marcados as (update public.primeras_citas_seguimientos s set auto_at=now(),auto_error=null from due where s.id=due.id returning s.id,s.cita_id,s.etapa)
 select m.id,c.id,m.etapa,(select count(*)::int from public.primeras_citas_seguimientos t where t.cita_id=c.id and t.anulado_at is null),
  c.cliente_nombre,c.telefono,coalesce(sd.nombre,''),coalesce(c.tipo_seguimiento,'asistida'),coalesce(nullif(c.motivo_no_alquiler,''),c.motivo),c.tipo_vestido,c.fecha_evento,
  private.correo_persona(c.cliente_documento,c.telefono,c.email) is not null
 from marcados m join public.primeras_citas c on c.id=m.cita_id left join public.sedes sd on sd.id=c.sede_id;
end $$;

-- Result of an automatic stage: sent (done, in the history) or error (retried the next day).
create or replace function private.seguimiento_auto_registrar(p_id uuid,p_ok boolean,p_texto text,p_error text) returns void
language plpgsql security definer set search_path='' as $$
declare f public.primeras_citas_seguimientos;
begin
 select * into f from public.primeras_citas_seguimientos where id=p_id for update;
 if f.id is null or f.realizado_at is not null then return; end if;
 if not p_ok then update public.primeras_citas_seguimientos set auto_error=left(coalesce(p_error,'Error'),300),updated_at=clock_timestamp() where id=p_id; return; end if;
 update public.primeras_citas_seguimientos set realizado_at=now(),canal='WhatsApp',resultado='Mensaje automático',nota=left(coalesce(p_texto,''),1000),auto_error=null,updated_at=clock_timestamp() where id=p_id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(f.cita_id,null,'Seguimiento '||f.etapa,'WhatsApp automático: '||left(coalesce(p_texto,''),500));
end $$;

-- What the WhatsApp AI needs to know about an open follow-up of this phone.
create or replace function private.seguimiento_info_chat(p_tel text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('tipo',c.tipo_seguimiento,'motivo_no_alquiler',coalesce(nullif(c.motivo_no_alquiler,''),c.motivo),'tipo_vestido',c.tipo_vestido,'fecha_evento',c.fecha_evento,
  'etapas_enviadas',(select count(*) from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.realizado_at is not null),
  'autoriza_promociones',private.correo_persona(c.cliente_documento,c.telefono,c.email) is not null)
 from public.primeras_citas c
 where right(regexp_replace(coalesce(c.telefono,''),'\D','','g'),10)=right(regexp_replace(coalesce(p_tel,''),'\D','','g'),10) and length(regexp_replace(coalesce(p_tel,''),'\D','','g'))>=10
  and coalesce(c.resultado_comercial,'EN SEGUIMIENTO')='EN SEGUIMIENTO' and c.posible_seguimiento and c.estado<>'cancelada' and c.cierre_seguimiento is null
 order by c.fecha desc limit 1
$$;

-- The customer says in the chat she already rented, is not interested or wants no more messages: open plans of that phone are closed.
create or replace function private.seguimiento_cerrar_por_chat(p_tel text,p_motivo text) returns int
language plpgsql security definer set search_path='' as $$
declare x record; n int:=0;
begin
 if p_motivo not in ('alquilo_otro','no_interesa','no_contactar') or length(regexp_replace(coalesce(p_tel,''),'\D','','g'))<10 then return 0; end if;
 for x in select c.id from public.primeras_citas c
  where right(regexp_replace(coalesce(c.telefono,''),'\D','','g'),10)=right(regexp_replace(p_tel,'\D','','g'),10)
   and coalesce(c.resultado_comercial,'EN SEGUIMIENTO')='EN SEGUIMIENTO' and c.cierre_seguimiento is null and c.estado<>'cancelada' and c.posible_seguimiento
 loop
  perform private.cerrar_plan(x.id,case p_motivo when 'alquilo_otro' then 'Alquiló en otro lugar' when 'no_contactar' then 'No contactar' else 'Desistió: Otro' end,
   case p_motivo when 'no_contactar' then 'NO CONTACTAR' else 'DESISTIÓ' end,'No necesario','Lo dijo en el chat de WhatsApp');
  insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(x.id,null,'Seguimiento cerrado por la IA',
   case p_motivo when 'alquilo_otro' then 'La clienta dijo en el chat que ya alquiló en otro lugar.' when 'no_contactar' then 'La clienta pidió no recibir más mensajes.' else 'La clienta dijo en el chat que no le interesa.' end);
  n:=n+1;
 end loop;
 return n;
end $$;

-- Public wrappers for the server (service_role only).
create or replace function public.seguimientos_auto_tomar(p_limite int)
returns table(seguimiento_id uuid,cita_id uuid,etapa int,total int,nombre text,telefono text,sede text,tipo text,motivo text,tipo_vestido text,fecha_evento date,comercial boolean)
language sql security definer set search_path='' as $$ select * from private.seguimientos_auto_tomar(p_limite) $$;
create or replace function public.seguimiento_auto_registrar(p_id uuid,p_ok boolean,p_texto text,p_error text) returns void
language sql security definer set search_path='' as $$ select private.seguimiento_auto_registrar(p_id,p_ok,p_texto,p_error) $$;
create or replace function public.seguimiento_info_chat(p_tel text) returns jsonb
language sql stable security definer set search_path='' as $$ select private.seguimiento_info_chat(p_tel) $$;
create or replace function public.seguimiento_cerrar_por_chat(p_tel text,p_motivo text) returns int
language sql security definer set search_path='' as $$ select private.seguimiento_cerrar_por_chat(p_tel,p_motivo) $$;
revoke all on function private.seguimientos_auto_tomar(int), private.seguimiento_auto_registrar(uuid,boolean,text,text), private.seguimiento_info_chat(text), private.seguimiento_cerrar_por_chat(text,text),
 public.seguimientos_auto_tomar(int), public.seguimiento_auto_registrar(uuid,boolean,text,text), public.seguimiento_info_chat(text), public.seguimiento_cerrar_por_chat(text,text) from public, anon, authenticated;
grant execute on function private.seguimientos_auto_tomar(int), private.seguimiento_auto_registrar(uuid,boolean,text,text), private.seguimiento_info_chat(text), private.seguimiento_cerrar_por_chat(text,text),
 public.seguimientos_auto_tomar(int), public.seguimiento_auto_registrar(uuid,boolean,text,text), public.seguimiento_info_chat(text), public.seguimiento_cerrar_por_chat(text,text) to service_role;

-- Monday to Saturday at 10:05 a. m. and 4:05 p. m. (Bogotá), up to 20 customers each time.
select cron.schedule('seguimientos-automaticos','5 15,21 * * 1-6',$$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/seguimientos/automaticos',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000);
$$);
