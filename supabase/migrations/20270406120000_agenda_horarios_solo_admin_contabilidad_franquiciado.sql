-- Agenda de primeras citas: only administration, accounting and the franchisee change the store schedules (base hours, blocks and
-- exceptions). The «asesora líder» role no longer can (its grants are deactivated, not deleted). Accounting edits every store.
-- Reversible: set activo=true for asesora_lider on agenda.configurar / agenda.excepciones, deactivate the contabilidad grants and
--   restore private.agenda_puede_sede from 20261030120000_agenda_por_sede.sql.
update public.roles_permisos set activo=false where rol_id='asesora_lider' and permiso in ('agenda.configurar','agenda.excepciones');
insert into public.roles_permisos(rol_id,permiso) values ('contabilidad','agenda.configurar'),('contabilidad','agenda.excepciones'),('franquiciado','agenda.excepciones')
on conflict (rol_id,permiso) do update set activo=true;

create or replace function private.agenda_puede_sede(p_sede uuid, p_nivel text default 'configurar') returns boolean
language sql stable security definer set search_path='' as $$
 select private.agenda_es_propietario() or (p_sede is not null and private.es_finanzas()) or (
  p_sede is not null
  and (private.tiene_permiso('agenda.configurar') or (p_nivel='excepciones' and private.tiene_permiso('agenda.excepciones')))
  and exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) and p_sede=any(private.sedes_usuario(p.id))));
$$;
