-- Integraciones: permite la conexión 'redes' (Instagram y Messenger) además de correo y WhatsApp.
-- Reversión: alter table public.integraciones drop constraint integraciones_id_check, add constraint integraciones_id_check check (id in ('correo','whatsapp'));
alter table public.integraciones drop constraint integraciones_id_check;
alter table public.integraciones add constraint integraciones_id_check check (id in ('correo','whatsapp','redes'));
