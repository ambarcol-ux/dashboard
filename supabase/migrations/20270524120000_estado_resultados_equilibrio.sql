-- Punto de equilibrio en el Estado de resultados: each expense line says whether it is a fixed or variable cost ('costo'), and each store
-- gets 'dato' lines with the contracts made in the period and their total value (average ticket). Variable = costs that grow with each
-- contract (supplies, suppliers, alterations, transport, photography, laundry, commissions); everything else is fixed. Read-only.
-- Reversible: re-run 20270523120000_estado_resultados.sql.

create or replace function private.estado_resultados(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare fin boolean:=private.es_finanzas();
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Selecciona un periodo de hasta un año.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('sede_id',x.sede_id,'sede',coalesce(s.nombre,'Administración general'),'grupo',x.grupo,'concepto',x.concepto,'valor',x.valor,'costo',case when x.grupo<>'gasto' then null when x.concepto ilike any(array['Compras e insumos%','Proveedores%','Mantenimiento y arreglos%','Transporte%','Fotograf%','Lavander%','Comisi%']) then 'variable' else 'fijo' end)
   order by coalesce(s.nombre,'zzz'),x.grupo desc,x.valor desc)
  from (select u.sede_id,u.grupo,u.concepto,sum(u.valor) valor from (
   select m.sede_id,'ingreso' grupo,coalesce(m.categoria,'Otro ingreso') concepto,m.valor from public.caja_movimientos m
    where m.tipo='ingreso' and m.anulado_at is null and m.fecha between p_desde and p_hasta
     and m.categoria is distinct from 'Base de caja' and m.categoria is distinct from 'Depósito en garantía'
     and coalesce(m.origen,'') not in ('deposito','entre_sedes_entrada','prestamo_socio_entrada')
   union all
   select k.sede_id,'ingreso','Retención de depósitos (daños)',d.descuento from public.movimientos_depositos d join public.contratos k on k.id=d.contrato_id
    where d.tipo='devolucion' and coalesce(d.descuento,0)>0 and d.fecha between p_desde and p_hasta
   union all
   select m.sede_id,'gasto',coalesce(m.categoria,'Otro egreso'),m.valor from public.caja_movimientos m
    where m.tipo='egreso' and m.anulado_at is null and m.fecha between p_desde and p_hasta
     and m.categoria is distinct from 'Devolución de depósito' and m.categoria is distinct from 'Consignación a banco'
     and coalesce(m.origen,'') not in ('devolucion','gasto','entre_sedes_salida','prestamo_socio_salida')
   union all
   select g.sede_id,'gasto',g.categoria,g.valor from public.gastos g
    where g.clase='gasto' and g.anulado_at is null and g.fecha between p_desde and p_hasta
   union all
   select c.sede_id,'gasto','Pago fijo: '||coalesce(nullif(pc.categoria,''),pc.nombre),coalesce(c.valor_pagado,c.valor) from public.pagos_fijos_cuotas c join public.pagos_fijos_conceptos pc on pc.id=c.concepto_id
    where c.estado='pagada' and c.caja_movimiento_id is null and c.pagada_fecha between p_desde and p_hasta
   union all
   select k.sede_id,'gasto','Proveedores (servicios)',dt.valor from public.pago_proveedor_detalle dt join public.pagos_proveedor p on p.id=dt.pago_id
    join public.contrato_servicios cs on cs.id=dt.contrato_servicio_id join public.contratos k on k.id=cs.contrato_id
    where p.anulado_at is null and p.fecha_pago between p_desde and p_hasta
   union all
   select coalesce(k.sede_id,v.sede_actual_id),'gasto','Proveedores (arreglos)',a.valor from public.pago_proveedor_arreglos a join public.pagos_proveedor p on p.id=a.pago_id
    join public.mantenimiento_vestidos mv on mv.id=a.mantenimiento_id left join public.contratos k on k.id=mv.contrato_id left join public.vestidos v on v.id=mv.vestido_id
    where p.anulado_at is null and p.fecha_pago between p_desde and p_hasta
   union all
   select null,'gasto','Proveedores (sin sede)',p.valor_total-coalesce((select sum(dt.valor) from public.pago_proveedor_detalle dt where dt.pago_id=p.id),0)
     -coalesce((select sum(a.valor) from public.pago_proveedor_arreglos a where a.pago_id=p.id),0)
    from public.pagos_proveedor p where p.anulado_at is null and p.fecha_pago between p_desde and p_hasta
   union all
   select k.sede_id,'dato','contratos',1 from public.contratos k
    where coalesce(k.fecha_elaboracion,(k.created_at at time zone 'America/Bogota')::date) between p_desde and p_hasta and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','cancelada','borrador','rechazado')
   union all
   select k.sede_id,'dato','valor_contratos',k.valor_total from public.contratos k
    where coalesce(k.fecha_elaboracion,(k.created_at at time zone 'America/Bogota')::date) between p_desde and p_hasta and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','cancelada','borrador','rechazado')
  ) u where coalesce(u.valor,0)<>0 group by 1,2,3) x
  left join public.sedes s on s.id=x.sede_id
  where (x.sede_id is null and fin) or (x.sede_id is not null and private.caja_ver(x.sede_id))),'[]'::jsonb);
end $$;
revoke all on function private.estado_resultados(date,date) from public, anon;
grant execute on function private.estado_resultados(date,date) to authenticated;

create or replace function public.estado_resultados(p_desde date, p_hasta date) returns jsonb
language sql stable set search_path='' as $$ select private.estado_resultados(p_desde,p_hasta); $$;
revoke all on function public.estado_resultados(date,date) from public, anon;
grant execute on function public.estado_resultados(date,date) to authenticated;
