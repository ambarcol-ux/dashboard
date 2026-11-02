-- Correo: la solicitud de autorización también llega a quienes ya alquilaron (se pidió enviarla a todos los correos).
-- La regla «Ya alquiló» aplica solo a las automatizaciones de marketing; las solicitudes omitidas por ella vuelven a la cola.
-- Revert: re-apply public.correo_tomar_envios from 20261207120000_correo_automatizaciones.sql.
create or replace function public.correo_tomar_envios(p_limite int) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.correo_reglas; ahora timestamp:=now() at time zone 'America/Bogota'; hoy date:=(now() at time zone 'America/Bogota')::date; cupo int; out jsonb;
begin
 select * into r from public.correo_reglas where id;
 if extract(hour from ahora)<r.hora_desde or extract(hour from ahora)>=r.hora_hasta then return jsonb_build_object('motivo','Fuera del horario de envío','envios','[]'::jsonb); end if;
 if r.sin_domingos_festivos and (extract(isodow from hoy)=7 or private.festivo_colombia(hoy)) then return jsonb_build_object('motivo','Domingo o festivo','envios','[]'::jsonb); end if;
 -- Envíos que quedaron «enviando» por un corte: vuelven a la cola.
 update public.correo_envios set estado='pendiente' where estado='enviando' and programado_at<now()-interval '15 minutes';
 -- Automatizaciones que la persona ya no debe recibir (retiró la autorización o alquiló).
 update public.correo_envios e set estado='omitido',motivo='Sin autorización comercial vigente'
  where e.estado='pendiente' and e.autorizacion_id is not null and e.automatizacion_id is distinct from 'solicitud_autorizacion'
   and not exists(select 1 from public.autorizaciones_datos a where a.id=e.autorizacion_id and a.estado='autorizada' and a.comercial);
 -- Solicitud de autorización: ya no hace falta si la persona autorizó o retiró su autorización.
 update public.correo_envios e set estado='omitido',motivo='Ya respondió la autorización'
  where e.estado='pendiente' and e.automatizacion_id='solicitud_autorizacion'
   and exists(select 1 from public.autorizaciones_datos a where a.id=e.autorizacion_id and (a.comercial or a.estado='revocada'));
 update public.correo_envios e set estado='omitido',motivo='Ya alquiló'
  where e.estado='pendiente' and e.cita_id is not null and e.automatizacion_id is distinct from 'solicitud_autorizacion' and exists(select 1 from public.primeras_citas c where c.id=e.cita_id and (coalesce(c.alquilo,false)
   or exists(select 1 from public.contratos k where k.primera_cita_id=c.id and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado','borrador'))));
 cupo:=r.cupo_diario-(select count(*) from public.correo_envios where estado='enviado' and enviado_at>=(hoy::timestamp at time zone 'America/Bogota'));
 if cupo<=0 then return jsonb_build_object('motivo','Cupo diario alcanzado','envios','[]'::jsonb); end if;
 with elegibles as (
  select distinct on (lower(e.email)) e.id from public.correo_envios e
  where e.estado='pendiente' and e.programado_at<=now()
   and (select count(*) from public.correo_envios s where s.estado='enviado' and lower(s.email)=lower(e.email) and s.enviado_at>=(hoy::timestamp at time zone 'America/Bogota'))<r.max_dia
   and (select count(*) from public.correo_envios s where s.estado='enviado' and lower(s.email)=lower(e.email) and s.enviado_at>=now()-interval '7 days')<r.max_semana
  order by lower(e.email),e.automatizacion_id is null,e.programado_at
 ), tomados as (
  update public.correo_envios e set estado='enviando',intentos=e.intentos+1,programado_at=now()
  where e.id in (select id from elegibles order by id limit least(greatest(coalesce(p_limite,20),1),50,cupo))
  returning e.*)
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into out from tomados t;
 return jsonb_build_object('motivo',null,'envios',out);
end $$;

update public.correo_envios set estado='pendiente',motivo=null
 where automatizacion_id='solicitud_autorizacion' and estado='omitido' and motivo='Ya alquiló';
