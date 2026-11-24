-- Plan Ahorro XV visible to every non-admin role (asesora, asesora líder, franquiciado, contabilidad); each sees only the plans its caja access allows.
-- Revert: set activo=false on these 'panel.plan_ahorro' rows of public.roles_permisos.
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
values('panel.plan_ahorro','Ventas y CRM','Ver Plan Ahorro XV','',false,62) on conflict do nothing;
insert into public.roles_permisos(rol_id,permiso,activo)
select r,'panel.plan_ahorro',true from unnest(array['asesora','asesora_lider','franquiciado','contabilidad']) r
where not exists(select 1 from public.roles_permisos x where x.rol_id=r and x.permiso='panel.plan_ahorro');
