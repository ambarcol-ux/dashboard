-- WhatsApp 304: the AI flags chats interested in the Plan Ahorro XV (filter «Interesadas en Plan Ahorro XV» and the «Inscribir en el plan» button).
-- Reversión: alter table public.whatsapp_conversaciones drop column plan_ahorro_at;
alter table public.whatsapp_conversaciones add column if not exists plan_ahorro_at timestamptz;
