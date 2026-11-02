-- Ventas y CRM › Correo: automatizaciones (interruptor, texto, momento, sedes), envíos manuales por segmento,
-- reglas de frecuencia y embudo hasta contrato (docs/correo/config-inicial.md, aprobado).
-- Todas empiezan apagadas: se encienden en Correo › Automatizaciones después de verificar el remitente en el proveedor.
-- Solo personas con autorización comercial vigente. No reemplaza los correos existentes de citas y aliados (Resend).
-- Envía por la conexión activa de Configuración › Integraciones. El reloj (pg_cron) llama /api/correo/procesar cada 10 minutos.
-- Revert: select cron.unschedule('correo-envios'); drop function public.correo_encolar_automatizaciones(),
--   public.correo_tomar_envios(int), public.correo_segmento(jsonb), public.correo_crear_campana(text,text,text,jsonb),
--   public.correo_embudo(date,date), private.correo_persona(text,text,text), private.correo_etapa(text,text,text);
--   drop table public.correo_envios, public.correo_campanas, public.correo_reglas, public.correo_automatizaciones.

-- ── Automatizaciones ────────────────────────────────────────────────────────────────────────────
create table if not exists public.correo_automatizaciones(
 id text primary key,
 nombre text not null,
 disparador text not null check (disparador in ('visita','no_asistio','evento','contrato','devolucion')),
 activo boolean not null default false,
 asunto text not null check (length(trim(asunto)) between 2 and 160),
 cuerpo text not null check (length(trim(cuerpo)) between 10 and 5000),
 momento_horas int not null check (momento_horas between 0 and 8760),
 sede_ids uuid[],
 orden int not null default 0,
 actualizado_por uuid references public.profiles(id),
 updated_at timestamptz not null default now()
);
insert into public.correo_automatizaciones(id,nombre,disparador,activo,momento_horas,orden,asunto,cuerpo) values
('gracias_visita','Gracias por tu visita','visita',false,2,1,'Gracias por visitarnos, {nombre}',
 E'Hola, {nombre}.\n\nGracias por visitarnos en Ámbar Couture {sede}. Fue un gusto acompañarte a buscar tu vestido.\n\nAquí tienes el catálogo para que sigas viendo opciones con calma:\n{catalogo}\n\nSi quieres volver a probarte algún vestido, agenda aquí:\n{enlace_cita}'),
('seguimiento','¿Ya elegiste tu vestido?','visita',false,72,2,'{nombre}, ¿ya elegiste tu vestido?',
 E'Hola, {nombre}.\n\n¿Pudiste decidirte por tu vestido? Si te quedó alguna duda sobre tallas, ajustes o disponibilidad para tu fecha, con gusto te ayudamos.\n\nMira de nuevo las opciones:\n{catalogo}\n\nAgenda otra visita aquí:\n{enlace_cita}'),
('promocion','Promoción vigente para tu tipo de vestido','visita',false,168,3,'{nombre}, tenemos una promoción para ti',
 E'Hola, {nombre}.\n\nTenemos {promocion}: {beneficio}.\nVálida hasta el {vigencia}.\n{condiciones}\n\nMira los vestidos:\n{catalogo}\n\nAgenda tu cita aquí:\n{enlace_cita}'),
('reagendar','Te esperamos: reagenda tu cita','no_asistio',false,24,4,'{nombre}, te esperamos en Ámbar Couture',
 E'Hola, {nombre}.\n\nNotamos que no pudiste asistir a tu cita. ¡No te preocupes! Elige una nueva fecha y hora aquí:\n{enlace_cita}\n\nTe esperamos en Ámbar Couture {sede}.'),
('aviso_evento','Último aviso antes de tu evento','evento',false,1080,5,'{nombre}, tu evento se acerca',
 E'Hola, {nombre}.\n\nTu evento del {fecha_evento} se acerca y todavía estás a tiempo de elegir tu vestido con ajustes incluidos.\n\nMira los vestidos:\n{catalogo}\n\nAgenda tu cita aquí:\n{enlace_cita}'),
