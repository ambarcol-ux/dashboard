-- Autorizaciones de datos por persona (Ley 1581): tratamiento (obligatoria) y comercial (opcional, nunca marcada por defecto).
-- Una por persona (documento, o teléfono si no hay documento), con fecha, origen, versión del texto y quién registró; revocable.
-- Pendiente: citas creadas por el equipo y clientas declaradas por un aliado; la persona acepta con su enlace (token).
-- Revert: drop table public.autorizaciones_eventos, public.autorizaciones_datos, public.autorizaciones_textos cascade;
--   drop function private.registrar_autorizacion, private.responder_autorizacion, private.revocar_autorizacion,
--   public.registrar_autorizacion, public.autorizacion_de, public.autorizaciones_indicador, public.revocar_autorizacion,
--   public.guardar_texto_autorizacion, public.buscar_autorizaciones; delete from public.roles_permisos where permiso='autorizaciones.gestionar';
--   delete from public.permisos where codigo='autorizaciones.gestionar';

create table public.autorizaciones_textos(
 id bigint generated always as identity primary key,
 tipo text not null check (tipo in ('tratamiento','comercial','declaracion_aliado')),
 version int not null,
 texto text not null check (length(btrim(texto)) >= 20),
 creado_por uuid default auth.uid(),
 creado_en timestamptz not null default now(),
 unique(tipo,version));
insert into public.autorizaciones_textos(tipo,version,texto,creado_por) values
('tratamiento',1,'Autorizo a Ámbar Couture, en los términos de la Ley 1581 de 2012, a recolectar, almacenar, usar y actualizar mis datos personales (nombre, documento, teléfono, correo y datos del evento) para gestionar mis citas, contratos, pagos, entregas y la atención que solicito. Puedo conocer, actualizar, rectificar y suprimir mis datos y revocar esta autorización escribiendo a Ámbar Couture.',null),
('comercial',1,'Acepto recibir de Ámbar Couture información comercial, promociones y novedades por WhatsApp, llamada, correo o redes sociales. Puedo retirar esta autorización en cualquier momento.',null),
('declaracion_aliado',1,'Declaro que la clienta (o su representante) me autorizó a compartir sus datos con Ámbar Couture para registrarla. Ella recibirá un enlace propio para aceptar la autorización de tratamiento de datos.',null);

create table public.autorizaciones_datos(
 id uuid primary key default gen_random_uuid(),
 persona text not null unique,
 documento text, nombre text, telefono text, email text,
 sede_id uuid references public.sedes(id),
 estado text not null default 'pendiente' check (estado in ('pendiente','autorizada','revocada')),
 tratamiento_at timestamptz, tratamiento_version text,
 comercial boolean not null default false, comercial_at timestamptz, comercial_version text,
 origen text not null check (origen in ('agendamiento','confirmacion','vitrina','contrato','vinculacion_aliado','clienta_aliado')),
 registrado_por uuid, aliado_id uuid references public.aliados(id),
 token uuid not null unique default gen_random_uuid(),
 revocada_at timestamptz, comercial_revocada_at timestamptz,
 creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now());
create index autorizaciones_datos_sede on public.autorizaciones_datos(sede_id);

create table public.autorizaciones_eventos(
 id bigint generated always as identity primary key,
 autorizacion_id uuid not null references public.autorizaciones_datos(id) on delete cascade,
 accion text not null, origen text, tratamiento_version text, comercial boolean, comercial_version text,
 usuario_id uuid, aliado_id uuid, creado_en timestamptz not null default now());

alter table public.autorizaciones_textos enable row level security;
alter table public.autorizaciones_datos enable row level security;
alter table public.autorizaciones_eventos enable row level security;
create policy autorizaciones_textos_leer on public.autorizaciones_textos for select to authenticated using (true);
create policy autorizaciones_datos_leer on public.autorizaciones_datos for select to authenticated
 using (private.sedes_limitadas() is null or sede_id is null or sede_id=any(private.sedes_limitadas()));
create policy autorizaciones_eventos_leer on public.autorizaciones_eventos for select to authenticated
 using (exists(select 1 from public.autorizaciones_datos a where a.id=autorizacion_id));

insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
values('autorizaciones.gestionar','Primeras visitas','Revocar autorizaciones de datos','Retirar la autorización de tratamiento o la comercial de una persona de sus sedes',false,205) on conflict do nothing;
insert into public.roles_permisos(rol_id,permiso,activo) values('asesora_lider','autorizaciones.gestionar',true),('franquiciado','autorizaciones.gestionar',true) on conflict do nothing;

create function private.texto_version(p_tipo text) returns text language sql stable security definer set search_path='' as $$
 select coalesce(max(version),0)::text from public.autorizaciones_textos where tipo=p_tipo $$;

-- Registers (or completes) the person's authorization. p_pendiente: the person still has to accept with her link.
create function private.registrar_autorizacion(p_documento text,p_telefono text,p_nombre text,p_email text,p_sede uuid,p_origen text,
 p_tratamiento boolean,p_comercial boolean,p_pendiente boolean,p_aliado uuid default null,p_registrado_por uuid default null,p_version_tratamiento text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc text:=nullif(regexp_replace(coalesce(p_documento,''),'[^0-9A-Za-z]','','g'),''); tel text:=nullif(regexp_replace(coalesce(p_telefono,''),'\D','','g'),'');
 key text; a public.autorizaciones_datos; who uuid:=coalesce(auth.uid(),p_registrado_por);
 vt text:=coalesce(p_version_tratamiento,private.texto_version('tratamiento')); vc text:=private.texto_version('comercial'); acc text;
begin
 if p_origen not in ('agendamiento','confirmacion','vitrina','contrato','vinculacion_aliado','clienta_aliado') then raise exception 'Origen no válido.'; end if;
 key:=coalesce('DOC:'||upper(doc),'TEL:'||tel);
 if key is null then raise exception 'Falta el documento o el teléfono de la persona.'; end if;
 if not p_pendiente and p_tratamiento is not true then raise exception 'La autorización de tratamiento de datos es obligatoria.'; end if;
 select * into a from public.autorizaciones_datos where persona=key or (doc is not null and tel is not null and persona='TEL:'||tel) order by (persona=key) desc limit 1 for update;
 if found and a.persona like 'TEL:%' and doc is not null and not exists(select 1 from public.autorizaciones_datos where persona=key) then
  update public.autorizaciones_datos set persona=key,documento=doc,actualizado_en=now() where id=a.id returning * into a;
 end if;
 if a.id is null then
  insert into public.autorizaciones_datos(persona,documento,nombre,telefono,email,sede_id,estado,tratamiento_at,tratamiento_version,comercial,comercial_at,comercial_version,origen,registrado_por,aliado_id)
  values(key,doc,nullif(btrim(p_nombre),''),tel,nullif(lower(btrim(p_email)),''),p_sede,case when p_pendiente then 'pendiente' else 'autorizada' end,
   case when p_pendiente then null else now() end,case when p_pendiente then null else vt end,
   (not p_pendiente and p_comercial is true),case when not p_pendiente and p_comercial then now() end,case when not p_pendiente and p_comercial then vc end,
   p_origen,who,p_aliado) returning * into a;
  acc:=case when p_pendiente then 'pendiente' else 'autorizada' end;
 elsif p_pendiente then
  acc:=null; -- already registered: no new request, the same link is used
 elsif a.estado in ('pendiente','revocada') then
  update public.autorizaciones_datos set estado='autorizada',tratamiento_at=now(),tratamiento_version=vt,revocada_at=null,
   comercial=p_comercial is true,comercial_at=case when p_comercial then now() else comercial_at end,comercial_version=case when p_comercial then vc else comercial_version end,
   sede_id=coalesce(sede_id,p_sede),actualizado_en=now() where id=a.id returning * into a;
  acc:='autorizada';
 elsif p_comercial is true and not a.comercial then
  update public.autorizaciones_datos set comercial=true,comercial_at=now(),comercial_version=vc,comercial_revocada_at=null,actualizado_en=now() where id=a.id returning * into a;
  acc:='comercial';
 end if;
 if acc is not null then
  insert into public.autorizaciones_eventos(autorizacion_id,accion,origen,tratamiento_version,comercial,comercial_version,usuario_id,aliado_id)
  values(a.id,acc,p_origen,a.tratamiento_version,a.comercial,a.comercial_version,who,p_aliado);
 end if;
 return jsonb_build_object('id',a.id,'estado',a.estado,'comercial',a.comercial,'token',a.token);
end $$;

-- The person's own link: accept (tratamiento + optional comercial), or revoke everything / only comercial.
create function private.responder_autorizacion(p_token uuid,p_accion text,p_comercial boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.autorizaciones_datos;
begin
 select * into a from public.autorizaciones_datos where token=p_token for update;
 if not found then raise exception 'El enlace no es válido.'; end if;
 if p_accion='aceptar' then
  update public.autorizaciones_datos set estado='autorizada',tratamiento_at=case when estado='autorizada' then tratamiento_at else now() end,
   tratamiento_version=case when estado='autorizada' then tratamiento_version else private.texto_version('tratamiento') end,revocada_at=null,
   comercial=p_comercial is true,comercial_at=case when p_comercial is true and not comercial then now() else comercial_at end,
   comercial_version=case when p_comercial is true and not comercial then private.texto_version('comercial') else comercial_version end,
   comercial_revocada_at=case when comercial and p_comercial is not true then now() else comercial_revocada_at end,actualizado_en=now()
  where id=a.id returning * into a;
 elsif p_accion='revocar' then
  update public.autorizaciones_datos set estado='revocada',revocada_at=now(),comercial=false,comercial_revocada_at=case when comercial then now() else comercial_revocada_at end,actualizado_en=now() where id=a.id returning * into a;
 else raise exception 'Acción no válida.'; end if;
 insert into public.autorizaciones_eventos(autorizacion_id,accion,origen,tratamiento_version,comercial,comercial_version) values(a.id,p_accion,'confirmacion',a.tratamiento_version,a.comercial,a.comercial_version);
 return jsonb_build_object('estado',a.estado,'comercial',a.comercial);
end $$;

-- Team: revoke everything ('todo') or only the commercial authorization ('comercial').
create function private.revocar_autorizacion(p_id uuid,p_tipo text) returns void language plpgsql security definer set search_path='' as $$
declare a public.autorizaciones_datos;
begin
 if not (public.es_admin() or private.tiene_permiso('autorizaciones.gestionar')) then raise exception 'No tienes permiso para revocar autorizaciones.' using errcode='42501'; end if;
 select * into a from public.autorizaciones_datos where id=p_id and (private.sedes_limitadas() is null or sede_id is null or sede_id=any(private.sedes_limitadas())) for update;
 if not found then raise exception 'Autorización no encontrada.'; end if;
 if p_tipo='todo' then update public.autorizaciones_datos set estado='revocada',revocada_at=now(),comercial=false,comercial_revocada_at=case when comercial then now() else comercial_revocada_at end,actualizado_en=now() where id=p_id;
 elsif p_tipo='comercial' then update public.autorizaciones_datos set comercial=false,comercial_revocada_at=now(),actualizado_en=now() where id=p_id;
 else raise exception 'Tipo no válido.'; end if;
 insert into public.autorizaciones_eventos(autorizacion_id,accion,origen,usuario_id) values(p_id,'revocar_'||p_tipo,'equipo',auth.uid());
end $$;

create function public.registrar_autorizacion(p_documento text,p_telefono text,p_nombre text,p_email text,p_sede uuid,p_origen text,p_tratamiento boolean,p_comercial boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 if p_origen not in ('vitrina','contrato') then raise exception 'Origen no válido.'; end if;
 return private.registrar_autorizacion(p_documento,p_telefono,p_nombre,p_email,p_sede,p_origen,p_tratamiento,p_comercial,false);
end $$;

-- State of a person's authorization for the team forms (asked once per person).
create function public.autorizacion_de(p_documento text,p_telefono text) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(x) from (select a.estado,a.comercial,a.tratamiento_at,a.origen,a.token from public.autorizaciones_datos a
  where auth.uid() is not null and (a.persona='DOC:'||upper(nullif(regexp_replace(coalesce(p_documento,''),'[^0-9A-Za-z]','','g'),''))
   or a.persona='TEL:'||nullif(regexp_replace(coalesce(p_telefono,''),'\D','','g'),'')) order by a.persona like 'DOC:%' desc limit 1) x $$;

create function public.autorizaciones_indicador() returns table(sede_id uuid,sede text,personas bigint,autorizadas bigint,comerciales bigint,pendientes bigint,revocadas bigint)
language sql stable security definer set search_path='' as $$
 select s.id,s.nombre,count(a.id),count(a.id) filter (where a.estado='autorizada'),count(a.id) filter (where a.estado='autorizada' and a.comercial),
  count(a.id) filter (where a.estado='pendiente'),count(a.id) filter (where a.estado='revocada')
 from public.sedes s left join public.autorizaciones_datos a on a.sede_id=s.id
 where auth.uid() is not null and s.activo is true and (private.sedes_limitadas() is null or s.id=any(private.sedes_limitadas()))
 group by s.id,s.nombre order by s.nombre $$;

create function public.revocar_autorizacion(p_id uuid,p_tipo text) returns void language sql security invoker set search_path='' as $$ select private.revocar_autorizacion(p_id,p_tipo); $$;

create function public.guardar_texto_autorizacion(p_tipo text,p_texto text) returns int language plpgsql security definer set search_path='' as $$
declare v int;
begin
 if not public.es_admin() then raise exception 'Solo Administración.' using errcode='42501'; end if;
 if exists(select 1 from public.autorizaciones_textos where tipo=p_tipo and version=(select max(version) from public.autorizaciones_textos where tipo=p_tipo) and texto=btrim(p_texto)) then
  return (select max(version) from public.autorizaciones_textos where tipo=p_tipo); end if;
 insert into public.autorizaciones_textos(tipo,version,texto) values(p_tipo,(select coalesce(max(version),0)+1 from public.autorizaciones_textos where tipo=p_tipo),btrim(p_texto)) returning version into v;
 return v;
end $$;

revoke all on function private.texto_version(text),private.registrar_autorizacion(text,text,text,text,uuid,text,boolean,boolean,boolean,uuid,uuid,text),
 private.responder_autorizacion(uuid,text,boolean),private.revocar_autorizacion(uuid,text) from public,anon,authenticated;
grant execute on function private.registrar_autorizacion(text,text,text,text,uuid,text,boolean,boolean,boolean,uuid,uuid,text),private.responder_autorizacion(uuid,text,boolean),private.texto_version(text) to service_role;
grant execute on function private.revocar_autorizacion(uuid,text),private.registrar_autorizacion(text,text,text,text,uuid,text,boolean,boolean,boolean,uuid,uuid,text) to authenticated;
revoke all on function public.registrar_autorizacion(text,text,text,text,uuid,text,boolean,boolean),public.autorizacion_de(text,text),public.autorizaciones_indicador(),
 public.revocar_autorizacion(uuid,text),public.guardar_texto_autorizacion(text,text) from public,anon;
grant execute on function public.registrar_autorizacion(text,text,text,text,uuid,text,boolean,boolean),public.autorizacion_de(text,text),public.autorizaciones_indicador(),
 public.revocar_autorizacion(uuid,text),public.guardar_texto_autorizacion(text,text) to authenticated;

-- Server APIs (service role only): public forms, the person's link and ally registrations.
create function public.autorizacion_publica(p_documento text,p_telefono text,p_nombre text,p_email text,p_sede uuid,p_origen text,p_tratamiento boolean,p_comercial boolean,
 p_pendiente boolean,p_aliado uuid,p_registrado_por uuid,p_version_tratamiento text) returns jsonb language sql security invoker set search_path='' as $$
 select private.registrar_autorizacion(p_documento,p_telefono,p_nombre,p_email,p_sede,p_origen,p_tratamiento,p_comercial,p_pendiente,p_aliado,p_registrado_por,p_version_tratamiento) $$;
create function public.responder_autorizacion(p_token uuid,p_accion text,p_comercial boolean) returns jsonb language sql security invoker set search_path='' as $$
 select private.responder_autorizacion(p_token,p_accion,p_comercial) $$;
revoke all on function public.autorizacion_publica(text,text,text,text,uuid,text,boolean,boolean,boolean,uuid,uuid,text),public.responder_autorizacion(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.autorizacion_publica(text,text,text,text,uuid,text,boolean,boolean,boolean,uuid,uuid,text),public.responder_autorizacion(uuid,text,boolean) to service_role;
