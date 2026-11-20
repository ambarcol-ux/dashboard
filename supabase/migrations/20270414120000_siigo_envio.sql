-- Siigo por sede, envío automático (completes 20270411120000_siigo_documentos; functions here replace those of that file).
-- Each store has a switch «Enviar a Siigo» (parametros.envio_activo): while off nothing is queued, so it never duplicates what the
-- store still does by hand. From the cut-over day the store works only in the ERP:
--  · New contract: the form marks the invoice «SIIGO-PENDIENTE» (the ERP requires an invoice number) with its options (electrónica /
--    de ingreso, alquiler / venta, forma de pago). The invoice goes to Siigo on credit (total = contract value) and its real number
--    replaces the placeholder in the contract. Every payment (also the first one) becomes a recibo de caja against that invoice.
--  · Deposit received → anticipo; deposit returned → comprobante contable (devolución de depósitos).
--  · Expenses by supplier document; credit notes (administration/accounting); a contract annulled after invoicing is flagged.
--  · Dress ↔ Siigo product links per store (siigo_productos): rental = the dress code (service), sale = code + V (product).
-- History: private.config_historial(). Reversible: drop the triggers siigo_contrato_factura, siigo_pago_recibo, siigo_deposito_documento;
--   drop table public.siigo_productos; drop the three contratos.siigo_* columns; drop the functions created here; cron.unschedule('siigo-enviar').

alter table public.contratos
 add column if not exists siigo_tipo_factura text check (siigo_tipo_factura in ('electronica','ingreso')),
 add column if not exists siigo_tipo_venta text check (siigo_tipo_venta in ('alquiler','venta')),
 add column if not exists siigo_forma_pago text;

alter table public.siigo_documentos drop constraint if exists siigo_documentos_tipo_check;
alter table public.siigo_documentos add constraint siigo_documentos_tipo_check check (tipo in ('factura','recibo_caja','anticipo','devolucion_anticipo','gasto','soporte_gasto','soporte_producto','nota_credito'));

create table if not exists public.siigo_productos(
 sede_id uuid not null references public.sedes(id),
 vestido_id uuid not null references public.vestidos(id),
 codigo_alquiler text,
 codigo_venta text,
 origen text not null default 'cruce',
 updated_at timestamptz not null default now(),
 primary key (sede_id, vestido_id)
);
alter table public.siigo_productos enable row level security;
create policy siigo_productos_ver on public.siigo_productos for select to authenticated using (public.es_admin() or private.es_finanzas());
create trigger siigo_productos_historial after insert or update or delete on public.siigo_productos for each row execute function private.config_historial();

-- Parameters of the store (only with full credentials) and its switch.
create or replace function private.siigo_param(p_sede uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select parametros from private.credenciales_siigo where sede_id=p_sede and activo and nullif(access_key,'') is not null and nullif(usuario_api,'') is not null;
$$;
create or replace function private.siigo_activo(p_sede uuid) returns boolean
language sql stable security definer set search_path='' as $$ select coalesce((private.siigo_param(p_sede)->>'envio_activo')::boolean,false); $$;

-- For the contract form: whether the store invoices through Siigo and its defaults.
create or replace function public.siigo_sede_activa(p_sede uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('activa',private.siigo_activo(p_sede),'tipo_factura',coalesce(private.siigo_param(p_sede)->>'tipo_factura_defecto','electronica'),
  'formas_pago',coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(coalesce(private.siigo_param(p_sede)->'formas_pago','{}'::jsonb)) k where k not in ('credito')),'[]'::jsonb));
$$;

