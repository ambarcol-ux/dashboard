-- Metas y Ventas: el recaudo del mes no cuenta abonos anulados (igual que el Inicio).
create or replace function private.metas_panel(p_sede uuid, p_mes integer, p_anio integer)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare limite uuid:=private.metas_sede_usuario(); ini date:=make_date(p_anio,p_mes,1); fin date; hoy date:=(now() at time zone 'America/Bogota')::date; ref date;
begin
 if auth.uid() is null or private.prov_rol() in ('','proveedor') then raise exception 'No autorizado.' using errcode='42501'; end if;
 fin:=(ini+interval '1 month -1 day')::date;
 ref:=least(greatest(hoy,ini),fin+1);
 return coalesce((select jsonb_agg(x order by x->>'sede') from (
  select jsonb_build_object('sede_id',s.id,'sede',s.nombre,'meta_id',m.id,'meta',m.monto_meta,'automatica',coalesce(m.automatica,false),
   'dias_operativos',coalesce(m.dias_operativos,private.dias_operativos(ini,fin)),'dias_calculados',private.dias_operativos(ini,fin),
   'dias_restantes',case when ref>fin then 0 else private.dias_operativos(ref,fin) end,
   'vendido',v.total,'vendido_hasta_ayer',v.hasta_ayer,'contratos',v.n,'recaudado_mes',(select coalesce(sum(p.valor_pagado),0) from public.pagos p join public.contratos c on c.id=p.contrato_id
     where c.sede_id=s.id and p.anulado_at is null and (p.fecha_pago at time zone 'UTC')::date between ini and fin and lower(coalesce(c.estado,'')) not in ('cancelado','anulado','borrador','rechazado'))) x
  from public.sedes s
  left join lateral (select * from public.metas x where x.tipo='sede' and x.mes=p_mes and x.anio=p_anio and (x.identificador_id=s.id or private.norm_nombre(x.nombre_objetivo)=private.norm_nombre(s.nombre)) order by x.identificador_id nulls last limit 1) m on true
  cross join lateral (select coalesce(sum(c.valor_total),0) total,coalesce(sum(c.valor_total) filter (where (c.created_at at time zone 'America/Bogota')::date<ref),0) hasta_ayer,count(*) n
   from public.contratos c where c.sede_id=s.id and (c.created_at at time zone 'America/Bogota')::date between ini and fin and lower(coalesce(c.estado,'')) not in ('cancelado','anulado','borrador','rechazado')) v
  where coalesce(s.activo,true) and (limite is null or s.id=limite) and (p_sede is null or s.id=p_sede)) t(x)),'[]'::jsonb);
end $function$;
