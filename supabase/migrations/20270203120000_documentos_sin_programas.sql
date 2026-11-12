-- Documentos de la marca: no se aceptan programas ni accesos directos (.exe, .lnk…) como documentos.
-- Solo se revisa al subir o cambiar el archivo (las filas existentes se pueden editar, archivar o volver a otra versión).
-- Reversión: drop trigger doc_archivos_sin_programas on public.doc_archivos; drop function private.doc_sin_programas();
create or replace function private.doc_sin_programas() returns trigger language plpgsql set search_path='' as $$
begin
 if new.ruta ~* '\.(exe|msi|bat|cmd|com|lnk|url|scr|vbs|js|ps1|dll|apk|jar|app|dmg)$' then
  raise exception 'Ese archivo es un programa o un acceso directo, no un documento. Si está en Google Drive, usa «Subir documento › Desde Google Drive».';
 end if;
 return new;
end $$;
drop trigger if exists doc_archivos_sin_programas on public.doc_archivos;
create trigger doc_archivos_sin_programas before insert or update of ruta on public.doc_archivos for each row execute function private.doc_sin_programas();
