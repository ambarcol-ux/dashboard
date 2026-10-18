-- Primeras visitas: registro de clientas de vitrina (llegan a la tienda sin cita).
-- Misma tabla que las citas, con origen 'vitrina': se guardan como atendidas, no consumen cupos, no
-- reciben mensajes de confirmación/recordatorio ni se reportan como reserva a Meta o al CRM.

alter table public.primeras_citas
 add column origen text not null default 'cita' check (origen in ('cita','vitrina')),
 add column como_se_entero text check (como_se_entero in ('Instagram','Recomendación','Pasaba por la tienda','Otro')),
 add column asesora_id uuid references public.profiles(id),
 add column resultado_visita text check (resultado_visita in ('Cerrado','Contrato pendiente','En seguimiento','No cerró'));
create index primeras_citas_origen on public.primeras_citas(origen,fecha);

-- La vitrina se registra a la hora real de llegada (cualquier minuto, cualquier día).
alter table public.primeras_citas drop constraint primeras_citas_hora_check;
alter table public.primeras_citas add constraint primeras_citas_hora_check check (
 (origen='vitrina' and extract(second from hora)=0)
 or (hora between time '09:00' and time '18:00' and extract(minute from hora)=0 and extract(second from hora)=0));
alter table public.primeras_citas add constraint primeras_citas_vitrina_presencial check (origen='cita' or (modalidad='presencial' and estado in ('asistio','seguimiento','no_cerro')));

-- ── Los disparadores de reservas no aplican a vitrinas ───────────────────────────────────────────
create or replace function private.programar_mensajes_primera_cita() returns trigger language plpgsql set search_path='' as $$
declare start_at timestamptz;
begin
 if new.origen='vitrina' then return new; end if;
 if new.estado='cancelada' or new.resultado_comercial='NO CONTACTAR' then
  update public.primeras_citas_mensajes set estado='omitido',updated_at=now() where cita_id=new.id and estado in ('pendiente','error');return new;
 end if;
 if new.crm_origen_id is not null and not new.crm_mensajes_activos then return new;end if;
 if tg_op='UPDATE' and new.revision=old.revision and new.estado=old.estado and new.resultado_comercial=old.resultado_comercial and new.crm_mensajes_activos=old.crm_mensajes_activos then return new; end if;
 if tg_op='UPDATE' and new.revision=old.revision and new.crm_mensajes_activos=old.crm_mensajes_activos then return new; end if;
 update public.primeras_citas_mensajes set estado='omitido',updated_at=now() where cita_id=new.id and revision<>new.revision and estado in ('pendiente','error');
 start_at:=(new.fecha+new.hora) at time zone 'America/Bogota';
 insert into public.primeras_citas_mensajes(cita_id,revision,tipo,programado_at)
 select new.id,new.revision,t,dt from (values ('confirmacion',now()),('recordatorio24',start_at-interval '24 hours'),('recordatorio2',start_at-interval '2 hours'),('post_cita',start_at+interval '150 minutes'),('correo_interno',now())) q(t,dt)
 where dt>=now() or t in ('confirmacion','correo_interno') on conflict do nothing;
 return new;
end; $$;

create or replace function private.notificar_cambio_primera_cita() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; site text;
begin
 if new.origen='vitrina' then return new; end if;
 if coalesce(new.email,'')='' or (new.crm_origen_id is not null and not new.crm_mensajes_activos) then return new; end if;
 if tg_op='INSERT' then kind:='reserva';
 elsif new.estado='cancelada' and old.estado<>'cancelada' then kind:='cancelacion';
 elsif new.estado='cancelada' then return new;
 elsif (new.fecha,new.hora,new.modalidad,new.sede_id) is distinct from (old.fecha,old.hora,old.modalidad,old.sede_id) then kind:='reprogramacion';
 elsif new.estado='confirmada' and old.estado<>'confirmada' then kind:='confirmacion';
 elsif new.enlace_virtual<>'' and new.enlace_virtual is distinct from old.enlace_virtual then kind:='enlace_virtual';
 else return new;
 end if;
 select nombre into site from public.sedes where id=new.sede_id;
 insert into public.primeras_citas_correos(cita_id,evento,detalle) values(new.id,kind,jsonb_build_object(
  'fecha',new.fecha,'hora',to_char(new.hora,'HH24:MI'),'modalidad',new.modalidad,'sede',site,'motivo',new.motivo,'enlace_virtual',new.enlace_virtual,
  'anterior',case when kind='reprogramacion' then jsonb_build_object('fecha',old.fecha,'hora',to_char(old.hora,'HH24:MI'),'modalidad',old.modalidad,'sede',(select nombre from public.sedes where id=old.sede_id)) end));
 return new;
