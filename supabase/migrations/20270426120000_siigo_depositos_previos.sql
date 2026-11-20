-- Siigo: deposits received before Siigo was switched on (20/11/2026) are already in Siigo (made by hand). Registering them late in the
-- ERP (control, receipts) must not send a new advance receipt; and returning one must not invent an advance from the contract: the
-- return is crossed with the customer's advance receipt already in Siigo (lib/siigo.ts).
-- Reversible: restore private.siigo_deposito_documento from 20270411120000_siigo_documentos.sql.
create or replace function private.siigo_deposito_documento() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.contratos; ant uuid;
begin
 if new.tipo not in ('ingreso','devolucion') or coalesce(new.monto,0)<=0 then return new; end if;
 select * into c from public.contratos where id=new.contrato_id;
 if c.id is null or c.sede_id is null or not private.siigo_activo(c.sede_id) then return new; end if;
 if new.tipo='ingreso' then
  if coalesce(new.fecha_pago_deposito,new.fecha)<date '2026-11-20' then return new; end if;
  insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,creado_por)
  values(c.sede_id,'anticipo','movimiento_deposito',new.id,c.id,jsonb_build_object('valor',new.monto,'medio',new.metodo,'fecha',coalesce(new.fecha_pago_deposito,new.fecha),'numero_contrato',c.numero_contrato),auth.uid())
  on conflict do nothing;
  return new;
 end if;
 select id into ant from public.siigo_documentos where tipo='anticipo' and contrato_id=c.id and estado<>'anulado' order by created_at limit 1;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
 values(c.sede_id,'devolucion_anticipo','movimiento_deposito',new.id,c.id,ant,jsonb_build_object('valor',new.monto,'medio',new.metodo,'fecha',new.fecha,'numero_contrato',c.numero_contrato,'descuento',new.descuento),auth.uid())
 on conflict do nothing;
 return new;
end $$;
