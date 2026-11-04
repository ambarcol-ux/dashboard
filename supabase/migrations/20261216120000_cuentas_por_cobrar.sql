-- Finanzas › Cuentas por cobrar: permiso del panel. Se activa para los roles que ya ven el Dashboard o los Cierres de caja.
-- Revert: delete from public.roles_permisos where permiso='panel.cobros'; delete from public.permisos where codigo='panel.cobros';
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
 values('panel.cobros','Finanzas','Ver Cuentas por cobrar','Contratos con saldo por la fecha de entrega del vestido, con alertas a 7 y 3 días',false,30)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso,activo)
 select distinct rol_id,'panel.cobros',true from public.roles_permisos where activo and permiso in ('panel.dashboard','panel.caja') and rol_id<>'admin'
on conflict do nothing;
