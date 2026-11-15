-- Estudio de contenido › medición por pieza: alcance e interacciones (Instagram y Facebook, cada día) y resultados de negocio.
-- Cada pieza tiene un código corto (P + 5 caracteres) que la IA pone en el texto («escríbenos con el código …»); cuando una clienta
-- lo menciona en WhatsApp, su chat queda unido a la pieza y se cuentan sus citas y contratos posteriores.
-- Reversión: select cron.unschedule('contenido-metricas'); drop function public.contenido_resultados(int);
--   alter table public.whatsapp_conversaciones drop column contenido_pieza_id, drop column contenido_pieza_at;
--   alter table public.contenido_piezas drop column codigo, drop column metricas, drop column metricas_at;
alter table public.contenido_piezas add column if not exists codigo text unique check (codigo is null or codigo ~ '^P[0-9A-Z]{5}$'),
 add column if not exists metricas jsonb not null default '{}',
 add column if not exists metricas_at timestamptz;
alter table public.whatsapp_conversaciones add column if not exists contenido_pieza_id uuid references public.contenido_piezas(id) on delete set null,
 add column if not exists contenido_pieza_at timestamptz;
create index if not exists whatsapp_conversaciones_pieza on public.whatsapp_conversaciones(contenido_pieza_id) where contenido_pieza_id is not null;

-- Results per published piece: chats that mentioned its code, first visits booked afterwards from those phones, and contracts.
create or replace function public.contenido_resultados(p_dias int default 60)
returns table(pieza_id uuid, chats bigint, citas bigint, asistieron bigint, contratos bigint, valor numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if not (public.es_admin() or private.tiene_permiso('panel.estudio_contenido')) then raise exception 'Sin permiso.' using errcode='42501'; end if;
 return query
 with ch as (select w.contenido_pieza_id pid, w.contenido_pieza_at at, right(regexp_replace(w.telefono,'\D','','g'),10) tel
  from public.whatsapp_conversaciones w join public.contenido_piezas p on p.id=w.contenido_pieza_id
  where p.created_at>now()-make_interval(days=>greatest(1,least(coalesce(p_dias,60),365)))),
 ci as (select ch.pid, c.id, (c.llegada_at is not null or c.estado in ('asistio','seguimiento','no_cerro')) asis from ch
  join public.primeras_citas c on right(regexp_replace(coalesce(c.telefono,''),'\D','','g'),10)=ch.tel and c.created_at>=ch.at-interval '1 hour' and c.estado<>'cancelada'),
 ko as (select ch.pid, k.id, coalesce(k.valor_total,0) v from ch
  join public.contratos k on right(regexp_replace(coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp,''),'\D','','g'),10)=ch.tel and k.created_at>=ch.at-interval '1 hour'
  where lower(coalesce(k.estado,'')) not in ('anulado','cancelado','borrador'))
 select p.id,(select count(*) from ch where ch.pid=p.id),(select count(distinct ci.id) from ci where ci.pid=p.id),(select count(distinct ci.id) filter (where ci.asis) from ci where ci.pid=p.id),
  (select count(distinct ko.id) from ko where ko.pid=p.id),(select coalesce(sum(ko.v),0) from (select distinct on (ko.id) ko.* from ko where ko.pid=p.id) ko)
 from public.contenido_piezas p where p.created_at>now()-make_interval(days=>greatest(1,least(coalesce(p_dias,60),365))) and p.estado in ('publicada','publicando');
end $$;
revoke all on function public.contenido_resultados(int) from public, anon;
grant execute on function public.contenido_resultados(int) to authenticated;

-- 6:40 a. m. Bogotá: brings reach and interactions of the pieces published in the last 30 days.
select cron.schedule('contenido-metricas','40 11 * * *',$c$
 select net.http_post(url:='https://erp.ambarcouture.com/api/marketing/metricas',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb, timeout_milliseconds:=60000);
$c$);