-- Queues the invoice of a contract (on credit) and a receipt for each payment it already has.
create or replace function private.siigo_encolar_factura(p_contrato uuid, p_tipo_factura text, p_tipo_venta text, p_forma_pago text, p_usuario uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.contratos; f uuid;
begin
 select * into c from public.contratos where id=p_contrato;
 if c.id is null then return null; end if;
 select id into f from public.siigo_documentos where tipo='factura' and contrato_id=c.id and estado<>'anulado' limit 1;
 if f is not null then return f; end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,creado_por)
 values(c.sede_id,'factura','contrato',c.id,c.id,jsonb_build_object('tipo_factura',coalesce(p_tipo_factura,'electronica'),'tipo_venta',coalesce(p_tipo_venta,'alquiler'),
  'forma_pago',p_forma_pago,'fecha',(now() at time zone 'America/Bogota')::date,'numero_contrato',c.numero_contrato),p_usuario)
 on conflict (tipo,origen,origen_id) do update set estado='pendiente',datos=excluded.datos,error=null,intentos=0,updated_at=now()
 returning id into f;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
 select c.sede_id,'recibo_caja','pago',p.id,c.id,f,jsonb_build_object('valor',p.valor_pagado,'medio',p.medio_pago,'recibo',p.numero_recibo,
   'fecha',(coalesce(p.fecha_pago,p.created_at) at time zone 'America/Bogota')::date,'numero_contrato',c.numero_contrato),p_usuario
 from public.pagos p where p.contrato_id=c.id and p.anulado_at is null and coalesce(p.valor_pagado,0)>0
 on conflict do nothing;
 return f;
end $$;

-- Manual invoice from the payment page (contracts created before the cut-over, or when the automatic one was annulled).
create or replace function public.siigo_facturar_contrato(p_contrato uuid, p_tipo_factura text, p_tipo_venta text, p_forma_pago text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.contratos; f uuid;
begin
 select * into c from public.contratos where id=p_contrato;
 if c.id is null or not (public.es_admin() or private.es_finanzas() or private.caja_operar(c.sede_id)) then raise exception 'Contrato no disponible.' using errcode='42501'; end if;
 if p_tipo_factura not in ('electronica','ingreso') then raise exception 'Elige factura electrónica o factura de ingreso.'; end if;
 if p_tipo_venta not in ('alquiler','venta') then raise exception 'Elige venta o servicio de alquiler.'; end if;
 if private.siigo_param(c.sede_id) is null then raise exception 'La sede no tiene Siigo configurado.'; end if;
 if length(regexp_replace(coalesce(c.cliente_documento,''),'\D','','g'))<5 then raise exception 'El contrato no tiene documento del cliente: complétalo antes de facturar.'; end if;
 if exists(select 1 from public.siigo_documentos where tipo='factura' and contrato_id=c.id and estado<>'anulado') then raise exception 'Este contrato ya tiene factura en Siigo.'; end if;
 f:=private.siigo_encolar_factura(c.id,p_tipo_factura,p_tipo_venta,p_forma_pago,auth.uid());
 update public.contratos set siigo_tipo_factura=p_tipo_factura,siigo_tipo_venta=p_tipo_venta,siigo_forma_pago=p_forma_pago where id=c.id;
 return jsonb_build_object('id',f);
end $$;

-- New contract with «SIIGO-PENDIENTE» in an active store → its invoice is queued. Annulled/cancelled after invoicing → flagged for a credit note.
create or replace function private.siigo_contrato_factura() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if lower(coalesce(new.numero_factura,'')) like 'siigo%pendiente%' and private.siigo_activo(new.sede_id)
  and (tg_op='INSERT' or old.numero_factura is distinct from new.numero_factura) then
  perform private.siigo_encolar_factura(new.id,new.siigo_tipo_factura,new.siigo_tipo_venta,new.siigo_forma_pago,auth.uid());
 end if;
 if tg_op='UPDATE' and lower(coalesce(new.estado,'')) in ('cancelado','cancelada','anulado','anulada') and lower(coalesce(old.estado,'')) not in ('cancelado','cancelada','anulado','anulada') then
  update public.siigo_documentos set estado='anulado',error='Contrato anulado antes de enviar la factura.',updated_at=now() where tipo='factura' and contrato_id=new.id and estado in ('pendiente','error');
  update public.siigo_documentos set error='Contrato anulado: hazle nota crédito a esta factura.',updated_at=now() where tipo='factura' and contrato_id=new.id and estado='enviado'
   and not exists(select 1 from public.siigo_documentos n where n.factura_id=siigo_documentos.id and n.tipo='nota_credito' and n.estado<>'anulado');
 end if;
 return new;
end $$;
create or replace trigger siigo_contrato_factura after insert or update of numero_factura, estado on public.contratos for each row execute function private.siigo_contrato_factura();

-- Each payment of an invoiced contract → recibo de caja. Annulled while pending → not sent; already sent → flagged.
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
  'fecha',(coalesce(new.fecha_pago,now()) at time zone 'America/Bogota')::date,'numero_contrato',c.numero_contrato),auth.uid())
 on conflict do nothing;
 return new;
