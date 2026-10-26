-- Agenda de primeras citas independiente por sede.
-- Cada sede tiene, por modalidad: estado (bloqueo y reapertura), cupo por defecto, lunes festivos y horario semanal.
-- El cupo virtual deja de ser compartido: cada sede cuenta solo sus citas virtuales.
-- El interruptor general por modalidad (agenda_modalidad) queda solo para el Propietario y aplica a todas las sedes.
-- Administradoras de tienda (asesora_lider) y franquiciados editan solo su sede.

create table if not exists public.agenda_sede_modalidad(
 sede_id uuid not null references public.sedes(id),
 modalidad text not null references public.agenda_modalidad(modalidad),
 estado text not null default 'ACTIVA' check(estado in ('ACTIVA','BLOQUEADA')),
 motivo_bloqueo text not null default '',
 reapertura_programada timestamptz,
 cupo_defecto int not null check(cupo_defecto between 1 and 3),
 cerrar_lunes_festivos boolean not null default true,
 actualizado_por uuid references public.profiles(id),
 actualizado_en timestamptz not null default now(),
 primary key(sede_id,modalidad)
);
create table if not exists public.agenda_horario_sede(
 id uuid primary key default gen_random_uuid(),
 sede_id uuid not null references public.sedes(id),
 modalidad text not null references public.agenda_modalidad(modalidad),
 dia_semana int not null check(dia_semana between 1 and 7),
 hora_inicio time not null,
 hora_fin time not null,
 cupo_defecto int not null check(cupo_defecto between 1 and 3),
 activo boolean not null default true,
 unique(sede_id,modalidad,dia_semana),
 check(hora_fin>hora_inicio),
 check(extract(minute from hora_inicio)=0 and extract(minute from hora_fin)=0)
);
alter table public.agenda_sede_modalidad enable row level security;
alter table public.agenda_horario_sede enable row level security;
revoke all on public.agenda_sede_modalidad, public.agenda_horario_sede from anon, authenticated;
alter table public.agenda_auditoria add column if not exists sede_id uuid references public.sedes(id);

-- Migración: el horario y la configuración actuales se copian a las 4 sedes (nada cambia el día del cambio).
insert into public.agenda_sede_modalidad(sede_id,modalidad,cupo_defecto,cerrar_lunes_festivos)
select s.id,m.modalidad,m.cupo_defecto,m.cerrar_lunes_festivos from public.sedes s cross join public.agenda_modalidad m where s.activo is true
on conflict do nothing;
insert into public.agenda_horario_sede(sede_id,modalidad,dia_semana,hora_inicio,hora_fin,cupo_defecto,activo)
select s.id,h.modalidad,h.dia_semana,h.hora_inicio,h.hora_fin,h.cupo_defecto,h.activo from public.sedes s cross join public.agenda_horario_base h where s.activo is true
on conflict do nothing;

-- Permisos: «Configurar agenda» se puede dar a administradoras de tienda y franquiciados, limitado a su sede.
update public.permisos set solo_admin=false,descripcion='Horario base, bloqueos y excepciones de su sede (el Propietario: todas)' where codigo='agenda.configurar';
insert into public.roles(id,nombre,descripcion,sistema) values('franquiciado','Franquiciado','Dueño de una sede: configura la agenda de su sede',true) on conflict (id) do nothing;
insert into public.roles_permisos(rol_id,permiso) values('asesora_lider','agenda.configurar'),('franquiciado','agenda.configurar'),('franquiciado','panel.primeras-citas')
on conflict (rol_id,permiso) do update set activo=true;

create or replace function private.agenda_es_propietario() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) and lower(btrim(p.rol))='admin')
  or exists(select 1 from public.usuarios_roles u where u.usuario_id=auth.uid() and u.rol_id='admin' and u.activo));
$$;
-- ¿Puede editar la agenda de esa sede? p_sede null = todas las sedes (solo Propietario).
create or replace function private.agenda_puede_sede(p_sede uuid, p_nivel text default 'configurar') returns boolean language sql stable security definer set search_path='' as $$
 select private.agenda_es_propietario() or (
  p_sede is not null
  and (private.tiene_permiso('agenda.configurar') or (p_nivel='excepciones' and private.tiene_permiso('agenda.excepciones')))
  and exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) and p.sede_id=p_sede));
