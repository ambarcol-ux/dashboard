-- Documentos de la marca → IA: a document saved as a Google Docs / Sheets / Slides link (no uploaded file) is now read too. The link
-- goes in «ruta» (lib/doc-ia.ts exports its text) and, since the linked document can change without a new version, it is read
-- again every day. Reversible: re-apply documentos_ia_pendientes from its previous migration.
create or replace function public.documentos_ia_pendientes(p_limite integer)
 returns table(id uuid, nombre text, ruta text, tipo text, tamano bigint, version integer)
 language sql stable security definer set search_path to ''
as $function$
 select d.id,d.nombre,coalesce(d.ruta,d.enlace),d.tipo,d.tamano,d.version from public.doc_archivos d left join public.doc_ia_resumenes r on r.archivo_id=d.id
 where not d.archivado and (d.ruta is not null or coalesce(d.enlace,'') ~ 'docs\.google\.com/(document|spreadsheets|presentation)/d/')
  and (d.vence is null or d.vence>=(now() at time zone 'America/Bogota')::date) and private.doc_ia_lee(d.area_id)
  and (r.archivo_id is null or r.version<>d.version or (r.estado='error' and r.updated_at<now()-interval '1 day')
   or (d.ruta is null and r.updated_at<now()-interval '20 hours'))
 order by d.updated_at desc limit greatest(1,least(p_limite,20))
$function$;
