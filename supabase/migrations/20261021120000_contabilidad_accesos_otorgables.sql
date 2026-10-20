-- Accesos por perfil: el administrador ya puede dar paneles extra a Contabilidad. Antes estaba bloqueado en
-- tres capas (pantalla, rutas y RLS). Contabilidad sigue viendo solo Depósitos y Caja por defecto; cada panel
-- que el admin le permita abre únicamente las tablas que ese panel necesita. Contratos y perfiles siguen
-- siendo de solo lectura para Contabilidad.
create function private.contabilidad_panel(p_panel text) returns boolean language sql stable security definer set search_path='' as $$
 select private.es_contabilidad() and exists(select 1 from public.accesos_paneles a where a.usuario_id=auth.uid() and a.panel=p_panel and a.estado='permitido');
$$;
create function private.contabilidad_lee(p_tabla text) returns boolean language sql stable security definer set search_path='' as $$
 select private.es_contabilidad() and exists(select 1 from public.accesos_paneles a
  join (values
   ('dashboard','{contratos,contrato_items_vestidos,pagos,vestidos,sedes,notas_contrato,bitacora_contratos,historial_cambios_contrato,entregas_bitacora,arreglos,mantenimiento_vestidos,mantenimiento_bitacora,bitacora_cambios,plantillas_contratos,codigos_descuento,referidores,config_escalas,profiles,bitacora_eliminaciones_contrato,pedidos_alquiler_estrene}'::text[]),
   ('calendario','{contratos,contrato_items_vestidos,vestidos,sedes,citas,bitacora_citas,profiles,pagos}'),
   ('primeras-citas','{sedes,profiles,contratos}'),
   ('disponibilidad','{vestidos,sedes,contrato_items_vestidos,contratos,bitacora_vestidos,traslados_bitacora,mantenimiento_vestidos}'),
   ('pedidos_estrene','{pedidos_alquiler_estrene,bitacora_pedidos_estrene,contratos,sedes,vestidos}'),
   ('inventory','{vestidos,sedes,bitacora_vestidos,traslados_bitacora,contrato_items_vestidos,contratos,mantenimiento_vestidos}'),
   ('reports','{contratos,pagos,sedes,vestidos,contrato_items_vestidos,profiles,metas}'),
   ('proveedores-catalogo','{sedes}'),
   ('metas','{metas,sedes,contratos,pagos,profiles,asesoras}'),
   ('aliados_admin','{referidores,codigos_descuento,config_escalas,contratos,pagos}'),
   ('comisiones','{config_escalas}'),
   ('liquidaciones','{referidores,codigos_descuento,config_escalas,cierres_mensuales_aliados,contratos,pagos,sedes}'),
   ('horarios','{control_horarios,profiles,sedes,asesoras}')
  ) m(panel,tablas) on m.panel=a.panel
  where a.usuario_id=auth.uid() and a.estado='permitido' and p_tabla=any(m.tablas));
$$;
revoke all on function private.contabilidad_panel(text),private.contabilidad_lee(text) from public,anon;
grant execute on function private.contabilidad_panel(text),private.contabilidad_lee(text) to authenticated;

do $$ declare r record; begin
 for r in select tablename from pg_policies where schemaname='public' and policyname='contabilidad_bandeja_exclusiva' loop
  execute format('alter policy contabilidad_bandeja_exclusiva on public.%I using ((not (select private.es_contabilidad())) or (select private.contabilidad_lee(%L))) with check ((not (select private.es_contabilidad())) or (select private.contabilidad_lee(%L)))',r.tablename,r.tablename,r.tablename);
 end loop;
 for r in select tablename from pg_policies where schemaname='public' and policyname='contabilidad_solo_depositos' loop
  execute format('alter policy contabilidad_solo_depositos on public.%I using (((select private.current_profile_role()) is distinct from ''contabilidad'') or (select private.contabilidad_lee(%L))) with check (((select private.current_profile_role()) is distinct from ''contabilidad'') or (select private.contabilidad_lee(%L)))',r.tablename,r.tablename,r.tablename);
 end loop;
end $$;
alter policy contabilidad_bandeja_perfil_propio on public.profiles using ((not (select private.es_contabilidad())) or id=(select auth.uid()) or (select private.contabilidad_lee('profiles')));
alter policy contabilidad_perfil_propio on public.profiles using (((select private.current_profile_role()) is distinct from 'contabilidad') or id=(select auth.uid()) or (select private.contabilidad_lee('profiles')));

-- Catálogo de proveedores: Contabilidad entra solo si el admin le dio ese panel.
create or replace function private.prov_es_personal() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.prov_rol() not in ('','contabilidad','proveedor'),false) or private.contabilidad_panel('proveedores-catalogo');
$$;

-- El guardado de accesos ya no rechaza "Permitir" para Contabilidad.
create or replace function private.guardar_accesos_panel(p_usuario uuid,p_cambios jsonb) returns integer language plpgsql security definer set search_path='' as $$
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
  select a.estado into anterior from public.accesos_paneles a where a.usuario_id=p_usuario and a.panel=v_panel;
  if coalesce(anterior,'defecto')=v_estado then continue; end if;
  insert into public.accesos_paneles(usuario_id,panel,estado,actualizado_por,actualizado_at) values(p_usuario,v_panel,v_estado,auth.uid(),now())
  on conflict (usuario_id,panel) do update set estado=excluded.estado,actualizado_por=excluded.actualizado_por,actualizado_at=excluded.actualizado_at;
  insert into public.accesos_paneles_bitacora(usuario_id,panel,estado_anterior,estado_nuevo,cambiado_por) values(p_usuario,v_panel,coalesce(anterior,'defecto'),v_estado,auth.uid());
  n:=n+1;
 end loop;
 return n;
end $$;
