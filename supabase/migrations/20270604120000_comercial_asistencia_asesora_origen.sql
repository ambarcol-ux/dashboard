-- Comercial (Primeras visitas), to measure conversion and what the ads produce:
--  · Asesora: when a visit's result says she attended, the visit keeps who attended her (the person registering the result) if it had
--    no advisor. Past attended visits get their advisor from who registered the result when that person is an advisor.
--  · Asistencia: Cierres de caja › Pendientes de la sede lists the store's visits already past without a result, before the automatic
--    «no asistió» (48 h) marks them.
--  · Origen: a new visit takes, when it has none, the channel of the client's conversation (WhatsApp, Instagram, Facebook) and the ad that
--    started it; visits since September get the same.
-- Reversible: re-apply primeras_citas_anuncio, registrar_resultado_primera_cita and caja_pendientes from their previous migrations.

-- Extends the existing primeras_citas_anuncio (ad of the conversation) with the conversation's channel.
create or replace function private.primeras_citas_anuncio() returns trigger
language plpgsql security definer set search_path='' as $$
declare canal text;
begin
 if new.anuncio_id is null and length(regexp_replace(coalesce(new.telefono,''),'\D','','g'))>=10 then
  select w.anuncio_id into new.anuncio_id from public.whatsapp_conversaciones w
  where w.anuncio_id is not null and right(w.telefono,10)=right(regexp_replace(new.telefono,'\D','','g'),10)
    and w.anuncio_at between now()-interval '30 days' and now()+interval '1 hour'
  order by w.anuncio_at desc limit 1;
 end if;
 if new.como_se_entero is null and length(regexp_replace(coalesce(new.telefono,''),'\D','','g'))>=10 then
  select w.canal into canal from public.whatsapp_conversaciones w
  where right(regexp_replace(coalesce(w.telefono,''),'\D','','g'),10)=right(regexp_replace(new.telefono,'\D','','g'),10)
  order by (w.anuncio_id is not null) desc, w.ultimo_at desc nulls last limit 1;
  if canal is not null then new.como_se_entero:=case canal when 'instagram' then 'Instagram' when 'messenger' then 'Facebook' else 'WhatsApp' end; end if;
 end if;
 return new;
end $$;

update public.primeras_citas c set como_se_entero=(select case x.canal when 'instagram' then 'Instagram' when 'messenger' then 'Facebook' else 'WhatsApp' end
  from public.whatsapp_conversaciones x where right(regexp_replace(coalesce(x.telefono,''),'\D','','g'),10)=right(regexp_replace(c.telefono,'\D','','g'),10)
  order by (x.anuncio_id is not null) desc, x.ultimo_at desc nulls last limit 1)
where c.fecha>=date '2026-09-01' and c.como_se_entero is null and length(regexp_replace(coalesce(c.telefono,''),'\D','','g'))>=10
 and exists(select 1 from public.whatsapp_conversaciones x where right(regexp_replace(coalesce(x.telefono,''),'\D','','g'),10)=right(regexp_replace(c.telefono,'\D','','g'),10));

update public.primeras_citas c set asesora_id=c.responsable_id
from public.profiles p
where p.id=c.responsable_id and c.asesora_id is null and c.estado in ('asistio','seguimiento','no_cerro')
 and coalesce(c.resultado_comercial,'')<>'' and coalesce(p.rol_id,p.rol) in ('asesora','asesora_lider');

do $mig$
declare d text; a text;
begin
 d:=pg_get_functiondef('private.registrar_resultado_primera_cita(uuid,boolean,boolean,boolean,text,timestamp with time zone)'::regprocedure);
 a:='motivo=case when nota<>'''' then nota else motivo end,responsable_id=auth.uid(),';
 if position(a in d)=0 then raise exception 'registrar_resultado_primera_cita: punto'; end if;
 d:=replace(d,a,a||'asesora_id=case when p_asistio then coalesce(c.asesora_id,auth.uid()) else c.asesora_id end,');
 execute d;

 d:=pg_get_functiondef('public.caja_pendientes(uuid)'::regprocedure);
 a:=E' return r;\nend';
 if position(a in d)=0 then raise exception 'caja_pendientes: punto'; end if;
 d:=replace(d,a,$n$ select count(*) into n from public.primeras_citas c where c.sede_id=p_sede and c.origen='cita' and c.estado in ('agendada','confirmada')
  and (c.fecha+c.hora)<(now() at time zone 'America/Bogota') and c.fecha>=private.caja_hoy()-3;
 if n>0 then r:=r||jsonb_build_array(jsonb_build_object('nivel','alta','texto',format('%s primera(s) visita(s) ya pasaron sin resultado: marca en Primeras visitas si vino y si alquiló (si no, en 48 horas quedan como «no asistió»).',n))); end if;
 return r;
end$n$);
 execute d;
end $mig$;
