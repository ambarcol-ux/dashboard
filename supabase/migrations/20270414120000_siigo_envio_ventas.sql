-- Siigo: parámetros de facturación por sede y ventas de vestidos a la cola public.siigo_documentos.
-- Reutiliza private.credenciales_siigo.parametros y public.siigo_documentos (ya en producción). Solo aditivo.
-- Reversa: drop function public.siigo_parametros(uuid,jsonb); drop function public.siigo_facturar_venta(uuid,text);

-- Read (and, with p_parametros, replace) the billing parameters of a site. Admin only.
create or replace function public.siigo_parametros(p_sede_id uuid, p_parametros jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 if not public.es_admin() then raise exception 'Solo administración configura la facturación.' using errcode='42501'; end if;
 if p_parametros is not null then
  if jsonb_typeof(p_parametros)<>'object' or length(p_parametros::text)>4000 then raise exception 'Parámetros no válidos.'; end if;
  update private.credenciales_siigo set parametros=p_parametros,updated_at=now(),updated_by=auth.uid() where sede_id=p_sede_id;
  if not found then raise exception 'Primero guarda las credenciales de Siigo de esta sede.'; end if;
 end if;
 select parametros into r from private.credenciales_siigo where sede_id=p_sede_id;
 return coalesce(r,'{}'::jsonb);
end $$;
revoke all on function public.siigo_parametros(uuid,jsonb) from public, anon;
grant execute on function public.siigo_parametros(uuid,jsonb) to authenticated;

-- Queue a dress sale as a Siigo invoice (or return the one already queued, to retry it).
create or replace function public.siigo_facturar_venta(p_venta uuid, p_tipo_factura text default 'electronica') returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.ventas_vestidos; v public.vestidos; d public.siigo_documentos;
begin
 select * into s from public.ventas_vestidos where id=p_venta for update;
 if s.id is null or not (public.es_admin() or private.es_finanzas() or private.caja_operar(s.sede_id)) then raise exception 'Venta no disponible.' using errcode='42501'; end if;
 if s.estado<>'registrada' then raise exception 'La venta está anulada.'; end if;
 if p_tipo_factura not in ('electronica','ingreso') then raise exception 'Elige factura electrónica o factura de ingreso.'; end if;
 select * into d from public.siigo_documentos where tipo='factura' and origen='venta' and origen_id=s.id;
 if d.id is not null then
  if d.estado='enviado' then raise exception 'Esta venta ya tiene factura en Siigo: %.',coalesce(d.siigo_numero,'enviada'); end if;
  if d.estado='anulado' then raise exception 'La factura de esta venta fue anulada en el ERP.'; end if;
  return jsonb_build_object('id',d.id,'total',s.total);
 end if;
 select * into v from public.vestidos where id=s.vestido_id;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por)
 values(s.sede_id,'factura','venta',s.id,jsonb_build_object('tipo_factura',p_tipo_factura,'tipo_venta','venta','forma_pago',s.medio_pago,'fecha',s.fecha,
   'cliente',jsonb_build_object('nombre',s.cliente_nombre,'documento',regexp_replace(s.cliente_documento,'\D','','g'),'tipo_documento','CC','email',s.cliente_email,
     'telefono',right(regexp_replace(coalesce(s.cliente_telefono,''),'\D','','g'),10),'direccion',null),
   'items',jsonb_build_array(jsonb_build_object('vestido_id',v.id,'codigo',s.codigo_siigo,'descripcion',concat_ws(' · ','Venta vestido',v.codigo,v.nombre),'cantidad',1,'precio',s.total)),
   'total',s.total,'pagado',s.total,'saldo',0,'vence',s.fecha,'venta',s.consecutivo),auth.uid())
 returning * into d;
 update public.ventas_vestidos set siigo_estado='pendiente' where id=s.id;
 return jsonb_build_object('id',d.id,'total',s.total);
end $$;
revoke all on function public.siigo_facturar_venta(uuid,text) from public, anon;
grant execute on function public.siigo_facturar_venta(uuid,text) to authenticated;

-- The server also reads the site's parameters (same signature; one more key). Reversa: quitar 'parametros' del objeto.
create or replace function public.siigo_credencial_servidor(p_sede_id uuid) returns jsonb language sql security definer set search_path to ''
as $function$ select jsonb_build_object('usuario_api',usuario_api,'access_key',access_key,'partner_id',partner_id,'producto_codigo',producto_codigo,'producto_nombre',producto_nombre,'parametros',parametros) from private.credenciales_siigo where sede_id=p_sede_id and activo limit 1 $function$;
