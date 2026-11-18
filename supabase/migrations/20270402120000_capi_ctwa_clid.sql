-- Meta: the first-visit / contract events also carry the click of the WhatsApp ad («ctwa_clid») that started the chat, so Meta can tell
-- which ad brought each appointment, attendance and rental (Conversions API for Business Messaging). The click is taken from the
-- latest ad chat of the same phone (last 10 digits) in the 28 days before the event. Only the job returned to the worker changes.
-- Reversible: re-apply public.tomar_capi_primera_cita without the 'ctwa_clid' key and drop private.capi_ctwa_clid.

create or replace function private.capi_ctwa_clid(p_telefono text,p_hasta timestamptz) returns text
language sql stable security definer set search_path='' as $$
 select w.ctwa_clid from public.whatsapp_conversaciones w
 where w.ctwa_clid is not null and length(regexp_replace(coalesce(p_telefono,''),'\D','','g'))>=10
  and right(regexp_replace(w.telefono,'\D','','g'),10)=right(regexp_replace(p_telefono,'\D','','g'),10)
  and coalesce(w.anuncio_at,w.created_at)<=p_hasta+interval '1 day' and coalesce(w.anuncio_at,w.created_at)>p_hasta-interval '28 days'
 order by coalesce(w.anuncio_at,w.created_at) desc limit 1;
$$;
revoke all on function private.capi_ctwa_clid(text,timestamptz) from public,anon,authenticated;
grant execute on function private.capi_ctwa_clid(text,timestamptz) to service_role;

create or replace function public.tomar_capi_primera_cita() returns jsonb
language plpgsql set search_path to '' as $function$
declare e public.primeras_citas_capi; c public.primeras_citas; k public.contratos; tel text;
begin
 update public.primeras_citas_capi set estado='error',respuesta='Resultado desconocido; se reintentará.',updated_at=now() where estado='enviando' and updated_at<now()-interval '10 minutes';
 select * into e from public.primeras_citas_capi where estado in ('pendiente','error') and intentos<5 and (estado='pendiente' or updated_at<now()-interval '10 minutes')
  order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 if e.event_time<now()-(case when e.action_source='physical_store' then interval '62 days' else interval '7 days' end) then
  update public.primeras_citas_capi set estado='omitido',respuesta=case when e.action_source='physical_store' then 'Venta con más de 62 días' else 'Evento con más de 7 días' end,updated_at=now() where id=e.id;
  return jsonb_build_object('omitido',true);
 end if;
 update public.primeras_citas_capi set estado='enviando',intentos=intentos+1,updated_at=now() where id=e.id;
 if e.cita_id is not null then
  select * into c from public.primeras_citas where id=e.cita_id;
  return jsonb_build_object('evento',to_jsonb(e),'cita',jsonb_build_object('id',c.id,'email',c.email,'telefono',c.telefono,'cliente_nombre',c.cliente_nombre),'sede',(select nombre from public.sedes where id=c.sede_id),
   'ctwa_clid',private.capi_ctwa_clid(c.telefono,e.event_time));
 end if;
 select * into k from public.contratos where id=e.contrato_id;
 tel:=coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp);
 return jsonb_build_object('evento',to_jsonb(e),'cita',jsonb_build_object('id',coalesce(k.primera_cita_id,k.id),'email',k.cliente_email,'telefono',tel,'cliente_nombre',k.cliente_nombre),'sede',(select nombre from public.sedes where id=k.sede_id),
  'ctwa_clid',private.capi_ctwa_clid(coalesce((select telefono from public.primeras_citas where id=k.primera_cita_id),tel),e.event_time));
end;
$function$;
