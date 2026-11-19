-- Siigo automático: si cambia el valor, los arreglos o los vestidos de un contrato ya facturado, su factura se vuelve a enviar
-- como edición (PUT, mismo número). Los documentos aún sin enviar se recalculan con los datos actuales del contrato.
-- Reversa: volver private.siigo_encolar_automatico a 20270414140000_siigo_automatico.sql; drop function private.siigo_datos_contrato(public.contratos,text);

-- Invoice data of a contract as it is now (items split like public.siigo_facturar_contrato; payments from the cash register).
create or replace function private.siigo_datos_contrato(c public.contratos, p_tipo text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare total numeric:=coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.descuento_plan_ahorro,0); items jsonb; k int; pagos jsonb; pagado numeric; hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if total<=0 then return null; end if;
 with vv as (select distinct x.id,x.codigo,x.nombre from public.vestidos x where x.id in (select i.vestido_id from public.contrato_items_vestidos i where i.contrato_id=c.id and i.vestido_id is not null union select c.vestido_id where c.vestido_id is not null)),
  r as (select vv.*,row_number() over (order by vv.codigo) kk,count(*) over () m from vv)
 select jsonb_agg(jsonb_build_object('vestido_id',r.id,'codigo',r.codigo,'descripcion',concat_ws(' · ',r.codigo,r.nombre,'contrato '||c.numero_contrato),'cantidad',1,
   'precio',case when r.kk=r.m then coalesce(c.valor_total,0)-coalesce(c.descuento_plan_ahorro,0)-floor((coalesce(c.valor_total,0)-coalesce(c.descuento_plan_ahorro,0))/r.m)*(r.m-1) else floor((coalesce(c.valor_total,0)-coalesce(c.descuento_plan_ahorro,0))/r.m) end) order by r.kk),count(*)
  into items,k from r;
 if coalesce(k,0)=0 then return null; end if;
 if coalesce(c.total_arreglos,0)>0 then items:=items||jsonb_build_array(jsonb_build_object('generico',true,'descripcion','Arreglos contrato '||c.numero_contrato,'cantidad',1,'precio',c.total_arreglos)); end if;
 select coalesce(jsonb_agg(jsonb_build_object('medio',medio,'valor',v2) order by medio),'[]'::jsonb),coalesce(sum(v2),0) into pagos,pagado
  from (select coalesce(nullif(m.medio,''),'Otro') medio,sum(m.valor) v2 from public.caja_movimientos m
   where m.contrato_id=c.id and m.tipo='ingreso' and m.anulado_at is null group by 1) z;
 pagado:=least(total,pagado);
 return jsonb_build_object('tipo_factura',p_tipo,'tipo_venta','alquiler','forma_pago','Otro','pagos',pagos,'fecha',hoy,'cliente',private.siigo_cliente(c),'items',items,
  'total',total,'pagado',pagado,'saldo',total-pagado,'vence',greatest(hoy,coalesce(c.fecha_evento,hoy)),'numero_contrato',c.numero_contrato,
  'asesora',coalesce(c.nombre_asesora,c.asesora),'fecha_entrega',c.fecha_entrega_evento);
end $$;
revoke all on function private.siigo_datos_contrato(public.contratos,text) from public, anon, authenticated;

