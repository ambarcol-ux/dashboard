-- Inventario: clasificación «Vestido de cambio» (antes de «Otro»).
insert into public.clasificaciones_vestido (nombre, orden) values ('Vestido de cambio',5) on conflict (nombre) do nothing;
update public.clasificaciones_vestido set orden=6 where nombre='Otro';
