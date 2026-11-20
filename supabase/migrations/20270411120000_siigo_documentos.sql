-- Siigo por sede: the ERP prepares every accounting document of the rental procedure and a worker sends it with each store's
-- credentials (Configuración › Facturación por sede). Until the API credentials exist, documents wait as «pendiente».
--  · factura           : from the contract (electrónica or de ingreso; alquiler or venta; forma de pago). One item per dress
--                        (Siigo product = dress code, so the inventory moves); paid so far as contado, the rest as crédito.
--  · recibo_caja       : each abono after the invoice (Abono / Pago factura) lowers the invoice balance.
--  · anticipo          : the deposit (garantía) when the dress leaves, only for the invoice's customer.
--  · devolucion_anticipo: comprobante contable, débito 2805 / crédito caja (1105) or bank per payment method.
--  · gasto / soporte_gasto / soporte_producto: purchases by the document the supplier gives (factura electrónica, cuenta de cobro,
--    compra de vestidos).
-- History: private.config_historial(). Reversible: drop the triggers siigo_pago_recibo, siigo_deposito_documento, the functions
--   private.siigo_*, public.siigo_*, the table public.siigo_documentos, the column private.credenciales_siigo.parametros and
--   select cron.unschedule('siigo-enviar').

alter table private.credenciales_siigo add column if not exists parametros jsonb not null default '{}'::jsonb;

create table if not exists public.siigo_documentos(
 id uuid primary key default gen_random_uuid(),
 sede_id uuid not null references public.sedes(id),
 tipo text not null check (tipo in ('factura','recibo_caja','anticipo','devolucion_anticipo','gasto','soporte_gasto','soporte_producto')),
 origen text not null,
 origen_id uuid not null,
 contrato_id uuid references public.contratos(id),
 factura_id uuid references public.siigo_documentos(id),
 datos jsonb not null default '{}'::jsonb,
 estado text not null default 'pendiente' check (estado in ('pendiente','enviado','error','anulado')),
 intentos integer not null default 0,
 error text,
 siigo_id text,
 siigo_numero text,
 respuesta jsonb,
 enviado_at timestamptz,
 creado_por uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (tipo, origen, origen_id)
);
create index if not exists siigo_documentos_cola on public.siigo_documentos(estado, created_at) where estado in ('pendiente','error');
create index if not exists siigo_documentos_contrato on public.siigo_documentos(contrato_id);
alter table public.siigo_documentos enable row level security;
create policy siigo_documentos_ver on public.siigo_documentos for select to authenticated
 using (public.es_admin() or private.es_finanzas() or private.caja_operar(sede_id));
create trigger siigo_documentos_historial after insert or update or delete on public.siigo_documentos for each row execute function private.config_historial();

-- Customer of a contract (national customers).
create or replace function private.siigo_cliente(c public.contratos) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('nombre',btrim(coalesce(c.cliente_nombre,'')),'documento',regexp_replace(coalesce(c.cliente_documento,''),'\D','','g'),
  'tipo_documento',coalesce(nullif(c.tipo_documento_cliente,''),'CC'),'email',c.cliente_email,'telefono',right(regexp_replace(coalesce(c.cliente_whatsapp,c.whatsapp,''),'\D','','g'),10),
  'direccion',coalesce(nullif(c.cliente_direccion,''),c.direccion));
$$;

