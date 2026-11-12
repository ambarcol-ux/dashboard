-- Asistencia sin depender de la asesora: llegada por QR en la sede (código de la cita, cédula o celular), apertura del enlace de la
-- videollamada desde el ERP o respuesta «Asistí» por WhatsApp. Sin ninguna señal ni contrato 48 h después: «No asistió» automático
-- (entra al seguimiento de reagendar). Llegó y nadie registró el resultado en 48 h sin contrato: «Asistió · no alquiló» (seguimiento).
-- Reversión: select cron.unschedule('citas-asistencia-automatica'); drop function public.cita_llegada_buscar(uuid,text),
--   public.cita_llegada_marcar(uuid,uuid,text), private.citas_asistencia_automatica(), public.citas_proximas_sede();
--   alter table public.primeras_citas drop column llegada_at, drop column llegada_via;
--   volver a aplicar tomar_correo_primera_cita sin «codigo» y «modalidad».
alter table public.primeras_citas add column if not exists llegada_at timestamptz, add column if not exists llegada_via text check (llegada_via in ('qr','videollamada','whatsapp'));

-- Finds today's appointment of that store around now (2 h before to 2 h after) by appointment code, ID number or phone of who booked.
create or replace function public.cita_llegada_buscar(p_sede uuid, p_dato text)
returns table(id uuid, nombre text, hora time, modalidad text) language sql stable security definer set search_path='' as $$
 with d as (select upper(btrim(coalesce(p_dato,''))) t, regexp_replace(coalesce(p_dato,''),'\D','','g') n)
 select c.id, split_part(btrim(c.cliente_nombre),' ',1)||coalesce(' '||left(nullif(split_part(btrim(c.cliente_nombre),' ',2),''),1)||'.',''), c.hora, c.modalidad
 from public.primeras_citas c, d
 where c.sede_id=p_sede and c.origen='cita' and c.estado in ('agendada','confirmada','asistio','seguimiento','no_cerro')
  and c.fecha=(now() at time zone 'America/Bogota')::date
  and (c.fecha+c.hora) between (now() at time zone 'America/Bogota')-interval '2 hours' and (now() at time zone 'America/Bogota')+interval '2 hours'
  and length(d.t)>=4 and (upper(coalesce(c.codigo,''))=d.t
   or (length(d.n)>=6 and regexp_replace(coalesce(c.cliente_documento,''),'\D','','g')=d.n)
   or (length(d.n)>=10 and right(regexp_replace(coalesce(c.telefono,''),'\D','','g'),10)=right(d.n,10)))
 order by abs(extract(epoch from ((c.fecha+c.hora)-(now() at time zone 'America/Bogota')))) limit 3
$$;

-- Registers the arrival once (the result is registered later, or automatically if nobody does).
create or replace function public.cita_llegada_marcar(p_id uuid, p_sede uuid, p_via text) returns boolean
language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas;
begin
 if p_via not in ('qr','videollamada','whatsapp') then return false; end if;
 select * into c from public.primeras_citas where id=p_id for update;
 if c.id is null or c.origen<>'cita' or c.estado='cancelada' or (p_sede is not null and c.sede_id<>p_sede) then return false; end if;
 if c.llegada_at is not null then return true; end if;
 update public.primeras_citas set llegada_at=now(),llegada_via=p_via,updated_at=clock_timestamp() where id=p_id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(p_id,null,'Llegada registrada',
  case p_via when 'qr' then 'La clienta registró su llegada con el QR de la sede.' when 'videollamada' then 'La clienta entró a la videollamada desde el enlace del ERP.' else 'La clienta respondió por WhatsApp que asistió.' end);
 return true;
end $$;

