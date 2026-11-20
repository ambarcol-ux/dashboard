-- Fix: public.siigo_productos had primary key (sede_id, vestido_id), so the API read it as a many-to-many bridge between vestidos and
-- sedes and every «vestidos … sedes(nombre)» read became ambiguous (PGRST201): saving or editing a contract said «el vestido no se
-- encontró en el inventario global». The link keeps the same uniqueness (sede, vestido) but gets its own id as primary key.
-- Reversible: alter table public.siigo_productos drop constraint siigo_productos_pkey, drop column id;
--   alter table public.siigo_productos add primary key (sede_id, vestido_id); drop the unique constraint below.
alter table public.siigo_productos add column if not exists id bigint generated always as identity;
alter table public.siigo_productos drop constraint if exists siigo_productos_pkey;
alter table public.siigo_productos add constraint siigo_productos_pkey primary key (id);
alter table public.siigo_productos add constraint siigo_productos_sede_vestido_key unique (sede_id, vestido_id);
notify pgrst, 'reload schema';
