-- Descripción por IA de la foto de cada vestido visible: la IA de WhatsApp la usa para reconocer las fotos de nuestros catálogos
-- que envían las clientas (y para buscar opciones parecidas). Tabla aparte: no toca la tabla vestidos.
-- Se llena sola cada 15 minutos (solo fotos nuevas o cambiadas). Solo la lee el servidor.
-- Reversión: select cron.unschedule('vestidos-describir-fotos'); drop table public.vestidos_ia_fotos;
create table if not exists public.vestidos_ia_fotos(
 vestido_id uuid primary key references public.vestidos(id) on delete cascade,
 foto_url text not null,
 descripcion text not null,
 updated_at timestamptz not null default now()
);
alter table public.vestidos_ia_fotos enable row level security;
revoke all on public.vestidos_ia_fotos from anon, authenticated;

select cron.schedule('vestidos-describir-fotos','*/15 * * * *',$c$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/inventario/describir-fotos',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000);
$c$);
