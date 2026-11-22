-- New contracts get their «fecha de elaboración» automatically (today in Bogotá). It can still be changed with motivo
-- (cambiar_fecha_elaboracion). Existing contracts are not touched: where it is empty, every report keeps using the creation date.
-- Reversible: alter table public.contratos alter column fecha_elaboracion drop default;
alter table public.contratos alter column fecha_elaboracion set default ((now() at time zone 'America/Bogota')::date);