end; $$;

create or replace function private.encolar_evento_crm_primera_cita() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text;
begin
 if new.origen='vitrina' then return new; end if;
 if new.crm_origen_id is not null then return new; end if;
 if tg_op='INSERT' then kind:='BOOKING_CREATED';
 elsif new.estado='cancelada' and old.estado<>'cancelada' then kind:='BOOKING_CANCELLED';
 elsif new.estado='cancelada' then return new;
 elsif (new.fecha,new.hora,new.modalidad,new.sede_id) is distinct from (old.fecha,old.hora,old.modalidad,old.sede_id) then kind:='BOOKING_RESCHEDULED';
 else return new;
 end if;
 -- Snapshot at change time: a later edit never rewrites what an earlier event said.
 insert into public.primeras_citas_eventos_crm(cita_id,evento,revision,datos) values(new.id,kind,new.revision,jsonb_build_object(
  'fecha',new.fecha,'hora',to_char(new.hora,'HH24:MI'),'modalidad',new.modalidad,'sede_id',new.sede_id,'sede',(select nombre from public.sedes where id=new.sede_id),
  'nombre',new.cliente_nombre,'email',new.email,'telefono',new.telefono,'documento',new.cliente_documento,'tipo_vestido',new.tipo_vestido,'fecha_evento',new.fecha_evento,
  'motivo',new.motivo,'enlace_virtual',new.enlace_virtual,'creada',new.created_at,
  'anterior',case when kind='BOOKING_RESCHEDULED' then jsonb_build_object('fecha',old.fecha,'hora',to_char(old.hora,'HH24:MI')) end));
 return new;
end $$;

create or replace function private.encolar_capi_primera_cita() returns trigger language plpgsql security definer set search_path='' as $$
declare ext text; attended boolean; rented boolean;
begin
 if new.origen='vitrina' then return new; end if; -- sin reserva no hay evento de anuncio que atribuir
 if new.crm_origen_id is not null then select id_externo into ext from public.crm_historico where id=new.crm_origen_id; end if;
 if tg_op='INSERT' and new.crm_origen_id is null then
  insert into public.primeras_citas_capi(cita_id,evento,event_id,event_time) values(new.id,'Schedule','erp_schedule_'||new.id,new.created_at) on conflict (event_id) do nothing;
 end if;
 attended:=new.respuesta_asistencia is true or new.estado in ('asistio','seguimiento','no_cerro');
 rented:=new.respuesta_alquiler is true or new.resultado_comercial='ALQUILÓ';
 if attended or rented then
  insert into public.primeras_citas_capi(cita_id,evento,event_id) values(new.id,'AppointmentAttended',coalesce('capi_asistio_'||ext,'erp_asistio_'||new.id)) on conflict (event_id) do nothing;
 end if;
 if rented then
  insert into public.primeras_citas_capi(cita_id,evento,event_id) values(new.id,'Purchase',coalesce('capi_alquilo_'||ext,'erp_alquilo_'||new.id)) on conflict (event_id) do nothing;
 end if;
 return new;
end $$;

-- ── Los cupos de reserva son exclusivos de citas ─────────────────────────────────────────────────
create or replace function public.disponibilidad_primera_cita(p_fecha date,p_modalidad text,p_sede uuid) returns jsonb language plpgsql set search_path='' as $$
declare today date := (now() at time zone 'America/Bogota')::date; closed boolean; result jsonb;
begin
 if p_fecha is null or p_fecha<today or p_fecha>today+90 or p_modalidad is null or p_modalidad not in ('presencial','virtual') or not exists(select 1 from public.sedes where id=p_sede and activo is true) then raise exception 'Fecha, modalidad o sede inválida.'; end if;
 closed:=extract(isodow from p_fecha)=7 or (extract(isodow from p_fecha)=1 and private.festivo_colombia(p_fecha));
 select coalesce(jsonb_agg(jsonb_build_object('hora',to_char(h,'HH24:MI'),'cupos',greatest(0,cap-ocupados)) order by h),'[]'::jsonb) into result
 from (
 select (time '09:00'+n*interval '1 hour') h,
 case when closed then 0 when p_modalidad='virtual' then 1 else 2 end cap,
 (select count(*) from public.primeras_citas c where c.origen='cita' and c.fecha=p_fecha and c.hora=time '09:00'+n*interval '1 hour' and c.modalidad=p_modalidad and (p_modalidad='virtual' or c.sede_id=p_sede) and c.estado<>'cancelada')::integer ocupados
 from generate_series(0,9) n
 where (p_fecha+time '09:00'+n*interval '1 hour') at time zone 'America/Bogota'>now()
 ) t;
 return result;
