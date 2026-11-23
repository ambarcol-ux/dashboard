-- Inventario: fabric of the dress (optional select in the dress form; the photo reader fills it when empty) so the WhatsApp AI can
-- answer «¿tienen en satín?». The photos already read get their fabric on the next runs (estilo_at is cleared; only empty fields are
-- filled). Reversible: the column is additive.
alter table public.vestidos add column if not exists tela text;
update public.vestidos_ia_fotos set estilo_at=null where estilo_at is not null;
