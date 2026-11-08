-- Medición de anuncios: cada chat guarda el anuncio de Meta (clic a WhatsApp) de donde llegó; el nombre del anuncio
-- (que lleva la sede) se consulta a Meta y se guarda. El resumen sigue a la clienta por su celular: chat → primera cita → asistió → contrato.
-- Reversión: drop function public.whatsapp_anuncios_resumen(date,date); drop table public.meta_anuncios;
--   alter table public.whatsapp_conversaciones drop column anuncio_id, drop column anuncio_titulo, drop column anuncio_url, drop column ctwa_clid, drop column anuncio_at;
alter table public.whatsapp_conversaciones
 add column if not exists anuncio_id text, add column if not exists anuncio_titulo text, add column if not exists anuncio_url text,
 add column if not exists ctwa_clid text, add column if not exists anuncio_at timestamptz;
create index if not exists whatsapp_conversaciones_anuncio on public.whatsapp_conversaciones(anuncio_id, anuncio_at) where anuncio_id is not null;

create table public.meta_anuncios(
 id text primary key check (id ~ '^\d+$'),
 nombre text, campana text, conjunto text,
 sede_id uuid references public.sedes(id) on delete set null,
 actualizado_at timestamptz not null default now()
);
alter table public.meta_anuncios enable row level security;
create policy meta_anuncios_ver on public.meta_anuncios for select to authenticated using ((select public.es_admin()));
revoke insert,update,delete on public.meta_anuncios from anon, authenticated;

-- Per ad, for chats that arrived from it between the dates (Bogotá): chats, visits booked after the chat (virtual/in person),
-- attended (same rule as Primeras visitas) and contracts closed after the chat. Administration only.
create or replace function public.whatsapp_anuncios_resumen(p_desde date, p_hasta date)
returns table(anuncio_id text, nombre text, campana text, sede text, chats bigint, citas bigint, citas_virtuales bigint, citas_presenciales bigint, asistieron bigint, contratos bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración puede ver la medición de anuncios.'; end if;
 return query
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
end $$;
revoke all on function public.whatsapp_anuncios_resumen(date,date) from public, anon;
grant execute on function public.whatsapp_anuncios_resumen(date,date) to authenticated;
