-- «Error de digitación»: a contract value typed wrong is corrected on the same Siigo invoice instead of an additional invoice.
-- The edit screen stamps contratos.siigo_correccion_at right before saving; when the value then changes, private.siigo_ajuste_contrato
-- queues one «correccion_factura» job for the contract's invoice. The worker (lib/siigo.ts) edits a «factura de ingreso» in Siigo; an
-- electronic invoice (DIAN) cannot be edited, so it gets a credit note (lower value) or a total credit note plus a new invoice (higher).
-- Reversible: drop column contratos.siigo_correccion_at and restore both functions from 20270501120000 / their previous definitions.

alter table public.contratos add column if not exists siigo_correccion_at timestamptz;
alter table public.siigo_documentos drop constraint siigo_documentos_tipo_check, add constraint siigo_documentos_tipo_check check (tipo = any (array['factura','recibo_caja','anticipo','devolucion_anticipo','gasto','soporte_gasto','soporte_producto','nota_credito','comprobante','compra','correccion_factura']));

create or replace function private.siigo_ajuste_contrato() returns trigger
language plpgsql security definer set search_path='' as $function$
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
 total:=greatest(0,coalesce(new.valor_total,0)-coalesce(new.descuento_plan_ahorro,0))+coalesce(new.total_arreglos,0);
 facturado:=greatest(0,coalesce(old.valor_total,0)-coalesce(old.descuento_plan_ahorro,0))+coalesce(old.total_arreglos,0);
 dif:=round(total-facturado);
 if abs(dif)<=1000 then return new; end if;
 -- Typing error: the same invoice is corrected (the contract's main invoice, not an additional one).
 if new.siigo_correccion_at is not null and new.siigo_correccion_at>now()-interval '10 minutes' then
  select * into f from public.siigo_documentos where contrato_id=new.id and tipo='factura' and estado='enviado' and coalesce(datos->>'adicional','')<>'true'
  order by created_at desc limit 1;
  if found then
   insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
   values(f.sede_id,'correccion_factura','correccion',gen_random_uuid(),new.id,f.id,jsonb_build_object('valor',dif,'valor_anterior',facturado,'valor_nuevo',total,
    'motivo','Error de digitación en el valor del contrato','fecha',(now() at time zone 'America/Bogota')::date,'numero_contrato',new.numero_contrato,
    'tipo_factura',coalesce(new.siigo_tipo_factura,'electronica'),'tipo_venta',coalesce(new.siigo_tipo_venta,'alquiler')),auth.uid());
   nota:=format('Error de digitación: se corrige la factura %s en Siigo de $%s a $%s (sin factura adicional).',coalesce(f.siigo_numero,'—'),
    to_char(facturado,'FM999G999G999'),to_char(total,'FM999G999G999'));
   insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo) values(new.id,auth.uid(),nota,'Siigo');
   return new;
  end if;
 end if;
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
end $function$;

create or replace function public.siigo_resultado_servidor(p_id uuid, p_ok boolean, p_siigo_id text, p_numero text, p_error text, p_respuesta jsonb, p_esperar boolean default false)
returns void language plpgsql security definer set search_path='' as $function$
declare d public.siigo_documentos;
begin
 update public.siigo_documentos set
  estado=case when p_ok then 'enviado' when p_esperar then 'pendiente' else 'error' end,
  intentos=intentos+case when p_ok or p_esperar then 0 else 1 end,
  siigo_id=coalesce(p_siigo_id,siigo_id),siigo_numero=coalesce(p_numero,siigo_numero),error=case when p_ok then null else left(p_error,1000) end,
  respuesta=coalesce(p_respuesta,respuesta),enviado_at=case when p_ok then now() else enviado_at end,updated_at=now()
 where id=p_id returning * into d;
 if p_ok and d.tipo='factura' and d.contrato_id is not null and p_numero is not null then
  update public.contratos set numero_factura=p_numero,factura_registrada_at=now() where id=d.contrato_id
   and (numero_factura is null or lower(numero_factura) like 'siigo%' or coalesce(d.datos->>'reemplaza','')='true');
 end if;
 -- An invoice edited in Siigo (typing error): the original invoice keeps Siigo's new version (new total) for the reconciliation.
 if p_ok and d.tipo='correccion_factura' and coalesce(p_respuesta->>'editada','')='true' and d.factura_id is not null then
  update public.siigo_documentos set respuesta=p_respuesta-'editada',updated_at=now() where id=d.factura_id;
 end if;
 if d.tipo='factura' and d.origen='venta' then
  update public.ventas_vestidos set siigo_estado=case when p_ok then 'enviada' when p_esperar then 'pendiente' else 'error' end,
   numero_factura=case when p_ok then coalesce(p_numero,numero_factura) else numero_factura end,
   codigo_siigo=case when p_ok then coalesce(p_respuesta#>>'{items,0,code}',codigo_siigo) else codigo_siigo end where id=d.origen_id;
 end if;
end $function$;
