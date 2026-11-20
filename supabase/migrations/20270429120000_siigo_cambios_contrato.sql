-- Siigo: editing an invoiced contract corrects Siigo by itself (an approved electronic invoice cannot be changed):
--  · lower value (discount, dress or alteration removed) → partial credit note for the difference;
--  · higher value → additional invoice for the difference (lib/siigo.ts, datos.adicional);
--  · another customer (cédula) → full credit note of every invoice and a new invoice;
--  · cancelled contract → full credit note of every invoice.
-- Payments then go to the invoice of the contract that still has a balance. Everything is written in the contract history.
-- Reversible: drop trigger siigo_zz_ajuste_contrato on public.contratos; drop function private.siigo_ajuste_contrato(), private.siigo_saldo_factura(uuid);
--   restore private.siigo_pago_recibo from 20270424120000_siigo_recibo_pagos_previos.sql.

-- What is still owed on an invoice for the ERP: its balance in Siigo when sent (or its total), minus receipts and credit notes made since.
create or replace function private.siigo_saldo_factura(p_factura uuid) returns numeric
language sql stable security definer set search_path='' as $$
 select coalesce((f.respuesta->>'balance')::numeric,(f.respuesta->>'total')::numeric,(f.datos->>'valor')::numeric,0)
  -coalesce((select sum((r.datos->>'valor')::numeric) from public.siigo_documentos r where r.factura_id=f.id and r.tipo='recibo_caja' and r.estado<>'anulado' and coalesce(r.siigo_numero,'') not like 'Incluido en%'),0)
  -coalesce((select sum((n.datos->>'valor')::numeric) from public.siigo_documentos n where n.factura_id=f.id and n.tipo='nota_credito' and n.estado<>'anulado'),0)
 from public.siigo_documentos f where f.id=p_factura;
$$;

