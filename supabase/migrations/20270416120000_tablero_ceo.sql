-- Ámbar Exitoso · Tablero CEO (Reportes y Estadísticas): where the money is, what the company has and owes, how the month goes and
-- where it is heading, per store and in total, in real time from the ERP. Reuses private.caja_resumen (what came in / went out),
-- private.caja_saldo_inicial (cash at the last close), pagos_fijos_cuotas (fixed costs), private.proveedores_resumen (suppliers to pay)
-- and the same contract balance rules as Cuentas por cobrar. Administration and accounting only.
-- Approximations, stated on the screen: bank balance = ERP movements of each account; profit = sold − expenses of the month.
-- Reversible: drop function public.tablero_ceo(uuid).

create or replace function public.tablero_ceo(p_sede uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare hoy date:=(now() at time zone 'America/Bogota')::date; ini date:=date_trunc('month',(now() at time zone 'America/Bogota'))::date;
 ini_ant date:=(date_trunc('month',(now() at time zone 'America/Bogota'))-interval '1 month')::date; caja jsonb; caja_ant jsonb; prov jsonb; r jsonb;
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad.' using errcode='42501'; end if;
 caja:=private.caja_resumen(ini,hoy);
 caja_ant:=private.caja_resumen(ini_ant,(ini-1));
 prov:=case when public.es_admin() then private.proveedores_resumen(ini) end;
 with s as (select id,nombre from public.sedes where activo and (p_sede is null or id=p_sede)),
 k as (select c.*,greatest(0,coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.anticipo,0)) debe from public.contratos c
  where lower(coalesce(c.estado,'')) not in ('cancelado','cancelada','anulado','anulada','rechazado') and (lower(coalesce(c.estado,''))<>'borrador' or coalesce(c.anticipo,0)>0)),
 x as (select s.id,s.nombre,
  -- where the money is
  private.caja_saldo_inicial(s.id,hoy+1) efectivo,
  coalesce((select sum(case when m.tipo='ingreso' then m.valor else -m.valor end) from public.caja_movimientos m join public.cuentas_dinero d on d.id=m.cuenta_id
   where m.sede_id=s.id and m.anulado_at is null and d.tipo<>'efectivo'),0) bancos,
  -- money that is not ours yet
  coalesce((select sum(c.valor_deposito) from k c where c.sede_id=s.id and coalesce(c.valor_deposito,0)>0 and coalesce(c.entregado_evento,false) and c.finalizado_at is null
   and not exists(select 1 from public.devoluciones_depositos dd where dd.contrato_id=c.id and lower(coalesce(dd.estado,'completado')) not in ('cancelado','anulado','rechazado'))),0) depositos,
  coalesce((select sum(g.valor) from public.planes_ahorro_pagos g join public.planes_ahorro p on p.id=g.plan_id where p.sede_id=s.id and p.estado='activo' and g.anulado_at is null),0) plan_ahorro,
  coalesce((select sum(case when ps.tipo='devolucion' then -ps.valor else ps.valor end) from public.prestamos_socios ps where ps.sede_id=s.id and ps.anulado_at is null),0) socios,
  -- what clients owe and what is already secured
  coalesce((select sum(c.debe) from k c where c.sede_id=s.id and lower(coalesce(c.estado,''))<>'finalizado'),0) por_cobrar,
  coalesce((select sum(c.debe) from k c where c.sede_id=s.id and lower(coalesce(c.estado,''))<>'finalizado' and c.fecha_evento<hoy),0) por_cobrar_vencido,
  coalesce((select sum(c.debe) from k c where c.sede_id=s.id and c.fecha_evento>=hoy),0) asegurado,
  coalesce((select count(*) from k c where c.sede_id=s.id and c.fecha_evento>=hoy),0) contratos_futuros,
  -- the month
  coalesce((select sum(coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)) from k c where c.sede_id=s.id and (c.created_at at time zone 'America/Bogota')::date>=ini),0)
   +coalesce((select sum(v.total) from public.ventas_vestidos v where v.sede_id=s.id and v.anulada_at is null and v.fecha>=ini),0) vendido,
  coalesce((select sum(coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)) from k c where c.sede_id=s.id and (c.created_at at time zone 'America/Bogota')::date between ini_ant and ini-1),0)
   +coalesce((select sum(v.total) from public.ventas_vestidos v where v.sede_id=s.id and v.anulada_at is null and v.fecha between ini_ant and ini-1),0) vendido_ant,
  coalesce((select count(*) from k c where c.sede_id=s.id and (c.created_at at time zone 'America/Bogota')::date>=ini),0) contratos_mes,
  coalesce((select count(*) from public.primeras_citas pc where pc.sede_id=s.id and (pc.created_at at time zone 'America/Bogota')::date>=ini and coalesce(pc.estado,'') not ilike 'cancel%' and not coalesce(pc.registrada_al_contratar,false)),0) citas_mes,
  coalesce((select (e->>'ingresos')::numeric from jsonb_array_elements(caja) e where (e->>'sede_id')::uuid=s.id),0) entro,
  coalesce((select (e->>'egresos')::numeric from jsonb_array_elements(caja) e where (e->>'sede_id')::uuid=s.id),0) salio,
  coalesce((select (e->>'egresos')::numeric from jsonb_array_elements(caja_ant) e where (e->>'sede_id')::uuid=s.id),0) salio_ant,
  coalesce((select sum(q.valor) from public.pagos_fijos_cuotas q where q.sede_id=s.id and q.estado<>'anulada' and q.vence between ini and (ini+interval '1 month'-interval '1 day')::date),0) fijos_mes,
  coalesce((select sum(q.valor) from public.pagos_fijos_cuotas q where q.sede_id=s.id and q.estado not in ('anulada','pagada') and q.vence between ini and (ini+interval '1 month'-interval '1 day')::date),0) fijos_pendientes,
  (select count(*) from public.vestidos v where v.sede_actual_id=s.id and not coalesce(v.archivado,false)) vestidos
  from s)
 select jsonb_build_object('hoy',hoy,'mes',ini,'dia_mes',extract(day from hoy)::int,'dias_mes',extract(day from (ini+interval '1 month'-interval '1 day'))::int,
  'proveedores_por_pagar',case when prov is null then null else coalesce((select sum((p->>'por_pagar')::numeric) from jsonb_array_elements(prov->'proveedores') p),0) end,
  'sedes',coalesce(jsonb_agg(to_jsonb(x) order by x.nombre),'[]'::jsonb)) into r from x;
 return r;
end $$;
revoke all on function public.tablero_ceo(uuid) from public, anon;
grant execute on function public.tablero_ceo(uuid) to authenticated;
