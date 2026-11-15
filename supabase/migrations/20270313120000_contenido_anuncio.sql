-- Anuncios fase 3: una pieza publicada se promociona como anuncio a WhatsApp (creado en pausa en Meta). Guarda sus ids y condiciones.
-- Reversión: alter table public.contenido_piezas drop column anuncio;
alter table public.contenido_piezas add column if not exists anuncio jsonb;