('bienvenida_contrato','Bienvenida al contrato','contrato',false,0,6,'Bienvenida a Ámbar Couture, {nombre}',
 E'Hola, {nombre}.\n\nGracias por elegir Ámbar Couture. Estos son los siguientes pasos: toma de medidas, prueba final y entrega de tu vestido. Tu asesora te confirmará cada fecha.\n\nCualquier duda, escríbenos a la sede {sede}.'),
('gracias_devolucion','Gracias y cuéntanos cómo te fue','devolucion',false,72,7,'{nombre}, ¿cómo te fue en tu evento?',
 E'Hola, {nombre}.\n\nGracias por confiar en Ámbar Couture para tu evento. Nos encantaría saber cómo te fue y ver tus fotos.\n\nSi conoces a alguien que esté buscando vestido, ¡recomiéndanos!')
on conflict (id) do nothing;

-- ── Reglas de frecuencia (una sola fila) ───────────────────────────────────────────────────────
create table if not exists public.correo_reglas(
 id boolean primary key default true check (id),
 max_semana int not null default 2 check (max_semana between 1 and 14),
 max_dia int not null default 1 check (max_dia between 1 and 5),
 hora_desde int not null default 8 check (hora_desde between 0 and 23),
 hora_hasta int not null default 20 check (hora_hasta between 1 and 24),
 sin_domingos_festivos boolean not null default true,
 cupo_diario int not null default 300 check (cupo_diario between 1 and 100000),
 ventana_dias int not null default 3 check (ventana_dias between 1 and 30),
 updated_at timestamptz not null default now()
);
insert into public.correo_reglas(id) values(true) on conflict do nothing;

-- ── Envíos manuales por segmento ───────────────────────────────────────────────────────────────
create table if not exists public.correo_campanas(
 id uuid primary key default gen_random_uuid(),
 nombre text not null check (length(trim(nombre)) between 2 and 120),
 asunto text not null check (length(trim(asunto)) between 2 and 160),
 cuerpo text not null check (length(trim(cuerpo)) between 10 and 5000),
 segmento jsonb not null default '{}'::jsonb,
 total int not null default 0,
 creada_por uuid default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now()
);

-- ── Cola e historial de envíos ─────────────────────────────────────────────────────────────────
create table if not exists public.correo_envios(
 id bigint generated always as identity primary key,
 automatizacion_id text references public.correo_automatizaciones(id),
 campana_id uuid references public.correo_campanas(id),
 cita_id uuid references public.primeras_citas(id),
 contrato_id uuid references public.contratos(id),
 autorizacion_id uuid references public.autorizaciones_datos(id),
 promocion_id uuid references public.promociones(id),
 email text not null,
 nombre text,
 asunto text,
 estado text not null default 'pendiente' check (estado in ('pendiente','enviando','enviado','omitido','error')),
 motivo text,
 intentos int not null default 0,
 provider_id text,
 programado_at timestamptz not null default now(),
 enviado_at timestamptz,
 created_at timestamptz not null default now(),
 check ((automatizacion_id is null) <> (campana_id is null))
);
create unique index if not exists correo_envios_auto_cita on public.correo_envios(automatizacion_id,cita_id) where automatizacion_id is not null and cita_id is not null;
create unique index if not exists correo_envios_auto_contrato on public.correo_envios(automatizacion_id,contrato_id) where automatizacion_id is not null and contrato_id is not null;
create unique index if not exists correo_envios_campana_email on public.correo_envios(campana_id,lower(email)) where campana_id is not null;
create index if not exists correo_envios_cola on public.correo_envios(programado_at) where estado in ('pendiente','enviando');
create index if not exists correo_envios_email on public.correo_envios(lower(email),enviado_at) where estado='enviado';

