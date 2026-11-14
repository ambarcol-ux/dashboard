-- Correo «Te esperamos: reagenda tu cita»: lleva la promoción vigente para su sede y tipo de vestido (si hay) y el catálogo.
-- El párrafo de la promoción se omite solo cuando no hay promoción vigente (app/api/correo/procesar).
-- Reversión: volver a «where a.id='promocion' and x.activo» en public.correo_encolar_automatizaciones y restaurar el texto anterior:
--   asunto '{nombre}, te esperamos en Ámbar Couture'; cuerpo 'Hola, {nombre}.\n\nNotamos que no pudiste asistir a tu cita. ¡No te preocupes! Elige una nueva fecha y hora aquí:\n{enlace_cita}\n\nTe esperamos en Ámbar Couture {sede}.'
do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.correo_encolar_automatizaciones()'::regprocedure);
 d:=replace(d,$x$where a.id='promocion' and x.activo$x$,$x$where a.id in ('promocion','reagendar') and x.activo$x$);
 if position($x$a.id in ('promocion','reagendar')$x$ in d)=0 then raise exception 'correo_encolar_automatizaciones: texto no encontrado'; end if;
 execute d;
end $do$;
update public.correo_automatizaciones set asunto='{nombre}, tu vestido te sigue esperando 💛',
 cuerpo=E'Hola, {nombre}.\n\nTe extrañamos en tu cita en Ámbar Couture {sede}. Sabemos que a veces surgen imprevistos: elige una nueva fecha y hora en menos de un minuto aquí:\n{enlace_cita}\n\nAprovecha: tenemos {promocion}, válida hasta el {vigencia}. {condiciones}\n\nMientras tanto, mira los vestidos de tu sede:\n{catalogo}\n\nSi te queda difícil venir, también puedes hacer tu cita virtual desde casa.',
 updated_at=now()
where id='reagendar';
