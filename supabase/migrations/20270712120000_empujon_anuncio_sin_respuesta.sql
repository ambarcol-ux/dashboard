-- WhatsApp: a customer who came from an ad, wrote only the ad's pre-filled message and did not answer the AI's warm-up question gets the
-- AI's short follow-up 2 hours later offering the visit with buttons (instead of 16–23 h). Same rules: 8 a. m.–8 p. m., once per message of hers.
-- Reversión: replace the added «or (… anuncio_id …)» condition back out of private.crm_empujon_tomar.
do $m$
declare f text:=pg_get_functiondef('private.crm_empujon_tomar(integer)'::regprocedure);
 a text:='~* ''ver vestidos''))';
 b text:='~* ''ver vestidos'')
    or (w.ultimo_entrante_at between now()-interval ''23 hours'' and now()-interval ''2 hours'' and w.anuncio_id is not null
     and (select count(*) from public.whatsapp_mensajes x where x.conversacion_id=w.id and x.direccion=''entrante'')=1))';
begin
 if position('w.anuncio_id is not null' in f)>0 then return; end if;
 if position(a in f)=0 then raise exception 'crm_empujon_tomar cambió: revisar antes de aplicar'; end if;
 execute replace(f,a,b);
end $m$;
