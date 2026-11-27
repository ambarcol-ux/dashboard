-- «Consignación a banco» (cash from the drawer deposited in the store's bank account) goes to Siigo by itself as an internal
-- journal (traslado): debit the bank chosen (or the store's default bank account), credit the cash drawer. Only stores with
-- Siigo active. The previous consignments are queued too (approved by the owner). Reversible: remove trigger
-- siigo_consignacion_documento (queued documents can be annulled from the queue).
create or replace function private.siigo_consignacion_documento() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.categoria<>'Consignación a banco' or new.tipo<>'egreso' or new.anulado_at is not null or coalesce(new.valor,0)<=0
  or new.sede_id is null or not private.siigo_activo(new.sede_id) then return new; end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por)
 values(new.sede_id,'comprobante','consignacion_banco',new.id,jsonb_build_object('valor',new.valor,'fecha',new.fecha,
  'descripcion',left(format('Consignación de efectivo a banco · %s',coalesce(new.descripcion,'')),300),
  'lineas',jsonb_build_array(jsonb_build_object('cuenta','caja','cuenta_id',new.cuenta_destino_id,'medio','Transferencia','mov','Debit'),
   jsonb_build_object('cuenta','caja','cuenta_id',new.cuenta_id,'medio','Efectivo','mov','Credit'))),new.usuario_id) on conflict do nothing;
 return new;
end $$;
revoke all on function private.siigo_consignacion_documento() from public,anon,authenticated;
create or replace trigger siigo_consignacion_documento after insert on public.caja_movimientos
 for each row execute function private.siigo_consignacion_documento();

-- Previous consignments: queued once (the trigger logic, applied to the existing rows).
insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por)
select m.sede_id,'comprobante','consignacion_banco',m.id,jsonb_build_object('valor',m.valor,'fecha',m.fecha,
  'descripcion',left(format('Consignación de efectivo a banco · %s',coalesce(m.descripcion,'')),300),
  'lineas',jsonb_build_array(jsonb_build_object('cuenta','caja','cuenta_id',m.cuenta_destino_id,'medio','Transferencia','mov','Debit'),
   jsonb_build_object('cuenta','caja','cuenta_id',m.cuenta_id,'medio','Efectivo','mov','Credit'))),m.usuario_id
from public.caja_movimientos m
where m.categoria='Consignación a banco' and m.tipo='egreso' and m.anulado_at is null and coalesce(m.valor,0)>0 and private.siigo_activo(m.sede_id)
 and not exists(select 1 from public.siigo_documentos d where d.origen='consignacion_banco' and d.origen_id=m.id)
on conflict do nothing;
