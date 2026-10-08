-- Additive extension confined to primeras_citas; does not alter legacy citas or contract dates.
alter table public.primeras_citas
 add column fecha_evento date,
 add column nueva_cita_id uuid references public.primeras_citas(id),
 add column tipo_vestido text not null default '' check(length(tipo_vestido)<=100),
 add column enlace_virtual text not null default '' check(length(enlace_virtual)<=500),
 add column revision integer not null default 1,
 add column respuesta_asistencia boolean,
 add column respuesta_alquiler boolean,
 add column motivo_no_alquiler text not null default '' check(length(motivo_no_alquiler)<=1000),
 add column resultado_comercial text not null default 'EN SEGUIMIENTO' check(resultado_comercial in ('EN SEGUIMIENTO','ALQUILÓ','AGENDÓ NUEVA CITA','DESISTIÓ','CERRADO SIN RESPUESTA','NO CONTACTAR','EVENTO FINALIZADO'));
create index primeras_citas_nueva_cita on public.primeras_citas(nueva_cita_id);
create table public.primeras_citas_seguimientos (
 id uuid primary key default gen_random_uuid(), cita_id uuid not null references public.primeras_citas(id),
 etapa integer not null check(etapa between 1 and 5), fecha date not null, updated_at timestamptz not null default now(),
 realizado_at timestamptz, responsable_id uuid references public.profiles(id), nota text not null default '' check(length(nota)<=1000),
 unique(cita_id,etapa)
);
create index primeras_citas_seguimientos_pendientes on public.primeras_citas_seguimientos(fecha) where realizado_at is null;
create index primeras_citas_seguimientos_responsable on public.primeras_citas_seguimientos(responsable_id);
create table public.primeras_citas_mensajes (
 id uuid primary key default gen_random_uuid(), cita_id uuid not null references public.primeras_citas(id), revision integer not null,
 tipo text not null, programado_at timestamptz not null,
 estado text not null default 'pendiente' check(estado in ('pendiente','enviando','enviado','error','omitido','revisar')),
 intentos integer not null default 0, provider_id text, entrega_estado text check(entrega_estado in ('sent','delivered','read','failed')), entrega_actualizada_at timestamptz, error text, updated_at timestamptz not null default now(),
 unique(cita_id,revision,tipo)
);
create index primeras_citas_mensajes_pendientes on public.primeras_citas_mensajes(programado_at) where estado in ('pendiente','error');
alter table public.primeras_citas_seguimientos enable row level security;
alter table public.primeras_citas_mensajes enable row level security;
revoke all on public.primeras_citas_seguimientos,public.primeras_citas_mensajes from public,anon,authenticated;
grant select on public.primeras_citas_seguimientos,public.primeras_citas_mensajes to authenticated;
grant all on public.primeras_citas_seguimientos,public.primeras_citas_mensajes to service_role;
create policy seguimientos_lectura on public.primeras_citas_seguimientos for select to authenticated using(exists(select 1 from public.primeras_citas c where c.id=cita_id));
create policy mensajes_lectura on public.primeras_citas_mensajes for select to authenticated using(exists(select 1 from public.primeras_citas c where c.id=cita_id));

