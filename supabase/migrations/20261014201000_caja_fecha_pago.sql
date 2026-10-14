-- pagos.fecha_pago holds the payment date at 00:00 UTC (it is a calendar date, not an instant):
-- read it in UTC so a payment is suggested on its own day and not the day before in Bogotá time.
create or replace function private.caja_dia(p_sede uuid,p_fecha date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare inicial numeric; movs jsonb; tot jsonb; cierre jsonb; sug jsonb;
begin
 if p_sede is null or p_fecha is null or not private.caja_ver(p_sede) then raise exception 'No tienes acceso a la caja de esta sede.' using errcode='42501'; end if;
 inicial:=private.caja_saldo_inicial(p_sede,p_fecha);
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'tipo',m.tipo,'categoria',m.categoria,'medio',m.medio,'valor',m.valor,'descripcion',m.descripcion,
  'contrato_id',m.contrato_id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'origen',m.origen,'comprobante_path',m.comprobante_path,
  'usuario',coalesce(u.nombre,u.email),'created_at',m.created_at,'anulado_at',m.anulado_at,'motivo_anulacion',m.motivo_anulacion,'anulado_por',coalesce(a.nombre,a.email)) order by m.created_at),'[]'::jsonb)
 into movs from public.caja_movimientos m left join public.contratos c on c.id=m.contrato_id left join public.profiles u on u.id=m.usuario_id left join public.profiles a on a.id=m.anulado_por
 where m.sede_id=p_sede and m.fecha=p_fecha;
 select jsonb_build_object(
  'ingresos',coalesce(sum(valor) filter (where tipo='ingreso'),0),'egresos',coalesce(sum(valor) filter (where tipo='egreso'),0),
  'ingresos_efectivo',coalesce(sum(valor) filter (where tipo='ingreso' and medio='Efectivo'),0),'egresos_efectivo',coalesce(sum(valor) filter (where tipo='egreso' and medio='Efectivo'),0),
  'por_medio',coalesce((select jsonb_object_agg(medio,jsonb_build_object('ingresos',i,'egresos',e)) from (select medio,sum(valor) filter (where tipo='ingreso') i,sum(valor) filter (where tipo='egreso') e from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null group by medio) x),'{}'::jsonb))
 into tot from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null;
 select to_jsonb(k)||jsonb_build_object('cerrado_por_nombre',(select coalesce(nombre,email) from public.profiles where id=k.cerrado_por)) into cierre
  from public.caja_cierres k where k.sede_id=p_sede and k.fecha=p_fecha and k.reabierto_at is null;
 select coalesce(jsonb_agg(s order by s->>'hora'),'[]'::jsonb) into sug from (
  select jsonb_build_object('origen','pago','origen_id',p.id,'tipo','ingreso','categoria','Pago de contrato','medio',case when p.medio_pago in ('Efectivo','Transferencia','Tarjeta') then p.medio_pago else '' end,
   'valor',p.valor_pagado,'contrato_id',c.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'hora',p.fecha_pago) s
  from public.pagos p join public.contratos c on c.id=p.contrato_id
  where c.sede_id=p_sede and (p.fecha_pago at time zone 'UTC')::date=p_fecha and p.valor_pagado>0
   and not exists(select 1 from public.caja_movimientos x where x.origen='pago' and x.origen_id=p.id and x.anulado_at is null)
  union all
  select jsonb_build_object('origen',case when d.tipo='ingreso' then 'deposito' else 'devolucion' end,'origen_id',d.id,'tipo',case when d.tipo='ingreso' then 'ingreso' else 'egreso' end,
   'categoria',case when d.tipo='ingreso' then 'Depósito en garantía' else 'Devolución de depósito' end,'medio',case when d.metodo in ('Efectivo','Transferencia','Tarjeta','Otro') then d.metodo else '' end,
   'valor',d.monto,'contrato_id',c.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'hora',d.created_at)
  from public.movimientos_depositos d join public.contratos c on c.id=d.contrato_id
  where c.sede_id=p_sede and (d.created_at at time zone 'America/Bogota')::date=p_fecha and d.monto>0
   and not exists(select 1 from public.caja_movimientos x where x.origen in ('deposito','devolucion') and x.origen_id=d.id and x.anulado_at is null)
 ) q;
 return jsonb_build_object('sede_id',p_sede,'fecha',p_fecha,'saldo_inicial',inicial,'movimientos',movs,'totales',tot,'cierre',cierre,'sugerencias',sug,
  'puede_operar',private.caja_operar(p_sede),'es_hoy',p_fecha=private.caja_hoy());
end $$;