create or replace function private.siigo_encolar_automatico() returns integer
language plpgsql security definer set search_path='' as $$
declare cfg record; s public.ventas_vestidos; c public.contratos; v public.vestidos; d public.siigo_documentos; n int:=0; v_tipo text; nuevo jsonb;
begin
 for cfg in select cs.sede_id,cs.parametros p,(cs.parametros->>'auto_desde')::timestamptz desde from private.credenciales_siigo cs
  where cs.activo and nullif(cs.access_key,'') is not null and cs.parametros->>'automatico'='true' and cs.parametros ? 'auto_desde' loop
  -- Dress sales.
  v_tipo:=coalesce(nullif(cfg.p->>'factura_ventas',''),'electronica');
  for s in select x.* from public.ventas_vestidos x where x.sede_id=cfg.sede_id and x.estado='registrada' and x.created_at>=cfg.desde
    and coalesce(x.numero_factura,'') !~ '^[A-Za-z]+-[0-9]+-[0-9]+$'
    and not exists(select 1 from public.siigo_documentos d2 where d2.tipo='factura' and d2.origen='venta' and d2.origen_id=x.id) loop
   select * into v from public.vestidos where id=s.vestido_id;
   insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos)
   values(s.sede_id,'factura','venta',s.id,jsonb_build_object('tipo_factura',v_tipo,'tipo_venta','venta','forma_pago',s.medio_pago,'fecha',s.fecha,
     'cliente',jsonb_build_object('nombre',s.cliente_nombre,'documento',regexp_replace(s.cliente_documento,'\D','','g'),'tipo_documento','CC','email',s.cliente_email,
       'telefono',right(regexp_replace(coalesce(s.cliente_telefono,''),'\D','','g'),10),'direccion',null),
     'items',jsonb_build_array(jsonb_build_object('vestido_id',v.id,'codigo',s.codigo_siigo,'descripcion',concat_ws(' · ','Venta vestido',v.codigo,v.nombre),'cantidad',1,'precio',s.total)),
     'total',s.total,'pagado',s.total,'saldo',0,'vence',s.fecha,'venta',s.consecutivo));
   update public.ventas_vestidos set siigo_estado='pendiente' where id=s.id;
   n:=n+1;
  end loop;
  v_tipo:=coalesce(nullif(cfg.p->>'factura_contratos',''),nullif(cfg.p->>'factura_ventas',''),'electronica');
  -- New signed contracts (with their first payment in the cash register, or 12 h later).
  for c in select x.* from public.contratos x where x.sede_id=cfg.sede_id and x.created_at>=cfg.desde
    and lower(coalesce(x.estado,'')) not in ('borrador','pendiente_admin','cancelado','cancelada','anulado','anulada','rechazado')
    and coalesce(x.numero_factura,'') !~ '^[A-Za-z]+-[0-9]+-[0-9]+$'
    and length(regexp_replace(coalesce(x.cliente_documento,''),'\D','','g'))>=5
    and (x.created_at<now()-interval '12 hours' or exists(select 1 from public.caja_movimientos m where m.contrato_id=x.id and m.tipo='ingreso' and m.anulado_at is null))
    and not exists(select 1 from public.siigo_documentos d2 where d2.tipo='factura' and d2.contrato_id=x.id and d2.estado<>'anulado') loop
   nuevo:=private.siigo_datos_contrato(c,v_tipo);
   continue when nuevo is null;
   insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos) values(c.sede_id,'factura','contrato',c.id,c.id,nuevo)
   on conflict (tipo,origen,origen_id) do nothing;
   n:=n+1;
  end loop;
  -- Contracts already queued: unsent ones take the current data; sent ones whose value, extras or dresses changed are sent again as an edit.
  for d in select x.* from public.siigo_documentos x where x.sede_id=cfg.sede_id and x.tipo='factura' and x.origen='contrato' and x.estado in ('pendiente','error','enviado') loop
   select * into c from public.contratos where id=d.contrato_id;
   continue when c.id is null;
   nuevo:=private.siigo_datos_contrato(c,coalesce(d.datos->>'tipo_factura',v_tipo));
   continue when nuevo is null;
   if d.estado='enviado' then
    continue when (nuevo->'total')=(d.datos->'total') and (nuevo->'items')=(d.datos->'items');
    nuevo:=nuevo||jsonb_build_object('fecha',d.datos->'fecha','actualizar',true);
    update public.siigo_documentos set datos=nuevo,estado='pendiente',intentos=0,error=null,updated_at=now() where id=d.id;
    n:=n+1;
   elsif (nuevo-'fecha'-'vence')<>(d.datos-'fecha'-'vence'-'actualizar') then
    update public.siigo_documentos set datos=nuevo||case when d.datos ? 'actualizar' then jsonb_build_object('fecha',d.datos->'fecha','actualizar',true) else '{}'::jsonb end,updated_at=now() where id=d.id;
   end if;
  end loop;
 end loop;
 return n;
end $$;
