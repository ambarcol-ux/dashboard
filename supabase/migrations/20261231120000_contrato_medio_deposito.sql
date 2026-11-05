-- Contrato: cómo pagó la clienta el depósito de garantía (Efectivo, Transferencia, Tarjeta u Otro). Aditivo.
-- Reversión: alter table public.contratos drop column medio_deposito;
alter table public.contratos add column if not exists medio_deposito text
 check (medio_deposito is null or medio_deposito in ('Efectivo','Transferencia','Tarjeta','Otro'));
