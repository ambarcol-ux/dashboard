-- Alertas exactas: la agenda cuenta solo fechas de contratos (lo que muestra el Calendario) y las primeras citas van aparte;
-- lista de vestidos con mantenimiento demorado (+7 días) para abrir Inventario filtrado. Solo lectura.
-- Reversión: volver a aplicar 20261227120000_alertas_inicio_sede.sql; drop function public.vestidos_mantenimiento_demorado(uuid), private.vestidos_mantenimiento_demorado(uuid);
do $$
declare d text; antes text;
begin
 d:=pg_get_functiondef('private.alertas_inicio_sede(uuid)'::regprocedure); antes:=d;
 d:=replace(d,$x$and hoy in (c.fecha_cita_medidas,c.fecha_prueba_final,c.fecha_entrega_envio,c.fecha_pre_xv))
    +(select count(*) from public.primeras_citas p where (lim is null or p.sede_id=any(lim)) and p.fecha=hoy and p.estado in ('agendada','confirmada')),$x$,
  $x$and hoy in (c.fecha_cita_medidas,c.fecha_prueba_final,c.fecha_entrega_envio,c.fecha_pre_xv)),
  'citas_hoy',(select count(*) from public.primeras_citas p where (lim is null or p.sede_id=any(lim)) and p.fecha=hoy and p.estado in ('agendada','confirmada')),$x$);
 d:=replace(d,$x$and hoy+1 in (c.fecha_cita_medidas,c.fecha_prueba_final,c.fecha_entrega_envio,c.fecha_pre_xv))
    +(select count(*) from public.primeras_citas p where (lim is null or p.sede_id=any(lim)) and p.fecha=hoy+1 and p.estado in ('agendada','confirmada')),$x$,
  $x$and hoy+1 in (c.fecha_cita_medidas,c.fecha_prueba_final,c.fecha_entrega_envio,c.fecha_pre_xv)),$x$);
 if d=antes or position('''citas_hoy''' in d)=0 or position('p.fecha=hoy+1' in d)>0 then raise exception 'alertas_inicio_sede: no se encontró el texto a reemplazar'; end if;
 execute d;
end $$;

create or replace function private.vestidos_mantenimiento_demorado(p_sede uuid default null)
 returns jsonb language sql stable security definer set search_path to ''
as $function$
 select coalesce(jsonb_agg(jsonb_build_object('vestido_id',x.vestido_id,'codigo',x.codigo,'dias',x.dias) order by x.dias desc),'[]'::jsonb) from (
  select v.id vestido_id,v.codigo,((now() at time zone 'America/Bogota')::date-min(m.fecha_entrada::date)) dias
  from public.mantenimiento_bitacora m join public.vestidos v on v.id=m.vestido_id
  where auth.uid() is not null and not coalesce(m.completado,false) and lower(coalesce(m.estado,'')) not in ('finalizado','completado','cancelado') and not coalesce(v.archivado,false)
   and (private.sedes_limitadas() is null or v.sede_actual_id=any(private.sedes_limitadas())) and (p_sede is null or v.sede_actual_id=p_sede)
   and (m.fecha_salida_estimada::date<(now() at time zone 'America/Bogota')::date or m.fecha_entrada::date<=(now() at time zone 'America/Bogota')::date-7)
  group by v.id,v.codigo) x;
$function$;
create or replace function public.vestidos_mantenimiento_demorado(p_sede uuid default null) returns jsonb language sql stable set search_path to '' as $function$ select private.vestidos_mantenimiento_demorado(p_sede); $function$;
revoke all on function private.vestidos_mantenimiento_demorado(uuid), public.vestidos_mantenimiento_demorado(uuid) from public, anon;
grant execute on function private.vestidos_mantenimiento_demorado(uuid), public.vestidos_mantenimiento_demorado(uuid) to authenticated;
