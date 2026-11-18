-- Catálogo para las clientas del aliado (sin precios ni marca de Ámbar): its own public link, separate from the ally's private token.
-- Reversible: alter table public.aliados drop column catalogo_token;
alter table public.aliados add column if not exists catalogo_token uuid not null default gen_random_uuid();
create unique index if not exists aliados_catalogo_token on public.aliados(catalogo_token);
