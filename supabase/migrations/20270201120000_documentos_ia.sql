-- Documentos de la marca para la IA de WhatsApp: por área se decide si la IA puede leer sus documentos (vacío = hereda del área padre).
-- La IA resume lo útil para atender clientas; deja de usarlo si vence, se archiva o cambia de versión (se vuelve a leer).
-- Reversión: select cron.unschedule('documentos-ia'); drop function public.documentos_para_ia(), public.documentos_ia_pendientes(int);
--   drop table public.doc_ia_resumenes; alter table public.doc_areas drop column ia_lee;
alter table public.doc_areas add column if not exists ia_lee boolean;
-- Approved by administration: the customer-facing areas start readable by the AI; Finance, HR and Legal stay closed.
update public.doc_areas set ia_lee=true where padre_id is null and nombre in ('Marketing y redes','Operaciones y sedes','Capacitación','Diseño y producto') and ia_lee is null;
update public.doc_areas set ia_lee=false where padre_id is null and nombre in ('Finanzas y contabilidad','Talento humano','Legal') and ia_lee is null;

create table if not exists public.doc_ia_resumenes(
 archivo_id uuid primary key references public.doc_archivos(id) on delete cascade,
 version int not null,
 estado text not null check (estado in ('ok','sin_contenido','error')),
 resumen text, error text,
 updated_at timestamptz not null default now()
);
alter table public.doc_ia_resumenes enable row level security;
create policy doc_ia_resumenes_ver on public.doc_ia_resumenes for select to authenticated using ((select public.es_admin()));
revoke insert, update, delete on public.doc_ia_resumenes from anon, authenticated;

-- Effective «AI can read»: the closest area in the chain with a value (none = no).
create or replace function private.doc_ia_lee(p_area uuid) returns boolean language sql stable security definer set search_path='' as $$
 with recursive cadena as(
  select a.id,a.padre_id,a.ia_lee,a.activo,0 n from public.doc_areas a where a.id=p_area
  union all select a.id,a.padre_id,a.ia_lee,a.activo,c.n+1 from public.doc_areas a join cadena c on a.id=c.padre_id)
 select coalesce((select c.ia_lee from cadena c where c.ia_lee is not null order by c.n limit 1),false) and not exists(select 1 from cadena c where not c.activo)
$$;

-- Files the AI still has to read (new or with a new version).
create or replace function public.documentos_ia_pendientes(p_limite int) returns table(id uuid,nombre text,ruta text,tipo text,tamano bigint,version int)
language sql stable security definer set search_path='' as $$
 select d.id,d.nombre,d.ruta,d.tipo,d.tamano,d.version from public.doc_archivos d left join public.doc_ia_resumenes r on r.archivo_id=d.id
 where not d.archivado and d.ruta is not null and (d.vence is null or d.vence>=(now() at time zone 'America/Bogota')::date) and private.doc_ia_lee(d.area_id)
  and (r.archivo_id is null or r.version<>d.version or (r.estado='error' and r.updated_at<now()-interval '1 day'))
 order by d.updated_at desc limit greatest(1,least(p_limite,20))
$$;

-- What the WhatsApp AI uses: summaries of current documents of readable areas.
create or replace function public.documentos_para_ia() returns table(nombre text,sede text,vence date,resumen text)
language sql stable security definer set search_path='' as $$
 select d.nombre,s.nombre,d.vence,r.resumen from public.doc_archivos d join public.doc_ia_resumenes r on r.archivo_id=d.id and r.version=d.version and r.estado='ok'
 left join public.sedes s on s.id=d.sede_id
 where not d.archivado and (d.vence is null or d.vence>=(now() at time zone 'America/Bogota')::date) and private.doc_ia_lee(d.area_id)
 order by d.nombre
$$;
revoke all on function private.doc_ia_lee(uuid), public.documentos_ia_pendientes(int), public.documentos_para_ia() from public, anon;
grant execute on function private.doc_ia_lee(uuid) to authenticated, service_role;
revoke all on function public.documentos_ia_pendientes(int), public.documentos_para_ia() from authenticated;
grant execute on function public.documentos_ia_pendientes(int), public.documentos_para_ia() to service_role;

-- Every day at 7:20 a. m. (Bogotá) the AI reads new documents (before the daily chat analysis); uploads also trigger it right away.
select cron.schedule('documentos-ia','20 12 * * *',$$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/documentos/ia',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000);
$$);
