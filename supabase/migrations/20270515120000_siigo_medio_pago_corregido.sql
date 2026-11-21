-- When a contract payment's method or account is corrected in Cierres de caja (private.editar_movimiento_caja → caja_movimientos_historial),
-- Siigo follows: a receipt not sent yet takes the new method; a payment that went inside the invoice («Incluido en FV-…») queues a
-- «correccion_factura» that moves that value to the new payment form on the same invoice (lib/siigo.ts edits a «factura de ingreso»).
-- A separate receipt (RC) already in Siigo is left for contabilidad, with a note in the contract history.
-- Reversible: drop trigger siigo_medio_pago_corregido on public.caja_movimientos_historial; drop function private.siigo_medio_pago_corregido().

create or replace function private.siigo_medio_pago_corregido() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.caja_movimientos; r public.siigo_documentos; c public.contratos; v numeric;
begin
 select * into m from public.caja_movimientos where id=new.movimiento_id;
 if m.id is null or m.origen<>'pago' then return new; end if;
 if (new.anterior->>'medio') is not distinct from (new.nuevo->>'medio') and (new.anterior->>'cuenta_id') is not distinct from (new.nuevo->>'cuenta_id') then return new; end if;
 select * into c from public.contratos where id=m.contrato_id;
 select * into r from public.siigo_documentos where tipo='recibo_caja' and origen='pago' and origen_id=m.origen_id order by created_at desc limit 1;
 if r.id is null then return new; end if;
 v:=coalesce((new.nuevo->>'valor')::numeric,m.valor);
 if r.estado in ('pendiente','error') then
  update public.siigo_documentos set datos=datos||jsonb_build_object('medio',new.nuevo->>'medio','valor',v),updated_at=now() where id=r.id;
 elsif r.estado='enviado' and coalesce(r.siigo_numero,'') like 'Incluido en %' and r.factura_id is not null then
  insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
  values(r.sede_id,'correccion_factura','correccion',gen_random_uuid(),r.contrato_id,r.factura_id,jsonb_build_object('pago_medio',true,'valor',v,
   'medio_anterior',new.anterior->>'medio','cuenta_anterior',new.anterior->>'cuenta_id','medio_nuevo',new.nuevo->>'medio','cuenta_nuevo',new.nuevo->>'cuenta_id',
   'motivo',new.motivo,'fecha',(now() at time zone 'America/Bogota')::date,'numero_contrato',c.numero_contrato),auth.uid());
  insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo) values(c.id,auth.uid(),
   format('Medio del abono de $%s corregido de %s a %s: se corrige la forma de pago en la factura %s de Siigo.',to_char(v,'FM999G999G999'),new.anterior->>'medio',new.nuevo->>'medio',replace(r.siigo_numero,'Incluido en ','')),'Siigo');
 elsif r.estado='enviado' then
  insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo) values(c.id,auth.uid(),
   format('Medio del abono corregido de %s a %s: el recibo %s ya está en Siigo, contabilidad debe ajustar su forma de pago.',new.anterior->>'medio',new.nuevo->>'medio',coalesce(r.siigo_numero,'—')),'Siigo');
 end if;
 return new;
end $$;
create or replace trigger siigo_medio_pago_corregido after insert on public.caja_movimientos_historial
 for each row execute function private.siigo_medio_pago_corregido();
