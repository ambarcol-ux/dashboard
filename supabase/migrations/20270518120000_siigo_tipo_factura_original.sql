-- New invoices for an already invoiced contract (customer change, fallback additional invoice) take the type of the contract's
-- invoice in Siigo (factura de ingreso / electrónica) instead of defaulting to «electrónica» when the contract has no type saved.
-- Reversible: re-run private.siigo_ajuste_contrato from 20270514120000_siigo_ajuste_corrige_factura.sql; drop function private.siigo_tipo_factura_contrato(public.contratos).

create or replace function private.siigo_tipo_factura_contrato(c public.contratos) returns text
language sql stable security definer set search_path='' as $$
 select coalesce(c.siigo_tipo_factura,(select case when (d.respuesta#>>'{document,id}')=(k.parametros#>>'{documentos,factura_ingreso}') then 'ingreso' else 'electronica' end
  from public.siigo_documentos d left join private.credenciales_siigo k on k.sede_id=d.sede_id where d.contrato_id=c.id and d.tipo='factura' and d.estado='enviado' order by d.created_at limit 1),'electronica');
$$;

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
   values(new.sede_id,'factura','ajuste',gen_random_uuid(),new.id,jsonb_build_object('fecha',(now() at time zone 'America/Bogota')::date,'tipo_factura',private.siigo_tipo_factura_contrato(new),
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
 -- The same invoice is corrected (the contract's main invoice, not an additional one); the old paths below remain only as fallback.
 if true then
  select * into f from public.siigo_documentos where contrato_id=new.id and tipo='factura' and estado='enviado' and coalesce(datos->>'adicional','')<>'true'
  order by created_at desc limit 1;
  if found then
   insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
   values(f.sede_id,'correccion_factura','correccion',gen_random_uuid(),new.id,f.id,jsonb_build_object('valor',dif,'valor_anterior',facturado,'valor_nuevo',total,
    'motivo','Ajuste del valor del contrato','fecha',(now() at time zone 'America/Bogota')::date,'numero_contrato',new.numero_contrato,
    'tipo_factura',private.siigo_tipo_factura_contrato(new),'tipo_venta',coalesce(new.siigo_tipo_venta,'alquiler')),auth.uid());
   nota:=format('Ajuste del valor: se corrige la factura %s en Siigo de $%s a $%s (sin factura adicional).',coalesce(f.siigo_numero,'—'),
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
  values(new.sede_id,'factura','ajuste',gen_random_uuid(),new.id,jsonb_build_object('fecha',(now() at time zone 'America/Bogota')::date,'tipo_factura',private.siigo_tipo_factura_contrato(new),
   'tipo_venta',coalesce(new.siigo_tipo_venta,'alquiler'),'numero_contrato',new.numero_contrato,'adicional',true,'valor',dif),auth.uid());
  nota:=format('El contrato subió $%s: factura adicional por la diferencia en Siigo.',to_char(dif,'FM999G999G999'));
 end if;
 insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo) values(new.id,auth.uid(),nota,'Siigo');
 return new;
end $function$;
