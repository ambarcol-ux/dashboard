-- El historial de mantenimiento pertenece al contrato y debe acompañar su
-- eliminación permanente. La restricción de producción estaba en NO ACTION,
-- aunque el modelo de la aplicación ya declara esta relación en cascada.
alter table public.mantenimiento_bitacora
  drop constraint if exists mantenimiento_bitacora_contrato_id_fkey;

alter table public.mantenimiento_bitacora
  add constraint mantenimiento_bitacora_contrato_id_fkey
  foreign key (contrato_id)
  references public.contratos(id)
  on delete cascade;
