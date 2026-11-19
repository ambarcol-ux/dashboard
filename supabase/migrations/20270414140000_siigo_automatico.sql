-- Siigo automático: ventas y contratos (desde que la sede activa «automatico» en sus parámetros) entran solos a public.siigo_documentos
-- y la tarea siigo-facturacion (cada 10 min) los envía con /api/siigo/procesar. Nada creado antes de parametros.auto_desde se factura.
-- Un contrato o venta que ya tiene un número completo de Siigo (FV-n-n) se deja igual.
-- Reversa: select cron.unschedule('siigo-facturacion'); drop function private.siigo_encolar_automatico(); drop function public.siigo_encolar_automatico();

create or replace function private.siigo_encolar_automatico() returns integer
language plpgsql security definer set search_path='' as $$
declare cfg record; s public.ventas_vestidos; c public.contratos; v public.vestidos; n int:=0;
 total numeric; pagado numeric; items jsonb; k int; pagos jsonb; v_tipo text;
begin
 for cfg in select cs.sede_id,cs.parametros p,(cs.parametros->>'auto_desde')::timestamptz desde from private.credenciales_siigo cs
  where cs.activo and nullif(cs.access_key,'') is not null and cs.parametros->>'automatico'='true' and cs.parametros ? 'auto_desde' loop
  -- Dress sales.
  v_tipo:=coalesce(nullif(cfg.p->>'factura_ventas',''),'electronica');
  for s in select x.* from public.ventas_vestidos x where x.sede_id=cfg.sede_id and x.estado='registrada' and x.created_at>=cfg.desde
    and coalesce(x.numero_factura,'') !~ '^[A-Za-z]+-[0-9]+-[0-9]+$'
    and not exists(select 1 from public.siigo_documentos d where d.tipo='factura' and d.origen='venta' and d.origen_id=x.id) loop
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
  -- Contracts once signed (not drafts or cancelled), with the client's document; payments come from the cash register.
  v_tipo:=coalesce(nullif(cfg.p->>'factura_contratos',''),nullif(cfg.p->>'factura_ventas',''),'electronica');
  for c in select x.* from public.contratos x where x.sede_id=cfg.sede_id and x.created_at>=cfg.desde
    and lower(coalesce(x.estado,'')) not in ('borrador','pendiente_admin','cancelado','cancelada','anulado','anulada','rechazado')
    and coalesce(x.numero_factura,'') !~ '^[A-Za-z]+-[0-9]+-[0-9]+$'
    and length(regexp_replace(coalesce(x.cliente_documento,''),'\D','','g'))>=5
    -- Waits for the first payment in the cash register (or 12 h) so the invoice carries what was actually paid.
    and (x.created_at<now()-interval '12 hours' or exists(select 1 from public.caja_movimientos m where m.contrato_id=x.id and m.tipo='ingreso' and m.anulado_at is null))
    and not exists(select 1 from public.siigo_documentos d where d.tipo='factura' and d.contrato_id=x.id and d.estado<>'anulado') loop
   total:=coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.descuento_plan_ahorro,0);
   continue when total<=0;
   -- Same item split as public.siigo_facturar_contrato.
   with vv as (select distinct x.id,x.codigo,x.nombre from public.vestidos x where x.id in (select i.vestido_id from public.contrato_items_vestidos i where i.contrato_id=c.id and i.vestido_id is not null union select c.vestido_id where c.vestido_id is not null)),
    r as (select vv.*,row_number() over (order by vv.codigo) kk,count(*) over () m from vv)
   select jsonb_agg(jsonb_build_object('vestido_id',r.id,'codigo',r.codigo,'descripcion',concat_ws(' · ',r.codigo,r.nombre,'contrato '||c.numero_contrato),'cantidad',1,
     'precio',case when r.kk=r.m then coalesce(c.valor_total,0)-coalesce(c.descuento_plan_ahorro,0)-floor((coalesce(c.valor_total,0)-coalesce(c.descuento_plan_ahorro,0))/r.m)*(r.m-1) else floor((coalesce(c.valor_total,0)-coalesce(c.descuento_plan_ahorro,0))/r.m) end) order by r.kk),count(*)
    into items,k from r;
   continue when coalesce(k,0)=0;
   if coalesce(c.total_arreglos,0)>0 then items:=items||jsonb_build_array(jsonb_build_object('generico',true,'descripcion','Arreglos contrato '||c.numero_contrato,'cantidad',1,'precio',c.total_arreglos)); end if;
   select coalesce(jsonb_agg(jsonb_build_object('medio',medio,'valor',v2) order by medio),'[]'::jsonb),coalesce(sum(v2),0) into pagos,pagado
    from (select coalesce(nullif(m.medio,''),'Otro') medio,sum(m.valor) v2 from public.caja_movimientos m
     where m.contrato_id=c.id and m.tipo='ingreso' and m.anulado_at is null group by 1) z;
   pagado:=least(total,pagado);
   insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos)
   values(c.sede_id,'factura','contrato',c.id,c.id,jsonb_build_object('tipo_factura',v_tipo,'tipo_venta','alquiler','forma_pago','Otro','pagos',pagos,
     'fecha',(now() at time zone 'America/Bogota')::date,'cliente',private.siigo_cliente(c),'items',items,'total',total,'pagado',pagado,'saldo',total-pagado,
     'vence',greatest((now() at time zone 'America/Bogota')::date,coalesce(c.fecha_evento,(now() at time zone 'America/Bogota')::date)),'numero_contrato',c.numero_contrato,
     'asesora',coalesce(c.nombre_asesora,c.asesora),'fecha_entrega',c.fecha_entrega_evento))
   on conflict (tipo,origen,origen_id) do nothing;
   n:=n+1;
  end loop;
 end loop;
 return n;
end $$;
revoke all on function private.siigo_encolar_automatico() from public, anon, authenticated;
create or replace function public.siigo_encolar_automatico() returns integer language sql security definer set search_path='' as $$ select private.siigo_encolar_automatico(); $$;
revoke all on function public.siigo_encolar_automatico() from public, anon, authenticated;
grant execute on function public.siigo_encolar_automatico() to service_role;

select cron.schedule('siigo-facturacion','*/10 * * * *',$cron$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/siigo/procesar',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=55000)
$cron$);

-- Contract form: with automatic billing the invoice number is optional (Siigo fills it). Reversa: drop function public.siigo_sede_automatica(uuid);
create or replace function public.siigo_sede_automatica(p_sede_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.credenciales_siigo c where c.sede_id=p_sede_id and c.activo and nullif(c.access_key,'') is not null and c.parametros->>'automatico'='true');
$$;
revoke all on function public.siigo_sede_automatica(uuid) from public, anon;
grant execute on function public.siigo_sede_automatica(uuid) to authenticated;
