-- Accounting receives only the alert projection; its contract/inventory restrictions stay in place.
create or replace function private.vestidos_fuera_contabilidad()
returns table(id uuid,contrato_id uuid,numero_contrato text,numero_factura text,cliente_nombre text,sede text,vestido_codigo text,salida_at timestamptz,dias_fuera integer,semaforo text)
language sql stable security definer set search_path='' as $$
 select f.id,c.id,c.numero_contrato::text,c.numero_factura::text,c.cliente_nombre::text,c.sede::text,v.codigo::text,f.salida_at,
 greatest(1,((now() at time zone 'America/Bogota')::date-(f.salida_at at time zone 'America/Bogota')::date))::integer,
 case when ((now() at time zone 'America/Bogota')::date-(f.salida_at at time zone 'America/Bogota')::date)>=5 then 'ALERTA' else 'NORMAL' end
 from public.vestidos_fuera_tienda f join public.contratos c on c.id=f.contrato_id join public.vestidos v on v.id=f.vestido_id
 where f.regreso_at is null and auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.activo is true and lower(p.rol)='contabilidad') order by f.salida_at;
$$;

revoke all on function private.vestidos_fuera_contabilidad() from public,anon;
grant execute on function private.vestidos_fuera_contabilidad() to authenticated;
create or replace function public.vestidos_fuera_activos()
returns table(id uuid,contrato_id uuid,numero_contrato text,numero_factura text,cliente_nombre text,sede text,vestido_codigo text,salida_at timestamptz,dias_fuera integer,semaforo text)
language sql stable security invoker set search_path='' as $$
 select f.id,c.id,c.numero_contrato::text,c.numero_factura::text,c.cliente_nombre::text,c.sede::text,v.codigo::text,f.salida_at,
 greatest(1,((now() at time zone 'America/Bogota')::date-(f.salida_at at time zone 'America/Bogota')::date))::integer,
 case when ((now() at time zone 'America/Bogota')::date-(f.salida_at at time zone 'America/Bogota')::date)>=5 then 'ALERTA' else 'NORMAL' end
 from public.vestidos_fuera_tienda f join public.contratos c on c.id=f.contrato_id join public.vestidos v on v.id=f.vestido_id
 where f.regreso_at is null and private.acceso_deposito(c.id) and not private.es_contabilidad()
 union all select * from private.vestidos_fuera_contabilidad() order by 8,1;
$$;
revoke all on function public.vestidos_fuera_activos() from public,anon;
grant execute on function public.vestidos_fuera_activos() to authenticated;


notify pgrst, 'reload schema';
