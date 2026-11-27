-- WhatsApp: a customer who tapped «Ver vestidos» (catalog) and went quiet gets the AI's short follow-up («¿Cuál te gustó? Te separo una cita»)
-- 2 hours later instead of the usual 16–23 hours (still inside the 24 h window, 8 a. m.–8 p. m., once per message of hers).
-- Reversión: replace the condition back to «where w.ultimo_entrante_at between now()-interval '23 hours' and now()-interval '16 hours'».
do $m$
declare f text:=pg_get_functiondef('private.crm_empujon_tomar(integer)'::regprocedure);
 a text:='where w.ultimo_entrante_at between now()-interval ''23 hours'' and now()-interval ''16 hours''';
 b text:='where (w.ultimo_entrante_at between now()-interval ''23 hours'' and now()-interval ''16 hours''
    or (w.ultimo_entrante_at between now()-interval ''23 hours'' and now()-interval ''2 hours''
     and (select x.texto from public.whatsapp_mensajes x where x.conversacion_id=w.id and x.direccion=''entrante'' order by x.created_at desc limit 1) ~* ''ver vestidos''))';
begin
 if position('ver vestidos' in f)>0 then return; end if;
 if position(a in f)=0 then raise exception 'crm_empujon_tomar cambió: revisar antes de aplicar'; end if;
 execute replace(f,a,b);
end $m$;
