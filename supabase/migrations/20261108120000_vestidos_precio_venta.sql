-- Inventario: precio de venta sugerido (opcional).
alter table public.vestidos add column if not exists precio_venta numeric null;