-- Invoice from the contract.
create or replace function public.siigo_facturar_contrato(p_contrato uuid, p_tipo_factura text, p_tipo_venta text, p_forma_pago text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.contratos; total numeric; pagado numeric; saldo numeric; items jsonb; n int; d public.siigo_documentos;
begin
 select * into c from public.contratos where id=p_contrato for update;
 if c.id is null or not (public.es_admin() or private.es_finanzas() or private.caja_operar(c.sede_id)) then raise exception 'Contrato no disponible.' using errcode='42501'; end if;
 if p_tipo_factura not in ('electronica','ingreso') then raise exception 'Elige factura electrónica o factura de ingreso.'; end if;
 if p_tipo_venta not in ('alquiler','venta') then raise exception 'Elige venta o servicio de alquiler.'; end if;
 if length(btrim(coalesce(p_forma_pago,'')))=0 then raise exception 'Elige la forma de pago.'; end if;
 if length(regexp_replace(coalesce(c.cliente_documento,''),'\D','','g'))<5 then raise exception 'El contrato no tiene documento del cliente: complétalo antes de facturar.'; end if;
 if exists(select 1 from public.siigo_documentos where tipo='factura' and contrato_id=c.id and estado<>'anulado') then raise exception 'Este contrato ya tiene factura en Siigo.'; end if;
 total:=coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.descuento_plan_ahorro,0);
 pagado:=greatest(0,least(total,coalesce(c.anticipo,0)-coalesce(c.descuento_plan_ahorro,0)));
 saldo:=total-pagado;
 if total<=0 then raise exception 'El contrato no tiene valor para facturar.'; end if;
 -- One line per dress (its code is the Siigo product), the dresses' value split evenly; arreglos as a service line.
 with v as (select distinct x.id,x.codigo,x.nombre from public.vestidos x where x.id in (select i.vestido_id from public.contrato_items_vestidos i where i.contrato_id=c.id and i.vestido_id is not null union select c.vestido_id where c.vestido_id is not null)),
  r as (select v.*,row_number() over (order by v.codigo) k,count(*) over () m from v)
 select jsonb_agg(jsonb_build_object('vestido_id',r.id,'codigo',r.codigo,'descripcion',concat_ws(' · ',r.codigo,r.nombre,'contrato '||c.numero_contrato),'cantidad',1,
   'precio',case when r.k=r.m then coalesce(c.valor_total,0)-coalesce(c.descuento_plan_ahorro,0)-floor((coalesce(c.valor_total,0)-coalesce(c.descuento_plan_ahorro,0))/r.m)*(r.m-1) else floor((coalesce(c.valor_total,0)-coalesce(c.descuento_plan_ahorro,0))/r.m) end) order by r.k),count(*)
  into items,n from r;
 if coalesce(n,0)=0 then raise exception 'El contrato no tiene vestidos con código de inventario.'; end if;
 if coalesce(c.total_arreglos,0)>0 then items:=items||jsonb_build_array(jsonb_build_object('generico',true,'descripcion','Arreglos contrato '||c.numero_contrato,'cantidad',1,'precio',c.total_arreglos)); end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,creado_por)
 values(c.sede_id,'factura','contrato',c.id,c.id,jsonb_build_object('tipo_factura',p_tipo_factura,'tipo_venta',p_tipo_venta,'forma_pago',p_forma_pago,
   'fecha',(now() at time zone 'America/Bogota')::date,'cliente',private.siigo_cliente(c),'items',items,'total',total,'pagado',pagado,'saldo',saldo,
   'vence',coalesce(c.fecha_evento,(now() at time zone 'America/Bogota')::date),'numero_contrato',c.numero_contrato),auth.uid())
 returning * into d;
 return jsonb_build_object('id',d.id,'total',total,'pagado',pagado,'saldo',saldo);
end $$;

-- Siigo documents of a contract and its pending balance (for the payment page).
create or replace function public.siigo_contrato(p_contrato uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('saldo',coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.anticipo,0),
  'configurada',exists(select 1 from private.credenciales_siigo s where s.sede_id=c.sede_id and s.activo and nullif(s.access_key,'') is not null),
  'documentos',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'tipo',d.tipo,'estado',d.estado,'numero',d.siigo_numero,'error',d.error,'valor',coalesce(d.datos->>'total',d.datos->>'valor'),'fecha',d.created_at) order by d.created_at) from public.siigo_documentos d where d.contrato_id=c.id),'[]'::jsonb))
 from public.contratos c where c.id=p_contrato and (public.es_admin() or private.es_finanzas() or private.caja_operar(c.sede_id));
$$;

