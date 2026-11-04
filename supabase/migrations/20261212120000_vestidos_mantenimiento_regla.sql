-- Vestidos: «EN MANTENIMIENTO» solo mientras haya un mantenimiento abierto (aprobado por el usuario 03/11/2026).
-- Antes, un vestido que ya decía «EN MANTENIMIENTO» quedaba así aunque su mantenimiento estuviera cerrado.
-- Se recalculan (una vez) los vestidos no archivados que estaban pegados; cada cambio queda en bitacora_vestidos.
-- Revert: re-crear private.refrescar_prenda_operaciones con la condición
--   «or lower(coalesce(v.estado,'')) in ('en mantenimiento','mantenimiento','lavanderia','lavandería')» en la primera rama,
--   y devolver a 'EN MANTENIMIENTO' los vestidos de bitacora_vestidos con accion='Estado recalculado (mantenimiento cerrado)'.
create or replace function private.refrescar_prenda_operaciones(p_vestido uuid) returns void language plpgsql set search_path to '' as $function$
begin
 update public.vestidos v set estado=case
 when exists(select 1 from public.mantenimiento_bitacora m where m.vestido_id=v.id and not coalesce(m.completado,false) and lower(coalesce(m.estado,'')) not in ('finalizado','completado','cancelado')) then 'EN MANTENIMIENTO'
 when exists(select 1 from public.contratos c where lower(c.estado)='entregado' and (c.vestido_id=v.id or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=c.id and i.vestido_id=v.id))) then 'Alquilado'
 when exists(select 1 from public.contratos c where lower(c.estado) not in ('cancelado','cancelada','anulado','anulada','rechazado','finalizado','liquidado','historial') and (c.vestido_id=v.id or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=c.id and i.vestido_id=v.id))) then 'Reservado'
 else 'Disponible' end where v.id=p_vestido;
end $function$;

do $do$ declare r record; nuevo text; begin
 for r in select v.id,v.estado from public.vestidos v
  where lower(coalesce(v.estado,'')) in ('en mantenimiento','mantenimiento','lavanderia','lavandería') and not coalesce(v.archivado,false)
   and not exists(select 1 from public.mantenimiento_bitacora m where m.vestido_id=v.id and not coalesce(m.completado,false) and lower(coalesce(m.estado,'')) not in ('finalizado','completado','cancelado'))
 loop
  perform private.refrescar_prenda_operaciones(r.id);
  select estado into nuevo from public.vestidos where id=r.id;
  insert into public.bitacora_vestidos(id,vestido_id,usuario_email,accion,motivo,detalle,fecha,created_at)
  values(gen_random_uuid(),r.id,'sistema','Estado recalculado (mantenimiento cerrado)','Sin mantenimiento abierto',r.estado||' → '||nuevo,now(),now());
 end loop;
end $do$;