end $$;
create or replace trigger siigo_pago_recibo after insert or update of anulado_at on public.pagos for each row execute function private.siigo_pago_recibo();

-- Deposit received → anticipo; deposit returned → comprobante contable (only in active stores).
create or replace function private.siigo_deposito_documento() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.contratos; ant uuid;
begin
 if new.tipo not in ('ingreso','devolucion') or coalesce(new.monto,0)<=0 then return new; end if;
 select * into c from public.contratos where id=new.contrato_id;
 if c.id is null or c.sede_id is null or not private.siigo_activo(c.sede_id) then return new; end if;
 if new.tipo='ingreso' then
  insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,creado_por)
  values(c.sede_id,'anticipo','movimiento_deposito',new.id,c.id,jsonb_build_object('valor',new.monto,'medio',new.metodo,'fecha',coalesce(new.fecha_pago_deposito,new.fecha),'numero_contrato',c.numero_contrato),auth.uid())
  on conflict do nothing;
  return new;
 end if;
 -- Deposit registered only on the contract: its anticipo goes first.
 if not exists(select 1 from public.siigo_documentos where tipo='anticipo' and contrato_id=c.id and estado<>'anulado') and coalesce(c.valor_deposito,0)>0 then
  insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,creado_por)
  values(c.sede_id,'anticipo','contrato',c.id,c.id,jsonb_build_object('valor',c.valor_deposito,'medio',coalesce(c.medio_deposito,'Transferencia'),'fecha',coalesce(new.fecha_pago_deposito,new.fecha),'numero_contrato',c.numero_contrato),auth.uid())
  on conflict do nothing;
 end if;
 select id into ant from public.siigo_documentos where tipo='anticipo' and contrato_id=c.id and estado<>'anulado' order by created_at limit 1;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
 values(c.sede_id,'devolucion_anticipo','movimiento_deposito',new.id,c.id,ant,jsonb_build_object('valor',new.monto,'medio',new.metodo,'fecha',new.fecha,'numero_contrato',c.numero_contrato,'descuento',new.descuento),auth.uid())
 on conflict do nothing;
 return new;
end $$;
create or replace trigger siigo_deposito_documento after insert on public.movimientos_depositos for each row execute function private.siigo_deposito_documento();

-- Credit note (administration or accounting): total, partial or correction (the contract can then be invoiced again).
-- It does not move money: a refund is registered as an egreso in Cierres de caja.
create or replace function public.siigo_nota_credito(p_factura uuid, p_tipo text, p_valor numeric, p_motivo text) returns uuid
language plpgsql security definer set search_path='' as $$
declare f public.siigo_documentos; total numeric; v numeric; r text:=btrim(coalesce(p_motivo,'')); d uuid; ya numeric;
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad hace notas crédito.' using errcode='42501'; end if;
 select * into f from public.siigo_documentos where id=p_factura and tipo='factura' for update;
 if f.id is null then raise exception 'Factura no encontrada.'; end if;
 if f.estado<>'enviado' then raise exception 'La factura aún no está en Siigo: anúlala desde la cola en vez de hacer nota crédito.'; end if;
 if p_tipo not in ('total','parcial','correccion') then raise exception 'Elige total, parcial o corrección.'; end if;
 if length(r) not between 5 and 300 then raise exception 'Escribe el motivo (mínimo 5 caracteres).'; end if;
 total:=coalesce((f.respuesta->>'total')::numeric,(f.datos->>'total')::numeric,0);
 select coalesce(sum((datos->>'valor')::numeric),0) into ya from public.siigo_documentos where factura_id=f.id and tipo='nota_credito' and estado<>'anulado';
 v:=case when p_tipo='parcial' then round(coalesce(p_valor,0)) else total-ya end;
 if v<=0 or v>total-ya then raise exception 'El valor debe ser mayor que cero y no superar lo que queda de la factura.'; end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
 values(f.sede_id,'nota_credito','nota_credito',gen_random_uuid(),f.contrato_id,f.id,jsonb_build_object('tipo',p_tipo,'valor',v,'motivo',r,'total_factura',total,
  'fecha',(now() at time zone 'America/Bogota')::date,'numero_contrato',f.datos->>'numero_contrato'),auth.uid())
 returning id into d;
 if p_tipo='correccion' then update public.siigo_documentos set estado='anulado',error=left('Corregida con nota crédito: '||r,1000),updated_at=now() where id=f.id; end if;
 update public.siigo_documentos set error=null,updated_at=now() where id=f.id and p_tipo<>'correccion' and error like 'Contrato anulado%';
 if f.contrato_id is not null then
  insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo) values(f.contrato_id,auth.uid(),left(format('Nota crédito %s por %s a la factura %s. %s',p_tipo,v,coalesce(f.siigo_numero,'—'),r),500),'Siigo nota crédito');
 end if;
 return d;