create or replace function private.siigo_ajuste_contrato() returns trigger
language plpgsql security definer set search_path='' as $$
declare f public.siigo_documentos; total numeric; facturado numeric; dif numeric; cliente_nuevo boolean; anulado boolean; nota text;
begin
 if new.sede_id is null or not private.siigo_activo(new.sede_id) then return new; end if;
 if not exists(select 1 from public.siigo_documentos where contrato_id=new.id and tipo='factura' and estado='enviado') then return new; end if;
 anulado:=lower(coalesce(new.estado,'')) in ('cancelado','cancelada','anulado','anulada') and lower(coalesce(old.estado,'')) not in ('cancelado','cancelada','anulado','anulada');
 cliente_nuevo:=regexp_replace(coalesce(new.cliente_documento,''),'\D','','g')<>regexp_replace(coalesce(old.cliente_documento,''),'\D','','g') and length(regexp_replace(coalesce(new.cliente_documento,''),'\D','','g'))>=5 and length(regexp_replace(coalesce(old.cliente_documento,''),'\D','','g'))>=5;
 if anulado or cliente_nuevo then
  for f in select * from public.siigo_documentos where contrato_id=new.id and tipo='factura' and estado='enviado' loop
   total:=coalesce((f.respuesta->>'total')::numeric,(f.datos->>'valor')::numeric,0)-coalesce((select sum((n.datos->>'valor')::numeric) from public.siigo_documentos n where n.factura_id=f.id and n.tipo='nota_credito' and n.estado<>'anulado'),0);
   if total>0 then
    insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
    values(f.sede_id,'nota_credito','nota_credito',gen_random_uuid(),new.id,f.id,jsonb_build_object('tipo','total','valor',total,'total_factura',total,
     'motivo',case when anulado then 'Contrato anulado' else 'Cambio de cliente en el contrato' end,'fecha',(now() at time zone 'America/Bogota')::date,'numero_contrato',new.numero_contrato),auth.uid());
   end if;
   update public.siigo_documentos set error=null,updated_at=now() where id=f.id and error like 'Contrato anulado%';
  end loop;
  if cliente_nuevo and not anulado then
   insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,creado_por)
   values(new.sede_id,'factura','ajuste',gen_random_uuid(),new.id,jsonb_build_object('fecha',(now() at time zone 'America/Bogota')::date,'tipo_factura',coalesce(new.siigo_tipo_factura,'electronica'),
    'tipo_venta',coalesce(new.siigo_tipo_venta,'alquiler'),'numero_contrato',new.numero_contrato,'reemplaza',true),auth.uid());
  end if;
  nota:=case when anulado then 'Contrato anulado: nota crédito total a Siigo.' else 'Cambio de cliente: nota crédito total y factura nueva en Siigo.' end;
  insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo) values(new.id,auth.uid(),nota,'Siigo');
  return new;
 end if;
 -- Value: only the change made in this edit (invoices made by hand may include items the ERP keeps apart, such as the deposit).
 total:=greatest(0,coalesce(new.valor_total,0)-coalesce(new.descuento_plan_ahorro,0))+coalesce(new.total_arreglos,0);
 facturado:=greatest(0,coalesce(old.valor_total,0)-coalesce(old.descuento_plan_ahorro,0))+coalesce(old.total_arreglos,0);
 dif:=round(total-facturado);
 if abs(dif)<=1000 then return new; end if;
 if dif<0 then
  select * into f from public.siigo_documentos where contrato_id=new.id and tipo='factura' and estado='enviado' order by private.siigo_saldo_factura(id) desc, created_at desc limit 1;
  insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
  values(f.sede_id,'nota_credito','nota_credito',gen_random_uuid(),new.id,f.id,jsonb_build_object('tipo','parcial','valor',-dif,'total_factura',coalesce((f.respuesta->>'total')::numeric,0),
   'motivo','Menor valor del contrato (edición)','fecha',(now() at time zone 'America/Bogota')::date,'numero_contrato',new.numero_contrato),auth.uid());
  nota:=format('El contrato bajó $%s: nota crédito parcial a la factura %s en Siigo.',to_char(-dif,'FM999G999G999'),coalesce(f.siigo_numero,'—'));
 else
  insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,creado_por)
  values(new.sede_id,'factura','ajuste',gen_random_uuid(),new.id,jsonb_build_object('fecha',(now() at time zone 'America/Bogota')::date,'tipo_factura',coalesce(new.siigo_tipo_factura,'electronica'),
   'tipo_venta',coalesce(new.siigo_tipo_venta,'alquiler'),'numero_contrato',new.numero_contrato,'adicional',true,'valor',dif),auth.uid());
  nota:=format('El contrato subió $%s: factura adicional por la diferencia en Siigo.',to_char(dif,'FM999G999G999'));
 end if;
 insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo) values(new.id,auth.uid(),nota,'Siigo');
 return new;
end $$;
-- «zz»: runs after siigo_contrato_factura, so the «hazle nota crédito» flag it sets is cleared once the credit note is queued.
create or replace trigger siigo_zz_ajuste_contrato after update of valor_total, total_arreglos, descuento_plan_ahorro, cliente_documento, estado on public.contratos
 for each row execute function private.siigo_ajuste_contrato();

-- Payments go to the invoice of the contract that still has a balance (the first one that covers it, else the one with most balance).
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
 select * into f from public.siigo_documentos where tipo='factura' and contrato_id=new.contrato_id and estado<>'anulado'
  order by (estado='enviado' and private.siigo_saldo_factura(id)>=new.valor_pagado) desc, (case when estado='enviado' then private.siigo_saldo_factura(id) else coalesce((datos->>'valor')::numeric,1e12) end) desc, created_at limit 1;
 if f.id is null then return new; end if;
 if f.datos->>'vinculada'='true' and (coalesce(new.fecha_pago,now()) at time zone 'America/Bogota')::date<(f.created_at at time zone 'America/Bogota')::date then return new; end if;
 select * into c from public.contratos where id=new.contrato_id;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
 values(f.sede_id,'recibo_caja','pago',new.id,new.contrato_id,f.id,jsonb_build_object('valor',new.valor_pagado,'medio',new.medio_pago,'recibo',new.numero_recibo,
  'fecha',(coalesce(new.fecha_pago,now()) at time zone 'America/Bogota')::date,'numero_contrato',c.numero_contrato),auth.uid())
 on conflict do nothing;
 return new;
end $$;
