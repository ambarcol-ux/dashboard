-- Inventario: the photo reader (api/inventario/describir-fotos, every few minutes) also fills, from the dress photo, the empty style
-- fields (silueta, corpiño, escote, mangas, detalles) so the WhatsApp AI can answer «esponjado», «sin strapless», «manga tres cuartos».
-- What a store already chose is never replaced. estilo_at marks that the style of that photo was already read (no retries).
-- Reversible: the column is unused by anything else.
alter table public.vestidos_ia_fotos add column if not exists estilo_at timestamptz;
