-- Roles y permisos: casilla «Todas las sedes» por permiso (hoy solo «Ver Agenda de vestidos»), sin dar acceso completo a otras sedes.
-- Con ella, la Agenda de vestidos consulta las reservas de vestidos de cualquier sede: fechas, estado y número de contrato,
-- sin nombre de la clienta ni valor cuando el vestido no es de sus sedes. Todo lo demás sigue limitado a sus sedes.
-- Se marca para «Asesora líder» (pedido del usuario 04/11/2026).
-- Revert: drop function public.disponibilidad_contratos_vestido(uuid), public.guardar_permiso_todas_sedes(text,text,boolean),
--   private.permiso_todas_sedes(text); alter table public.roles_permisos drop column todas_sedes;
alter table public.roles_permisos add column if not exists todas_sedes boolean not null default false;

-- Does any role of the signed-in user grant this permission for every site?
create or replace function private.permiso_todas_sedes(p_permiso text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.roles_permisos rp on rp.rol_id=p.rol_id
  where p.id=auth.uid() and coalesce(p.activo,true) and rp.permiso=p_permiso and rp.activo and rp.todas_sedes)
$$;
grant execute on function private.permiso_todas_sedes(text) to authenticated;

-- Administrator marks «Todas las sedes» on a permission of a role (only permissions that support it).
create or replace function public.guardar_permiso_todas_sedes(p_rol text,p_permiso text,p_todas boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo el Administrador cambia permisos.' using errcode='42501'; end if;
 if p_permiso not in ('panel.disponibilidad') then raise exception 'Ese permiso no se puede abrir a todas las sedes.'; end if;
 if not exists(select 1 from public.roles where id=p_rol) then raise exception 'Rol no encontrado.'; end if;
 insert into public.roles_permisos(rol_id,permiso,activo,todas_sedes) values(p_rol,p_permiso,false,coalesce(p_todas,false))
 on conflict (rol_id,permiso) do update set todas_sedes=excluded.todas_sedes;
 insert into public.roles_bitacora(tipo,objetivo,detalle,usuario) values('permisos_rol',p_rol,
  jsonb_build_object('agregados',case when p_todas then jsonb_build_array(p_permiso||' (todas las sedes)') else '[]'::jsonb end,
   'quitados',case when p_todas then '[]'::jsonb else jsonb_build_array(p_permiso||' (todas las sedes)') end),auth.uid());
end $$;
revoke all on function public.guardar_permiso_todas_sedes(text,text,boolean) from public,anon;
grant execute on function public.guardar_permiso_todas_sedes(text,text,boolean) to authenticated;

-- Agenda de vestidos: reservations of one dress, also from other sites when the role allows it.
-- Client name and value only for the user's own sites.
create or replace function public.disponibilidad_contratos_vestido(p_vestido uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.vestidos; sl uuid[]; propia boolean;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 if not (public.es_admin() or private.tiene_permiso('panel.disponibilidad')) then raise exception 'Sin acceso a la Agenda de vestidos.' using errcode='42501'; end if;
 select * into v from public.vestidos where id=p_vestido;
 if not found then return '[]'::jsonb; end if;
 sl:=private.sedes_limitadas();
 propia:=sl is null or v.sede_actual_id=any(sl) or v.sede_principal_id=any(sl);
 if not propia and not private.permiso_todas_sedes('panel.disponibilidad') then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'numero_contrato',c.numero_contrato,'cliente_nombre',case when propia then c.cliente_nombre end,
   'fecha_evento',c.fecha_evento,'tipo_evento',c.tipo_evento,'tipo_entrega',c.tipo_entrega,'estado',c.estado,'fecha_entrega_envio',c.fecha_entrega_envio,
   'fecha_pre_xv',c.fecha_pre_xv,'fechas_bloqueo_especial',c.fechas_bloqueo_especial,'fecha_disponibilidad_real',c.fecha_disponibilidad_real,
   'bloqueo_especial_fecha',case when c.bloqueo_especial_vestido_id=p_vestido then c.bloqueo_especial_fecha end,'bloqueo_especial_vestido_id',c.bloqueo_especial_vestido_id,
   'valor_total',case when propia then c.valor_total end,'created_at',c.created_at))
  from public.contratos c
  where c.vestido_id=p_vestido or c.bloqueo_especial_vestido_id=p_vestido
   or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=c.id and i.vestido_id=p_vestido)),'[]'::jsonb);
end $$;
revoke all on function public.disponibilidad_contratos_vestido(uuid) from public,anon;
grant execute on function public.disponibilidad_contratos_vestido(uuid) to authenticated;

update public.roles_permisos set todas_sedes=true where rol_id='asesora_lider' and permiso='panel.disponibilidad';
