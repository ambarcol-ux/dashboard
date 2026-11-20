-- Siigo por sede · fase B: everything that moves money in Cierres de caja reaches Siigo (only in stores with «Enviar a Siigo» on).
--  · Dress sale (ventas_vestidos) → factura de venta de contado (product = code + V); its number fills the sale; annulled → flagged.
--  · Plan Ahorro XV cuota → anticipo of the family (titular); annulled → flagged.
--  · Supplier payment (pagos_proveedor, administration) → gasto or documento soporte, from Proveedores › Pagos.
--  · Money between stores (movimientos_entre_sedes) → comprobante contable in each store (account «entre sedes» ↔ caja/banco).
--  · Partner loans (prestamos_socios) → comprobante contable (account of partners ↔ caja/banco).
--  · public.siigo_estado_dia: what is pending / with error for a store and day (Cierres de caja «Siigo al día»).
-- Reversible: drop the triggers siigo_venta_documento, siigo_plan_ahorro_documento, siigo_entre_sedes_documento, siigo_socio_documento
--   and the functions created here; restore siigo_resultado_servidor and the type check from 20270414120000.

alter table public.siigo_documentos drop constraint if exists siigo_documentos_tipo_check;
alter table public.siigo_documentos add constraint siigo_documentos_tipo_check check (tipo in ('factura','recibo_caja','anticipo','devolucion_anticipo','gasto','soporte_gasto','soporte_producto','nota_credito','comprobante'));

create or replace function private.siigo_venta_documento() returns trigger
language plpgsql security definer set search_path='' as $$
declare v public.vestidos;
begin
 if tg_op='UPDATE' then
  if new.anulada_at is not null and old.anulada_at is null then
   update public.siigo_documentos set estado='anulado',error='Venta anulada antes de enviar la factura.',updated_at=now() where tipo='factura' and origen='venta' and origen_id=new.id and estado in ('pendiente','error');
   update public.siigo_documentos set error='Venta anulada: hazle nota crédito a esta factura.',updated_at=now() where tipo='factura' and origen='venta' and origen_id=new.id and estado='enviado';
  end if;
  return new;
 end if;
 if new.anulada_at is not null or not private.siigo_activo(new.sede_id) then return new; end if;
 select * into v from public.vestidos where id=new.vestido_id;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por)
 values(new.sede_id,'factura','venta',new.id,jsonb_build_object('venta',true,'tipo_factura',coalesce(private.siigo_param(new.sede_id)->>'tipo_factura_defecto','electronica'),
  'fecha',coalesce(new.fecha,(now() at time zone 'America/Bogota')::date),'total',new.total,'medio',new.medio_pago,'cuenta_id',new.cuenta_id,'numero_venta',new.consecutivo,
  'cliente',jsonb_build_object('nombre',new.cliente_nombre,'documento',regexp_replace(coalesce(new.cliente_documento,''),'\D','','g'),'email',new.cliente_email,'telefono',new.cliente_telefono),
  'vestido',jsonb_build_object('id',v.id,'codigo',v.codigo,'nombre',v.nombre,'talla',v.talla,'precio',new.total,
   'venta',(select sp.codigo_venta from public.siigo_productos sp where sp.sede_id=new.sede_id and sp.vestido_id=v.id))),auth.uid())
 on conflict do nothing;
 return new;
end $$;
create or replace trigger siigo_venta_documento after insert or update of anulada_at on public.ventas_vestidos for each row execute function private.siigo_venta_documento();

create or replace function private.siigo_plan_ahorro_documento() returns trigger
language plpgsql security definer set search_path='' as $$
declare pl public.planes_ahorro;
begin
 if tg_op='UPDATE' then
  if new.anulado_at is not null and old.anulado_at is null then
   update public.siigo_documentos set estado='anulado',error='Cuota anulada antes de enviarse.',updated_at=now() where tipo='anticipo' and origen='plan_ahorro_pago' and origen_id=new.id and estado in ('pendiente','error');
   update public.siigo_documentos set error='Cuota anulada en el ERP: anula también el anticipo en Siigo.',updated_at=now() where tipo='anticipo' and origen='plan_ahorro_pago' and origen_id=new.id and estado='enviado';
  end if;
  return new;
 end if;
 select * into pl from public.planes_ahorro where id=new.plan_id;
 if new.anulado_at is not null or pl.id is null or not private.siigo_activo(pl.sede_id) then return new; end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por)
 values(pl.sede_id,'anticipo','plan_ahorro_pago',new.id,jsonb_build_object('valor',new.valor,'medio',new.medio,'fecha',new.fecha,'numero_contrato',format('Plan Ahorro XV n.º %s',pl.numero),
  'cliente',jsonb_build_object('nombre',pl.titular_nombre,'documento',regexp_replace(coalesce(pl.titular_documento,''),'\D','','g'),'email',pl.email,'telefono',pl.telefono)),auth.uid())
 on conflict do nothing;
 return new;
