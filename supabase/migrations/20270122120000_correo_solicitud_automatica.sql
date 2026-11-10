-- Correo › Solicitud de autorización: hasta ahora solo se enviaba con el botón de Correo › Envíos (lotes del 2 y 8 de noviembre);
-- su interruptor no hacía nada. Encendida, ahora se envía sola cada 10 minutos a cada persona nueva (una sola vez por correo),
-- con las mismas reglas del envío manual. Se deja encendida por decisión de administración.
-- Reversión: update public.correo_automatizaciones set activo=false where id='solicitud_autorizacion';
--   drop function private.correo_solicitud_autorizacion_auto(boolean); volver a aplicar public.correo_encolar_automatizaciones sin el bloque de abajo.
do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.correo_solicitud_autorizacion(boolean)'::regprocedure);
 d:=replace(d,'FUNCTION public.correo_solicitud_autorizacion(','FUNCTION private.correo_solicitud_autorizacion_auto(');
 d:=replace(d,$x$ if not public.es_admin() then raise exception 'Solo administración.' using errcode='42501'; end if;
$x$,'');
 if position('correo_solicitud_autorizacion_auto' in d)=0 or position('es_admin' in d)>0 then raise exception 'correo_solicitud_autorizacion: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;
revoke all on function private.correo_solicitud_autorizacion_auto(boolean) from public, anon, authenticated;

do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.correo_encolar_automatizaciones()'::regprocedure);
 d:=replace(d,$x$ end loop;
 return n;$x$,$x$ end loop;
 -- One-time authorization request, automatic while its switch is on.
 if exists(select 1 from public.correo_automatizaciones where id='solicitud_autorizacion' and activo) then
  n:=n+coalesce((private.correo_solicitud_autorizacion_auto(true)->>'encolados')::int,0);
 end if;
 return n;$x$);
 if position('correo_solicitud_autorizacion_auto' in d)=0 then raise exception 'correo_encolar_automatizaciones: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;

update public.correo_automatizaciones set activo=true,updated_at=now() where id='solicitud_autorizacion';