end; $$;

-- ── Gestión: una vitrina nunca queda agendada, confirmada, cancelada ni en No asistió ────────────
create or replace function private.gestionar_primera_cita(p_id uuid,p_estado text,p_motivo text,p_version timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=p_id for update;
 if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'Cita no disponible para tu usuario.'; end if;
 if p_version is null or c.updated_at<>p_version then raise exception 'La cita cambió. Actualiza antes de guardar.'; end if;
 if p_estado is null or p_estado not in ('confirmada','asistio','seguimiento','no_asistio','no_cerro','cancelada') or p_motivo is null or length(p_motivo)>1000 then raise exception 'Resultado inválido.'; end if;
 if c.origen='vitrina' and p_estado not in ('asistio','seguimiento','no_cerro') then raise exception 'Una vitrina siempre es una clienta atendida: elige Asistió, En seguimiento o No cerró.'; end if;
 if c.estado='cancelada' then raise exception 'Una cita cancelada no puede reactivarse: crea una reserva nueva.'; end if;
 if p_estado in ('no_cerro','cancelada','no_asistio') and length(trim(p_motivo))<5 then raise exception 'Escribe el motivo (mínimo 5 caracteres).'; end if;
 if p_estado in ('asistio','seguimiento','no_asistio','no_cerro') and (c.fecha+c.hora) at time zone 'America/Bogota'>now() then raise exception 'La cita todavía no ha ocurrido.'; end if;
 if p_estado in ('cancelada','no_cerro','no_asistio') and exists(select 1 from public.contratos where primera_cita_id=p_id and lower(estado) not in ('anulado','cancelado','rechazado')) then raise exception 'La cita ya tiene contrato. Revisa el contrato antes de cambiar el resultado.'; end if;
 update public.primeras_citas set estado=p_estado,motivo=trim(p_motivo),responsable_id=auth.uid(),updated_at=clock_timestamp(),
  resultado_visita=case when c.origen<>'vitrina' then resultado_visita when p_estado='seguimiento' then 'En seguimiento' when p_estado='no_cerro' then 'No cerró' else resultado_visita end
 where id=p_id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(p_id,auth.uid(),c.estado||' → '||p_estado,trim(p_motivo));
end; $$;

-- ── Listado: incluye la asesora que atendió ──────────────────────────────────────────────────────
create or replace function private.listar_primeras_citas(p_desde date,p_hasta date) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and activo is true and lower(rol) in ('admin','asesora')) then raise exception 'No tienes acceso a primeras visitas.'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Selecciona un periodo de hasta un año.'; end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.fecha,t.hora) from (
 select c.*,s.nombre sede,p.nombre responsable,a.nombre asesora_nombre,k.id contrato_id,k.numero_contrato,k.estado contrato_estado
 from public.primeras_citas c join public.sedes s on s.id=c.sede_id left join public.profiles p on p.id=c.responsable_id left join public.profiles a on a.id=c.asesora_id left join public.contratos k on k.primera_cita_id=c.id
 where c.fecha between p_desde and p_hasta and private.acceso_primera_cita(c.sede_id,c.modalidad)
 )t),'[]'::jsonb);
end; $$;

-- ── Duplicados: teléfono o cédula en primeras visitas o contratos ────────────────────────────────
create function private.duplicados_vitrina(p_telefono text,p_documento text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tel text:=right(regexp_replace(coalesce(p_telefono,''),'\D','','g'),10); doc text:=nullif(regexp_replace(coalesce(p_documento,''),'\D','','g'),'');
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and activo is true and lower(rol) in ('admin','asesora')) then raise exception 'No tienes acceso a primeras visitas.' using errcode='42501'; end if;
 if length(tel)<10 then tel:=null; end if;
 if doc is not null and length(doc)<5 then doc:=null; end if;
 if tel is null and doc is null then return jsonb_build_object('visitas','[]'::jsonb,'contratos','[]'::jsonb); end if;
 return jsonb_build_object(
  'visitas',coalesce((select jsonb_agg(x order by x->>'fecha' desc) from (
   select jsonb_build_object('id',c.id,'nombre',c.cliente_nombre,'fecha',c.fecha,'hora',to_char(c.hora,'HH24:MI'),'sede',s.nombre,'sede_id',c.sede_id,'estado',c.estado,'origen',c.origen,
    'vinculable',c.estado<>'cancelada' and private.acceso_primera_cita(c.sede_id,c.modalidad),'pendiente',c.estado in ('agendada','confirmada')) x
   from public.primeras_citas c join public.sedes s on s.id=c.sede_id
   where (tel is not null and right(c.telefono,10)=tel) or (doc is not null and c.cliente_documento=doc)
   order by c.fecha desc limit 5) q),'[]'::jsonb),
  'contratos',coalesce((select jsonb_agg(x) from (
   select jsonb_build_object('id',k.id,'numero_contrato',k.numero_contrato,'nombre',k.cliente_nombre,'sede',s.nombre,'fecha_evento',k.fecha_evento) x
   from public.contratos k left join public.sedes s on s.id=k.sede_id
   where lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado')
    and ((tel is not null and right(regexp_replace(coalesce(k.cliente_whatsapp,k.whatsapp,''),'\D','','g'),10)=tel) or (doc is not null and regexp_replace(coalesce(k.cliente_documento,''),'\D','','g')=doc))
   order by k.created_at desc limit 5) q),'[]'::jsonb));
