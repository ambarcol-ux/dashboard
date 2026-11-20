-- Ámbar Exitoso · datos limpios y embudo por sede.
--  · vestidos.costo_compra: what each dress cost (Inventario); the Tablero CEO adds the inventory to what the company has.
--  · private.cita_canal: one channel per first visit, same rules as lib/event-channel.ts canalDe, plus what the ERP knows
--    (ad of the chat, WhatsApp chat before the visit, ally). «Sin dato» = nobody recorded how she arrived.
--  · public.embudo_sede: per store, chats → citas → asistieron → contratos → ticket → vendido, citas by channel, % without origin
--    and the ad spend of the last daily ads report (7 days) with cost per ad chat / cita.
--  · public.tablero_inventario: value of the inventory (sum of costo_compra) and dresses still without cost, per store (Tablero CEO).
-- Reversible: drop function public.embudo_sede(date,date), private.cita_canal(public.primeras_citas); drop function public.tablero_inventario(); alter table public.vestidos drop column costo_compra.

alter table public.vestidos add column if not exists costo_compra numeric(14,2) check (costo_compra is null or costo_compra>=0);

create or replace function private.cita_canal(c public.primeras_citas) returns text
language sql stable security definer set search_path='' as $$
 select case
  when c.anuncio_id is not null or exists(select 1 from public.whatsapp_conversaciones w where w.anuncio_id is not null and right(regexp_replace(w.telefono,'\D','','g'),10)=right(regexp_replace(c.telefono,'\D','','g'),10) and w.created_at<=c.created_at+interval '1 hour') then 'Anuncio de Meta'
  when c.aliado_clienta_origen_id is not null or lower(coalesce(c.origen,'')) like '%aliad%' then 'Aliado'
  when lower(coalesce(c.origen_enlace,'')) like '%instagram%' or lower(coalesce(c.origen_enlace,'')) like 'ig%' or lower(coalesce(c.como_se_entero,'')) like '%instagram%' then 'Instagram'
  when lower(coalesce(c.origen_enlace,'')) like '%messenger%' or lower(coalesce(c.origen_enlace,'')) like 'fb%' or lower(coalesce(c.como_se_entero,'')) like '%facebook%' then 'Facebook / Messenger'
  when lower(coalesce(c.origen_enlace,'')) like '%tiktok%' or lower(coalesce(c.como_se_entero,'')) like '%tiktok%' then 'TikTok'
  when lower(coalesce(c.origen_enlace,'')) like '%whatsapp%' or lower(coalesce(c.como_se_entero,'')) like '%whatsapp%'
   or exists(select 1 from public.whatsapp_conversaciones w where coalesce(w.canal,'whatsapp')='whatsapp' and right(regexp_replace(w.telefono,'\D','','g'),10)=right(regexp_replace(c.telefono,'\D','','g'),10) and w.created_at<=c.created_at+interval '1 hour') then 'WhatsApp'
  when lower(coalesce(c.origen_enlace,'')) like 'correo%' then 'Correo'
  when lower(coalesce(c.como_se_entero,'')) like '%recomend%' then 'Recomendación'
  when lower(coalesce(c.como_se_entero,'')) like '%google%' then 'Google'
  when c.origen='vitrina' or lower(coalesce(c.como_se_entero,'')) like '%tienda%' or lower(coalesce(c.origen_enlace,'')) like 'qr%' then 'Tienda (vitrina)'
  when nullif(btrim(coalesce(c.como_se_entero,'')),'') is not null and lower(c.como_se_entero)<>'otro' then initcap(c.como_se_entero)
  else 'Sin dato' end;
$$;
revoke all on function private.cita_canal(public.primeras_citas) from public, anon, authenticated;