-- Each abono after the invoice → recibo de caja (Abono / Pago factura). Annulled while still pending → not sent.
create or replace function private.siigo_pago_recibo() returns trigger
language plpgsql security definer set search_path='' as $$
declare f public.siigo_documentos; c public.contratos;
begin
 if tg_op='UPDATE' then
  if new.anulado_at is not null and old.anulado_at is null then
   update public.siigo_documentos set estado='anulado',error='Abono anulado en el ERP antes de enviarse.',updated_at=now() where tipo='recibo_caja' and origen='pago' and origen_id=new.id and estado in ('pendiente','error');
   update public.siigo_documentos set error='Abono anulado en el ERP: anula también el recibo en Siigo.',updated_at=now() where tipo='recibo_caja' and origen='pago' and origen_id=new.id and estado='enviado';
  end if;
  return new;
 end if;
 if new.anulado_at is not null or coalesce(new.valor_pagado,0)<=0 then return new; end if;
 select * into f from public.siigo_documentos where tipo='factura' and contrato_id=new.contrato_id and estado<>'anulado' limit 1;
 if f.id is null then return new; end if;
 select * into c from public.contratos where id=new.contrato_id;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
 values(f.sede_id,'recibo_caja','pago',new.id,new.contrato_id,f.id,jsonb_build_object('valor',new.valor_pagado,'medio',new.medio_pago,'recibo',new.numero_recibo,
  'fecha',(coalesce(new.fecha_pago,now()) at time zone 'America/Bogota')::date,'cliente',f.datos->'cliente','numero_contrato',c.numero_contrato),auth.uid())
 on conflict do nothing;
 return new;
end $$;
drop trigger if exists siigo_pago_recibo on public.pagos;
create trigger siigo_pago_recibo after insert or update of anulado_at on public.pagos for each row execute function private.siigo_pago_recibo();

-- Deposit received → anticipo; deposit returned → comprobante contable (devolución de anticipo).
create or replace function private.siigo_deposito_documento() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.contratos; cli jsonb; ant uuid;
begin
 if new.tipo not in ('ingreso','devolucion') or coalesce(new.monto,0)<=0 then return new; end if;
 select * into c from public.contratos where id=new.contrato_id;
 if c.id is null or c.sede_id is null then return new; end if;
 cli:=private.siigo_cliente(c);
 if new.tipo='ingreso' then
  insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,creado_por)
  values(c.sede_id,'anticipo','movimiento_deposito',new.id,c.id,jsonb_build_object('valor',new.monto,'medio',new.metodo,'fecha',coalesce(new.fecha_pago_deposito,new.fecha),'cliente',cli,'numero_contrato',c.numero_contrato),auth.uid())
  on conflict do nothing;
  return new;
 end if;
 -- Deposit registered only on the contract (before this module): its anticipo is created first.
 if not exists(select 1 from public.siigo_documentos where tipo='anticipo' and contrato_id=c.id and estado<>'anulado') and coalesce(c.valor_deposito,0)>0 then
  insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,creado_por)
  values(c.sede_id,'anticipo','contrato',c.id,c.id,jsonb_build_object('valor',c.valor_deposito,'medio',coalesce(c.medio_deposito,'Transferencia'),'fecha',coalesce(new.fecha_pago_deposito,new.fecha),'cliente',cli,'numero_contrato',c.numero_contrato),auth.uid())
  on conflict do nothing;
 end if;
 select id into ant from public.siigo_documentos where tipo='anticipo' and contrato_id=c.id and estado<>'anulado' order by created_at limit 1;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
 values(c.sede_id,'devolucion_anticipo','movimiento_deposito',new.id,c.id,ant,jsonb_build_object('valor',new.monto,'medio',new.metodo,'fecha',new.fecha,'cliente',cli,'numero_contrato',c.numero_contrato,'descuento',new.descuento),auth.uid())
 on conflict do nothing;
 return new;
end $$;
drop trigger if exists siigo_deposito_documento on public.movimientos_depositos;
create trigger siigo_deposito_documento after insert on public.movimientos_depositos for each row execute function private.siigo_deposito_documento();

