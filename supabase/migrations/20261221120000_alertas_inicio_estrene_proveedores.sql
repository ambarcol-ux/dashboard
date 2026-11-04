-- Inicio: agrega pedidos de estrene en riesgo y servicios de proveedores por pagar a la franja de alertas.
create or replace function private.alertas_inicio()
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare lim uuid[]:=private.sedes_limitadas(); hoy date:=(now() at time zone 'America/Bogota')::date; res jsonb;
begin
 if auth.uid() is null then raise exception 'No autorizado.' using errcode='42501'; end if;
 select jsonb_build_object(
  'caja_abonos',(select jsonb_array_length(private.caja_abonos_pendientes())),
  'caja_sin_cerrar',(select count(*) from (select distinct m.sede_id,m.fecha from public.caja_movimientos m join public.sedes s on s.id=m.sede_id
     where s.activo is true and private.caja_ver(m.sede_id) and m.anulado_at is null and m.fecha<private.caja_hoy()
      and (private.caja_inicio(m.sede_id) is null or m.fecha>=private.caja_inicio(m.sede_id)) and not private.caja_dia_cerrado(m.sede_id,m.fecha)) x),
  'caja_diferencias',(select count(*) from public.caja_cierres k where private.caja_ver(k.sede_id) and k.reabierto_at is null and coalesce(k.diferencia,0)<>0 and k.fecha>=hoy-30),
  'pagos_sin_soporte',(select count(*) from public.pagos p join public.contratos c on c.id=p.contrato_id
     where (lim is null or c.sede_id=any(lim)) and p.anulado_at is null and p.valor_pagado>0 and p.created_at>=private.soportes_desde() and p.created_at>=now()-interval '30 days'
      and lower(coalesce(c.estado,'')) not in ('cancelado','anulado','borrador','rechazado')
      and not exists(select 1 from public.soportes_pago s where s.pago_id=p.id and s.activo)),
  'traslados_por_aprobar',(select count(*) from public.traslados_bitacora t where t.estado='solicitado' and t.solicitado_por is not null
     and (lim is null or t.sede_origen_id=any(lim) or t.sede_destino_id=any(lim))),
  'prestamos_vencidos',(select count(*) from public.traslados_bitacora t where t.tipo='prestamo' and t.estado='recibido' and t.fecha_devolucion<hoy
     and not exists(select 1 from public.traslados_bitacora d where d.traslado_padre_id=t.id and d.estado<>'rechazado')
     and (lim is null or t.sede_origen_id=any(lim) or t.sede_destino_id=any(lim))),
  'mantenimiento_demorado',(select count(distinct m.vestido_id) from public.mantenimiento_bitacora m join public.vestidos v on v.id=m.vestido_id
     where not coalesce(m.completado,false) and lower(coalesce(m.estado,'')) not in ('finalizado','completado','cancelado') and not coalesce(v.archivado,false)
      and (lim is null or v.sede_actual_id=any(lim))
      and (m.fecha_salida_estimada::date<hoy or m.fecha_entrada::date<=hoy-7)),
  'agenda_hoy',(select count(*) from public.contratos c where (lim is null or c.sede_id=any(lim)) and lower(coalesce(c.estado,'')) not in ('cancelado','anulado','borrador','rechazado','finalizado')
      and hoy in (c.fecha_cita_medidas,c.fecha_prueba_final,c.fecha_entrega_envio,c.fecha_pre_xv))
    +(select count(*) from public.primeras_citas p where (lim is null or p.sede_id=any(lim)) and p.fecha=hoy and p.estado in ('agendada','confirmada')),
  'agenda_manana',(select count(*) from public.contratos c where (lim is null or c.sede_id=any(lim)) and lower(coalesce(c.estado,'')) not in ('cancelado','anulado','borrador','rechazado','finalizado')
      and hoy+1 in (c.fecha_cita_medidas,c.fecha_prueba_final,c.fecha_entrega_envio,c.fecha_pre_xv))
    +(select count(*) from public.primeras_citas p where (lim is null or p.sede_id=any(lim)) and p.fecha=hoy+1 and p.estado in ('agendada','confirmada')),
  'estrene_riesgo',(select count(*) from public.pedidos_alquiler_estrene e join public.contratos c on c.id=e.contrato_id
     where (lim is null or c.sede_id=any(lim)) and e.estado not in ('recibido','entregado') and e.fecha_estimada_llegada is not null
      and lower(coalesce(c.estado,'')) not in ('cancelado','anulado','rechazado','finalizado')
      and coalesce(c.fecha_entrega_envio,c.fecha_evento)-e.fecha_estimada_llegada<=5),
  'proveedores_por_pagar',case when public.es_admin() then (select count(*) from public.contrato_servicios s join public.contratos c on c.id=s.contrato_id
     where s.estado<>'Cancelado' and s.estado_pago in ('Pendiente','No aplica') and s.valor_empresa>0 and (s.estado='Realizado' or s.estado_pago='Pendiente')) else 0 end,
  'ventas_sin_factura',(select count(*) from public.ventas_vestidos v where v.anulada_at is null and coalesce(trim(v.numero_factura),'')='' and (lim is null or v.sede_id=any(lim))),
  'incoherentes',(select coalesce(jsonb_agg(jsonb_build_object('numero',x.numero_contrato,'sede',x.sede,'problema',x.problema) order by x.numero_contrato),'[]'::jsonb) from (
     select c.numero_contrato,s.nombre sede,case
       when lower(coalesce(c.estado,''))='pagado totalmente' and coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.anticipo,0)>0 then 'Dice pagado totalmente pero tiene saldo'
       when coalesce(c.valor_total,0)=0 and coalesce(c.anticipo,0)>0 then 'Valor $0 con abonos'
       when lower(coalesce(c.estado,'')) in ('cancelado','anulado','borrador') and coalesce(c.saldo,0)>0 then 'Cancelado, anulado o borrador con saldo'
       when coalesce(c.saldo,0)<0 and coalesce(c.saldo,0)+coalesce(c.total_multas,0)<0 then 'Saldo negativo (pagó de más)'
       when abs(coalesce(c.saldo,0)-(coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.anticipo,0)))>1 and c.valor_total is not null then 'Saldo no cuadra con el total'
      end problema
     from public.contratos c left join public.sedes s on s.id=c.sede_id where lim is null or c.sede_id=any(lim)) x where x.problema is not null)
 ) into res;
 return res;
end $function$;
create or replace function public.alertas_inicio()
 returns jsonb language sql stable set search_path to ''
as $function$ select private.alertas_inicio(); $function$;
revoke all on function private.alertas_inicio() from public, anon;
grant execute on function private.alertas_inicio() to authenticated;
revoke all on function public.alertas_inicio() from public, anon;
grant execute on function public.alertas_inicio() to authenticated;
