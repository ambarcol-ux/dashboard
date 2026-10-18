-- Accesos por perfil: el administrador permite o quita paneles a cada usuario sin tocar código.
-- Sin cambio manual cada usuario conserva el acceso que le da su rol. "Quitar" siempre gana;
-- "Permitir" solo aplica a paneles otorgables y nunca a Contabilidad ni a proveedores.

create table public.accesos_paneles (
 usuario_id uuid not null references public.profiles(id),
 panel text not null check (panel ~ '^[a-z_-]{2,40}$'),
 estado text not null check (estado in ('permitido','bloqueado','defecto')),
 actualizado_por uuid references public.profiles(id),
 actualizado_at timestamptz not null default now(),
 primary key (usuario_id,panel)
);
create table public.accesos_paneles_bitacora (
 id bigint generated always as identity primary key,
 usuario_id uuid not null references public.profiles(id),
 panel text not null,
 estado_anterior text,
 estado_nuevo text not null,
 cambiado_por uuid references public.profiles(id),
 cambiado_at timestamptz not null default now()
);
alter table public.accesos_paneles enable row level security;
alter table public.accesos_paneles_bitacora enable row level security;
revoke all on public.accesos_paneles,public.accesos_paneles_bitacora from public,anon,authenticated;
grant select on public.accesos_paneles,public.accesos_paneles_bitacora to authenticated;
-- Cada usuario lee sus propios accesos (el menú y el control de rutas los necesitan); el admin, todos.
create policy accesos_paneles_leer on public.accesos_paneles for select to authenticated using (usuario_id=(select auth.uid()) or (select public.es_admin()));
create policy accesos_paneles_bitacora_leer on public.accesos_paneles_bitacora for select to authenticated using ((select public.es_admin()));

create function private.guardar_accesos_panel(p_usuario uuid,p_cambios jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare
 otorgables constant text[]:=array['dashboard','calendario','primeras-citas','disponibilidad','pedidos_estrene','depositos','inventory','reports','caja','proveedores-catalogo','metas','aliados_admin','comisiones','liquidaciones','horarios','manual'];
 todos constant text[]:=otorgables||array['proveedores','proveedores-pagos','users','config','clausulas','siigo'];
 destino public.profiles; c jsonb; v_panel text; v_estado text; anterior text; n integer:=0;
begin
 if not public.es_admin() then raise exception 'Solo un administrador puede cambiar accesos.' using errcode='42501'; end if;
 select * into destino from public.profiles where id=p_usuario;
 if destino.id is null then raise exception 'Usuario no encontrado.'; end if;
 if lower(btrim(coalesce(destino.rol,'')))='proveedor' then raise exception 'Los proveedores solo usan su portal; sus accesos no se configuran aquí.'; end if;
 if jsonb_typeof(p_cambios)<>'array' or jsonb_array_length(p_cambios)>100 then raise exception 'Cambios inválidos.'; end if;
 for c in select * from jsonb_array_elements(p_cambios) loop
  v_panel:=c->>'panel'; v_estado:=c->>'estado';
  if v_panel is null or not (v_panel=any(todos)) then raise exception 'Panel desconocido: %',coalesce(v_panel,'(vacío)'); end if;
  if v_estado is null or v_estado not in ('permitido','bloqueado','defecto') then raise exception 'Estado inválido para %',v_panel; end if;
  if v_estado='permitido' and not (v_panel=any(otorgables)) then raise exception 'El panel % es exclusivo de administración: solo se puede quitar.',v_panel; end if;
  if v_estado='permitido' and lower(btrim(coalesce(destino.rol,'')))='contabilidad' then raise exception 'A Contabilidad no se le pueden agregar paneles: sus datos están restringidos a depósitos y caja.'; end if;
  select a.estado into anterior from public.accesos_paneles a where a.usuario_id=p_usuario and a.panel=v_panel;
  if coalesce(anterior,'defecto')=v_estado then continue; end if;
  insert into public.accesos_paneles(usuario_id,panel,estado,actualizado_por,actualizado_at) values(p_usuario,v_panel,v_estado,auth.uid(),now())
  on conflict (usuario_id,panel) do update set estado=excluded.estado,actualizado_por=excluded.actualizado_por,actualizado_at=excluded.actualizado_at;
  insert into public.accesos_paneles_bitacora(usuario_id,panel,estado_anterior,estado_nuevo,cambiado_por) values(p_usuario,v_panel,coalesce(anterior,'defecto'),v_estado,auth.uid());
  n:=n+1;
 end loop;
 return n;
end $$;
create function public.guardar_accesos_panel(p_usuario uuid,p_cambios jsonb) returns integer language sql security invoker set search_path='' as $$ select private.guardar_accesos_panel(p_usuario,p_cambios); $$;
revoke all on function private.guardar_accesos_panel(uuid,jsonb),public.guardar_accesos_panel(uuid,jsonb) from public,anon;
grant execute on function private.guardar_accesos_panel(uuid,jsonb),public.guardar_accesos_panel(uuid,jsonb) to authenticated;

-- El control de rutas lee los accesos del usuario en cada navegación, también para proveedores (solo sus filas).
create or replace function public.guardia_proveedor() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then return; end if;
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and lower(btrim(coalesce(p.rol,'')))='proveedor') then return; end if;
 if current_setting('request.path',true) in ('/rpc/portal_proveedor','/rpc/confirmar_servicio_proveedor','/rpc/actualizar_datos_proveedor') then return; end if;
 if current_setting('request.path',true) in ('/profiles','/accesos_paneles') and current_setting('request.method',true) in ('GET','HEAD') then return; end if;
 raise sqlstate 'PT403' using message='Los proveedores solo tienen acceso a su portal.';
end $$;