end $$;

-- Expenses and purchases by the supplier's document.
create or replace function public.siigo_registrar_gasto(p_gasto uuid, p_tipo text, p_proveedor_documento text, p_proveedor_nombre text, p_factura_numero text, p_vestidos text[] default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare g public.gastos; nit text:=regexp_replace(coalesce(p_proveedor_documento,''),'\D','','g'); items jsonb; d uuid;
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
 return d;
exception when unique_violation then raise exception 'Este gasto ya se registró para Siigo.';
end $$;

-- Siigo documents of a contract and what the store can do (payment page).
create or replace function public.siigo_contrato(p_contrato uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('saldo',coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.anticipo,0),
  'configurada',private.siigo_param(c.sede_id) is not null,'activa',private.siigo_activo(c.sede_id),'nota_credito',public.es_admin() or private.es_finanzas(),
  'tipo_factura',coalesce(c.siigo_tipo_factura,private.siigo_param(c.sede_id)->>'tipo_factura_defecto','electronica'),'tipo_venta',coalesce(c.siigo_tipo_venta,'alquiler'),
  'documentos',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'tipo',d.tipo,'estado',d.estado,'numero',d.siigo_numero,'error',d.error,
    'valor',coalesce(d.respuesta->>'total',d.datos->>'valor'),'fecha',d.created_at) order by d.created_at) from public.siigo_documentos d where d.contrato_id=c.id),'[]'::jsonb))
 from public.contratos c where c.id=p_contrato and (public.es_admin() or private.es_finanzas() or private.caja_operar(c.sede_id));
$$;

create or replace function public.siigo_gastos_registrados(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(d.origen_id,jsonb_build_object('tipo',d.tipo,'estado',d.estado,'numero',d.siigo_numero,'error',d.error)),'{}'::jsonb)
 from public.siigo_documentos d where d.origen='gasto' and d.origen_id=any(p_ids) and (public.es_admin() or private.es_finanzas() or private.caja_operar(d.sede_id));
$$;

-- Queue of a store (Configuración › Facturación por sede), retry / annul a document not yet sent.
create or replace function public.siigo_documentos_listar(p_sede uuid, p_estado text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(x order by x->>'fecha' desc) from (select jsonb_build_object('id',d.id,'tipo',d.tipo,'estado',d.estado,'numero',d.siigo_numero,'error',d.error,'intentos',d.intentos,
   'valor',coalesce(d.respuesta->>'total',d.datos->>'valor'),'contrato',d.datos->>'numero_contrato','proveedor',d.datos#>>'{proveedor,nombre}','fecha',d.created_at) x
  from public.siigo_documentos d where d.sede_id=p_sede and (p_estado is null or d.estado=p_estado) order by d.created_at desc limit 200) s),'[]'::jsonb);
end $$;