end $$;
create or replace trigger siigo_plan_ahorro_documento after insert or update of anulado_at on public.planes_ahorro_pagos for each row execute function private.siigo_plan_ahorro_documento();

-- Money between stores: each store records its side against the account «entre sedes».
create or replace function private.siigo_entre_sedes_documento() returns trigger
language plpgsql security definer set search_path='' as $$
declare o text; d text;
begin
 if new.anulado_at is not null or coalesce(new.valor,0)<=0 then return new; end if;
 select nombre into o from public.sedes where id=new.sede_origen; select nombre into d from public.sedes where id=new.sede_destino;
 if new.sede_origen is not null and private.siigo_activo(new.sede_origen) and new.cuenta_origen is not null then
  insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por)
  values(new.sede_origen,'comprobante','entre_sedes_salida',new.id,jsonb_build_object('valor',new.valor,'fecha',new.fecha,'descripcion',left(format('Envío a %s · %s',coalesce(d,'otra sede'),coalesce(new.descripcion,'')),300),
   'lineas',jsonb_build_array(jsonb_build_object('cuenta','entre_sedes','mov','Debit'),jsonb_build_object('cuenta','caja','cuenta_id',new.cuenta_origen,'mov','Credit'))),auth.uid()) on conflict do nothing;
 end if;
 if new.sede_destino is not null and private.siigo_activo(new.sede_destino) and new.cuenta_destino is not null then
  insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por)
  values(new.sede_destino,'comprobante','entre_sedes_entrada',new.id,jsonb_build_object('valor',new.valor,'fecha',new.fecha,'descripcion',left(format('Recibido de %s · %s',coalesce(o,'otra sede'),coalesce(new.descripcion,'')),300),
   'lineas',jsonb_build_array(jsonb_build_object('cuenta','caja','cuenta_id',new.cuenta_destino,'mov','Debit'),jsonb_build_object('cuenta','entre_sedes','mov','Credit'))),auth.uid()) on conflict do nothing;
 end if;
 return new;
end $$;
create or replace trigger siigo_entre_sedes_documento after insert on public.movimientos_entre_sedes for each row execute function private.siigo_entre_sedes_documento();

-- Partner loans: money in (loan) or out (repayment) against the partners' account; the third party is the partner (document in the parameters).
create or replace function private.siigo_socio_documento() returns trigger
language plpgsql security definer set search_path='' as $$
declare entra boolean:=new.tipo='prestamo';
begin
 if new.tipo not in ('prestamo','devolucion') or new.anulado_at is not null or coalesce(new.valor,0)<=0 or new.sede_id is null or not private.siigo_activo(new.sede_id) then return new; end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por)
 values(new.sede_id,'comprobante','prestamo_socio',new.id,jsonb_build_object('valor',new.valor,'fecha',new.fecha,'socio',new.socio,
  'descripcion',left(format('%s socio %s · %s',case when entra then 'Préstamo de' else 'Pago a' end,new.socio,coalesce(new.descripcion,'')),300),
  'lineas',case when entra then jsonb_build_array(jsonb_build_object('cuenta','caja','cuenta_id',new.cuenta_id,'mov','Debit'),jsonb_build_object('cuenta','socios','mov','Credit'))
   else jsonb_build_array(jsonb_build_object('cuenta','socios','mov','Debit'),jsonb_build_object('cuenta','caja','cuenta_id',new.cuenta_id,'mov','Credit')) end),auth.uid())
 on conflict do nothing;
 return new;
end $$;
create or replace trigger siigo_socio_documento after insert on public.prestamos_socios for each row execute function private.siigo_socio_documento();

