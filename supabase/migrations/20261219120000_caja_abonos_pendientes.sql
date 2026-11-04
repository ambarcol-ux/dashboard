-- Cierres de caja: abonos de contratos que aún no pasan a la caja (mismas reglas que las sugerencias del día).
create or replace function private.caja_abonos_pendientes()
 returns jsonb language sql stable security definer set search_path to ''
as $function$
 select coalesce(jsonb_agg(jsonb_build_object('sede_id',s.id,'sede',s.nombre,'fecha',(p.fecha_pago at time zone 'UTC')::date,
   'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'valor',p.valor_pagado,'medio',p.medio_pago,
   'cerrado',private.caja_dia_cerrado(s.id,(p.fecha_pago at time zone 'UTC')::date)) order by s.nombre,p.fecha_pago),'[]'::jsonb)
 from public.pagos p join public.contratos c on c.id=p.contrato_id join public.sedes s on s.id=c.sede_id
 where s.activo is true and private.caja_ver(s.id) and p.valor_pagado>0 and p.anulado_at is null
  and (private.caja_inicio(s.id) is null or (p.fecha_pago at time zone 'UTC')::date>=private.caja_inicio(s.id))
  and (p.fecha_pago at time zone 'UTC')::date<=private.caja_hoy()
  and not exists(select 1 from public.caja_movimientos x where x.origen='pago' and x.origen_id=p.id and x.anulado_at is null);
$function$;
create or replace function public.caja_abonos_pendientes()
 returns jsonb language sql stable set search_path to ''
as $function$ select private.caja_abonos_pendientes(); $function$;
revoke all on function public.caja_abonos_pendientes() from public, anon;
grant execute on function public.caja_abonos_pendientes() to authenticated;
revoke all on function private.caja_abonos_pendientes() from public, anon;
grant execute on function private.caja_abonos_pendientes() to authenticated;
