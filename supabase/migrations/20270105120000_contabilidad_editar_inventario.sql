-- Contabilidad puede editar el inventario (p. ej. marcar alquiler/venta y precios) en todas las sedes, como líderes y franquiciados en la suya.
-- Reversión: delete from public.roles_permisos where rol_id='contabilidad' and permiso='inventario.editar';
insert into public.roles_permisos(rol_id,permiso,activo,todas_sedes) values ('contabilidad','inventario.editar',true,true)
on conflict do nothing;
