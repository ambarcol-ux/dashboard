-- Marketing › Anuncios: informe diario con IA. Cada día 7:10 a. m. (Bogotá) el ERP compara los anuncios de Meta de los últimos 7 días con
-- los 7 anteriores (gasto y métricas de Meta + chats, citas, asistencias y contratos que trajo cada anuncio), marca alertas fijas y la IA
-- escribe un resumen con recomendaciones. Solo recomienda: nada cambia en Meta sin administración. Se ve en WhatsApp 304 › Anuncios.
-- The ads funnel moves to private.anuncios_embudo so the server worker can read it; whatsapp_anuncios_resumen keeps the same result.
-- Reversible: select cron.unschedule('anuncios-informe-diario'); drop table public.anuncios_ia_informes; drop function public.anuncios_embudo_servidor(date,date);
--   restore whatsapp_anuncios_resumen from 20270111120000 and drop private.anuncios_embudo; delete the config_parametros row anuncios_alerta_sin_citas.

create or replace function private.anuncios_embudo(p_desde date, p_hasta date)
returns table(anuncio_id text, nombre text, campana text, sede text, chats bigint, citas bigint, citas_virtuales bigint, citas_presenciales bigint, asistieron bigint, contratos bigint)
language sql stable security definer set search_path='' as $$
 with c as (
  select w.anuncio_id, w.anuncio_at, right(regexp_replace(w.telefono,'\D','','g'),10) d
  from public.whatsapp_conversaciones w
  where w.anuncio_id is not null and (w.anuncio_at at time zone 'America/Bogota')::date between p_desde and p_hasta),
 f as (
  select c.anuncio_id,
   (select pc from public.primeras_citas pc where right(regexp_replace(coalesce(pc.telefono,''),'\D','','g'),10)=c.d and pc.created_at>=c.anuncio_at-interval '1 hour' and pc.estado<>'cancelada' order by pc.created_at limit 1) cita,
   exists(select 1 from public.contratos k where (right(regexp_replace(coalesce(k.whatsapp,''),'\D','','g'),10)=c.d or right(regexp_replace(coalesce(k.cliente_whatsapp,''),'\D','','g'),10)=c.d)
    and k.created_at>=c.anuncio_at-interval '1 hour' and lower(coalesce(k.estado,'')) in ('firmado','pagado totalmente','entregado','mantenimiento','finalizado')) contrato
  from c)
 select f.anuncio_id, a.nombre, a.campana, s.nombre::text,
  count(*), count((f.cita).id), count(*) filter (where (f.cita).modalidad='virtual'), count(*) filter (where (f.cita).modalidad='presencial'),
  count(*) filter (where (f.cita).estado in ('asistio','seguimiento','no_cerro') or (f.cita).alquilo is true),
  count(*) filter (where f.contrato)
 from f left join public.meta_anuncios a on a.id=f.anuncio_id left join public.sedes s on s.id=a.sede_id
 group by f.anuncio_id, a.nombre, a.campana, s.nombre
 order by count(*) desc;
$$;
revoke all on function private.anuncios_embudo(date,date) from public, anon, authenticated;

create or replace function public.whatsapp_anuncios_resumen(p_desde date, p_hasta date)
returns table(anuncio_id text, nombre text, campana text, sede text, chats bigint, citas bigint, citas_virtuales bigint, citas_presenciales bigint, asistieron bigint, contratos bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración puede ver la medición de anuncios.'; end if;
 return query select * from private.anuncios_embudo(p_desde,p_hasta);
end $$;

-- Same funnel for the daily worker (service role only).
create or replace function public.anuncios_embudo_servidor(p_desde date, p_hasta date)
returns table(anuncio_id text, nombre text, campana text, sede text, chats bigint, citas bigint, citas_virtuales bigint, citas_presenciales bigint, asistieron bigint, contratos bigint)
language sql stable security definer set search_path='' as $$ select * from private.anuncios_embudo(p_desde,p_hasta); $$;
revoke all on function public.anuncios_embudo_servidor(date,date) from public, anon, authenticated;
grant execute on function public.anuncios_embudo_servidor(date,date) to service_role;

create table if not exists public.anuncios_ia_informes(
 id bigint generated always as identity primary key,
 desde date not null, hasta date not null,
 metricas jsonb not null, alertas jsonb not null default '[]', filas jsonb not null default '[]',
 resumen text not null, recomendaciones jsonb not null default '[]',
 created_at timestamptz not null default now()
);
alter table public.anuncios_ia_informes enable row level security;
create policy anuncios_ia_informes_ver on public.anuncios_ia_informes for select to authenticated using ((select public.es_admin()));
revoke insert,update,delete on public.anuncios_ia_informes from anon, authenticated;

insert into public.config_parametros(clave,modulo,etiqueta,tipo,valor,minimo,maximo,orden,ayuda) values
 ('anuncios_alerta_sin_citas','anuncios','Alerta: gasto de un anuncio en 7 días sin ninguna cita (COP)','entero','50000',10000,2000000,30,'El informe diario de anuncios avisa cuando un anuncio gasta este valor o más en 7 días sin traer primeras citas.')
on conflict (clave) do nothing;

select cron.schedule('anuncios-informe-diario','10 12 * * *',$$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/anuncios/informe',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000);
$$);
