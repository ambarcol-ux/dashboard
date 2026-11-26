-- 1) Allies can be archived (the ERP's «delete»): nothing is erased; an archived ally becomes Inactive, leaves the main list
--    and can be restored. 2) An ally cannot be approved without the bank certification; the ERP emails the ally a link
--    to upload it. Reversible: the columns can stay; re-run the previous definitions of the patched functions.
alter table public.aliados add column if not exists archivado_at timestamptz, add column if not exists archivado_por uuid,
 add column if not exists motivo_archivo text;

create or replace function private.archivar_aliado(p_id uuid,p_archivar boolean,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare m text:=btrim(coalesce(p_motivo,''));
begin
 if not (public.es_admin() or private.tiene_permiso('aliados.gestionar')) or not private.aliado_visible(p_id) then
  raise exception 'No tienes permiso para archivar aliados.' using errcode='42501'; end if;
 if p_archivar then
  if length(m)<5 then raise exception 'Escribe el motivo para archivar (mínimo 5 caracteres).'; end if;
  update public.aliados set archivado_at=now(),archivado_por=auth.uid(),motivo_archivo=left(m,300),
   estado=case when estado in ('activo','pendiente','pendiente_firma') then 'inactivo' else estado end where id=p_id and archivado_at is null;
 else
  update public.aliados set archivado_at=null,archivado_por=null,motivo_archivo=null where id=p_id;
 end if;
 if not found then raise exception 'Aliado no encontrado o sin cambios.'; end if;
end $$;
revoke all on function private.archivar_aliado(uuid,boolean,text) from public,anon;
create or replace function public.archivar_aliado(p_id uuid,p_archivar boolean,p_motivo text) returns void language sql set search_path='' as $$ select private.archivar_aliado(p_id,p_archivar,p_motivo); $$;
grant execute on function public.archivar_aliado(uuid,boolean,text) to authenticated;

do $mig$
declare d text; a text;
begin
 d:=pg_get_functiondef('private.aliados_resumen'::regproc);
 if position('archivado' in d)=0 then
  a:='''cuenta_validada'',a.cuenta_validada,';
  if position(a in d)=0 then raise exception 'aliados_resumen: punto no encontrado'; end if;
  d:=replace(d,a,a||'''archivado'',a.archivado_at is not null,''motivo_archivo'',a.motivo_archivo,''tiene_certificacion'',a.certificacion_path is not null,');
  execute d;
 end if;
 d:=pg_get_functiondef('private.resolver_aliado'::regproc);
 if position('FALTA_CERTIFICACION' in d)=0 then
  a:='  if t.prefijo is null then raise exception ''El tipo % no tiene prefijo de código.'',t.nombre; end if;';
  if position(a in d)=0 then raise exception 'resolver_aliado: punto no encontrado'; end if;
  d:=replace(d,a,'  if a.certificacion_path is null then raise exception ''FALTA_CERTIFICACION: no se puede aprobar sin la certificación bancaria.''; end if;
'||a);
  execute d;
 end if;
end $mig$;
