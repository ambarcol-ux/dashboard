-- Rotación de vestidos: veces alquilado según contratos (vestido principal y vestidos adicionales del contrato, sin anulados,
-- cancelados, rechazados ni borradores), último alquiler y días sin alquilarse. Respeta los permisos por sede (security invoker).
-- Reversión: drop function public.rotacion_vestidos();
create or replace function public.rotacion_vestidos()
returns table(id uuid,codigo text,nombre text,talla text,color text,estado text,sede text,clasificacion text,categoria text,precio numeric,
 creado date,veces int,veces_90d int,proximos int,ultimo date,dias_sin_alquiler int,foto boolean)
language sql stable security invoker set search_path='' as $$
 with u as (
  select k.vestido_id, k.id contrato_id from public.contratos k where k.vestido_id is not null
  union
  select i.vestido_id, i.contrato_id from public.contrato_items_vestidos i where i.vestido_id is not null),
 c as (
  select u.vestido_id, k.id, (k.created_at at time zone 'America/Bogota')::date creado, k.fecha_evento
  from u join public.contratos k on k.id=u.contrato_id
  where lower(coalesce(k.estado,'')) not in ('anulado','cancelado','borrador','rechazado')),
 g as (
  select vestido_id, count(distinct id)::int veces,
   count(distinct id) filter (where creado>=(now() at time zone 'America/Bogota')::date-90)::int veces_90d,
   count(distinct id) filter (where fecha_evento>=(now() at time zone 'America/Bogota')::date)::int proximos,
   max(creado) ultimo from c group by 1)
 select v.id,v.codigo,v.nombre,v.talla,v.color,v.estado,s.nombre,cl.nombre,v.categoria,v.precio_sugerido,
  (v.created_at at time zone 'America/Bogota')::date,coalesce(g.veces,0),coalesce(g.veces_90d,0),coalesce(g.proximos,0),g.ultimo,
  ((now() at time zone 'America/Bogota')::date-greatest(coalesce(g.ultimo,(v.created_at at time zone 'America/Bogota')::date),date '2026-04-01'))::int,
  coalesce(nullif(v.foto_frente,''),nullif(v.imagen_url,'')) is not null
 from public.vestidos v left join g on g.vestido_id=v.id left join public.sedes s on s.id=v.sede_actual_id
  left join public.clasificaciones_vestido cl on cl.id=v.clasificacion_id
 where not coalesce(v.archivado,false) and coalesce(v.para_alquiler,true)
  and lower(coalesce(v.estado,'')) not in ('vendido','dañado/baja')
$$;
revoke all on function public.rotacion_vestidos() from public, anon;
grant execute on function public.rotacion_vestidos() to authenticated;
