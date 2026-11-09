-- Configuración › Sedes: enlace de reseñas de Google de cada sede, para la variable {resena} de los correos.
-- Reversión: alter table public.sedes drop column resena_url;
alter table public.sedes add column if not exists resena_url text;
