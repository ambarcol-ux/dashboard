-- Administración › Documentos de la marca: áreas y subáreas que administración crea y edita desde la pantalla,
-- con quién las ve y quién sube archivos (por perfil). Archivos privados (bucket documentos_marca), versiones y vencimientos.
-- Reversión: drop table public.doc_versiones, public.doc_archivos, public.doc_areas;
--   drop function private.doc_rol(), private.doc_puede_ver(uuid), private.doc_puede_editar(uuid), private.doc_area_de_ruta(text);
--   delete from storage.buckets where id='documentos_marca' (con sus políticas); delete from public.roles_permisos where permiso='panel.documentos'; delete from public.permisos where codigo='panel.documentos';
create table if not exists public.doc_areas(
 id uuid primary key default gen_random_uuid(),
 nombre text not null check (length(trim(nombre)) between 2 and 80),
 padre_id uuid references public.doc_areas(id) on delete restrict,
 orden int not null default 0,
 ver_roles text[] not null default '{}',     -- vacío = todos los perfiles con acceso al módulo
 editar_roles text[] not null default '{}',  -- vacío = solo administración sube archivos
 activo boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.doc_archivos(
 id uuid primary key default gen_random_uuid(),
 area_id uuid not null references public.doc_areas(id) on delete restrict,
 nombre text not null check (length(trim(nombre)) between 2 and 160),
 descripcion text,
 sede_id uuid references public.sedes(id),
 ruta text, enlace text, tipo text, tamano bigint,
 version int not null default 1,
 vence date,
 archivado boolean not null default false,
 subido_por uuid default auth.uid() references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (ruta is not null or enlace is not null)
);
create index if not exists doc_archivos_area on public.doc_archivos(area_id) where not archivado;
create table if not exists public.doc_versiones(
 id bigint generated always as identity primary key,
 archivo_id uuid not null references public.doc_archivos(id) on delete cascade,
 version int not null, ruta text, enlace text, tipo text, tamano bigint,
 subido_por uuid default auth.uid() references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);

create or replace function private.doc_rol() returns text language sql stable security definer set search_path='' as $$
 select lower(coalesce(nullif(p.rol_id,''),p.rol,'')) from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) limit 1;
$$;
-- An area is visible if the person's profile is allowed in it and in every parent area.
create or replace function private.doc_puede_ver(p_area uuid) returns boolean language sql stable security definer set search_path='' as $$
 with recursive cadena as(
  select a.id,a.padre_id,a.ver_roles,a.activo from public.doc_areas a where a.id=p_area
  union all select a.id,a.padre_id,a.ver_roles,a.activo from public.doc_areas a join cadena c on a.id=c.padre_id)
 select public.es_admin() or (exists(select 1 from cadena) and not exists(select 1 from cadena c where not c.activo or (cardinality(c.ver_roles)>0 and not private.doc_rol()=any(c.ver_roles))));
$$;
-- Uploading: administration, or a profile listed to edit the area or any parent area (and able to see it).
create or replace function private.doc_puede_editar(p_area uuid) returns boolean language sql stable security definer set search_path='' as $$
 with recursive cadena as(
  select a.id,a.padre_id,a.editar_roles from public.doc_areas a where a.id=p_area
  union all select a.id,a.padre_id,a.editar_roles from public.doc_areas a join cadena c on a.id=c.padre_id)
 select public.es_admin() or (private.doc_puede_ver(p_area) and exists(select 1 from cadena c where private.doc_rol()=any(c.editar_roles)));
$$;
create or replace function private.doc_area_de_ruta(p_name text) returns uuid language plpgsql immutable set search_path='' as $$
begin return split_part(p_name,'/',1)::uuid; exception when others then return null; end $$;
revoke all on function private.doc_rol(), private.doc_puede_ver(uuid), private.doc_puede_editar(uuid), private.doc_area_de_ruta(text) from public, anon;
grant execute on function private.doc_rol(), private.doc_puede_ver(uuid), private.doc_puede_editar(uuid), private.doc_area_de_ruta(text) to authenticated;

alter table public.doc_areas enable row level security;
alter table public.doc_archivos enable row level security;
alter table public.doc_versiones enable row level security;
create policy doc_areas_ver on public.doc_areas for select to authenticated using ((select public.es_admin()) or private.doc_puede_ver(id));
create policy doc_areas_admin on public.doc_areas for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy doc_archivos_ver on public.doc_archivos for select to authenticated using (private.doc_puede_ver(area_id));
create policy doc_archivos_subir on public.doc_archivos for insert to authenticated with check (private.doc_puede_editar(area_id));
create policy doc_archivos_editar on public.doc_archivos for update to authenticated using (private.doc_puede_editar(area_id)) with check (private.doc_puede_editar(area_id));
create policy doc_versiones_ver on public.doc_versiones for select to authenticated using (exists(select 1 from public.doc_archivos a where a.id=archivo_id and private.doc_puede_ver(a.area_id)));
create policy doc_versiones_subir on public.doc_versiones for insert to authenticated with check (exists(select 1 from public.doc_archivos a where a.id=archivo_id and private.doc_puede_editar(a.area_id)));
revoke delete on public.doc_archivos, public.doc_versiones from anon, authenticated;

-- Private files: path «<area_id>/<file>»; opened only with temporary links from the ERP.
insert into storage.buckets(id,name,public,file_size_limit) values('documentos_marca','documentos_marca',false,52428800) on conflict (id) do nothing;
create policy documentos_marca_ver on storage.objects for select to authenticated using (bucket_id='documentos_marca' and private.doc_puede_ver(private.doc_area_de_ruta(name)));
create policy documentos_marca_subir on storage.objects for insert to authenticated with check (bucket_id='documentos_marca' and private.doc_puede_editar(private.doc_area_de_ruta(name)));

-- Starting areas (administration renames, adds or hides them from the screen).
insert into public.doc_areas(nombre,orden,ver_roles) values
 ('Marketing y redes',1,'{}'),('Operaciones y sedes',2,'{}'),('Capacitación',3,'{}'),('Diseño y producto',4,'{}'),
 ('Finanzas y contabilidad',5,'{contabilidad}'),('Talento humano',6,'{admin}'),('Legal',7,'{admin}');

insert into public.permisos(codigo,modulo,accion,orden,solo_admin,descripcion) values('panel.documentos','Administración','Documentos de la marca',86,false,'') on conflict do nothing;
-- Module access for the staff profiles (areas then decide what each one sees); changeable in Accesos por perfil.
insert into public.roles_permisos(rol_id,permiso,activo,todas_sedes)
select r,'panel.documentos',true,false from unnest(array['asesora','asesora_lider','franquiciado','contabilidad']) r
where exists(select 1 from public.roles where id=r) on conflict do nothing;
