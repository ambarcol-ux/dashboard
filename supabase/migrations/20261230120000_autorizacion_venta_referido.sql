-- Autorización de datos: nuevos orígenes «venta» (venta de vestidos) y «referido» (enlace de referido de aliados).
-- Solo amplía la lista permitida; no cambia ningún registro.
-- Reversión: volver al check con ('agendamiento','confirmacion','vitrina','contrato','vinculacion_aliado','clienta_aliado').
alter table public.autorizaciones_datos drop constraint if exists autorizaciones_datos_origen_check;
alter table public.autorizaciones_datos add constraint autorizaciones_datos_origen_check
 check (origen = any (array['agendamiento','confirmacion','vitrina','contrato','vinculacion_aliado','clienta_aliado','venta','referido']));

-- El registro desde el ERP (equipo) acepta también el origen «venta».
create or replace function public.registrar_autorizacion(p_documento text, p_telefono text, p_nombre text, p_email text, p_sede uuid, p_origen text, p_tratamiento boolean, p_comercial boolean)
 returns jsonb language plpgsql set search_path to ''
as $function$
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 if p_origen not in ('vitrina','contrato','venta') then raise exception 'Origen no válido.'; end if;
 return private.registrar_autorizacion(p_documento,p_telefono,p_nombre,p_email,p_sede,p_origen,p_tratamiento,p_comercial,false);
end $function$;
