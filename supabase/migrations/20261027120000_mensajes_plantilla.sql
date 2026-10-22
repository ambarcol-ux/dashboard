-- Plantilla de WhatsApp con la que salió cada mensaje (para verificar la confirmación detallada por sede).
alter table public.primeras_citas_mensajes add column if not exists plantilla text;
