-- WhatsApp 304 en tiempo real: la bandeja recibe al instante los chats y mensajes nuevos (Supabase Realtime, respetando RLS).
-- recibido_at guarda cuándo llegó cada mensaje al ERP, para medir la demora frente a la hora de WhatsApp.
-- Reversión: alter publication supabase_realtime drop table public.whatsapp_conversaciones, public.whatsapp_mensajes;
--   alter table public.whatsapp_mensajes drop column recibido_at;
alter table public.whatsapp_mensajes add column if not exists recibido_at timestamptz not null default now();
alter publication supabase_realtime add table public.whatsapp_conversaciones, public.whatsapp_mensajes;
