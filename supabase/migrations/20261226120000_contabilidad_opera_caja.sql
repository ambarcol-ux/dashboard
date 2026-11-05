-- Contabilidad también registra movimientos y cierra caja (antes solo veía). Aprobado por el usuario 05/11/2026.
-- Reversión: devolver private.caja_operar a «caja_ver(p_sede) and not exists(... rol='contabilidad')».
create or replace function private.caja_operar(p_sede uuid)
 returns boolean language sql stable security definer set search_path to ''
as $function$
 select private.caja_ver(p_sede);
$function$;
