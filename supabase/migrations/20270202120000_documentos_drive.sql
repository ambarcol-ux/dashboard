-- Documentos de la marca: importar archivos desde una carpeta de Google Drive (se guarda el ID para no duplicarlos).
-- Reversión: alter table public.doc_archivos drop column drive_id;
alter table public.doc_archivos add column if not exists drive_id text;
create index if not exists doc_archivos_drive on public.doc_archivos(area_id, drive_id) where drive_id is not null;
