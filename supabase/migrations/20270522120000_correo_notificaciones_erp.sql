-- One address for every internal ERP notice (allies, ERP news): «correo_notificaciones_erp» in Configuración › Parámetros (tipo
-- correo). Notices no longer go to every administrator. The value is set from the owner's instruction in this deploy.
-- Reversible: delete from public.config_parametros where clave='correo_notificaciones_erp'; restore the tipo check to (entero, booleano).

alter table public.config_parametros drop constraint if exists config_parametros_tipo_check, add constraint config_parametros_tipo_check check (tipo = any (array['entero','booleano','correo']));
