-- WhatsApp 304: guarda el identificador de la foto que envía la clienta para que la IA pueda verla al sugerir la respuesta.
-- Reversión: alter table public.whatsapp_mensajes drop column media_id, drop column media_tipo;
alter table public.whatsapp_mensajes add column if not exists media_id text, add column if not exists media_tipo text;
