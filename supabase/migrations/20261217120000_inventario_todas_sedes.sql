-- Roles y permisos: «Todas las sedes» también en «Ver Gestión de inventario» (ver el inventario de todas las sedes;
-- editar solo el de sus sedes, como ya valida la base). Se marca para Asesora líder y Franquiciado (pedido 04/11/2026).
-- Revert: re-apply public.guardar_permiso_todas_sedes from 20261213120000; drop function public.mi_permiso_todas_sedes(text);
--   update public.roles_permisos set todas_sedes=false where permiso='panel.inventory';
create or replace function public.guardar_permiso_todas_sedes(p_rol text,p_permiso text,p_todas boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo el Administrador cambia permisos.' using errcode='42501'; end if;
 if p_permiso not in ('panel.disponibilidad','panel.inventory') then raise exception 'Ese permiso no se puede abrir a todas las sedes.'; end if;
 if not exists(select 1 from public.roles where id=p_rol) then raise exception 'Rol no encontrado.'; end if;
 insert into public.roles_permisos(rol_id,permiso,activo,todas_sedes) values(p_rol,p_permiso,false,coalesce(p_todas,false))
 on conflict (rol_id,permiso) do update set todas_sedes=excluded.todas_sedes;
 insert into public.roles_bitacora(tipo,objetivo,detalle,usuario) values('permisos_rol',p_rol,
  jsonb_build_object('agregados',case when p_todas then jsonb_build_array(p_permiso||' (todas las sedes)') else '[]'::jsonb end,
   'quitados',case when p_todas then '[]'::jsonb else jsonb_build_array(p_permiso||' (todas las sedes)') end),auth.uid());
end $$;

-- For pages: does the signed-in user see every site in this permission?
create or replace function public.mi_permiso_todas_sedes(p_permiso text) returns boolean language sql stable security definer set search_path='' as $$
 select public.es_admin() or private.sedes_limitadas() is null or private.permiso_todas_sedes(p_permiso)
$$;
grant execute on function public.mi_permiso_todas_sedes(text) to authenticated;

update public.roles_permisos set todas_sedes=true where rol_id in ('asesora_lider','franquiciado') and permiso='panel.inventory';