$$;
create or replace function private.agenda_sedes_editables() returns uuid[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(s.id),'{}') from public.sedes s where s.activo is true and private.agenda_puede_sede(s.id,'excepciones');
$$;

create or replace function private.agenda_auditar_sede(p_sede uuid, p_tabla text, p_registro text, p_accion text, p_antes jsonb, p_despues jsonb, p_motivo text)
returns void language sql security definer set search_path='' as $$
 insert into public.agenda_auditoria(usuario_id,sede_id,tabla,registro_id,accion,valor_anterior,valor_nuevo,motivo) values(auth.uid(),p_sede,p_tabla,p_registro,p_accion,p_antes,p_despues,coalesce(p_motivo,''));
$$;

-- Slots con estado, ahora siempre por sede (presencial y virtual).
create or replace function private.agenda_slots(p_modalidad text, p_sede uuid, p_desde date, p_hasta date)
returns table(fecha date, hora time, habilitado boolean, cupo int, reservadas int, libres int, origen text, motivo text, en_base boolean, pasado boolean, excepcion_id uuid)
language sql stable security definer set search_path='' as $$
 with g as (
  select *, (estado='BLOQUEADA' and (reapertura_programada is null or reapertura_programada>now())) bloqueada from public.agenda_modalidad where modalidad=p_modalidad
 ), m as (
  select sm.*, (sm.estado='BLOQUEADA' and (sm.reapertura_programada is null or sm.reapertura_programada>now())) bloqueada
  from public.agenda_sede_modalidad sm where sm.sede_id=p_sede and sm.modalidad=p_modalidad
 ), bl as (
  select coalesce((select bloqueada from g),false) or coalesce((select bloqueada from m),false) or not exists(select 1 from m) bloqueada,
   case when coalesce((select bloqueada from g),false) then (select motivo_bloqueo from g) when coalesce((select bloqueada from m),false) then (select motivo_bloqueo from m) else 'Sede sin agenda configurada' end motivo
 ), s as (
  select d::date f, (time '00:00'+h*interval '1 hour')::time t from generate_series(p_desde,p_hasta,interval '1 day') d cross join generate_series(6,21) h
 ), b as (
  select s.f, s.t, hb.id is not null en_base, coalesce(hb.cupo_defecto,(select cupo_defecto from m),(select cupo_defecto from g)) cupo_base,
   coalesce((select cerrar_lunes_festivos from m),true) and extract(isodow from s.f)=1 and private.festivo_colombia(s.f) festivo
  from s left join public.agenda_horario_sede hb on hb.sede_id=p_sede and hb.modalidad=p_modalidad and hb.activo and hb.dia_semana=extract(isodow from s.f)::int and s.t>=hb.hora_inicio and s.t<hb.hora_fin
 ), e as (
  select b.*, x.id xid, x.accion, x.cupo xcupo, x.motivo xmotivo
  from b left join lateral (
   select x.* from public.agenda_excepcion x
   where x.activo and x.modalidad=p_modalidad and (x.sede_id is null or x.sede_id=p_sede)
    and b.f>=x.fecha_inicio and b.f<=coalesce(x.fecha_fin,case when x.dias_semana is null then x.fecha_inicio else 'infinity'::date end)
    and (x.dias_semana is null or extract(isodow from b.f)::int=any(x.dias_semana))
    and (x.hora_inicio is null or (b.t>=x.hora_inicio and b.t<x.hora_fin))
   order by case when x.hora_inicio is not null then case when x.hora_fin-x.hora_inicio=interval '1 hour' then 5 else 4 end
             when x.dias_semana is not null then 1 when coalesce(x.fecha_fin,x.fecha_inicio)>x.fecha_inicio then 2 else 3 end desc, x.creado_en desc
   limit 1) x on true
 )
 select e.f, e.t,
  not (select bloqueada from bl) and case when e.xid is not null then e.accion='HABILITAR' else e.en_base and not e.festivo end,
  coalesce(e.xcupo,e.cupo_base),
  r.n,
  greatest(0,coalesce(e.xcupo,e.cupo_base)-r.n),
  case when (select bloqueada from bl) then 'modalidad' when e.xid is not null then case when e.accion='HABILITAR' then 'excepcion' else 'bloqueo' end when e.festivo and e.en_base then 'festivo' when e.en_base then 'base' else 'fuera' end,
  case when (select bloqueada from bl) then (select motivo from bl) when e.xid is not null then e.xmotivo when e.festivo and e.en_base then 'Lunes festivo' else '' end,
  e.en_base,
  (e.f+e.t) at time zone 'America/Bogota'<=now(),
  e.xid
 from e cross join lateral (
  select count(*)::int n from public.primeras_citas c where c.origen='cita' and c.fecha=e.f and c.hora=e.t and c.modalidad=p_modalidad and c.sede_id=p_sede and c.estado<>'cancelada'
 ) r
 order by 1,2;