-- Purchases and expenses by the supplier's document.
create or replace function public.siigo_registrar_gasto(p_gasto uuid, p_tipo text, p_proveedor_documento text, p_proveedor_nombre text, p_factura_numero text, p_vestidos text[] default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare g public.gastos; nit text:=regexp_replace(coalesce(p_proveedor_documento,''),'\D','','g'); items jsonb; d uuid;
begin
 select * into g from public.gastos where id=p_gasto;
 if g.id is null or not (public.es_admin() or private.es_finanzas() or private.caja_operar(g.sede_id)) then raise exception 'Gasto no disponible.' using errcode='42501'; end if;
 if g.anulado_at is not null then raise exception 'El gasto está anulado.'; end if;
 if p_tipo not in ('gasto','soporte_gasto','soporte_producto') then raise exception 'Elige qué documento entregó el proveedor.'; end if;
 if length(nit)<5 then raise exception 'Escribe el NIT o cédula del proveedor.'; end if;
 if p_tipo='gasto' and length(btrim(coalesce(p_factura_numero,'')))=0 then raise exception 'Escribe el número de la factura electrónica.'; end if;
 if p_tipo='soporte_producto' then
  select jsonb_agg(jsonb_build_object('vestido_id',v.id,'codigo',v.codigo,'descripcion',concat_ws(' · ',v.codigo,v.nombre),'cantidad',1)) into items
  from public.vestidos v where v.sede_actual_id=g.sede_id and v.codigo=any(p_vestidos);
  if items is null then raise exception 'Escribe los códigos de los vestidos comprados (de esta sede).'; end if;
 end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por)
 values(g.sede_id,p_tipo,'gasto',g.id,jsonb_build_object('valor',g.valor,'medio',g.medio,'fecha',g.fecha,'categoria',g.categoria,'descripcion',coalesce(g.descripcion,g.categoria),
  'proveedor',jsonb_build_object('documento',nit,'nombre',coalesce(nullif(btrim(p_proveedor_nombre),''),g.beneficiario)),'factura_numero',nullif(btrim(p_factura_numero),''),'vestidos',items),auth.uid())
 returning id into d;
 return d;
exception when unique_violation then raise exception 'Este gasto ya se registró para Siigo.';
end $$;

create or replace function public.siigo_gastos_registrados(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(d.origen_id,jsonb_build_object('tipo',d.tipo,'estado',d.estado,'numero',d.siigo_numero,'error',d.error)),'{}'::jsonb)
 from public.siigo_documentos d where d.origen='gasto' and d.origen_id=any(p_ids) and (public.es_admin() or private.es_finanzas() or private.caja_operar(d.sede_id));
$$;