-- Hourly: WhatsApp «Asistí» → arrival; no signal 48 h after → «No asistió»; arrived without result 48 h after → «Asistió · no alquiló».
create or replace function private.citas_asistencia_automatica() returns jsonb
language plpgsql security definer set search_path='' as $$
declare x record; llegadas int:=0; no_asist int:=0; sin_res int:=0;
begin
 for x in select id from public.primeras_citas where origen='cita' and llegada_at is null and respuesta_asistencia is true and estado<>'cancelada' and fecha>=date '2026-11-11' loop
  perform public.cita_llegada_marcar(x.id,null,'whatsapp'); llegadas:=llegadas+1;
 end loop;
 for x in select c.id,c.llegada_at from public.primeras_citas c
  where c.origen='cita' and c.estado in ('agendada','confirmada') and (c.fecha+c.hora)<(now() at time zone 'America/Bogota')-interval '48 hours'
   and c.fecha>=date '2026-11-11' -- the 42 earlier pending visits are left untouched until approved
   and not exists(select 1 from public.contratos k where k.primera_cita_id=c.id and lower(k.estado) not in ('anulado','cancelado','borrador'))
 loop
  if x.llegada_at is null then
   update public.primeras_citas set estado='no_asistio',alquilo=false,posible_seguimiento=true,resultado_comercial='EN SEGUIMIENTO',tipo_seguimiento='no_asistida',
    cierre_seguimiento=null,updated_at=clock_timestamp() where id=x.id;
   insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(x.id,null,'Resultado de la cita','No asistió · Automático: sin llegada por QR, videollamada, WhatsApp ni contrato en 48 horas.');
   no_asist:=no_asist+1;
  else
   update public.primeras_citas set estado='seguimiento',alquilo=false,posible_seguimiento=true,resultado_comercial='EN SEGUIMIENTO',tipo_seguimiento='asistida',
    cierre_seguimiento=null,updated_at=clock_timestamp() where id=x.id;
   insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(x.id,null,'Resultado de la cita','Asistió · No alquiló · Automático: llegó y no hay contrato ni resultado registrado en 48 horas.');
   sin_res:=sin_res+1;
  end if;
  perform private.replanificar_seguimientos(x.id);
 end loop;
 return jsonb_build_object('llegadas',llegadas,'no_asistio',no_asist,'sin_resultado',sin_res);
end $$;

-- Store alerts: appointments of the user's stores from 30 min ago to the next 90 min that nobody has attended (RLS of the visits applies).
create or replace function public.citas_proximas_sede() returns table(id uuid, nombre text, fecha date, hora time, modalidad text, sede text, enlace_virtual text, llegada_at timestamptz, codigo text)
language sql stable security invoker set search_path='' as $$
 select c.id,c.cliente_nombre,c.fecha,c.hora,c.modalidad,s.nombre,c.enlace_virtual,c.llegada_at,c.codigo
 from public.primeras_citas c left join public.sedes s on s.id=c.sede_id
 where c.origen='cita' and c.estado in ('agendada','confirmada')
  and c.fecha=(now() at time zone 'America/Bogota')::date
  and (c.fecha+c.hora) between (now() at time zone 'America/Bogota')-interval '30 minutes' and (now() at time zone 'America/Bogota')+interval '90 minutes'
 order by c.hora
$$;

revoke all on function public.cita_llegada_buscar(uuid,text), public.cita_llegada_marcar(uuid,uuid,text), private.citas_asistencia_automatica() from public, anon, authenticated;
grant execute on function public.cita_llegada_buscar(uuid,text), public.cita_llegada_marcar(uuid,uuid,text), private.citas_asistencia_automatica() to service_role;
revoke all on function public.citas_proximas_sede() from public, anon;
grant execute on function public.citas_proximas_sede() to authenticated;

-- Appointment emails also carry the appointment code (for the store QR) and the modality.
do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.tomar_correo_primera_cita(uuid)'::regprocedure);
 d:=replace(d,$x$'email',c.email)$x$,$x$'email',c.email,'codigo',c.codigo,'modalidad',c.modalidad)$x$);
 if position('''codigo'',c.codigo' in d)=0 then raise exception 'tomar_correo_primera_cita: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;

select cron.schedule('citas-asistencia-automatica','17 * * * *',$$ select private.citas_asistencia_automatica() $$);