create or replace function public.siigo_documento_accion(p_id uuid, p_accion text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.siigo_documentos;
begin
 select * into d from public.siigo_documentos where id=p_id for update;
 if d.id is null or not (public.es_admin() or private.es_finanzas() or private.caja_operar(d.sede_id)) then raise exception 'Documento no disponible.' using errcode='42501'; end if;
 if d.estado='enviado' then raise exception 'Ya está en Siigo: para reversarlo usa nota crédito.'; end if;
 if p_accion='reintentar' then update public.siigo_documentos set estado='pendiente',intentos=0,error=null,updated_at=now() where id=p_id;
 elsif p_accion='anular' then update public.siigo_documentos set estado='anulado',error='Anulado en el ERP.',updated_at=now() where id=p_id;
 else raise exception 'Acción no válida.'; end if;
end $$;

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
 if not exists(select 1 from private.credenciales_siigo where sede_id=p_sede) then raise exception 'Primero guarda las credenciales de Siigo de esta sede.'; end if;
 update private.credenciales_siigo set parametros=p_parametros,updated_at=now(),updated_by=auth.uid() where sede_id=p_sede;
end $$;

-- Worker (service_role). Invoices are built at send time from the contract as it is then (dresses, value); a receipt waits for its invoice.
create or replace function public.siigo_tomar_servidor(p_limite integer default 20) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'sede_id',d.sede_id,'tipo',d.tipo,'datos',d.datos,'intentos',d.intentos,'contrato_id',d.contrato_id,
   'cliente',(select private.siigo_cliente(c) from public.contratos c where c.id=d.contrato_id),
   'contrato',(select jsonb_build_object('numero',c.numero_contrato,'valor_total',coalesce(c.valor_total,0),'total_arreglos',coalesce(c.total_arreglos,0),'descuento',coalesce(c.descuento_plan_ahorro,0),
      'fecha_evento',c.fecha_evento,'vestidos',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'codigo',v.codigo,'nombre',v.nombre,'talla',v.talla,'precio',coalesce(v.precio_sugerido,0),
        'alquiler',sp.codigo_alquiler,'venta',sp.codigo_venta) order by v.codigo)
       from public.vestidos v left join public.siigo_productos sp on sp.vestido_id=v.id and sp.sede_id=d.sede_id
       where v.id in (select i.vestido_id from public.contrato_items_vestidos i where i.contrato_id=c.id and i.vestido_id is not null union select c.vestido_id where c.vestido_id is not null)),'[]'::jsonb))
     from public.contratos c where c.id=d.contrato_id and d.tipo='factura'),
   'factura',(select jsonb_build_object('estado',f.estado,'siigo_id',f.siigo_id,'numero',f.siigo_numero,'datos',f.datos,'respuesta',f.respuesta) from public.siigo_documentos f where f.id=d.factura_id),
   'cuenta_id',(select m.cuenta_id from public.caja_movimientos m where m.origen_id=d.origen_id and m.anulado_at is null order by m.created_at limit 1)) order by d.created_at),'[]'::jsonb)
 from (select * from public.siigo_documentos where (estado='pendiente' or (estado='error' and intentos<5 and updated_at<now()-interval '30 minutes')) and private.siigo_activo(sede_id)
  order by case tipo when 'factura' then 0 when 'anticipo' then 1 else 2 end, created_at limit p_limite) d;
$$;
create or replace function public.siigo_credenciales_activas_servidor() returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('sede_id',c.sede_id,'sede',s.nombre,'usuario_api',c.usuario_api,'access_key',c.access_key,'partner_id',c.partner_id,'parametros',c.parametros)),'[]'::jsonb)
 from private.credenciales_siigo c join public.sedes s on s.id=c.sede_id where c.activo and nullif(c.access_key,'') is not null;