alter table public.correo_automatizaciones enable row level security;
alter table public.correo_reglas enable row level security;
alter table public.correo_campanas enable row level security;
alter table public.correo_envios enable row level security;
revoke all on public.correo_automatizaciones,public.correo_reglas,public.correo_campanas,public.correo_envios from anon;
create policy correo_auto_leer on public.correo_automatizaciones for select to authenticated using (true);
create policy correo_auto_editar on public.correo_automatizaciones for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy correo_reglas_leer on public.correo_reglas for select to authenticated using (true);
create policy correo_reglas_editar on public.correo_reglas for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy correo_campanas_leer on public.correo_campanas for select to authenticated using (public.es_admin());
create policy correo_envios_leer on public.correo_envios for select to authenticated using (public.es_admin());

-- ── Persona con autorización comercial vigente (documento, teléfono o correo) ──────────────────
create or replace function private.correo_persona(p_doc text,p_tel text,p_mail text) returns uuid language sql stable security definer set search_path='' as $$
 select a.id from public.autorizaciones_datos a
 where a.estado='autorizada' and a.comercial
  and ((private.norm_doc(p_doc) is not null and private.norm_doc(a.documento)=private.norm_doc(p_doc))
   or (private.norm_tel(p_tel) is not null and private.norm_tel(a.telefono)=private.norm_tel(p_tel))
   or (private.norm_mail(p_mail) is not null and private.norm_mail(a.email)=private.norm_mail(p_mail)))
 order by a.actualizado_en desc limit 1
$$;

-- Contrato vigente de la persona (no se le envía marketing, salvo bienvenida y gracias).
create or replace function private.correo_tiene_contrato_vigente(p_doc text,p_mail text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.contratos k where lower(coalesce(k.estado,'')) in ('firmado','pagado totalmente','entregado','mantenimiento')
  and coalesce(k.fecha_evento,current_date)>=current_date
  and ((private.norm_doc(p_doc) is not null and private.norm_doc(k.cliente_documento)=private.norm_doc(p_doc))
   or (private.norm_mail(p_mail) is not null and private.norm_mail(k.cliente_email)=private.norm_mail(p_mail))))
$$;

-- Etapa del embudo de una persona.
create or replace function private.correo_etapa(p_doc text,p_tel text,p_mail text) returns text language sql stable security definer set search_path='' as $$
 with k as (select lower(coalesce(estado,'')) e from public.contratos where lower(coalesce(estado,'')) not in ('anulado','cancelado','rechazado')
   and ((private.norm_doc(p_doc) is not null and private.norm_doc(cliente_documento)=private.norm_doc(p_doc))
    or (private.norm_mail(p_mail) is not null and private.norm_mail(cliente_email)=private.norm_mail(p_mail))
    or (private.norm_tel(p_tel) is not null and private.norm_tel(coalesce(cliente_whatsapp,whatsapp))=private.norm_tel(p_tel)))),
 c as (select estado from public.primeras_citas where estado<>'cancelada'
   and ((private.norm_doc(p_doc) is not null and private.norm_doc(cliente_documento)=private.norm_doc(p_doc))
    or (private.norm_tel(p_tel) is not null and private.norm_tel(telefono)=private.norm_tel(p_tel))
    or (private.norm_mail(p_mail) is not null and private.norm_mail(email)=private.norm_mail(p_mail)))
   order by fecha desc,created_at desc limit 1)
 select case
  when exists(select 1 from k where e<>'borrador') then 'contrato_firmado'
  when exists(select 1 from k) then 'contrato_creado'
  when (select estado from c) in ('seguimiento','no_cerro') then 'seguimiento'
  when (select estado from c)='asistio' then 'asistio'
  when (select estado from c) in ('agendada','confirmada') then 'cita_agendada'
  when (select estado from c)='no_asistio' then 'no_asistio'
  else 'contacto' end
$$;

