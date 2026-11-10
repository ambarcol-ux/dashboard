-- Bandeja: los chats de Messenger e Instagram guardan «fb:<id>» o «ig:<id>» en telefono (no es un celular).
-- Reversión: alter table public.whatsapp_conversaciones drop constraint whatsapp_conversaciones_telefono_check, add constraint whatsapp_conversaciones_telefono_check check (telefono ~ '^\d{8,15}$');
alter table public.whatsapp_conversaciones drop constraint whatsapp_conversaciones_telefono_check;
alter table public.whatsapp_conversaciones add constraint whatsapp_conversaciones_telefono_check check (telefono ~ '^\d{8,15}$' or telefono ~ '^(fb|ig):\d{3,40}$');
