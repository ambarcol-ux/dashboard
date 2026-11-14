-- Aviso emergente «Atención de una persona»: solo casos de las últimas 48 horas (los más viejos siguen en WhatsApp 304 › filtro y en el Pipeline).
-- Reversión: volver a «w.ultimo_entrante_at>now()-interval '14 days'» (20270222120000_crm_autogestion_leads.sql).
create or replace function public.chats_atender_persona()
returns table(id uuid, nombre text, telefono text, sede text, motivo text, desde timestamptz)
language sql stable security definer set search_path='' as $$
 select w.id, w.nombre, w.telefono, s.nombre::text, w.ia_motivo, coalesce(w.ia_at,w.ultimo_entrante_at)
 from public.whatsapp_conversaciones w left join public.sedes s on s.id=w.sede_id
 where w.ia_atender and coalesce(w.ia_at,w.ultimo_entrante_at)>now()-interval '48 hours' and private.whatsapp_puede_ver(w.sede_id)
 order by coalesce(w.ia_at,w.ultimo_entrante_at) limit 50
$$;