-- Queue for Configuración › Facturación por sede (admin), retry and annul a pending document.
create or replace function public.siigo_documentos_listar(p_sede uuid, p_estado text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(x order by x->>'fecha' desc) from (select jsonb_build_object('id',d.id,'tipo',d.tipo,'estado',d.estado,'numero',d.siigo_numero,'error',d.error,'intentos',d.intentos,
   'valor',coalesce(d.datos->>'total',d.datos->>'valor'),'cliente',coalesce(d.datos#>>'{cliente,nombre}',d.datos#>>'{proveedor,nombre}'),'contrato',d.datos->>'numero_contrato','fecha',d.created_at) x
  from public.siigo_documentos d where d.sede_id=p_sede and (p_estado is null or d.estado=p_estado) order by d.created_at desc limit 200) s),'[]'::jsonb);
end $$;

create or replace function public.siigo_documento_accion(p_id uuid, p_accion text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.siigo_documentos;
begin
 select * into d from public.siigo_documentos where id=p_id for update;
 if d.id is null or not (public.es_admin() or private.es_finanzas() or private.caja_operar(d.sede_id)) then raise exception 'Documento no disponible.' using errcode='42501'; end if;
 if d.estado='enviado' then raise exception 'Ya está en Siigo: cualquier corrección se hace en Siigo.'; end if;
 if p_accion='reintentar' then update public.siigo_documentos set estado='pendiente',intentos=0,error=null,updated_at=now() where id=p_id;
 elsif p_accion='anular' then update public.siigo_documentos set estado='anulado',error='Anulado en el ERP.',updated_at=now() where id=p_id;
 else raise exception 'Acción no válida.'; end if;
end $$;

-- Parameters of each store's Siigo (document types, payment methods, accounts, seller, cost center).
create or replace function public.siigo_parametros(p_sede uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administrador.' using errcode='42501'; end if;
 return coalesce((select parametros from private.credenciales_siigo where sede_id=p_sede),'{}'::jsonb);
end $$;
create or replace function public.siigo_parametros_guardar(p_sede uuid, p_parametros jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administrador.' using errcode='42501'; end if;
 if jsonb_typeof(p_parametros)<>'object' then raise exception 'Parámetros no válidos.'; end if;
 insert into private.credenciales_siigo(sede_id,usuario_api,access_key,partner_id,producto_codigo,producto_nombre,activo,parametros,updated_at,updated_by)
 values(p_sede,'','','','ALQUILER-VESTIDO','Alquiler de Vestido',true,p_parametros,now(),auth.uid())
 on conflict (sede_id) do update set parametros=excluded.parametros,updated_at=now(),updated_by=auth.uid();
end $$;

-- Worker (service_role): take the queue (an invoice before its receipts) and save each result.
create or replace function public.siigo_tomar_servidor(p_limite integer default 20) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'sede_id',d.sede_id,'tipo',d.tipo,'datos',d.datos,'intentos',d.intentos,
   'factura',(select jsonb_build_object('estado',f.estado,'siigo_id',f.siigo_id,'numero',f.siigo_numero,'datos',f.datos,'respuesta',f.respuesta) from public.siigo_documentos f where f.id=d.factura_id)) order by d.created_at),'[]'::jsonb)
 from (select * from public.siigo_documentos where estado='pendiente' or (estado='error' and intentos<5 and updated_at<now()-interval '30 minutes') order by created_at limit p_limite) d;
$$;
create or replace function public.siigo_resultado_servidor(p_id uuid, p_ok boolean, p_siigo_id text, p_numero text, p_error text, p_respuesta jsonb, p_esperar boolean default false) returns void
language sql security definer set search_path='' as $$
 update public.siigo_documentos set
  estado=case when p_ok then 'enviado' when p_esperar then 'pendiente' else 'error' end,
  intentos=intentos+case when p_ok or p_esperar then 0 else 1 end,
  siigo_id=coalesce(p_siigo_id,siigo_id),siigo_numero=coalesce(p_numero,siigo_numero),error=case when p_ok then null else left(p_error,1000) end,
  respuesta=coalesce(p_respuesta,respuesta),enviado_at=case when p_ok then now() else enviado_at end,updated_at=now()
 where id=p_id;
$$;

revoke all on function public.siigo_facturar_contrato(uuid,text,text,text), public.siigo_contrato(uuid), public.siigo_registrar_gasto(uuid,text,text,text,text,text[]),
 public.siigo_gastos_registrados(uuid[]), public.siigo_documentos_listar(uuid,text), public.siigo_documento_accion(uuid,text), public.siigo_parametros(uuid),
 public.siigo_parametros_guardar(uuid,jsonb), public.siigo_tomar_servidor(integer), public.siigo_resultado_servidor(uuid,boolean,text,text,text,jsonb,boolean) from public, anon;
grant execute on function public.siigo_facturar_contrato(uuid,text,text,text), public.siigo_contrato(uuid), public.siigo_registrar_gasto(uuid,text,text,text,text,text[]),
 public.siigo_gastos_registrados(uuid[]), public.siigo_documentos_listar(uuid,text), public.siigo_documento_accion(uuid,text), public.siigo_parametros(uuid),
 public.siigo_parametros_guardar(uuid,jsonb) to authenticated;
revoke all on function public.siigo_tomar_servidor(integer), public.siigo_resultado_servidor(uuid,boolean,text,text,text,jsonb,boolean) from authenticated;
grant execute on function public.siigo_tomar_servidor(integer), public.siigo_resultado_servidor(uuid,boolean,text,text,text,jsonb,boolean) to service_role;
revoke all on function private.siigo_cliente(public.contratos) from public, anon, authenticated;

select cron.schedule('siigo-enviar','*/10 * * * *',$$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/siigo/procesar',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000);
$$);