-- ── Encolar automatizaciones vencidas (solo dentro de la ventana, nunca historial viejo) ───────
create or replace function public.correo_encolar_automatizaciones() returns int language plpgsql security definer set search_path='' as $$
declare r public.correo_reglas; n int:=0; m int; a public.correo_automatizaciones; hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 select * into r from public.correo_reglas where id;
 for a in select * from public.correo_automatizaciones where activo order by orden loop
  if a.disparador in ('visita','no_asistio','evento') then
   insert into public.correo_envios(automatizacion_id,cita_id,autorizacion_id,promocion_id,email,nombre,programado_at)
   select a.id,c.id,p.aut,pr.id,lower(trim(c.email)),c.cliente_nombre,now()
   from public.primeras_citas c
   cross join lateral (select ((c.fecha+c.hora) at time zone 'America/Bogota')+interval '1 hour' fin) t
   cross join lateral (select private.correo_persona(c.cliente_documento,c.telefono,c.email) aut) p
   left join lateral (select x.id from public.promociones x
     where a.id='promocion' and x.activo and hoy between x.desde and x.hasta
      and (coalesce(cardinality(x.sede_ids),0)=0 or c.sede_id=any(x.sede_ids))
      and (x.id=c.promocion_id or coalesce(cardinality(x.clasificacion_ids),0)=0 or exists(select 1 from public.clasificaciones_vestido v where v.id=any(x.clasificacion_ids)
        and (lower(v.nombre)=lower(c.tipo_vestido) or (lower(v.nombre)='xv años' and lower(coalesce(c.tipo_vestido,'')) in ('quince','xv años','xv')))))
     order by (x.id=c.promocion_id) desc,x.hasta limit 1) pr on true
   where p.aut is not null and c.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    and (coalesce(cardinality(a.sede_ids),0)=0 or c.sede_id=any(a.sede_ids))
    and coalesce(c.alquilo,false)=false
    and coalesce(c.cierre_seguimiento,'') !~* '^(alquil|no contactar)'
    and not exists(select 1 from public.contratos k where k.primera_cita_id=c.id and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado','borrador'))
    and not private.correo_tiene_contrato_vigente(c.cliente_documento,c.email)
    and (a.id<>'promocion' or pr.id is not null)
    and case a.disparador
     when 'visita' then c.estado in ('asistio','seguimiento','no_cerro')
       and t.fin+make_interval(hours=>a.momento_horas) between now()-make_interval(days=>r.ventana_dias) and now()
     when 'no_asistio' then c.estado='no_asistio' and c.nueva_cita_id is null
       and not exists(select 1 from public.primeras_citas o where o.id<>c.id and o.telefono=c.telefono and o.estado in ('agendada','confirmada','asistio') and o.created_at>c.created_at)
       and t.fin+make_interval(hours=>a.momento_horas) between now()-make_interval(days=>r.ventana_dias) and now()
     else c.estado in ('asistio','seguimiento','no_cerro') and c.fecha_evento>hoy
       and (c.fecha_evento::timestamp at time zone 'America/Bogota')-make_interval(hours=>a.momento_horas) between now()-make_interval(days=>r.ventana_dias) and now()
    end
   on conflict do nothing;
  else
   insert into public.correo_envios(automatizacion_id,contrato_id,autorizacion_id,email,nombre,programado_at)
   select a.id,k.id,p.aut,lower(trim(k.cliente_email)),k.cliente_nombre,now()
   from public.contratos k
   cross join lateral (select private.correo_persona(k.cliente_documento,coalesce(k.cliente_whatsapp,k.whatsapp),k.cliente_email) aut) p
   where p.aut is not null and k.cliente_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    and (coalesce(cardinality(a.sede_ids),0)=0 or k.sede_id=any(a.sede_ids))
    and case a.disparador
     when 'contrato' then lower(coalesce(k.estado,'')) in ('firmado','pagado totalmente','entregado','mantenimiento')
       and coalesce(k.fecha_firma,k.fecha_firma_cliente,k.created_at)+make_interval(hours=>a.momento_horas) between now()-make_interval(days=>r.ventana_dias) and now()
     else lower(coalesce(k.estado,''))='finalizado' and k.finalizado_at is not null
       and k.finalizado_at+make_interval(hours=>a.momento_horas) between now()-make_interval(days=>r.ventana_dias) and now()
    end
   on conflict do nothing;
  end if;
  get diagnostics m=row_count; n:=n+m;
 end loop;
 return n;
end $$;

-- ── Tomar envíos respetando horario, domingos/festivos, cupo diario y frecuencia por persona ───
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
  where e.estado='pendiente' and e.autorizacion_id is not null and not exists(select 1 from public.autorizaciones_datos a where a.id=e.autorizacion_id and a.estado='autorizada' and a.comercial);
 update public.correo_envios e set estado='omitido',motivo='Ya alquiló'
  where e.estado='pendiente' and e.cita_id is not null and exists(select 1 from public.primeras_citas c where c.id=e.cita_id and (coalesce(c.alquilo,false)
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

-- ── Segmento para envíos manuales: personas con autorización comercial vigente y correo ───────
create or replace function public.correo_segmento(p_segmento jsonb) returns table(autorizacion_id uuid,email text,nombre text,etapa text,excluido boolean) language plpgsql stable security definer set search_path='' as $$
declare s jsonb:=coalesce(p_segmento,'{}'::jsonb); r public.correo_reglas;
begin
 if not public.es_admin() and auth.role()<>'service_role' then raise exception 'Solo administración.' using errcode='42501'; end if;
 select * into r from public.correo_reglas where id;
 return query
 with personas as (
  select a.id,lower(trim(a.email)) email,a.nombre,a.documento,a.telefono,a.sede_id,
   (select c from public.primeras_citas c where c.estado<>'cancelada'
     and ((private.norm_doc(a.documento) is not null and private.norm_doc(c.cliente_documento)=private.norm_doc(a.documento))
      or (private.norm_tel(a.telefono) is not null and private.norm_tel(c.telefono)=private.norm_tel(a.telefono))
      or (private.norm_mail(a.email) is not null and private.norm_mail(c.email)=private.norm_mail(a.email)))
     order by c.fecha desc,c.created_at desc limit 1) cita
  from public.autorizaciones_datos a
  where a.estado='autorizada' and a.comercial and a.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
 select p.id,p.email,p.nombre,x.etapa,
  ((select count(*) from public.correo_envios e where e.estado='enviado' and lower(e.email)=p.email and e.enviado_at>=now()-interval '7 days')>=r.max_semana) excluido
 from personas p cross join lateral (select private.correo_etapa(p.documento,p.telefono,p.email) etapa) x
 where (nullif(s->>'sede','') is null or coalesce((p.cita).sede_id,p.sede_id)=(s->>'sede')::uuid)
  and (nullif(s->>'tipo','') is null or lower(coalesce((p.cita).tipo_vestido,''))=lower(s->>'tipo'))
  and (nullif(s->>'etapa','') is null or x.etapa=s->>'etapa')
  and (nullif(s->>'origen','') is null or (p.cita).origen_enlace=s->>'origen')
  and (nullif(s->>'promocion','') is null or (p.cita).promocion_id=(s->>'promocion')::uuid)
  and (nullif(s->>'evento_desde','') is null or (p.cita).fecha_evento>=(s->>'evento_desde')::date)
  and (nullif(s->>'evento_hasta','') is null or (p.cita).fecha_evento<=(s->>'evento_hasta')::date)
  and (nullif(s->>'visita_desde','') is null or (p.cita).fecha>=(s->>'visita_desde')::date)
  and (nullif(s->>'visita_hasta','') is null or (p.cita).fecha<=(s->>'visita_hasta')::date)
  and (coalesce(s->>'incluir_contrato','false')='true' or s->>'etapa' in ('contrato_creado','contrato_firmado') or not private.correo_tiene_contrato_vigente(p.documento,p.email));
end $$;

create or replace function public.correo_crear_campana(p_nombre text,p_asunto text,p_cuerpo text,p_segmento jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid; n int;
begin
 if not public.es_admin() then raise exception 'Solo administración puede enviar campañas.' using errcode='42501'; end if;
 insert into public.correo_campanas(nombre,asunto,cuerpo,segmento) values(trim(p_nombre),trim(p_asunto),trim(p_cuerpo),coalesce(p_segmento,'{}'::jsonb)) returning id into cid;
 insert into public.correo_envios(campana_id,autorizacion_id,email,nombre)
 select cid,s.autorizacion_id,s.email,s.nombre from public.correo_segmento(p_segmento) s on conflict do nothing;
 get diagnostics n=row_count;
 update public.correo_campanas set total=n where id=cid;
 return jsonb_build_object('id',cid,'total',n);
end $$;

-- ── Embudo hasta contrato y resultado de cada automatización ───────────────────────────────────
create or replace function public.correo_embudo(p_desde date,p_hasta date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración.' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Selecciona un periodo de hasta un año.'; end if;
 return jsonb_build_object(
  'etapas',(with c as (select c.*,exists(select 1 from public.contratos k where k.primera_cita_id=c.id and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado')) creado,
     exists(select 1 from public.contratos k where k.primera_cita_id=c.id and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado','borrador')) firmado
    from public.primeras_citas c where c.fecha between p_desde and p_hasta and c.estado<>'cancelada')
   select jsonb_build_object(
    'contactos',(select count(*) from public.autorizaciones_datos where estado='autorizada' and comercial),
    'citas',(select count(*) from c where origen='cita'),
    'asistieron',(select count(*) from c where estado in ('asistio','seguimiento','no_cerro') or creado),
    'seguimiento',(select count(*) from c where estado in ('seguimiento','no_cerro')),
    'contrato_creado',(select count(*) from c where creado),
    'contrato_firmado',(select count(*) from c where firmado))),
  'automatizaciones',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'nombre',a.nombre,'enviados',x.enviados,'contratos',x.contratos) order by a.orden)
   from public.correo_automatizaciones a cross join lateral (
    select count(*) enviados,
     count(*) filter (where exists(select 1 from public.contratos k where lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado','borrador')
      and k.created_at between e.enviado_at and e.enviado_at+interval '30 days'
      and (k.primera_cita_id=e.cita_id or k.id=e.contrato_id or private.norm_mail(k.cliente_email)=private.norm_mail(e.email)))) contratos
    from public.correo_envios e where e.automatizacion_id=a.id and e.estado='enviado' and (e.enviado_at at time zone 'America/Bogota')::date between p_desde and p_hasta) x),'[]'::jsonb),
  'campanas',coalesce((select jsonb_agg(jsonb_build_object('nombre',g.nombre,'fecha',g.created_at,'total',g.total,'enviados',
     (select count(*) from public.correo_envios e where e.campana_id=g.id and e.estado='enviado'),
     'contratos',(select count(*) from public.correo_envios e where e.campana_id=g.id and e.estado='enviado' and exists(select 1 from public.contratos k where lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado','borrador')
      and k.created_at between e.enviado_at and e.enviado_at+interval '30 days' and private.norm_mail(k.cliente_email)=private.norm_mail(e.email)))) order by g.created_at desc)
   from public.correo_campanas g where (g.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta),'[]'::jsonb));
end $$;

revoke all on function private.correo_persona(text,text,text),private.correo_tiene_contrato_vigente(text,text),private.correo_etapa(text,text,text) from public,anon,authenticated;
revoke all on function public.correo_encolar_automatizaciones(),public.correo_tomar_envios(int) from public,anon,authenticated;
grant execute on function public.correo_encolar_automatizaciones(),public.correo_tomar_envios(int) to service_role;
revoke all on function public.correo_segmento(jsonb),public.correo_crear_campana(text,text,text,jsonb),public.correo_embudo(date,date) from public,anon;
grant execute on function public.correo_segmento(jsonb),public.correo_crear_campana(text,text,text,jsonb),public.correo_embudo(date,date) to authenticated,service_role;

-- ── Reloj: cada 10 minutos el ERP procesa la cola de correo ────────────────────────────────────
select cron.schedule('correo-envios','*/10 * * * *',$$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/correo/procesar',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=55000);
$$);
