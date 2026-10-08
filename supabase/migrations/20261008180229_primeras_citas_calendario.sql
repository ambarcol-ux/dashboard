-- Primera visita only. No changes to existing citas or contract date rules.
create table public.primeras_citas (
 id uuid primary key,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 modalidad text not null check (modalidad in ('presencial','virtual')),
 sede_id uuid not null references public.sedes(id),
 fecha date not null,
 hora time not null check (hora >= time '09:00' and hora <= time '18:00' and extract(minute from hora)=0 and extract(second from hora)=0),
 cliente_nombre text not null check (length(cliente_nombre) between 2 and 120),
 telefono text not null check (telefono ~ '^[0-9]{10,15}$'),
 email text not null default '' check (length(email)<=160),
 estado text not null default 'agendada' check (estado in ('agendada','confirmada','asistio','seguimiento','no_asistio','no_cerro','cancelada')),
 motivo text not null default '' check (length(motivo)<=1000),
 responsable_id uuid references public.profiles(id),
 consentimiento_at timestamptz not null default now(),
 check (modalidad<>'virtual' or extract(isodow from fecha)<>7)
);
create index primeras_citas_cupo on public.primeras_citas(fecha,hora,modalidad,sede_id) where estado<>'cancelada';
create index primeras_citas_telefono on public.primeras_citas(telefono,fecha);
create index primeras_citas_sede on public.primeras_citas(sede_id,fecha);
create index primeras_citas_responsable on public.primeras_citas(responsable_id);
create table public.primeras_citas_historial (
 id uuid primary key default gen_random_uuid(),
 cita_id uuid not null references public.primeras_citas(id),
 created_at timestamptz not null default now(),
 usuario_id uuid references public.profiles(id),
 accion text not null,
 detalle text not null
);
create index primeras_citas_historial_cita on public.primeras_citas_historial(cita_id,created_at);
create index primeras_citas_historial_usuario on public.primeras_citas_historial(usuario_id);
create table private.primeras_citas_limites (
 clave text primary key,
 ventana timestamptz not null,
 intentos integer not null
);
alter table private.primeras_citas_limites enable row level security;
create policy primeras_citas_limites_servidor on private.primeras_citas_limites for all to service_role using(true) with check(true);
revoke all on private.primeras_citas_limites from public,anon,authenticated;
grant select,insert,update,delete on private.primeras_citas_limites to service_role;

create function private.acceso_primera_cita(p_sede uuid,p_modalidad text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.activo is true and (lower(p.rol)='admin' or (lower(p.rol)='asesora' and (p.sede_id=p_sede or p_modalidad='virtual'))));
$$;
revoke all on function private.acceso_primera_cita(uuid,text) from public,anon;
grant execute on function private.acceso_primera_cita(uuid,text) to authenticated;
alter table public.primeras_citas enable row level security;
alter table public.primeras_citas_historial enable row level security;
revoke all on public.primeras_citas,public.primeras_citas_historial from public,anon,authenticated;
grant select on public.primeras_citas,public.primeras_citas_historial to authenticated;
grant all on public.primeras_citas,public.primeras_citas_historial to service_role;
create policy primeras_citas_lectura on public.primeras_citas for select to authenticated using(private.acceso_primera_cita(sede_id,modalidad));
create policy primeras_citas_historial_lectura on public.primeras_citas_historial for select to authenticated using(exists(select 1 from public.primeras_citas c where c.id=cita_id));

grant usage on schema private to service_role;

