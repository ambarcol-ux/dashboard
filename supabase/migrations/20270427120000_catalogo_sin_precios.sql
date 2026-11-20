-- Catálogo › «Copiar link público» with «Sin precios»: the public link shows photos, type, size and color without rental or sale prices
-- (the API does not send them). Existing links keep their prices.
-- Reversible: alter table public.catalogos_publicos drop column sin_precios;
alter table public.catalogos_publicos add column if not exists sin_precios boolean not null default false;
