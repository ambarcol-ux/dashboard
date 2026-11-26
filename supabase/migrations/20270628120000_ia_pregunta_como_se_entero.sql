-- The WhatsApp AI asks once how the customer found Ámbar (Google, Instagram, recommendation…) when the chat did not come from an ad;
-- the answer is kept on the conversation and the first visit booked from that phone takes it instead of the generic «WhatsApp».
-- Reversible: remove the added line in private.primeras_citas_anuncio (the column can stay).
alter table public.whatsapp_conversaciones add column if not exists como_se_entero text;

do $mig$
declare d text:=pg_get_functiondef('private.primeras_citas_anuncio'::regproc);
 a text:=$q$if canal is not null then new.como_se_entero:=case canal when 'instagram' then 'Instagram' when 'messenger' then 'Facebook' else 'WhatsApp' end; end if;$q$;
 b text:=$q$
  new.como_se_entero:=coalesce((select w2.como_se_entero from public.whatsapp_conversaciones w2 where w2.como_se_entero is not null
   and right(regexp_replace(coalesce(w2.telefono,''),'\D','','g'),10)=right(regexp_replace(new.telefono,'\D','','g'),10)
   order by w2.ultimo_at desc nulls last limit 1),new.como_se_entero);$q$;
begin
 if position('w2.como_se_entero' in d)>0 then return; end if;
 if position(a in d)=0 then raise exception 'primeras_citas_anuncio: punto no encontrado'; end if;
 d:=replace(d,a,a||b);
 execute d;
end $mig$;