end $$;

-- ── Registrar una vitrina (o una llegada sin aviso sobre un registro existente) ──────────────────
create function private.registrar_vitrina(p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 nombre text:=btrim(coalesce(p_datos->>'nombre',''));
 tel text:=regexp_replace(coalesce(p_datos->>'telefono',''),'\D','','g');
 doc text:=nullif(regexp_replace(coalesce(p_datos->>'documento',''),'\D','','g'),'');
 correo text:=lower(btrim(coalesce(p_datos->>'email','')));
 sede uuid:=nullif(p_datos->>'sede_id','')::uuid;
 llegada timestamptz:=coalesce(nullif(p_datos->>'fecha_hora','')::timestamptz,now());
 asesora uuid:=coalesce(nullif(p_datos->>'asesora_id','')::uuid,auth.uid());
 tipo text:=btrim(coalesce(p_datos->>'tipo_evento',''));
 evento date:=nullif(p_datos->>'fecha_evento','')::date;
 entero text:=nullif(btrim(coalesce(p_datos->>'como_se_entero','')),'');
 resultado text:=p_datos->>'resultado';
 nota text:=btrim(coalesce(p_datos->>'motivo',''));
 vincular uuid:=nullif(p_datos->>'vincular_id','')::uuid;
 forzar boolean:=coalesce((p_datos->>'forzar')::boolean,false);
 dia date; hora time; estado_nuevo text; dup jsonb; c public.primeras_citas; new_id uuid; atendio text; gap int; a int; b int; n int; i int;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 if length(nombre) not between 2 and 120 then raise exception 'Escribe el nombre completo de la clienta.'; end if;
 if tel !~ '^[0-9]{10,15}$' then raise exception 'Revisa el teléfono: entre 10 y 15 números.'; end if;
 if doc is not null and doc !~ '^[0-9]{5,15}$' then raise exception 'Revisa la cédula: solo números, entre 5 y 15.'; end if;
 if length(correo)>160 or (correo<>'' and correo !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Revisa el correo.'; end if;
 if tipo not in ('XV años','Grado','Gala','Otro') then raise exception 'Elige el tipo de evento.'; end if;
 if resultado is null or resultado not in ('Cerrado','Contrato pendiente','En seguimiento','No cerró') then raise exception 'Elige el resultado de la visita.'; end if;
 if resultado='No cerró' and length(nota)<5 then raise exception 'Escribe el motivo por el que no cerró (mínimo 5 caracteres).'; end if;
 if length(nota)>1000 then raise exception 'Las observaciones son muy largas.'; end if;
 if entero is not null and entero not in ('Instagram','Recomendación','Pasaba por la tienda','Otro') then raise exception 'Revisa cómo se enteró.'; end if;
 if llegada>now()+interval '10 minutes' or llegada<now()-interval '30 days' then raise exception 'La fecha de la visita debe ser de hoy o de los últimos 30 días.'; end if;
 dia:=(llegada at time zone 'America/Bogota')::date; hora:=date_trunc('minute',(llegada at time zone 'America/Bogota')::time);
 if evento is not null and (evento<dia or evento>dia+1825) then raise exception 'Revisa la fecha del evento.'; end if;
 if not exists(select 1 from public.profiles where id=asesora and activo is true and lower(rol) in ('admin','asesora')) then raise exception 'Elige la asesora que atendió.'; end if;
 estado_nuevo:=case resultado when 'En seguimiento' then 'seguimiento' when 'No cerró' then 'no_cerro' else 'asistio' end;
 select coalesce(p.nombre,p.email) into atendio from public.profiles p where p.id=asesora;

 if vincular is not null then
  -- Llegó sin avisar: se registra sobre su registro existente para no duplicar el indicador.
  select * into c from public.primeras_citas where id=vincular for update;
  if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'El registro a vincular no está disponible.'; end if;
  if c.estado='cancelada' then raise exception 'Ese registro está cancelado; registra la vitrina como nueva.'; end if;
  if right(c.telefono,10)<>right(tel,10) and (doc is null or c.cliente_documento is distinct from doc) then raise exception 'El registro a vincular no tiene el mismo teléfono ni la misma cédula.'; end if;
  if estado_nuevo in ('no_cerro') and exists(select 1 from public.contratos where primera_cita_id=c.id and lower(estado) not in ('anulado','cancelado','rechazado')) then raise exception 'Ese registro ya tiene contrato.'; end if;
  update public.primeras_citas set estado=estado_nuevo,motivo=case when nota<>'' then nota else motivo end,asesora_id=asesora,responsable_id=auth.uid(),
   como_se_entero=coalesce(como_se_entero,entero),resultado_visita=resultado,cliente_documento=coalesce(cliente_documento,doc),
   email=case when email='' then correo else email end,tipo_vestido=case when tipo_vestido='' then tipo else tipo_vestido end,fecha_evento=coalesce(fecha_evento,evento),updated_at=clock_timestamp()
  where id=c.id;
  update public.primeras_citas_mensajes set estado='omitido',updated_at=now() where cita_id=c.id and estado in ('pendiente','error');
  insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Visita en tienda sin cita',
   format('Llegó el %s a las %s · Atendió %s · Resultado: %s%s',dia,to_char(hora,'HH24:MI'),atendio,resultado,case when nota<>'' then ' · '||nota else '' end));
  return c.id;
 end if;

 if sede is null or not private.acceso_primera_cita(sede,'presencial') then raise exception 'No puedes registrar vitrinas en esa sede.' using errcode='42501'; end if;
 if not forzar then
  dup:=private.duplicados_vitrina(tel,doc);
  if jsonb_array_length(dup->'visitas')>0 or jsonb_array_length(dup->'contratos')>0 then
   raise exception 'DUPLICADO: el teléfono o la cédula ya existen. Vincula el registro existente o confirma que es una vitrina nueva.' using errcode='P0001'; end if;
 end if;
 insert into public.primeras_citas(id,origen,modalidad,sede_id,fecha,hora,cliente_nombre,telefono,email,estado,motivo,responsable_id,asesora_id,consentimiento_at,
  fecha_evento,tipo_vestido,cliente_documento,como_se_entero,resultado_visita)
 values(gen_random_uuid(),'vitrina','presencial',sede,dia,hora,nombre,tel,correo,estado_nuevo,nota,auth.uid(),asesora,now(),evento,tipo,doc,entero,resultado)
 returning id into new_id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(new_id,auth.uid(),'Vitrina registrada',
  format('Atendió %s · Resultado: %s%s%s',atendio,resultado,case when entero is not null then ' · Se enteró por '||entero else '' end,case when nota<>'' then ' · '||nota else '' end));
 -- Mismas etapas de seguimiento que una cita atendida con fecha de evento.
 if estado_nuevo in ('asistio','seguimiento') and evento is not null then
  gap:=evento-dia;
  if gap>1 then
   a:=case when gap>=30 then 2 else 1 end;b:=case when gap>=30 then gap-7 else gap-1 end;n:=least(5,b-a+1);
   for i in 0..n-1 loop
    insert into public.primeras_citas_seguimientos(cita_id,etapa,fecha) values(new_id,i+1,dia+a+case when n=1 then 0 else round(i::numeric*(b-a)/(n-1))::integer end);
   end loop;
  end if;
 end if;
 return new_id;
end $$;

create function public.duplicados_vitrina(p_telefono text,p_documento text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.duplicados_vitrina(p_telefono,p_documento); $$;
create function public.registrar_vitrina(p_datos jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.registrar_vitrina(p_datos); $$;
revoke all on function private.duplicados_vitrina(text,text),private.registrar_vitrina(jsonb),public.duplicados_vitrina(text,text),public.registrar_vitrina(jsonb) from public,anon;
grant execute on function private.duplicados_vitrina(text,text),private.registrar_vitrina(jsonb),public.duplicados_vitrina(text,text),public.registrar_vitrina(jsonb) to authenticated;
