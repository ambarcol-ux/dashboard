-- Documentos de la marca: no se aceptan programas ni accesos directos (.exe, .lnk…) como documentos. Las filas existentes no se revisan (NOT VALID).
-- Reversión: alter table public.doc_archivos drop constraint doc_archivos_sin_programas;
alter table public.doc_archivos add constraint doc_archivos_sin_programas
 check (ruta is null or ruta !~* '\.(exe|msi|bat|cmd|com|lnk|url|scr|vbs|js|ps1|dll|apk|jar|app|dmg)$') not valid;
