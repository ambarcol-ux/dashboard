-- WhatsApp con botones: si la clienta escribe en vez de tocar el botón, la IA clasifica su texto contra el último mensaje
-- automático que espera respuesta (últimas 24 h) y el ERP ejecuta la misma acción que el botón.
-- Reversión: drop function public.flujo_pendiente_whatsapp(text);
create or replace function public.flujo_pendiente_whatsapp(p_tel text) returns table(provider_id text, tipo text)
language sql stable security definer set search_path='' as $$
 select m.provider_id::text, m.tipo from public.primeras_citas_mensajes m join public.primeras_citas c on c.id=m.cita_id
 where right(regexp_replace(coalesce(c.telefono,''),'\D','','g'),10)=right(regexp_replace(coalesce(p_tel,''),'\D','','g'),10)
  and m.estado='enviado' and m.respondido_at is null and m.provider_id is not null and m.updated_at>now()-interval '24 hours'
  and m.revision=c.revision and c.estado<>'cancelada'
  and m.tipo in ('confirmacion','recordatorio24','recordatorio2','confirmar_cancelacion','post_cita','pregunta_alquiler','pregunta_motivo','satisfaccion','satisfaccion_falla')
 order by m.updated_at desc limit 1;
$$;
revoke all on function public.flujo_pendiente_whatsapp(text) from public, anon, authenticated;
grant execute on function public.flujo_pendiente_whatsapp(text) to service_role;