-- Supplier payment (Proveedores › Pagos, administration): gasto or documento soporte, in the store chosen.
create or replace function public.siigo_registrar_pago_proveedor(p_pago uuid, p_sede uuid, p_tipo text, p_factura_numero text) returns uuid
language plpgsql security definer set search_path='' as $$
declare g public.pagos_proveedor; pr public.proveedores; d uuid;
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad.' using errcode='42501'; end if;
 select * into g from public.pagos_proveedor where id=p_pago;
 if g.id is null or g.anulado_at is not null then raise exception 'Pago no disponible.'; end if;
 select * into pr from public.proveedores where id=g.proveedor_id;
 if private.siigo_param(p_sede) is null then raise exception 'Elige una sede con Siigo configurado.'; end if;
 if p_tipo not in ('gasto','soporte_gasto') then raise exception 'Elige qué documento entregó el proveedor.'; end if;
 if length(regexp_replace(coalesce(pr.documento,''),'\D','','g'))<5 then raise exception 'El proveedor no tiene NIT o cédula: complétalo en su ficha.'; end if;
 if p_tipo='gasto' and length(btrim(coalesce(p_factura_numero,'')))=0 then raise exception 'Escribe el número de la factura electrónica.'; end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por)
 values(p_sede,p_tipo,'pago_proveedor',g.id,jsonb_build_object('valor',g.valor_total,'medio',g.medio_pago,'fecha',g.fecha_pago,'categoria','proveedores','descripcion',left(format('Pago a %s (%s)',pr.nombre,coalesce(pr.tipo_servicio,'servicios')),300),
  'proveedor',jsonb_build_object('documento',regexp_replace(pr.documento,'\D','','g'),'nombre',pr.nombre),'factura_numero',nullif(btrim(p_factura_numero),'')),auth.uid())
 returning id into d;
 return d;
exception when unique_violation then raise exception 'Este pago ya se registró para Siigo.';
end $$;
create or replace function public.siigo_pagos_proveedor_registrados(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(d.origen_id,jsonb_build_object('tipo',d.tipo,'estado',d.estado,'numero',d.siigo_numero,'error',d.error)),'{}'::jsonb)
 from public.siigo_documentos d where d.origen='pago_proveedor' and d.origen_id=any(p_ids) and (public.es_admin() or private.es_finanzas());
$$;

-- Cierres de caja «Siigo al día»: documents of the store for that day not yet in Siigo.
create or replace function public.siigo_estado_dia(p_sede uuid, p_fecha date) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('activa',private.siigo_activo(p_sede),
  'pendientes',count(*) filter (where d.estado='pendiente'),'errores',count(*) filter (where d.estado='error'),'enviados',count(*) filter (where d.estado='enviado'),
  'detalle',coalesce(jsonb_agg(jsonb_build_object('tipo',d.tipo,'estado',d.estado,'error',d.error)) filter (where d.estado in ('pendiente','error')),'[]'::jsonb))
 from public.siigo_documentos d
 where d.sede_id=p_sede and coalesce(nullif(d.datos->>'fecha','')::date,(d.created_at at time zone 'America/Bogota')::date)=p_fecha
  and (public.es_admin() or private.es_finanzas() or private.caja_operar(p_sede));
$$;

-- The invoice number also fills the dress sale.
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
 if p_ok and d.tipo='factura' and d.contrato_id is not null and p_numero is not null then
  update public.contratos set numero_factura=p_numero,factura_registrada_at=now() where id=d.contrato_id and (numero_factura is null or lower(numero_factura) like 'siigo%');
 end if;
 if d.tipo='factura' and d.origen='venta' then
  update public.ventas_vestidos set siigo_estado=case when p_ok then 'enviada' when p_esperar then 'pendiente' else 'error' end,
   numero_factura=case when p_ok then coalesce(p_numero,numero_factura) else numero_factura end,
   codigo_siigo=case when p_ok then coalesce(p_respuesta#>>'{items,0,code}',codigo_siigo) else codigo_siigo end where id=d.origen_id;
 end if;
end $$;

revoke all on function public.siigo_registrar_pago_proveedor(uuid,uuid,text,text), public.siigo_pagos_proveedor_registrados(uuid[]), public.siigo_estado_dia(uuid,date) from public, anon;
grant execute on function public.siigo_registrar_pago_proveedor(uuid,uuid,text,text), public.siigo_pagos_proveedor_registrados(uuid[]), public.siigo_estado_dia(uuid,date) to authenticated;