-- Server-only public-booking API. No client has SELECT on public visitors' data.
create function public.disponibilidad_primera_cita(p_fecha date,p_modalidad text,p_sede uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare today date := (now() at time zone 'America/Bogota')::date; result jsonb;
begin
 if p_fecha is null or p_fecha<today or p_fecha>today+90 or p_modalidad is null or p_modalidad not in ('presencial','virtual') or not exists(select 1 from public.sedes where id=p_sede and activo is true) then raise exception 'Fecha, modalidad o sede inválida.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('hora',to_char(h,'HH24:MI'),'cupos',greatest(0,cap-ocupados)) order by h),'[]'::jsonb) into result
 from (
 select (time '09:00'+n*interval '1 hour') h,
 case when p_modalidad='virtual' then case when extract(isodow from p_fecha)=7 then 0 else 1 end when extract(isodow from p_fecha)=7 then 1 else 2 end cap,
 (select count(*) from public.primeras_citas c where c.fecha=p_fecha and c.hora=time '09:00'+n*interval '1 hour' and c.modalidad=p_modalidad and (p_modalidad='virtual' or c.sede_id=p_sede) and c.estado<>'cancelada')::integer ocupados
 from generate_series(0,9) n
 where (p_fecha+time '09:00'+n*interval '1 hour') at time zone 'America/Bogota'>now()
 ) t;
 return result;
end; $$;
revoke all on function public.disponibilidad_primera_cita(date,text,uuid) from public,anon,authenticated;
grant execute on function public.disponibilidad_primera_cita(date,text,uuid) to service_role;

create function public.reservar_primera_cita(p_id uuid,p_fecha date,p_hora time,p_modalidad text,p_sede uuid,p_nombre text,p_telefono text,p_email text,p_consentimiento boolean,p_limite text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.primeras_citas; slots jsonb; available integer; attempts integer;
begin
 if p_id is null or p_consentimiento is distinct from true or p_nombre is null or length(trim(p_nombre)) not between 2 and 120 or p_telefono is null or p_telefono !~ '^[0-9]{10,15}$' or p_email is null or length(p_email)>160 or (p_email<>'' and p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or p_limite is null or length(p_limite)<>64 then raise exception 'Revisa tus datos y acepta el uso de tus datos para gestionar la cita.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('primera-id:'||p_id::text,0));
 select * into old from public.primeras_citas where id=p_id;
 if found then
  if old.estado='cancelada' then return jsonb_build_object('reservada',false,'error','Esta reserva fue cancelada. Inicia una nueva solicitud.'); end if;
  if old.fecha=p_fecha and old.hora=p_hora and old.modalidad=p_modalidad and old.sede_id=p_sede and old.telefono=p_telefono and old.cliente_nombre=trim(p_nombre) and old.email=p_email then return jsonb_build_object('reservada',true,'id',old.id); end if;
  raise exception 'La solicitud ya fue utilizada. Actualiza e intenta de nuevo.';
 end if;
 -- Both phone and capacity checks are protected from simultaneous bookings.
 perform pg_advisory_xact_lock(hashtextextended('primera-phone:'||p_telefono,0));
 perform pg_advisory_xact_lock(hashtextextended('primera-slot:'||coalesce(p_modalidad,'')||':'||case when p_modalidad='virtual' then 'global' else coalesce(p_sede::text,'') end||':'||coalesce(p_fecha::text,'')||':'||coalesce(p_hora::text,''),0));
 insert into private.primeras_citas_limites(clave,ventana,intentos) values(p_limite,now(),1)
 on conflict(clave) do update set intentos=case when primeras_citas_limites.ventana<now()-interval '1 hour' then 1 else primeras_citas_limites.intentos+1 end,ventana=case when primeras_citas_limites.ventana<now()-interval '1 hour' then now() else primeras_citas_limites.ventana end returning intentos into attempts;
 if attempts>8 then return jsonb_build_object('reservada',false,'error','Has realizado varias reservas. Intenta más tarde.'); end if;
 slots:=public.disponibilidad_primera_cita(p_fecha,p_modalidad,p_sede);
 select (s->>'cupos')::integer into available from jsonb_array_elements(slots) s where s->>'hora'=to_char(p_hora,'HH24:MI');
 if p_hora is null or extract(minute from p_hora)<>0 or extract(second from p_hora)<>0 or coalesce(available,0)<1 then return jsonb_build_object('reservada',false,'error','Ese horario ya no está disponible. Elige otro.'); end if;
 if exists(select 1 from public.primeras_citas where telefono=p_telefono and fecha>=(now() at time zone 'America/Bogota')::date and estado in ('agendada','confirmada')) then return jsonb_build_object('reservada',false,'error','Ya tienes una primera cita pendiente. Contacta a la sede para cambiarla.'); end if;
 insert into public.primeras_citas(id,modalidad,sede_id,fecha,hora,cliente_nombre,telefono,email) values(p_id,p_modalidad,p_sede,p_fecha,p_hora,trim(p_nombre),p_telefono,p_email);
 insert into public.primeras_citas_historial(cita_id,accion,detalle) values(p_id,'Reserva del cliente','Primera visita reservada desde enlace público.');
 return jsonb_build_object('reservada',true,'id',p_id);
end; $$;
revoke all on function public.reservar_primera_cita(uuid,date,time,text,uuid,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.reservar_primera_cita(uuid,date,time,text,uuid,text,text,text,boolean,text) to service_role;

alter table public.contratos add column primera_cita_id uuid references public.primeras_citas(id);
create unique index contratos_primera_cita_unique on public.contratos(primera_cita_id) where primera_cita_id is not null;

create function private.gestionar_primera_cita(p_id uuid,p_estado text,p_motivo text,p_version timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=p_id for update;
 if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'Cita no disponible para tu usuario.'; end if;
 if p_version is null or c.updated_at<>p_version then raise exception 'La cita cambió. Actualiza antes de guardar.'; end if;
 if p_estado is null or p_estado not in ('confirmada','asistio','seguimiento','no_asistio','no_cerro','cancelada') or p_motivo is null or length(p_motivo)>1000 then raise exception 'Resultado inválido.'; end if;
 if c.estado='cancelada' then raise exception 'Una cita cancelada no puede reactivarse: crea una reserva nueva.'; end if;
 if p_estado in ('no_cerro','cancelada','no_asistio') and length(trim(p_motivo))<5 then raise exception 'Escribe el motivo (mínimo 5 caracteres).'; end if;
 if p_estado in ('asistio','seguimiento','no_asistio','no_cerro') and (c.fecha+c.hora) at time zone 'America/Bogota'>now() then raise exception 'La cita todavía no ha ocurrido.'; end if;
 if p_estado in ('cancelada','no_cerro','no_asistio') and exists(select 1 from public.contratos where primera_cita_id=p_id and lower(estado) not in ('anulado','cancelado','rechazado')) then raise exception 'La cita ya tiene contrato. Revisa el contrato antes de cambiar el resultado.'; end if;
 update public.primeras_citas set estado=p_estado,motivo=trim(p_motivo),responsable_id=auth.uid(),updated_at=clock_timestamp() where id=p_id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(p_id,auth.uid(),c.estado||' → '||p_estado,trim(p_motivo));
end; $$;
revoke all on function private.gestionar_primera_cita(uuid,text,text,timestamptz) from public,anon;
grant execute on function private.gestionar_primera_cita(uuid,text,text,timestamptz) to authenticated;
create function public.gestionar_primera_cita(p_id uuid,p_estado text,p_motivo text,p_version timestamptz) returns void language sql security invoker set search_path='' as $$ select private.gestionar_primera_cita(p_id,p_estado,p_motivo,p_version); $$;
revoke all on function public.gestionar_primera_cita(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.gestionar_primera_cita(uuid,text,text,timestamptz) to authenticated;

create function private.vincular_primera_cita() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas;
begin
 if TG_OP='UPDATE' and new.primera_cita_id is not distinct from old.primera_cita_id and new.sede_id is not distinct from old.sede_id then return new; end if;
 if TG_OP='UPDATE' and old.primera_cita_id is not null and new.primera_cita_id is distinct from old.primera_cita_id then raise exception 'El origen de primera visita no se puede cambiar.'; end if;
 if new.primera_cita_id is null then return new; end if;
 select * into c from public.primeras_citas where id=new.primera_cita_id for update;
 if auth.uid() is null or not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) or new.sede_id is distinct from c.sede_id then raise exception 'La cita y el contrato deben pertenecer a la sede autorizada.'; end if;
 if c.estado not in ('asistio','seguimiento') then raise exception 'Registra primero la atención de la primera cita.'; end if;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Contrato creado',coalesce(new.numero_contrato,new.id::text));
 update public.primeras_citas set responsable_id=auth.uid(),updated_at=clock_timestamp() where id=c.id;
 return new;
end; $$;
revoke all on function private.vincular_primera_cita() from public,anon,authenticated;
create trigger vincular_primera_cita before insert or update of primera_cita_id,sede_id on public.contratos for each row execute function private.vincular_primera_cita();

create function private.listar_primeras_citas(p_desde date,p_hasta date) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and activo is true and lower(rol) in ('admin','asesora')) then raise exception 'No tienes acceso a primeras visitas.'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Selecciona un periodo de hasta un año.'; end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.fecha,t.hora) from (
 select c.*,s.nombre sede,p.nombre responsable,k.id contrato_id,k.numero_contrato,k.estado contrato_estado
 from public.primeras_citas c join public.sedes s on s.id=c.sede_id left join public.profiles p on p.id=c.responsable_id left join public.contratos k on k.primera_cita_id=c.id
 where c.fecha between p_desde and p_hasta and private.acceso_primera_cita(c.sede_id,c.modalidad)
 )t),'[]'::jsonb);
end; $$;
revoke all on function private.listar_primeras_citas(date,date) from public,anon;
grant execute on function private.listar_primeras_citas(date,date) to authenticated;
create function public.listar_primeras_citas(p_desde date,p_hasta date) returns jsonb language sql security invoker set search_path='' as $$select private.listar_primeras_citas(p_desde,p_hasta);$$;
revoke all on function public.listar_primeras_citas(date,date) from public,anon;
grant execute on function public.listar_primeras_citas(date,date) to authenticated;
notify pgrst,'reload schema';