create function public.reservar_primera_cita_completa(p_id uuid,p_fecha date,p_hora time,p_modalidad text,p_sede uuid,p_nombre text,p_telefono text,p_email text,p_consentimiento boolean,p_limite text,p_fecha_evento date,p_tipo_vestido text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; c public.primeras_citas;
begin
 if p_tipo_vestido is null or length(p_tipo_vestido)>100 or (p_fecha_evento is not null and (p_fecha_evento<p_fecha or p_fecha_evento>p_fecha+1825)) then raise exception 'Revisa la fecha del evento y tipo de vestido.'; end if;
 r:=public.reservar_primera_cita(p_id,p_fecha,p_hora,p_modalidad,p_sede,p_nombre,p_telefono,p_email,p_consentimiento,p_limite);
 if (r->>'reservada')::boolean then
  select * into c from public.primeras_citas where id=p_id for update;
  if c.fecha_evento is not null and c.fecha_evento is distinct from p_fecha_evento or c.tipo_vestido<>'' and c.tipo_vestido<>trim(p_tipo_vestido) then raise exception 'Reserva ya utilizada.'; end if;
  update public.primeras_citas set fecha_evento=p_fecha_evento,tipo_vestido=trim(p_tipo_vestido) where id=p_id;
 end if;
 return r;
end; $$;
revoke all on function public.reservar_primera_cita_completa(uuid,date,time,text,uuid,text,text,text,boolean,text,date,text) from public,anon,authenticated;
grant execute on function public.reservar_primera_cita_completa(uuid,date,time,text,uuid,text,text,text,boolean,text,date,text) to service_role;

-- The HTTP server validates the signed link before calling this service-only function.
create function public.accion_cliente_primera_cita(p_id uuid,p_accion text,p_datos jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.primeras_citas; slots jsonb; available integer; d date; h time; m text; s uuid; reason text; old_label text;
begin
 select * into c from public.primeras_citas where id=p_id for update;
 if not found then raise exception 'Cita no disponible.'; end if;
 if p_accion='consultar' then
  return jsonb_build_object('id',c.id,'fecha',c.fecha,'hora',to_char(c.hora,'HH24:MI'),'modalidad',c.modalidad,'sede_id',c.sede_id,'sede',(select nombre from public.sedes where id=c.sede_id),'estado',c.estado,'version',c.updated_at,'enlace_virtual',c.enlace_virtual,'respuesta_asistencia',c.respuesta_asistencia,'respuesta_alquiler',c.respuesta_alquiler,'motivo_no_alquiler',c.motivo_no_alquiler,'puede_responder',now()>=((c.fecha+c.hora) at time zone 'America/Bogota')+interval '1 hour');
 end if;
 if c.estado='cancelada' or c.resultado_comercial='NO CONTACTAR' then raise exception 'Esta cita está cerrada. Contacta a la sede.'; end if;
 if p_datos->>'version' is null or (p_datos->>'version')::timestamptz<>c.updated_at then raise exception 'La cita cambió. Actualiza antes de continuar.'; end if;
 reason:=trim(coalesce(p_datos->>'motivo',''));
 if length(reason)>1000 then raise exception 'El motivo es demasiado largo.'; end if;
 if p_accion in ('reprogramar','cancelar') then
  if c.estado not in ('agendada','confirmada','no_asistio') or exists(select 1 from public.contratos where primera_cita_id=c.id) then raise exception 'Contacta a tu asesora para modificar esta cita.'; end if;
  if length(reason)<5 then raise exception 'Indica el motivo (mínimo 5 caracteres).'; end if;
  if p_accion='cancelar' then
   update public.primeras_citas set estado='cancelada',motivo=reason,updated_at=clock_timestamp() where id=p_id;
  else
   d:=(p_datos->>'fecha')::date;h:=(p_datos->>'hora')::time;m:=p_datos->>'modalidad';s:=(p_datos->>'sede')::uuid;
   if d=c.fecha and h=c.hora and m=c.modalidad and s=c.sede_id then return jsonb_build_object('ok',true); end if;
   perform pg_advisory_xact_lock(hashtextextended('primera-phone:'||c.telefono,0));
   perform pg_advisory_xact_lock(hashtextextended('primera-slot:'||coalesce(m,'')||':'||case when m='virtual' then 'global' else coalesce(s::text,'') end||':'||coalesce(d::text,'')||':'||coalesce(h::text,''),0));
   slots:=public.disponibilidad_primera_cita(d,m,s);
   select (x->>'cupos')::integer into available from jsonb_array_elements(slots) x where x->>'hora'=to_char(h,'HH24:MI');
   if h is null or extract(minute from h)<>0 or extract(second from h)<>0 or coalesce(available,0)<1 then raise exception 'Horario sin cupos. Elige otro.'; end if;
   if exists(select 1 from public.primeras_citas where id<>c.id and telefono=c.telefono and fecha>=(now() at time zone 'America/Bogota')::date and estado in ('agendada','confirmada')) then raise exception 'Ya tienes otra cita pendiente.'; end if;
   if c.fecha_evento is not null and d>c.fecha_evento then raise exception 'La cita no puede quedar después del evento.'; end if;
   old_label:=c.fecha::text||' '||c.hora::text||' '||c.modalidad||' '||c.sede_id::text;
   update public.primeras_citas set fecha=d,hora=h,modalidad=m,sede_id=s,estado='agendada',motivo=reason,revision=revision+1,respuesta_asistencia=null,respuesta_alquiler=null,motivo_no_alquiler='',enlace_virtual='',updated_at=clock_timestamp() where id=p_id;
   reason:=old_label||' → '||d::text||' '||h::text||' '||m||' '||s::text||'. Motivo: '||reason;
  end if;
 elsif p_accion='confirmar' then
  if c.estado not in ('agendada','confirmada') or (c.fecha+c.hora) at time zone 'America/Bogota'<now() then raise exception 'La cita ya ocurrió.'; end if;
  update public.primeras_citas set estado='confirmada',updated_at=clock_timestamp() where id=p_id;
 elsif p_accion='respuesta' then
  if now()<((c.fecha+c.hora) at time zone 'America/Bogota')+interval '1 hour' then raise exception 'La cita aún no ha finalizado.'; end if;
  if p_datos->>'asistio' is null or p_datos->>'asistio' not in ('true','false') then raise exception 'Indica si asististe.'; end if;
  if c.respuesta_asistencia is not null then raise exception 'Tu respuesta ya quedó registrada.'; end if;
  if (p_datos->>'asistio')::boolean and (p_datos->>'alquilo' is null or p_datos->>'alquilo' not in ('true','false')) then raise exception 'Indica si alquilaste.'; end if;
  if (p_datos->>'asistio')::boolean and not (p_datos->>'alquilo')::boolean and length(reason)<3 then raise exception 'Indica el motivo de no alquiler.'; end if;
  -- Customer declarations never change contract/payment state or overwrite advisor's attendance.
  update public.primeras_citas set respuesta_asistencia=(p_datos->>'asistio')::boolean,respuesta_alquiler=case when (p_datos->>'asistio')::boolean then (p_datos->>'alquilo')::boolean else null end,motivo_no_alquiler=reason,updated_at=clock_timestamp() where id=p_id;
  reason:='Asistió: '||(p_datos->>'asistio')||'. Alquiló: '||coalesce(p_datos->>'alquilo','sin respuesta')||'. '||reason;
 else raise exception 'Acción no válida.';
 end if;
 insert into public.primeras_citas_historial(cita_id,accion,detalle) values(p_id,'Cliente: '||p_accion,reason);
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.accion_cliente_primera_cita(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.accion_cliente_primera_cita(uuid,text,jsonb) to service_role;

create function private.programar_mensajes_primera_cita() returns trigger language plpgsql security invoker set search_path='' as $$
declare start_at timestamptz;
begin
 if tg_op='UPDATE' and new.revision=old.revision and new.estado=old.estado and new.resultado_comercial=old.resultado_comercial then return new; end if;
 if new.estado='cancelada' or new.resultado_comercial='NO CONTACTAR' then
  update public.primeras_citas_mensajes set estado='omitido',updated_at=now() where cita_id=new.id and estado in ('pendiente','error');return new;
 end if;
 if tg_op='UPDATE' and new.revision=old.revision then return new; end if;
 update public.primeras_citas_mensajes set estado='omitido',updated_at=now() where cita_id=new.id and revision<>new.revision and estado in ('pendiente','error');
 start_at:=(new.fecha+new.hora) at time zone 'America/Bogota';
 insert into public.primeras_citas_mensajes(cita_id,revision,tipo,programado_at)
 select new.id,new.revision,t,dt from (values ('confirmacion',now()),('recordatorio24',start_at-interval '24 hours'),('recordatorio2',start_at-interval '2 hours'),('post_cita',start_at+interval '150 minutes'),('correo_interno',now())) q(t,dt)
 where dt>=now() or t in ('confirmacion','correo_interno') on conflict do nothing;
 return new;
end; $$;
revoke all on function private.programar_mensajes_primera_cita() from public,anon,authenticated;
create trigger programar_mensajes_primera_cita after insert or update of revision,estado,resultado_comercial on public.primeras_citas for each row execute function private.programar_mensajes_primera_cita();

create function private.editar_comercial_primera_cita(p_id uuid,p_datos jsonb,p_version timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; event_date date; result text; link text; gap integer; a integer; b integer; n integer; i integer; completed integer;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=p_id for update;
 if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'Cita no disponible.'; end if;
 if p_version is null or c.updated_at<>p_version then raise exception 'La cita cambió. Actualiza antes de guardar.'; end if;
 event_date:=nullif(p_datos->>'fecha_evento','')::date;result:=p_datos->>'resultado';link:=trim(coalesce(p_datos->>'enlace_virtual',''));
 if c.estado='cancelada' then raise exception 'La cita está cancelada.'; end if;
 if result is null or result not in ('EN SEGUIMIENTO','ALQUILÓ','AGENDÓ NUEVA CITA','DESISTIÓ','CERRADO SIN RESPUESTA','NO CONTACTAR','EVENTO FINALIZADO') or length(link)>500 or (link<>'' and link !~ '^https://meet\.google\.com/[a-z-]+$') then raise exception 'Resultado o enlace de Meet inválido.'; end if;
 if event_date is not null and (event_date<c.fecha or event_date>c.fecha+1825) then raise exception 'Revisa la fecha del evento.'; end if;
 if result='ALQUILÓ' and not exists(select 1 from public.contratos where primera_cita_id=c.id and lower(estado) in ('firmado','pagado totalmente','entregado','mantenimiento','finalizado')) then raise exception 'Crea y confirma el contrato para registrar el cierre.'; end if;
 if result='AGENDÓ NUEVA CITA' and not exists(select 1 from public.primeras_citas where id=nullif(p_datos->>'nueva_cita','')::uuid and id<>c.id and telefono=c.telefono and estado in ('agendada','confirmada')) then raise exception 'Selecciona una nueva cita válida del mismo cliente.'; end if;
 if result in ('DESISTIÓ','CERRADO SIN RESPUESTA','NO CONTACTAR','EVENTO FINALIZADO') and length(trim(coalesce(p_datos->>'nota','')))<5 then raise exception 'Registra el motivo del cierre.'; end if;
 update public.primeras_citas set fecha_evento=event_date,enlace_virtual=link,resultado_comercial=result,nueva_cita_id=case when result='AGENDÓ NUEVA CITA' then nullif(p_datos->>'nueva_cita','')::uuid else nueva_cita_id end,updated_at=clock_timestamp() where id=c.id;
 select count(*) into completed from public.primeras_citas_seguimientos where cita_id=c.id and realizado_at is not null;
 if completed=0 and c.estado in ('asistio','seguimiento','no_cerro') and result='EN SEGUIMIENTO' and not exists(select 1 from public.contratos where primera_cita_id=c.id and lower(estado) not in ('anulado','cancelado','rechazado')) then
  delete from public.primeras_citas_seguimientos where cita_id=c.id;
  gap:=event_date-c.fecha;
  if gap>1 then
   a:=case when gap>=30 then 2 else 1 end;b:=case when gap>=30 then gap-7 else gap-1 end;n:=least(5,b-a+1);
   for i in 0..n-1 loop
    insert into public.primeras_citas_seguimientos(cita_id,etapa,fecha) values(c.id,i+1,c.fecha+a+case when n=1 then 0 else round(i::numeric*(b-a)/(n-1))::integer end);
   end loop;
  end if;
 elsif completed>0 and event_date is distinct from c.fecha_evento then raise exception 'Hay seguimientos realizados. Reprograma las etapas pendientes para conservar el historial.';
 end if;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Gestión comercial',result||case when result='AGENDÓ NUEVA CITA' then ' · Reserva: '||(p_datos->>'nueva_cita') else '' end||'. '||left(coalesce(p_datos->>'nota',''),1000));
end; $$;
revoke all on function private.editar_comercial_primera_cita(uuid,jsonb,timestamptz) from public,anon;
grant execute on function private.editar_comercial_primera_cita(uuid,jsonb,timestamptz) to authenticated;
create function public.editar_comercial_primera_cita(p_id uuid,p_datos jsonb,p_version timestamptz) returns void language sql security invoker set search_path='' as $$select private.editar_comercial_primera_cita(p_id,p_datos,p_version);$$;
revoke all on function public.editar_comercial_primera_cita(uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.editar_comercial_primera_cita(uuid,jsonb,timestamptz) to authenticated;

create function private.gestionar_seguimiento_primera_cita(p_id uuid,p_fecha date,p_nota text,p_realizado boolean,p_version timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; f public.primeras_citas_seguimientos;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=(select cita_id from public.primeras_citas_seguimientos where id=p_id) for update;
 if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'Seguimiento no disponible.'; end if;
 select * into f from public.primeras_citas_seguimientos where id=p_id for update;
 if p_version is null or f.updated_at<>p_version then raise exception 'El seguimiento cambió. Actualiza antes de guardar.';end if;
 if f.realizado_at is not null or c.resultado_comercial<>'EN SEGUIMIENTO' or c.estado='cancelada' or exists(select 1 from public.contratos where primera_cita_id=c.id and lower(estado) not in ('anulado','cancelado','rechazado')) then raise exception 'Este seguimiento está cerrado.'; end if;
 if p_nota is null or length(trim(p_nota))<3 or length(p_nota)>1000 or p_fecha is null or p_fecha<=c.fecha or (c.fecha_evento is not null and p_fecha>=c.fecha_evento) or p_realizado is null then raise exception 'Revisa fecha y nota del seguimiento.'; end if;
 if p_realizado and p_fecha>(now() at time zone 'America/Bogota')::date then raise exception 'No puedes completar un seguimiento futuro.'; end if;
 if exists(select 1 from public.primeras_citas_seguimientos where cita_id=c.id and etapa<f.etapa and realizado_at is null) then raise exception 'Completa primero la etapa pendiente anterior.'; end if;
 update public.primeras_citas_seguimientos set updated_at=clock_timestamp(),fecha=p_fecha,nota=trim(p_nota),realizado_at=case when p_realizado then now() else null end,responsable_id=auth.uid() where id=p_id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Seguimiento '||f.etapa,case when p_realizado then 'Realizado: ' else 'Nota: ' end||trim(p_nota));
end; $$;
revoke all on function private.gestionar_seguimiento_primera_cita(uuid,date,text,boolean,timestamptz) from public,anon;
grant execute on function private.gestionar_seguimiento_primera_cita(uuid,date,text,boolean,timestamptz) to authenticated;
create function public.gestionar_seguimiento_primera_cita(p_id uuid,p_fecha date,p_nota text,p_realizado boolean,p_version timestamptz) returns void language sql security invoker set search_path='' as $$select private.gestionar_seguimiento_primera_cita(p_id,p_fecha,p_nota,p_realizado,p_version);$$;
revoke all on function public.gestionar_seguimiento_primera_cita(uuid,date,text,boolean,timestamptz) from public,anon;
grant execute on function public.gestionar_seguimiento_primera_cita(uuid,date,text,boolean,timestamptz) to authenticated;
notify pgrst,'reload schema';
-- Workers claim atomically; ambiguous outcomes require review instead of blind duplicate sends.
create function public.tomar_mensaje_primera_cita() returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.primeras_citas_mensajes; c public.primeras_citas;
begin
 update public.primeras_citas_mensajes set estado='revisar',error='Resultado del envío desconocido; comprobar proveedor.',updated_at=now() where estado='enviando' and updated_at<now()-interval '5 minutes';
 select * into m from public.primeras_citas_mensajes where estado in ('pendiente','error') and intentos<3 and programado_at<=now() order by programado_at for update skip locked limit 1;
 if not found then return null;end if;
 select * into c from public.primeras_citas where id=m.cita_id;
 if c.estado='cancelada' or c.resultado_comercial='NO CONTACTAR' or c.revision<>m.revision
 or (m.tipo in ('confirmacion','recordatorio24','recordatorio2') and ((c.fecha+c.hora) at time zone 'America/Bogota')<now())
 or (m.tipo='post_cita' and (c.respuesta_asistencia is not null or c.estado not in ('agendada','confirmada') or now()>((c.fecha+c.hora) at time zone 'America/Bogota')+interval '7 days'))
 or (m.tipo in ('pregunta_alquiler','pregunta_motivo','reagendar') and m.programado_at<now()-interval '23 hours') then
  update public.primeras_citas_mensajes set estado='omitido',updated_at=now() where id=m.id;return jsonb_build_object('omitido',true);
 end if;
 update public.primeras_citas_mensajes set estado='enviando',intentos=intentos+1,updated_at=now() where id=m.id;
 return jsonb_build_object('mensaje',to_jsonb(m),'cita',to_jsonb(c),'sede',(select nombre from public.sedes where id=c.sede_id));
end; $$;
revoke all on function public.tomar_mensaje_primera_cita() from public,anon,authenticated;
grant execute on function public.tomar_mensaje_primera_cita() to service_role;
create table private.primeras_citas_webhooks (id text primary key,created_at timestamptz not null default now());
alter table private.primeras_citas_webhooks enable row level security;
revoke all on private.primeras_citas_webhooks from public,anon,authenticated;
grant all on private.primeras_citas_webhooks to service_role;
create policy webhook_servidor on private.primeras_citas_webhooks for all to service_role using(true) with check(true);
create function public.respuesta_whatsapp_primera_cita(p_message_id text,p_context_id text,p_telefono text,p_accion text) returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.primeras_citas; m public.primeras_citas_mensajes; next_type text; reason text;
begin
 if p_message_id is null or length(p_message_id)>250 or p_context_id is null or length(p_context_id)>250 then return false;end if;
 select * into m from public.primeras_citas_mensajes where provider_id=p_context_id and estado='enviado' limit 1;
 if not found then return false;end if;
 select * into c from public.primeras_citas where id=m.cita_id for update;
 if (case when length(c.telefono)=10 then '57'||c.telefono else c.telefono end)<>p_telefono or c.revision<>m.revision or c.estado='cancelada' or c.resultado_comercial='NO CONTACTAR' then return false;end if;
 insert into private.primeras_citas_webhooks(id) values(p_message_id) on conflict do nothing;
 if not found then return true;end if;
 if m.tipo='post_cita' and c.respuesta_asistencia is null and p_accion in ('pc_asisti','pc_no_asisti') then
  update public.primeras_citas set respuesta_asistencia=p_accion='pc_asisti',updated_at=clock_timestamp() where id=c.id;
  next_type:=case when p_accion='pc_asisti' then 'pregunta_alquiler' else 'reagendar' end;
 elsif m.tipo='pregunta_alquiler' and c.respuesta_asistencia is true and c.respuesta_alquiler is null and p_accion in ('pc_alquile','pc_no_alquile') then
  update public.primeras_citas set respuesta_alquiler=p_accion='pc_alquile',updated_at=clock_timestamp() where id=c.id;
  if p_accion='pc_no_alquile' then next_type:='pregunta_motivo';end if;
 elsif m.tipo='pregunta_motivo' and c.respuesta_alquiler is false and c.motivo_no_alquiler='' then
  reason:=case p_accion when 'mot_precio' then 'Precio' when 'mot_no_vestido' then 'No encontré vestido' when 'mot_otras_tiendas' then 'Visitaré otras tiendas' when 'mot_consultar' then 'Debo consultarlo' when 'mot_fecha_evento' then 'Fecha del evento' when 'mot_talla_diseno' then 'Talla / diseño / ajuste' when 'mot_otro' then 'Otro' end;
  if reason is null then return false;end if;
  update public.primeras_citas set motivo_no_alquiler=reason,updated_at=clock_timestamp() where id=c.id;
 else return false;
 end if;
 if next_type is not null then insert into public.primeras_citas_mensajes(cita_id,revision,tipo,programado_at) values(c.id,c.revision,next_type,now()) on conflict do nothing;end if;
 insert into public.primeras_citas_historial(cita_id,accion,detalle) values(c.id,'Respuesta WhatsApp',coalesce(reason,p_accion));
 return true;
end; $$;
revoke all on function public.respuesta_whatsapp_primera_cita(text,text,text,text) from public,anon,authenticated;
grant execute on function public.respuesta_whatsapp_primera_cita(text,text,text,text) to service_role;
create index primeras_citas_mensajes_provider on public.primeras_citas_mensajes(provider_id) where provider_id is not null;
notify pgrst,'reload schema';

-- Track signed Meta delivery callbacks without changing the customer's business outcome.
create function public.estado_whatsapp_primera_cita(p_provider_id text,p_telefono text,p_estado text,p_fecha timestamptz) returns boolean language plpgsql security invoker set search_path='' as $$
declare m public.primeras_citas_mensajes; phone text;
begin
 if p_estado is null or p_estado not in ('sent','delivered','read','failed') or p_fecha is null or p_fecha>now()+interval '5 minutes' then return false;end if;
 select * into m from public.primeras_citas_mensajes where provider_id=p_provider_id for update;
 if not found then return false;end if;
 select case when length(telefono)=10 then '57'||telefono else telefono end into phone from public.primeras_citas where id=m.cita_id;
 if phone is distinct from p_telefono then return false;end if;
 if m.entrega_actualizada_at is not null and p_fecha<m.entrega_actualizada_at then return true;end if;
 if m.entrega_estado='read' or (m.entrega_estado='delivered' and p_estado in ('sent','failed')) then return true;end if;
 update public.primeras_citas_mensajes set entrega_estado=p_estado,entrega_actualizada_at=p_fecha,estado=case when p_estado='failed' then 'revisar' else estado end,error=case when p_estado='failed' then 'WhatsApp no pudo entregar el mensaje; revisar destinatario y proveedor.' else error end where id=m.id;
 return true;
end; $$;
revoke all on function public.estado_whatsapp_primera_cita(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.estado_whatsapp_primera_cita(text,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';
