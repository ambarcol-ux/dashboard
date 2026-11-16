-- Botón de horario del mensaje «reagendar» (rg_<fecha>_<hora>): la reprogramación exige la versión de la cita (updated_at) y el botón
-- no la enviaba, así que siempre caía en «ese horario se acaba de ocupar». Ahora la envía.
-- Reversión: re-aplicar el cuerpo de public.respuesta_whatsapp_primera_cita de 20270308120000_botones_etapa4.sql.
do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.respuesta_whatsapp_primera_cita(text,text,text,text)'::regprocedure);
 d:=replace(d,$x$jsonb_build_object('fecha',substr(p_accion,4,10),$x$,$x$jsonb_build_object('version',c.updated_at,'fecha',substr(p_accion,4,10),$x$);
 if position($x$'version',c.updated_at$x$ in d)=0 then raise exception 'respuesta_whatsapp_primera_cita: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;
