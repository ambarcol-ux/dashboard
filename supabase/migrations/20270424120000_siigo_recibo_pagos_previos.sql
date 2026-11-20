-- Siigo: an abono with a payment date before its invoice was linked from Siigo (invoice made by hand, «vinculada») is already in Siigo
-- (paid in the invoice or with a manual receipt). Registering it late in the ERP must not send a second receipt.
-- Reversible: restore private.siigo_pago_recibo from 20270414120000_siigo_envio.sql.
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
 if f.datos->>'vinculada'='true' and (coalesce(new.fecha_pago,now()) at time zone 'America/Bogota')::date<(f.created_at at time zone 'America/Bogota')::date then return new; end if;
 select * into c from public.contratos where id=new.contrato_id;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
 values(f.sede_id,'recibo_caja','pago',new.id,new.contrato_id,f.id,jsonb_build_object('valor',new.valor_pagado,'medio',new.medio_pago,'recibo',new.numero_recibo,
  'fecha',(coalesce(new.fecha_pago,now()) at time zone 'America/Bogota')::date,'numero_contrato',c.numero_contrato),auth.uid())
 on conflict do nothing;
 return new;
end $$;
