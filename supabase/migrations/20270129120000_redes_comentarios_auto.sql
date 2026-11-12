-- Comentarios de Instagram con respuesta automática: la IA clasifica (interés, elogio, negativo, otro) y guarda el mensaje privado
-- que abre el chat; se registra también la respuesta pública cuando van las dos.
-- Reversión: alter table public.redes_comentarios drop column ia_tipo, drop column ia_privado, drop column respuesta_publica, drop column respuesta_publica_id;
alter table public.redes_comentarios add column if not exists ia_tipo text check (ia_tipo in ('interes','elogio','negativo','otro')),
 add column if not exists ia_privado text, add column if not exists respuesta_publica text, add column if not exists respuesta_publica_id text;
