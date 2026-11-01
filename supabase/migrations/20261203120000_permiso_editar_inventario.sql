-- Inventario: permiso propio «Editar inventario de su sede» (Roles y permisos), validado en la base.
-- Sin el permiso, o fuera de sus sedes, no se crean vestidos ni se cambian sus datos, fotos o archivo.
-- Estado, sede (traslados) y stock siguen igual: contratos, entregas y traslados no cambian.
-- Revert: drop trigger vestidos_editar_inventario on public.vestidos; drop function private.vestidos_editar_inventario();
--   drop function public.sedes_inventario_editables(); delete from public.roles_permisos where permiso='inventario.editar';
--   delete from public.permisos where codigo='inventario.editar';
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
values('inventario.editar','Inventario','Editar inventario de su sede','Crear vestidos, editar sus datos, fotos y archivo. Solo en sus sedes (o en todas si el rol ve todas las sedes)',false,16)
on conflict do nothing;
insert into public.roles_permisos(rol_id,permiso,activo) values('asesora_lider','inventario.editar',true),('franquiciado','inventario.editar',true) on conflict do nothing;

-- Sedes where the user may edit the inventory (all for Administración).
create function public.sedes_inventario_editables() returns uuid[] language sql stable security definer set search_path='' as $$
 select case when public.es_admin() then array(select id from public.sedes)
  when not private.tiene_permiso('inventario.editar') then '{}'::uuid[]
  else coalesce(private.sedes_limitadas(),array(select id from public.sedes)) end
$$;
revoke all on function public.sedes_inventario_editables() from public,anon;
grant execute on function public.sedes_inventario_editables() to authenticated;

create function private.vestidos_editar_inventario() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.es_admin() then return new; end if;
 if tg_op='INSERT' then
  if not coalesce(new.sede_actual_id=any(public.sedes_inventario_editables()),false) then raise exception 'No tienes permiso para crear vestidos en esta sede.' using errcode='42501'; end if;
 elsif (new.codigo,new.nombre,new.talla,new.color,new.precio_sugerido,new.precio_venta,new.clasificacion_id,new.foto_frente,new.foto_espalda,new.foto_detalle,new.imagen_url,new.archivado,new.motivo_archivo)
   is distinct from (old.codigo,old.nombre,old.talla,old.color,old.precio_sugerido,old.precio_venta,old.clasificacion_id,old.foto_frente,old.foto_espalda,old.foto_detalle,old.imagen_url,old.archivado,old.motivo_archivo)
   and not coalesce(old.sede_actual_id=any(public.sedes_inventario_editables()),false) then
  raise exception 'No tienes permiso para editar el vestido % (solo el inventario de tu sede).',old.codigo using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.vestidos_editar_inventario() from public,anon,authenticated;
create trigger vestidos_editar_inventario before insert or update on public.vestidos for each row execute function private.vestidos_editar_inventario();
