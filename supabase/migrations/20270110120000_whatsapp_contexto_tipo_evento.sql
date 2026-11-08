-- IA de WhatsApp: la ficha de la clienta incluye el tipo de evento de sus contratos (para saber si le aplican las cláusulas [PreXV]).
-- Reversión: volver a aplicar private.whatsapp_contexto de 20270106120000_whatsapp_bandeja.sql.
do $do$
declare d text;
begin
 d:=pg_get_functiondef('private.whatsapp_contexto(text)'::regprocedure);
 d:=replace(d,'c.numero_contrato,c.estado,c.fecha_evento,','c.numero_contrato,c.estado,c.tipo_evento,c.fecha_evento,');
 if position('c.tipo_evento' in d)=0 then raise exception 'whatsapp_contexto: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;
