-- Comentarios de redes: nuevo estado «eliminado» para los que ya no existen en Meta (la persona los borró u ocultó).
-- Se marca el comentario de Instagram que Meta ya no encuentra (queja de la corona, 13/11/2026).
-- Reversión: update public.redes_comentarios set estado='pendiente' where estado='eliminado';
--   alter table public.redes_comentarios drop constraint redes_comentarios_estado_check,
--   add constraint redes_comentarios_estado_check check (estado in ('pendiente','respondido','privado','ignorado'));
alter table public.redes_comentarios drop constraint redes_comentarios_estado_check,
 add constraint redes_comentarios_estado_check check (estado in ('pendiente','respondido','privado','ignorado','eliminado'));
update public.redes_comentarios set estado='eliminado',
 ia_error='Este comentario ya no existe en Meta: la persona lo borró, lo editó o quedó oculto. No se le puede responder desde el ERP; si hace falta, escríbele por mensaje directo desde Instagram o Facebook.'
where comentario_id='17909408967668489' and estado='pendiente';
