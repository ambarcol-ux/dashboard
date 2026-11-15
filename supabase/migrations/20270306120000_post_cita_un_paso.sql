-- WhatsApp con botones, etapa 2: post-cita en un solo paso. «¿Cómo te fue en tu cita en Ámbar?»
-- [Fui y alquilé · Aún no decido · No pude ir]. «Aún no decido» pide el motivo (lista mot_*); «No pude ir» envía reagendar.
-- La respuesta de la clienta queda como asistencia_reportada y YA NO marca la llegada: la llegada real sale del QR, la videollamada
-- o un contrato. Si solo hay autorreporte, la cita no pasa a «no asistió» a las 48 h: queda por verificar (la asesora la registra).
-- Columnas de satisfacción para la etapa 3.
-- Reversión: alter table public.primeras_citas drop column asistencia_reportada, drop column satisfaccion, drop column satisfaccion_falla;
--   re-aplicar los cuerpos anteriores de public.respuesta_whatsapp_primera_cita y private.citas_asistencia_automatica.
alter table public.primeras_citas add column if not exists asistencia_reportada boolean,
 add column if not exists satisfaccion text,
 add column if not exists satisfaccion_falla text;

do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.respuesta_whatsapp_primera_cita(text,text,text,text)'::regprocedure);
 d:=replace(d,$x$  update public.primeras_citas set respuesta_asistencia=p_accion='pc_asisti',updated_at=clock_timestamp() where id=c.id;
  next_type:=case when p_accion='pc_asisti' then 'pregunta_alquiler' else 'reagendar' end;$x$,
 $x$  update public.primeras_citas set respuesta_asistencia=p_accion='pc_asisti',asistencia_reportada=p_accion='pc_asisti',updated_at=clock_timestamp() where id=c.id;
  next_type:=case when p_accion='pc_asisti' then 'pregunta_alquiler' else 'reagendar' end;
 elsif m.tipo='post_cita' and c.respuesta_asistencia is null and p_accion in ('pc_alquile','pc_no_decido') then
  update public.primeras_citas set respuesta_asistencia=true,asistencia_reportada=true,respuesta_alquiler=p_accion='pc_alquile',updated_at=clock_timestamp() where id=c.id;
  if p_accion='pc_no_decido' then next_type:='pregunta_motivo';end if;$x$);
 d:=replace(d,$x$ if p_accion='pc_asisti' and private.resena_permitida$x$,$x$ if p_accion in ('pc_asisti','pc_alquile','pc_no_decido') and private.resena_permitida$x$);
 if position('pc_no_decido' in d)=0 or position('asistencia_reportada' in d)=0 then raise exception 'respuesta_whatsapp_primera_cita: no se encontró el texto a reemplazar'; end if;
 execute d;
 d:=pg_get_functiondef('private.citas_asistencia_automatica()'::regprocedure);
 d:=replace(d,$x$ for x in select id from public.primeras_citas where origen='cita' and llegada_at is null and respuesta_asistencia is true and estado<>'cancelada' and fecha>=date '2026-11-11' loop$x$,
  $x$ -- The customer's own answer no longer marks the arrival (only QR, video call or contract do).
 for x in select id from public.primeras_citas where false loop$x$);
 d:=replace(d,$x$   and c.fecha>=date '2026-11-11'
   and not exists(select 1 from public.contratos k where k.primera_cita_id=c.id and lower(k.estado) not in ('anulado','cancelado','borrador'))
 loop$x$,$x$   and c.fecha>=date '2026-11-11'
   and not exists(select 1 from public.contratos k where k.primera_cita_id=c.id and lower(k.estado) not in ('anulado','cancelado','borrador'))
   and not (c.llegada_at is null and (c.asistencia_reportada is true or c.respuesta_asistencia is true))
 loop$x$);
 if position('where false loop' in d)=0 or position('asistencia_reportada is true' in d)=0 then raise exception 'citas_asistencia_automatica: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;
