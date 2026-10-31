-- Catálogo de vestidos en el menú (Ventas y CRM): permiso de panel; lo reciben los roles que ya ven la Agenda de vestidos.
-- Revert: remove permiso 'panel.catalogo' and its roles_permisos rows.
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
values('panel.catalogo','Ventas y CRM','Ver Catálogo de vestidos','Vestidos por tipo y categoría con foto, precio y PDF',false,14)
on conflict do nothing;
insert into public.roles_permisos(rol_id,permiso,activo)
select rol_id,'panel.catalogo',true from public.roles_permisos where permiso='panel.disponibilidad' and activo
on conflict do nothing;
