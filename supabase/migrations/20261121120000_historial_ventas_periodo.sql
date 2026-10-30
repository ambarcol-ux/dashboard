-- Panel historial de Metas y ventas por período y sede.
-- p_modo 'contratos' = contracts dated in the period (fecha del contrato); 'caja' = contracts with abonos in the period (fecha del abono).
-- Same scope as cartera_contratos. Balance is computed in the client with lib/saldo.ts.
-- Revert: remove public.historial_ventas_periodo and private.historial_ventas_periodo.
create or replace function private.historial_ventas_periodo(p_desde date,p_hasta date,p_sede uuid,p_modo text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare limite uuid:=private.metas_sede_usuario(); hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if auth.uid() is null or private.prov_rol() in ('','proveedor') then raise exception 'No autorizado.' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>3660 or p_modo not in ('contratos','caja') then raise exception 'Período inválido.'; end if;
 return coalesce((select jsonb_agg(r order by r->>'fecha' desc) from (
  select jsonb_build_object('id',c.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'sede_id',c.sede_id,'sede',s.nombre,
   'fecha',coalesce(c.fecha_elaboracion::date,(c.created_at at time zone 'America/Bogota')::date),'factura',nullif(btrim(c.numero_factura),''),
   'recibo',(select p.numero_recibo from public.pagos p where p.contrato_id=c.id and nullif(btrim(p.numero_recibo),'') is not null order by p.fecha_pago desc limit 1),
   'valor_total',coalesce(c.valor_total,0),'total_arreglos',coalesce(c.total_arreglos,0),'anticipo',coalesce(c.anticipo,0),
   'abonos_periodo',(select coalesce(sum(p.valor_pagado),0) from public.pagos p where p.contrato_id=c.id and p.anulado_at is null and (p.fecha_pago at time zone 'America/Bogota')::date between p_desde and p_hasta),
   'dias',hoy-coalesce((c.factura_registrada_at at time zone 'America/Bogota')::date,(c.created_at at time zone 'America/Bogota')::date),'estado',c.estado) r
  from public.contratos c left join public.sedes s on s.id=c.sede_id
  where lower(coalesce(c.estado,'')) not in ('cancelado','anulado','borrador','rechazado')
   and (limite is null or c.sede_id=limite) and (p_sede is null or c.sede_id=p_sede)
   and case when p_modo='contratos' then coalesce(c.fecha_elaboracion::date,(c.created_at at time zone 'America/Bogota')::date) between p_desde and p_hasta
    else exists(select 1 from public.pagos p where p.contrato_id=c.id and p.anulado_at is null and (p.fecha_pago at time zone 'America/Bogota')::date between p_desde and p_hasta) end) t(r)),'[]'::jsonb);
end $$;
create or replace function public.historial_ventas_periodo(p_desde date,p_hasta date,p_sede uuid,p_modo text) returns jsonb language sql stable set search_path='' as $$
 select private.historial_ventas_periodo(p_desde,p_hasta,p_sede,p_modo)
$$;
revoke all on function public.historial_ventas_periodo(date,date,uuid,text),private.historial_ventas_periodo(date,date,uuid,text) from public,anon;
grant execute on function public.historial_ventas_periodo(date,date,uuid,text),private.historial_ventas_periodo(date,date,uuid,text) to authenticated;
