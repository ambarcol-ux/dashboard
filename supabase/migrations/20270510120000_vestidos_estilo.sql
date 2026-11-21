-- Estilo del vestido (pedido por las clientas en WhatsApp: corset, escote, mangas, pedrería…): silueta, corpiño, escote, mangas y
-- detalles. Required in Inventario for new and edited dresses (app/admin/inventory/page.tsx, dressMissing); existing dresses show
-- «Sin estilo» among the incomplete records until completed. The WhatsApp AI reads them with the inventory (lib/whatsapp-ai.ts).
-- Reversible: drop the five columns.
alter table public.vestidos add column if not exists silueta text;
alter table public.vestidos add column if not exists corpino text;
alter table public.vestidos add column if not exists escote text;
alter table public.vestidos add column if not exists mangas text;
alter table public.vestidos add column if not exists detalles text[];
