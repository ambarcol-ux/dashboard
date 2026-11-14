-- Marketing › Estudio de contenido (etapa 1): biblioteca de fotos/videos, piezas creadas con la IA, aprobación y
-- publicación automática en Instagram y Facebook (los estados de WhatsApp quedan listos para subir a mano).
-- Reversión:
--   select cron.unschedule('contenido-publicar');
--   delete from public.roles_permisos where permiso='panel.estudio_contenido'; delete from public.permisos where codigo='panel.estudio_contenido';
--   drop table public.contenido_piezas, public.contenido_biblioteca; delete from storage.buckets where id='contenido_marketing';

-- Public bucket: Meta downloads the media from its URL to publish it (random file names).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('contenido_marketing','contenido_marketing',true,104857600,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
on conflict (id) do nothing;

create table if not exists public.contenido_biblioteca(
 id uuid primary key default gen_random_uuid(),
 ruta text not null unique,
 url text not null,
 tipo text not null check (tipo in ('imagen','video')),
 titulo text check (titulo is null or length(titulo)<=120),
 etiquetas text[] not null default '{}',
 sede_id uuid references public.sedes(id),
 tiene_clienta boolean not null default false,
 autorizada boolean not null default false,
 archivado boolean not null default false,
 subido_por uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists contenido_biblioteca_activos on public.contenido_biblioteca(created_at desc) where not archivado;

create table if not exists public.contenido_piezas(
 id uuid primary key default gen_random_uuid(),
 formato text not null check (formato in ('historia','publicacion','carrusel','reel')),
 redes text[] not null check (redes <@ array['instagram','facebook','whatsapp']::text[] and cardinality(redes)>0),
 sede_id uuid references public.sedes(id),
 orden text check (orden is null or length(orden)<=1000),
 texto text check (texto is null or length(texto)<=2200),
 medios jsonb not null default '[]',
 idea text check (idea is null or length(idea)<=600),
 programada_at timestamptz,
 estado text not null default 'por_aprobar' check (estado in ('por_aprobar','aprobada','publicando','publicada','error','descartada')),
 resultado jsonb not null default '{}',
 error text,
 creado_por uuid references public.profiles(id) on delete set null,
 aprobado_por uuid references public.profiles(id) on delete set null,
 aprobado_at timestamptz,
 publicado_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists contenido_piezas_cola on public.contenido_piezas(programada_at) where estado='aprobada';

alter table public.contenido_biblioteca enable row level security;
alter table public.contenido_piezas enable row level security;
create policy contenido_biblioteca_ver on public.contenido_biblioteca for select to authenticated
 using ((select public.es_admin()) or (select private.tiene_permiso('panel.estudio_contenido')));
create policy contenido_piezas_ver on public.contenido_piezas for select to authenticated
 using ((select public.es_admin()) or (select private.tiene_permiso('panel.estudio_contenido')));
-- Changes only through the ERP server (it checks who approves and publishes).
revoke insert,update,delete on public.contenido_biblioteca, public.contenido_piezas from anon, authenticated;

insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
values ('panel.estudio_contenido','Marketing','Ver y crear en el Estudio de contenido','Crear piezas con la IA y subir material; aprobar y publicar es solo de administración',false,41)
on conflict (codigo) do nothing;

-- Every 5 minutes: publishes the approved pieces whose time has come.
select cron.schedule('contenido-publicar','*/5 * * * *',$c$
 select net.http_post(url:='https://erp.ambarcouture.com/api/marketing/publicar',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb, timeout_milliseconds:=60000);
$c$);
