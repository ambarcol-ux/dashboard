-- Ámbar Exitoso · datos limpios: a purchase of dresses registered from Gastos («Compra de vestidos para inventario», documento soporte
-- de productos) also records what each dress cost: the purchase value split evenly among the dresses (the last one takes the
-- rounding), only on dresses that still have no cost. The cost change goes to the dress history (bitacora_vestidos).
-- Reversible: restore public.siigo_registrar_gasto from 20270414120000_siigo_envio.sql.

create or replace function public.siigo_registrar_gasto(p_gasto uuid, p_tipo text, p_proveedor_documento text, p_proveedor_nombre text, p_factura_numero text, p_vestidos text[] default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare g public.gastos; nit text:=regexp_replace(coalesce(p_proveedor_documento,''),'\D','','g'); items jsonb; d uuid; n int; cada numeric; i int:=0; v record;
begin
 select * into g from public.gastos where id=p_gasto;
 if g.id is null or not (public.es_admin() or private.es_finanzas() or private.caja_operar(g.sede_id)) then raise exception 'Gasto no disponible.' using errcode='42501'; end if;
 if g.anulado_at is not null then raise exception 'El gasto está anulado.'; end if;
 if private.siigo_param(g.sede_id) is null then raise exception 'La sede no tiene Siigo configurado.'; end if;
 if p_tipo not in ('gasto','soporte_gasto','soporte_producto') then raise exception 'Elige qué documento entregó el proveedor.'; end if;
 if length(nit)<5 then raise exception 'Escribe el NIT o cédula del proveedor.'; end if;
 if p_tipo='gasto' and length(btrim(coalesce(p_factura_numero,'')))=0 then raise exception 'Escribe el número de la factura electrónica.'; end if;
 if p_tipo='soporte_producto' then
  select jsonb_agg(jsonb_build_object('vestido_id',v.id,'codigo',v.codigo,'descripcion',concat_ws(' · ',v.codigo,v.nombre),'cantidad',1)) into items
  from public.vestidos v where v.sede_actual_id=g.sede_id and upper(btrim(v.codigo))=any(select upper(btrim(x)) from unnest(p_vestidos) x);
  if items is null then raise exception 'Escribe los códigos de los vestidos comprados (de esta sede).'; end if;
 end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por)
 values(g.sede_id,p_tipo,'gasto',g.id,jsonb_build_object('valor',g.valor,'medio',g.medio,'fecha',g.fecha,'categoria',g.categoria,'descripcion',coalesce(g.descripcion,g.categoria),
  'proveedor',jsonb_build_object('documento',nit,'nombre',coalesce(nullif(btrim(p_proveedor_nombre),''),g.beneficiario)),'factura_numero',nullif(btrim(p_factura_numero),''),'vestidos',items),auth.uid())
 returning id into d;
 -- The purchase gives each dress its cost (only dresses still without cost).
 if p_tipo='soporte_producto' then
  n:=jsonb_array_length(items); cada:=floor(g.valor/n);
  for v in select (x->>'vestido_id')::uuid id,x->>'codigo' codigo from jsonb_array_elements(items) x loop
   i:=i+1;
   update public.vestidos set costo_compra=case when i=n then g.valor-cada*(n-1) else cada end where id=v.id and costo_compra is null;
   if found then insert into public.bitacora_vestidos(vestido_id,accion,detalle) values(v.id,'Costo registrado',format('Costo %s desde la compra de vestidos (gasto del %s).',case when i=n then g.valor-cada*(n-1) else cada end,g.fecha)); end if;
  end loop;
 end if;
 return d;
exception when unique_violation then raise exception 'Este gasto ya se registró para Siigo.';
end $$;
