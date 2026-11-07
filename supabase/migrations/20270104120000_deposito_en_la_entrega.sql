-- Contratos: el depósito puede quedar «En la entrega» (se cobra con su comprobante al entregar el vestido).
-- Reversión: alter table public.contratos drop constraint contratos_medio_deposito_check, add constraint contratos_medio_deposito_check check (medio_deposito is null or medio_deposito in ('Efectivo','Transferencia','Tarjeta','Otro'));
alter table public.contratos drop constraint if exists contratos_medio_deposito_check;
alter table public.contratos add constraint contratos_medio_deposito_check check (medio_deposito is null or medio_deposito in ('Efectivo','Transferencia','Tarjeta','Otro','En la entrega'));
