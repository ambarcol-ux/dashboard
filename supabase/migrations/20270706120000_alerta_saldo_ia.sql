-- Alert when the WhatsApp AI stops because the Anthropic account ran out of credit: the owner gets an email (at most every 6 hours
-- while it lasts) and administration sees a red banner in the ERP until the AI answers again.
-- Reversible: the columns can stay; remove the banner function.
alter table public.whatsapp_ia_config add column if not exists ia_sin_saldo_at timestamptz,
 add column if not exists ia_saldo_avisado_at timestamptz,
 add column if not exists alerta_saldo_usuario uuid references public.profiles(id);
-- The owner (Propietario) receives the email; administration can change it.
update public.whatsapp_ia_config set alerta_saldo_usuario=coalesce(alerta_saldo_usuario,'9978c8f3-9961-45a9-91d4-410cd30511ed') where id=1;
-- The current outage (since 26/11) shows at once.
update public.whatsapp_ia_config set ia_sin_saldo_at=coalesce(ia_sin_saldo_at,(select min(ia_at) from public.whatsapp_conversaciones where ia_error ilike '%credit balance%' and ia_at>now()-interval '3 days')) where id=1;

-- Banner for administration: since when the AI has no credit and how many chats are waiting.
create or replace function public.ia_sin_saldo() returns jsonb language sql stable security definer set search_path='' as $$
 select case when public.es_admin() and c.ia_sin_saldo_at is not null then jsonb_build_object('desde',c.ia_sin_saldo_at,
  'chats',(select count(*) from public.whatsapp_conversaciones w where w.ia_error ilike '%credit balance%' and w.ia_at>=c.ia_sin_saldo_at)) end
 from public.whatsapp_ia_config c where c.id=1;
$$;
grant execute on function public.ia_sin_saldo() to authenticated;