$$;
create or replace function public.siigo_resultado_servidor(p_id uuid, p_ok boolean, p_siigo_id text, p_numero text, p_error text, p_respuesta jsonb, p_esperar boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare d public.siigo_documentos;
begin
 update public.siigo_documentos set
  estado=case when p_ok then 'enviado' when p_esperar then 'pendiente' else 'error' end,
  intentos=intentos+case when p_ok or p_esperar then 0 else 1 end,
  siigo_id=coalesce(p_siigo_id,siigo_id),siigo_numero=coalesce(p_numero,siigo_numero),error=case when p_ok then null else left(p_error,1000) end,
  respuesta=coalesce(p_respuesta,respuesta),enviado_at=case when p_ok then now() else enviado_at end,updated_at=now()
 where id=p_id returning * into d;
 -- The invoice's real number replaces «SIIGO-PENDIENTE» in the contract.
 if p_ok and d.tipo='factura' and d.contrato_id is not null and p_numero is not null then
  update public.contratos set numero_factura=p_numero,factura_registrada_at=now() where id=d.contrato_id and (numero_factura is null or lower(numero_factura) like 'siigo%');
 end if;
end $$;
create or replace function public.siigo_producto_vincular_servidor(p_sede uuid, p_vestido uuid, p_alquiler text, p_venta text, p_origen text) returns void
language sql security definer set search_path='' as $$
 insert into public.siigo_productos(sede_id,vestido_id,codigo_alquiler,codigo_venta,origen,updated_at) values(p_sede,p_vestido,nullif(p_alquiler,''),nullif(p_venta,''),coalesce(p_origen,'cruce'),now())
 on conflict (sede_id,vestido_id) do update set codigo_alquiler=coalesce(excluded.codigo_alquiler,siigo_productos.codigo_alquiler),codigo_venta=coalesce(excluded.codigo_venta,siigo_productos.codigo_venta),origen=excluded.origen,updated_at=now();
$$;

revoke all on function public.siigo_sede_activa(uuid), public.siigo_facturar_contrato(uuid,text,text,text), public.siigo_nota_credito(uuid,text,numeric,text),
 public.siigo_registrar_gasto(uuid,text,text,text,text,text[]), public.siigo_contrato(uuid), public.siigo_gastos_registrados(uuid[]), public.siigo_documentos_listar(uuid,text),
 public.siigo_documento_accion(uuid,text), public.siigo_parametros(uuid), public.siigo_parametros_guardar(uuid,jsonb) from public, anon;
grant execute on function public.siigo_sede_activa(uuid), public.siigo_facturar_contrato(uuid,text,text,text), public.siigo_nota_credito(uuid,text,numeric,text),
 public.siigo_registrar_gasto(uuid,text,text,text,text,text[]), public.siigo_contrato(uuid), public.siigo_gastos_registrados(uuid[]), public.siigo_documentos_listar(uuid,text),
 public.siigo_documento_accion(uuid,text), public.siigo_parametros(uuid), public.siigo_parametros_guardar(uuid,jsonb) to authenticated;
revoke all on function public.siigo_tomar_servidor(integer), public.siigo_credenciales_activas_servidor(), public.siigo_resultado_servidor(uuid,boolean,text,text,text,jsonb,boolean),
 public.siigo_producto_vincular_servidor(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.siigo_tomar_servidor(integer), public.siigo_credenciales_activas_servidor(), public.siigo_resultado_servidor(uuid,boolean,text,text,text,jsonb,boolean),
 public.siigo_producto_vincular_servidor(uuid,uuid,text,text,text) to service_role;
revoke all on function private.siigo_cliente(public.contratos), private.siigo_param(uuid), private.siigo_activo(uuid), private.siigo_encolar_factura(uuid,text,text,text,uuid) from public, anon, authenticated;

-- Cut-over: an open contract whose invoice was made by hand in Siigo is linked to it (sent), so its next payments go as receipts.
create or replace function public.siigo_vincular_factura_servidor(p_contrato uuid, p_siigo_id text, p_numero text, p_respuesta jsonb) returns void
language sql security definer set search_path='' as $$
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,estado,siigo_id,siigo_numero,respuesta,enviado_at)
 select c.sede_id,'factura','contrato',c.id,c.id,jsonb_build_object('vinculada',true,'numero_contrato',c.numero_contrato,'fecha',p_respuesta->>'date'),'enviado',p_siigo_id,p_numero,p_respuesta,now()
 from public.contratos c where c.id=p_contrato and not exists(select 1 from public.siigo_documentos d where d.tipo='factura' and d.contrato_id=c.id and d.estado<>'anulado')
 on conflict (tipo,origen,origen_id) do nothing;
$$;
revoke all on function public.siigo_vincular_factura_servidor(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.siigo_vincular_factura_servidor(uuid,text,text,jsonb) to service_role;
