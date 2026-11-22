-- Inventario: retorno de cada vestido (Inventario › Rotación): purchase cost, what its contracts produced (each contract's value split
-- among its dresses) and return = produced ÷ cost. Read like rotacion_vestidos (security invoker, same visibility).
-- Old transfers of the previous flow left «En Camino» (360) are closed: received when the dress is at the destination or moved again
-- later (353), cancelled when it never left the origin (7). Each one keeps a note of the automatic closing.
-- Reversible: drop function public.rotacion_vestidos_retorno(); the closed transfers keep their note «Cierre automático (22/11/2026)».

create or replace function public.rotacion_vestidos_retorno()
returns table(id uuid, costo numeric, ingresos numeric, retorno numeric)
language sql stable set search_path='' as $$
 with u as (
  select k.vestido_id, k.id contrato_id from public.contratos k where k.vestido_id is not null
  union
  select i.vestido_id, i.contrato_id from public.contrato_items_vestidos i where i.vestido_id is not null),
 n as (select contrato_id, count(distinct vestido_id) n from u group by 1),
 g as (select u.vestido_id, sum(coalesce(k.valor_total,0)/greatest(n.n,1)) ingresos
  from u join n on n.contrato_id=u.contrato_id join public.contratos k on k.id=u.contrato_id
  where lower(coalesce(k.estado,'')) not in ('anulado','cancelado','borrador','rechazado') group by 1)
 select v.id, v.costo_compra, coalesce(g.ingresos,0), case when coalesce(v.costo_compra,0)>0 then round(coalesce(g.ingresos,0)/v.costo_compra,2) end
 from public.vestidos v left join g on g.vestido_id=v.id
 where not coalesce(v.archivado,false);
$$;
grant execute on function public.rotacion_vestidos_retorno() to authenticated;

update public.traslados_bitacora t set estado='recibido', fecha_recepcion=coalesce(t.fecha_recepcion,t.updated_at,t.created_at), updated_at=now(),
 observacion=left(concat_ws(' · ',nullif(t.observacion,''),'Cierre automático (22/11/2026): el vestido ya estaba en la sede de destino o tuvo un traslado posterior'),500)
from public.vestidos v
where v.id=t.vestido_id and t.estado='En Camino'
 and (v.sede_actual_id=t.sede_destino_id or exists(select 1 from public.traslados_bitacora t2 where t2.vestido_id=t.vestido_id and t2.created_at>t.created_at));
update public.traslados_bitacora t set estado='cancelado', updated_at=now(),
 observacion=left(concat_ws(' · ',nullif(t.observacion,''),'Cierre automático (22/11/2026): el vestido nunca salió de la sede de origen'),500)
where t.estado='En Camino';