create or replace function public.embudo_sede(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare inf public.anuncios_ia_informes;
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad.' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>370 then raise exception 'Elige un periodo de hasta un año.'; end if;
 select * into inf from public.anuncios_ia_informes order by created_at desc limit 1;
 return jsonb_build_object('desde',p_desde,'hasta',p_hasta,'anuncios_desde',inf.desde,'anuncios_hasta',inf.hasta,'sedes',coalesce((
  with s as (select id,nombre from public.sedes where activo),
  pc as (select p.*,private.cita_canal(p) canal,(p.created_at at time zone 'America/Bogota')::date dia from public.primeras_citas p
   where (p.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta and coalesce(p.estado,'')<>'cancelada' and not coalesce(p.registrada_al_contratar,false)),
  k as (select c.* from public.contratos c where (c.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
   and lower(coalesce(c.estado,'')) not in ('cancelado','cancelada','anulado','anulada','rechazado') and (lower(coalesce(c.estado,''))<>'borrador' or coalesce(c.anticipo,0)>0)),
  ads as (select f->>'sede' sede,sum(coalesce((f->>'gasto')::numeric,0)) gasto,sum(coalesce((f->>'chats')::numeric,0)) chats,sum(coalesce((f->>'citas')::numeric,0)) citas,sum(coalesce((f->>'contratos')::numeric,0)) contratos
   from jsonb_array_elements(coalesce(inf.filas,'[]'::jsonb)) f group by 1)
  select jsonb_agg(jsonb_build_object('id',s.id,'nombre',s.nombre,
   'chats',(select count(*) from public.whatsapp_conversaciones w where w.sede_id=s.id and coalesce(w.canal,'whatsapp')='whatsapp' and (w.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta),
   'chats_anuncio',(select count(*) from public.whatsapp_conversaciones w where w.sede_id=s.id and w.anuncio_id is not null and (w.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta),
   'citas',(select count(*) from pc where pc.sede_id=s.id),
   'asistieron',(select count(*) from pc where pc.sede_id=s.id and (pc.estado in ('asistio','seguimiento','no_cerro') or pc.llegada_at is not null or exists(select 1 from public.contratos c2 where c2.primera_cita_id=pc.id))),
   'contratos_de_citas',(select count(*) from pc where pc.sede_id=s.id and exists(select 1 from public.contratos c2 where c2.primera_cita_id=pc.id and lower(coalesce(c2.estado,'')) not in ('cancelado','cancelada','anulado','anulada','rechazado'))),
   'contratos',(select count(*) from k where k.sede_id=s.id),
   'vendido',(select coalesce(sum(coalesce(k.valor_total,0)+coalesce(k.total_arreglos,0)),0) from k where k.sede_id=s.id),
   'sin_dato',(select count(*) from pc where pc.sede_id=s.id and pc.canal='Sin dato'),
   'por_canal',(select coalesce(jsonb_object_agg(canal,n),'{}'::jsonb) from (select pc.canal,count(*) n from pc where pc.sede_id=s.id group by 1) z),
   'anuncios',(select jsonb_build_object('gasto',a.gasto,'chats',a.chats,'citas',a.citas,'contratos',a.contratos) from ads a where lower(a.sede)=lower(s.nombre))) order by s.nombre)
  from s),'[]'::jsonb));
end $$;
revoke all on function public.embudo_sede(date,date) from public, anon;
grant execute on function public.embudo_sede(date,date) to authenticated;

create or replace function public.tablero_inventario() returns jsonb
language sql stable security definer set search_path='' as $$
 select case when public.es_admin() or private.es_finanzas() then coalesce(jsonb_object_agg(s.id,jsonb_build_object(
  'costo',(select coalesce(sum(v.costo_compra),0) from public.vestidos v where v.sede_actual_id=s.id and not coalesce(v.archivado,false)),
  'sin_costo',(select count(*) from public.vestidos v where v.sede_actual_id=s.id and not coalesce(v.archivado,false) and v.costo_compra is null))),'{}'::jsonb) end
 from public.sedes s where s.activo;
$$;
revoke all on function public.tablero_inventario() from public, anon;
grant execute on function public.tablero_inventario() to authenticated;