$$;

-- Portal: días y modalidades abiertas de la sede elegida.
create or replace function public.dias_primera_cita(p_modalidad text, p_sede uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date := (now() at time zone 'America/Bogota')::date;
begin
 if p_modalidad not in ('presencial','virtual') or p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>92 or not exists(select 1 from public.sedes where id=p_sede and activo is true) then raise exception 'Consulta inválida.'; end if;
 return jsonb_build_object(
  'modalidades',(select jsonb_object_agg(g.modalidad,
    not (g.estado='BLOQUEADA' and (g.reapertura_programada is null or g.reapertura_programada>now()))
    and exists(select 1 from public.agenda_sede_modalidad sm where sm.sede_id=p_sede and sm.modalidad=g.modalidad and not (sm.estado='BLOQUEADA' and (sm.reapertura_programada is null or sm.reapertura_programada>now()))))
   from public.agenda_modalidad g),
  'dias',coalesce((select jsonb_agg(jsonb_build_object('fecha',f,'disponible',disp,'motivo',case when disp then null else mot end) order by f) from (
   select s.fecha f, bool_or(s.habilitado and not s.pasado and s.libres>0) disp,
    coalesce(max(nullif(s.motivo,'')) filter (where not s.habilitado and s.en_base),case when bool_or(s.habilitado and not s.pasado) then 'Sin cupos' else 'Sin atención' end) mot
   from private.agenda_slots(p_modalidad,p_sede,greatest(p_desde,today),least(p_hasta,today+90)) s group by s.fecha) d),'[]'::jsonb));
end $$;

create or replace function private.agenda_validar_cupos(p_modalidad text, p_sede uuid)
returns void language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/Bogota')::date; s record;
begin
 for s in
  select x.fecha, x.hora, x.cupo, x.reservadas, se.nombre sede
  from public.sedes se cross join lateral private.agenda_slots(p_modalidad,se.id,today,today+120) x
  where se.activo is true and (p_sede is null or se.id=p_sede) and x.habilitado and not x.pasado and x.reservadas>x.cupo limit 1
 loop
  raise exception 'El % a las % (%) tiene % reservas: el cupo no puede quedar en %. Reprograma primero las citas sobrantes.', to_char(s.fecha,'DD/MM/YYYY'), to_char(s.hora,'HH24:MI'), s.sede, s.reservadas, s.cupo;
 end loop;
end $$;
create or replace function private.agenda_validar_cupos(p_modalidad text)
returns void language sql security definer set search_path='' as $$ select private.agenda_validar_cupos(p_modalidad,null::uuid); $$;

create or replace function private.agenda_config()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare editables uuid[]:=private.agenda_sedes_editables();
begin
 if not private.agenda_puede('ver') then raise exception 'No tienes acceso a la agenda.' using errcode='42501'; end if;
 return jsonb_build_object(
  'propietario',private.agenda_es_propietario(),
  'puede_configurar',private.agenda_es_propietario() or private.tiene_permiso('agenda.configurar'),
  'puede_excepciones',cardinality(editables)>0,
  'sedes_editables',to_jsonb(editables),
  'mi_sede',(select sede_id from public.profiles where id=auth.uid()),
  'modalidades',(select jsonb_agg(to_jsonb(m)||jsonb_build_object('actualizado_por_nombre',(select coalesce(nombre,email) from public.profiles where id=m.actualizado_por),
     'bloqueada',m.estado='BLOQUEADA' and (m.reapertura_programada is null or m.reapertura_programada>now())) order by m.modalidad) from public.agenda_modalidad m),
  'sede_modalidad',(select coalesce(jsonb_agg(to_jsonb(sm)||jsonb_build_object('actualizado_por_nombre',(select coalesce(nombre,email) from public.profiles where id=sm.actualizado_por),
     'bloqueada',sm.estado='BLOQUEADA' and (sm.reapertura_programada is null or sm.reapertura_programada>now())) order by sm.sede_id,sm.modalidad),'[]'::jsonb) from public.agenda_sede_modalidad sm),
  'horario',(select coalesce(jsonb_agg(to_jsonb(h) order by h.sede_id,h.modalidad,h.dia_semana),'[]'::jsonb) from public.agenda_horario_sede h),
  'excepciones',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('sede',(select nombre from public.sedes where id=x.sede_id),'creado_por_nombre',(select coalesce(nombre,email) from public.profiles where id=x.creado_por),
     'editable',private.agenda_puede_sede(x.sede_id,'excepciones')) order by x.creado_en desc),'[]'::jsonb)
   from public.agenda_excepcion x where x.activo and coalesce(x.fecha_fin,case when x.dias_semana is null then x.fecha_inicio else 'infinity'::date end)>=(now() at time zone 'America/Bogota')::date),
  'sedes',(select jsonb_agg(jsonb_build_object('id',id,'nombre',nombre) order by nombre) from public.sedes where activo is true));
end $$;

create or replace function private.agenda_calendario(p_modalidad text, p_sede uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.agenda_puede('ver') then raise exception 'No tienes acceso a la agenda.' using errcode='42501'; end if;
 if p_modalidad not in ('presencial','virtual') or p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>45 then raise exception 'Periodo inválido.'; end if;
 if p_sede is null then raise exception 'Elige la sede.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('fecha',s.fecha,'hora',to_char(s.hora,'HH24:MI'),'habilitado',s.habilitado,'cupo',s.cupo,'reservadas',s.reservadas,'libres',s.libres,'origen',s.origen,'motivo',s.motivo,'en_base',s.en_base,'pasado',s.pasado,'excepcion_id',s.excepcion_id) order by s.fecha,s.hora)
  from private.agenda_slots(p_modalidad,p_sede,p_desde,p_hasta) s where s.en_base or s.excepcion_id is not null or s.reservadas>0),'[]'::jsonb);
end $$;

-- Interruptor general (todas las sedes): solo el Propietario.
create or replace function private.agenda_guardar_modalidad(p_modalidad text, p_activa boolean, p_motivo text, p_reapertura timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare old public.agenda_modalidad; reason text:=btrim(coalesce(p_motivo,''));
begin
 if not private.agenda_es_propietario() then raise exception 'Solo el Propietario puede cerrar una modalidad en todas las sedes.' using errcode='42501'; end if;
 select * into old from public.agenda_modalidad where modalidad=p_modalidad for update;
 if old.modalidad is null or p_activa is null then raise exception 'Modalidad inválida.'; end if;
 if not p_activa and length(reason)<3 then raise exception 'Escribe el motivo del bloqueo.'; end if;
 if not p_activa and p_reapertura is not null and p_reapertura<=now() then raise exception 'La reapertura debe ser en el futuro.'; end if;
 update public.agenda_modalidad set estado=case when p_activa then 'ACTIVA' else 'BLOQUEADA' end,motivo_bloqueo=case when p_activa then '' else reason end,
  reapertura_programada=case when p_activa then null else p_reapertura end,actualizado_por=auth.uid(),actualizado_en=now() where modalidad=p_modalidad;
 perform private.agenda_auditar_sede(null,'agenda_modalidad',p_modalidad,case when p_activa then 'HABILITAR' else 'BLOQUEAR' end,
  jsonb_build_object('modalidad',p_modalidad,'estado',old.estado,'motivo',old.motivo_bloqueo,'reapertura',old.reapertura_programada),
  jsonb_build_object('modalidad',p_modalidad,'estado',case when p_activa then 'ACTIVA' else 'BLOQUEADA' end,'reapertura',case when p_activa then null else p_reapertura end),reason);
end $$;

-- Bloqueo / reapertura de una modalidad en una sede.
create or replace function private.agenda_guardar_estado_sede(p_sede uuid, p_modalidad text, p_activa boolean, p_motivo text, p_reapertura timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare old public.agenda_sede_modalidad; reason text:=btrim(coalesce(p_motivo,''));
begin
 if p_sede is null or not private.agenda_puede_sede(p_sede) then raise exception 'Solo puedes cambiar la agenda de tu sede.' using errcode='42501'; end if;
 select * into old from public.agenda_sede_modalidad where sede_id=p_sede and modalidad=p_modalidad for update;
 if old.sede_id is null or p_activa is null then raise exception 'Sede o modalidad inválida.'; end if;
 if not p_activa and length(reason)<3 then raise exception 'Escribe el motivo del bloqueo.'; end if;
 if not p_activa and p_reapertura is not null and p_reapertura<=now() then raise exception 'La reapertura debe ser en el futuro.'; end if;
 update public.agenda_sede_modalidad set estado=case when p_activa then 'ACTIVA' else 'BLOQUEADA' end,motivo_bloqueo=case when p_activa then '' else reason end,
  reapertura_programada=case when p_activa then null else p_reapertura end,actualizado_por=auth.uid(),actualizado_en=now() where sede_id=p_sede and modalidad=p_modalidad;
 perform private.agenda_auditar_sede(p_sede,'agenda_sede_modalidad',p_modalidad,case when p_activa then 'HABILITAR' else 'BLOQUEAR' end,
  jsonb_build_object('modalidad',p_modalidad,'estado',old.estado,'motivo',old.motivo_bloqueo,'reapertura',old.reapertura_programada),
  jsonb_build_object('modalidad',p_modalidad,'estado',case when p_activa then 'ACTIVA' else 'BLOQUEADA' end,'reapertura',case when p_activa then null else p_reapertura end),reason);
end $$;

-- Horario base de una sede y modalidad: 7 días, cupo por defecto y lunes festivos.
create or replace function private.agenda_guardar_horario_sede(p_sede uuid, p_modalidad text, p_dias jsonb, p_cupo_defecto int, p_cerrar_festivos boolean, p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare antes jsonb; d jsonb;
begin
 if p_sede is null or not private.agenda_puede_sede(p_sede) then raise exception 'Solo puedes editar el horario de tu sede.' using errcode='42501'; end if;
 if not exists(select 1 from public.agenda_sede_modalidad where sede_id=p_sede and modalidad=p_modalidad) then raise exception 'Sede o modalidad inválida.'; end if;
 if p_cupo_defecto is null or p_cupo_defecto not between 1 and 3 then raise exception 'El cupo solo puede ser 1, 2 o 3.'; end if;
 if p_cerrar_festivos is null then raise exception 'Indica si se cierra los lunes festivos.'; end if;
 if jsonb_typeof(p_dias)<>'array' or jsonb_array_length(p_dias)<>7 then raise exception 'Envía los 7 días de la semana.'; end if;
 select jsonb_build_object('modalidad',p_modalidad,'cupo_defecto',sm.cupo_defecto,'cerrar_lunes_festivos',sm.cerrar_lunes_festivos,
  'dias',(select jsonb_agg(to_jsonb(h) order by h.dia_semana) from public.agenda_horario_sede h where h.sede_id=p_sede and h.modalidad=p_modalidad)) into antes
  from public.agenda_sede_modalidad sm where sm.sede_id=p_sede and sm.modalidad=p_modalidad;
 for d in select * from jsonb_array_elements(p_dias) loop
  if (d->>'dia_semana')::int not between 1 and 7 or coalesce((d->>'cupo_defecto')::int,0) not between 1 and 3 or (d->>'hora_fin')::time<=(d->>'hora_inicio')::time then raise exception 'Revisa las horas y el cupo (1, 2 o 3) de cada día.'; end if;
  insert into public.agenda_horario_sede(sede_id,modalidad,dia_semana,hora_inicio,hora_fin,cupo_defecto,activo)
  values(p_sede,p_modalidad,(d->>'dia_semana')::int,(d->>'hora_inicio')::time,(d->>'hora_fin')::time,(d->>'cupo_defecto')::int,coalesce((d->>'activo')::boolean,true))
  on conflict (sede_id,modalidad,dia_semana) do update set hora_inicio=excluded.hora_inicio,hora_fin=excluded.hora_fin,cupo_defecto=excluded.cupo_defecto,activo=excluded.activo;
 end loop;
 update public.agenda_sede_modalidad set cupo_defecto=p_cupo_defecto,cerrar_lunes_festivos=p_cerrar_festivos,actualizado_por=auth.uid(),actualizado_en=now() where sede_id=p_sede and modalidad=p_modalidad;
 perform private.agenda_validar_cupos(p_modalidad,p_sede);
 perform private.agenda_auditar_sede(p_sede,'agenda_horario_sede',p_modalidad,'EDITAR',antes,
  jsonb_build_object('modalidad',p_modalidad,'cupo_defecto',p_cupo_defecto,'cerrar_lunes_festivos',p_cerrar_festivos,
   'dias',(select jsonb_agg(to_jsonb(h) order by h.dia_semana) from public.agenda_horario_sede h where h.sede_id=p_sede and h.modalidad=p_modalidad)),p_motivo);
end $$;

-- El horario base global quedó reemplazado por el horario por sede.
create or replace function private.agenda_guardar_horario(p_modalidad text, p_dias jsonb, p_cupo_defecto int, p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'El horario base ahora es por sede: elige la sede en Horario base.'; end $$;

create or replace function private.agenda_insertar_excepcion(p_datos jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.agenda_excepcion; today date:=(now() at time zone 'America/Bogota')::date; new_id uuid;
begin
 v.modalidad:=p_datos->>'modalidad'; v.sede_id:=nullif(p_datos->>'sede_id','')::uuid; v.fecha_inicio:=(p_datos->>'fecha_inicio')::date; v.fecha_fin:=nullif(p_datos->>'fecha_fin','')::date;
 v.dias_semana:=case when jsonb_typeof(p_datos->'dias_semana')='array' and jsonb_array_length(p_datos->'dias_semana')>0 then array(select jsonb_array_elements_text(p_datos->'dias_semana')::int) end;
 v.hora_inicio:=nullif(p_datos->>'hora_inicio','')::time; v.hora_fin:=nullif(p_datos->>'hora_fin','')::time; v.accion:=upper(coalesce(p_datos->>'accion',''));
 v.cupo:=nullif(p_datos->>'cupo','')::int; v.motivo:=btrim(coalesce(p_datos->>'motivo',''));
 if v.modalidad not in ('virtual','presencial') or v.accion not in ('HABILITAR','BLOQUEAR') or v.fecha_inicio is null then raise exception 'Elige modalidad, acción y fecha.'; end if;
 if not private.agenda_puede_sede(v.sede_id,'excepciones') then raise exception '%', case when v.sede_id is null then 'Solo el Propietario puede crear reglas para todas las sedes: elige tu sede.' else 'Solo puedes cambiar la agenda de tu sede.' end using errcode='42501'; end if;
 if v.sede_id is not null and not exists(select 1 from public.sedes where id=v.sede_id) then raise exception 'Sede no encontrada.'; end if;
 if v.fecha_inicio<today then raise exception 'No se pueden modificar fechas pasadas.'; end if;
 if v.fecha_fin is not null and v.fecha_fin<v.fecha_inicio then raise exception 'La fecha final debe ser igual o posterior a la inicial.'; end if;
 if v.fecha_fin is not null and v.fecha_fin>today+400 then raise exception 'El rango puede ser de máximo un año.'; end if;
 if (v.hora_inicio is null)<>(v.hora_fin is null) or (v.hora_inicio is not null and v.hora_fin<=v.hora_inicio) then raise exception 'Revisa la franja: la hora final debe ser posterior a la inicial.'; end if;
 if v.cupo is not null and v.cupo not between 1 and 3 then raise exception 'El cupo solo puede ser 1, 2 o 3.'; end if;
 if v.accion='BLOQUEAR' then v.cupo:=null; if length(v.motivo)<3 then raise exception 'El motivo es obligatorio para bloquear.'; end if; end if;
 if length(v.motivo)>500 then raise exception 'El motivo es muy largo.'; end if;
 insert into public.agenda_excepcion(modalidad,sede_id,fecha_inicio,fecha_fin,dias_semana,hora_inicio,hora_fin,accion,cupo,motivo,creado_por)
 values(v.modalidad,v.sede_id,v.fecha_inicio,v.fecha_fin,v.dias_semana,v.hora_inicio,v.hora_fin,v.accion,v.cupo,v.motivo,auth.uid()) returning id into new_id;
 return new_id;
end $$;

create or replace function private.agenda_estado_slots(p_modalidad text, p_sede uuid, p_desde date, p_hasta date)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('sede',se.id,'fecha',s.fecha,'hora',s.hora,'abierto',s.habilitado and not s.pasado,'cupo',s.cupo,'reservadas',s.reservadas)),'[]'::jsonb)
 from public.sedes se cross join lateral private.agenda_slots(p_modalidad,se.id,p_desde,p_hasta) s
 where se.activo is true and (p_sede is null or se.id=p_sede);
$$;

create or replace function private.agenda_efecto(p_datos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m text:=p_datos->>'modalidad'; sede uuid:=nullif(p_datos->>'sede_id','')::uuid; today date:=(now() at time zone 'America/Bogota')::date; desde date; hasta date; antes jsonb; despues jsonb; result jsonb;
begin
 if m not in ('virtual','presencial') or nullif(p_datos->>'fecha_inicio','') is null then raise exception 'Elige modalidad y fecha.'; end if;
 desde:=greatest(today,(p_datos->>'fecha_inicio')::date);
 hasta:=least(today+120,coalesce(nullif(p_datos->>'fecha_fin','')::date,case when jsonb_typeof(p_datos->'dias_semana')='array' and jsonb_array_length(p_datos->'dias_semana')>0 then today+120 else desde end));
 antes:=private.agenda_estado_slots(m,sede,desde,hasta);
 begin
  perform private.agenda_insertar_excepcion(p_datos);
  despues:=private.agenda_estado_slots(m,sede,desde,hasta);
  raise exception using errcode='P0099', message='agenda_preview';
 exception when sqlstate 'P0099' then null;
 end;
 with a as (select * from jsonb_to_recordset(antes) x(sede uuid, fecha date, hora time, abierto boolean, cupo int, reservadas int)),
  n as (select * from jsonb_to_recordset(despues) x(sede uuid, fecha date, hora time, abierto boolean, cupo int, reservadas int)),
  j as (select a.sede,a.fecha,a.hora,a.abierto ab,n.abierto nb,a.cupo ac,n.cupo nc,n.reservadas from a join n on n.sede=a.sede and n.fecha=a.fecha and n.hora=a.hora)
 select jsonb_build_object(
  'slots_bloqueados',(select count(*) from j where ab and not nb),
  'slots_habilitados',(select count(*) from j where not ab and nb),
  'cupo_cambia',(select count(*) from j where ab and nb and ac<>nc),
  'sobrecupo',(select count(*) from j where nb and reservadas>nc),
  'citas',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'fecha',c.fecha,'hora',to_char(c.hora,'HH24:MI'),'cliente',c.cliente_nombre,'telefono',c.telefono,'sede',(select nombre from public.sedes where id=c.sede_id),'estado',c.estado) order by c.fecha,c.hora)
    from public.primeras_citas c join j on j.fecha=c.fecha and j.hora=c.hora and j.sede=c.sede_id
    where c.origen='cita' and c.modalidad=m and c.estado in ('agendada','confirmada') and j.ab and not j.nb),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function private.agenda_vista_previa(p_datos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.agenda_puede_sede(nullif(p_datos->>'sede_id','')::uuid,'excepciones') then raise exception 'Solo puedes cambiar la agenda de tu sede.' using errcode='42501'; end if;
 return private.agenda_efecto(p_datos);
end $$;

create or replace function private.agenda_crear_excepcion(p_datos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare efecto jsonb; new_id uuid; c jsonb; canceladas int:=0; accion_citas text:=coalesce(p_datos->>'citas','mantener'); sede uuid:=nullif(p_datos->>'sede_id','')::uuid;
begin
 if not private.agenda_puede_sede(sede,'excepciones') then raise exception 'Solo puedes cambiar la agenda de tu sede.' using errcode='42501'; end if;
 if accion_citas not in ('mantener','cancelar') then raise exception 'Elige qué hacer con las citas afectadas.'; end if;
 efecto:=private.agenda_efecto(p_datos);
 new_id:=private.agenda_insertar_excepcion(p_datos);
 perform private.agenda_validar_cupos(p_datos->>'modalidad',sede);
 if accion_citas='cancelar' then
  for c in select * from jsonb_array_elements(efecto->'citas') loop
   update public.primeras_citas set estado='cancelada',motivo='Por un ajuste en nuestra agenda no podremos atenderte en ese horario. Puedes reservar una nueva cita.',updated_at=clock_timestamp()
    where id=(c->>'id')::uuid and estado in ('agendada','confirmada');
   if found then
    canceladas:=canceladas+1;
    insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values((c->>'id')::uuid,auth.uid(),'Cancelada por bloqueo de agenda',btrim(coalesce(p_datos->>'motivo','')));
   end if;
  end loop;
 end if;
 perform private.agenda_auditar_sede(sede,'agenda_excepcion',new_id::text,upper(p_datos->>'accion'),null,
  (select to_jsonb(x) from public.agenda_excepcion x where x.id=new_id)||jsonb_build_object('citas_afectadas',jsonb_array_length(efecto->'citas'),'citas_canceladas',canceladas),p_datos->>'motivo');
 return efecto||jsonb_build_object('id',new_id,'citas_canceladas',canceladas);
end $$;

create or replace function private.agenda_anular_excepcion(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare x public.agenda_excepcion;
begin
 select * into x from public.agenda_excepcion where id=p_id and activo for update;
 if x.id is null then raise exception 'La regla ya no está activa.'; end if;
 if not private.agenda_puede_sede(x.sede_id,'excepciones') then raise exception 'Solo puedes quitar reglas de tu sede.' using errcode='42501'; end if;
 update public.agenda_excepcion set activo=false,anulado_por=auth.uid(),anulado_en=now(),motivo_anulacion=btrim(coalesce(p_motivo,'')) where id=p_id;
 perform private.agenda_validar_cupos(x.modalidad,x.sede_id);
 perform private.agenda_auditar_sede(x.sede_id,'agenda_excepcion',p_id::text,'QUITAR',to_jsonb(x),null,p_motivo);
end $$;

create or replace function private.agenda_deshacer()
returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.agenda_excepcion;
begin
 if cardinality(private.agenda_sedes_editables())=0 then raise exception 'No tienes permiso para cambiar la agenda.' using errcode='42501'; end if;
 select * into x from public.agenda_excepcion where activo and creado_por=auth.uid() order by creado_en desc limit 1;
 if x.id is null then raise exception 'No tienes cambios para deshacer.'; end if;
 perform private.agenda_anular_excepcion(x.id,'Deshacer último cambio');
 return to_jsonb(x)||jsonb_build_object('sede',(select nombre from public.sedes where id=x.sede_id));
end $$;

-- Historial con la sede de cada cambio; cada quien ve el de sus sedes (el Propietario, todo).
create or replace function private.agenda_historial(p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare propietario boolean:=private.agenda_es_propietario(); editables uuid[]:=private.agenda_sedes_editables();
begin
 if not propietario and cardinality(editables)=0 then raise exception 'No tienes acceso al historial de la agenda.' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>370 then raise exception 'Periodo inválido.'; end if;
 return coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('usuario',(select coalesce(nombre,email) from public.profiles where id=a.usuario_id),'sede',coalesce((select nombre from public.sedes where id=a.sede_id),'Todas las sedes')) order by a.fecha desc)
  from public.agenda_auditoria a where (a.fecha at time zone 'America/Bogota')::date between p_desde and p_hasta and (propietario or a.sede_id=any(editables))),'[]'::jsonb);
end $$;

create or replace function public.agenda_guardar_estado_sede(p_sede uuid, p_modalidad text, p_activa boolean, p_motivo text, p_reapertura timestamptz) returns void language sql set search_path='' as $$ select private.agenda_guardar_estado_sede(p_sede,p_modalidad,p_activa,p_motivo,p_reapertura); $$;
create or replace function public.agenda_guardar_horario_sede(p_sede uuid, p_modalidad text, p_dias jsonb, p_cupo_defecto int, p_cerrar_festivos boolean, p_motivo text) returns void language sql set search_path='' as $$ select private.agenda_guardar_horario_sede(p_sede,p_modalidad,p_dias,p_cupo_defecto,p_cerrar_festivos,p_motivo); $$;

revoke all on function private.agenda_es_propietario(), private.agenda_puede_sede(uuid,text), private.agenda_sedes_editables(), private.agenda_auditar_sede(uuid,text,text,text,jsonb,jsonb,text),
 private.agenda_validar_cupos(text,uuid), private.agenda_guardar_estado_sede(uuid,text,boolean,text,timestamptz), private.agenda_guardar_horario_sede(uuid,text,jsonb,int,boolean,text) from public, anon;
revoke all on function public.agenda_guardar_estado_sede(uuid,text,boolean,text,timestamptz), public.agenda_guardar_horario_sede(uuid,text,jsonb,int,boolean,text) from public, anon;
grant execute on function private.agenda_guardar_estado_sede(uuid,text,boolean,text,timestamptz), private.agenda_guardar_horario_sede(uuid,text,jsonb,int,boolean,text),
 public.agenda_guardar_estado_sede(uuid,text,boolean,text,timestamptz), public.agenda_guardar_horario_sede(uuid,text,jsonb,int,boolean,text) to authenticated;
