-- Fase B2 equipo y permisos: permisos solo por rol_id, sedes solo por usuario_sedes (varias), permiso de registros guardados,
-- vendedora activa exige usuario, historial de fichas. Vestidos, agenda y préstamos siguen visibles entre sedes.
-- Revert: re-apply the previous bodies captured in 20261112120000 and earlier migrations; alter the operaciones_sede_limitada
-- policies back to private.sede_operativa_limitada().

-- Who is limited and to which sedes: Administrator and roles that see every sede are not limited.
create or replace function private.sedes_limitadas() returns uuid[] language sql stable security definer set search_path='' as $$
 select case when p.id is null or lower(coalesce(p.rol,''))='proveedor' or r.ve_todas_sedes or p.rol_id='admin' then null
  else array(select us.sede_id from public.usuario_sedes us where us.usuario_id=p.id and us.activo) end
 from (select auth.uid() uid) a left join public.profiles p on p.id=a.uid left join public.roles r on r.id=p.rol_id
$$;
grant execute on function private.sedes_limitadas() to authenticated;

create or replace function private.roles_usuario(p_usuario uuid) returns text[] language sql stable security definer set search_path='' as $$
 select array_remove(array[p.rol_id],null) from public.profiles p where p.id=p_usuario and coalesce(p.activo,true)
$$;
create or replace function private.sedes_usuario(p_usuario uuid) returns uuid[] language sql stable security definer set search_path='' as $$
 select case when r.ve_todas_sedes or p.rol_id='admin' then array(select id from public.sedes)
  else array(select us.sede_id from public.usuario_sedes us where us.usuario_id=p.id and us.activo) end
 from public.profiles p left join public.roles r on r.id=p.rol_id where p.id=p_usuario
$$;
create or replace function private.permisos_usuario(p_usuario uuid) returns text[] language sql stable security definer set search_path='' as $$
 select case when p.rol_id='admin' then (select coalesce(array_agg(codigo order by codigo),'{}') from public.permisos)
  else (select coalesce(array_agg(distinct rp.permiso order by rp.permiso),'{}') from public.roles_permisos rp
   where rp.activo and rp.rol_id=p.rol_id and not exists(select 1 from public.permisos x where x.codigo=rp.permiso and x.solo_admin)) end
 from public.profiles p where p.id=p_usuario and coalesce(p.activo,true)
$$;
create or replace function public.es_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and rol_id='admin' and coalesce(activo,true))
$$;

-- RLS: every sede-limited policy uses the person's sedes; dresses stay visible across sedes.
do $$ declare r record; q text; c text; begin
 for r in select polrelid::regclass::text t,polname,pg_get_expr(polqual,polrelid) q,pg_get_expr(polwithcheck,polrelid) c from pg_policy
  where polname in ('operaciones_sede_limitada','operaciones_no_insert','operaciones_no_update','operaciones_no_delete') loop
  if r.polname='operaciones_sede_limitada' and r.t in ('vestidos','bitacora_vestidos','traslados_bitacora','prestamos_vestidos_sedes','sedes') then
   execute format('alter policy %I on public.%s using (true) with check (true)',r.polname,r.t); continue;
  end if;
  if r.polname='operaciones_sede_limitada' and r.t='referidores' then
   execute format('alter policy %I on public.%s using ((select private.sedes_limitadas()) is null or sede_origen in (select s.nombre from public.sedes s where s.id=any(private.sedes_limitadas()))) with check ((select private.sedes_limitadas()) is null or sede_origen in (select s.nombre from public.sedes s where s.id=any(private.sedes_limitadas())))',r.polname,r.t); continue;
  end if;
  if r.polname='operaciones_no_update' and r.t='profiles' then
   execute format('alter policy %I on public.%s using ((select private.sedes_limitadas()) is null or id=(select auth.uid())) with check ((select private.sedes_limitadas()) is null or id=(select auth.uid()))',r.polname,r.t); continue;
  end if;
  q:=r.q; c:=r.c;
  q:=replace(q,'(( SELECT private.sede_operativa_limitada() AS sede_operativa_limitada))::text','ANY ((( SELECT private.sedes_limitadas() AS s))::text[])');
  q:=replace(q,'(identificador_id)::text = ANY','(identificador_id)::text = ANY');
  q:=replace(q,'= ( SELECT private.sede_operativa_limitada() AS sede_operativa_limitada)','= ANY ((( SELECT private.sedes_limitadas() AS s))::uuid[])');
  q:=replace(q,'( SELECT private.sede_operativa_limitada() AS sede_operativa_limitada) IS NULL','( SELECT private.sedes_limitadas() AS s) IS NULL');
  if c is not null then
   c:=replace(c,'(( SELECT private.sede_operativa_limitada() AS sede_operativa_limitada))::text','ANY ((( SELECT private.sedes_limitadas() AS s))::text[])');
   c:=replace(c,'= ( SELECT private.sede_operativa_limitada() AS sede_operativa_limitada)','= ANY ((( SELECT private.sedes_limitadas() AS s))::uuid[])');
   c:=replace(c,'( SELECT private.sede_operativa_limitada() AS sede_operativa_limitada) IS NULL','( SELECT private.sedes_limitadas() AS s) IS NULL');
  end if;
  if coalesce(q,'')||coalesce(c,'') like '%sede_operativa_limitada%' then raise exception 'Policy % on % not converted: %',r.polname,r.t,coalesce(q,c); end if;
  if q is not null and c is not null then execute format('alter policy %I on public.%s using (%s) with check (%s)',r.polname,r.t,q,c);
  elsif q is not null then execute format('alter policy %I on public.%s using (%s)',r.polname,r.t,q);
  elsif c is not null then execute format('alter policy %I on public.%s with check (%s)',r.polname,r.t,c); end if;
 end loop;
end $$;

-- Functions: same sedes rule (no accesos_operativos_sede, no profiles.sede_id).
do $$ declare f record; d text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
  and p.proname in ('acceso_primera_cita','caja_ver','cambiar_fecha_contrato','cambiar_fecha_elaboracion','catalogo_proveedores','movimientos_depositos_dia','vestido_gestionable','editar_contrato_completo_admin','validar_y_quemar_codigo','metas_sede_usuario',
   'acceso_deposito','agenda_puede_sede','alertas_retorno_vestidos','guardar_retablo_contrato','aplicar_movimiento_deposito','registrar_movimiento_deposito','validar_devolucion_deposito') loop
  d:=pg_get_functiondef(f.oid);
  d:=replace(d,'c.sede_id is distinct from coalesce(private.sede_operativa_limitada(),u.sede_id)','not (c.sede_id=any(coalesce(private.sedes_usuario(u.id),''{}'')))');
  d:=replace(d,'coalesce(private.sede_operativa_limitada(),(select p.sede_id from public.profiles p where p.id=auth.uid()),','coalesce((private.sedes_limitadas())[1],(select us.sede_id from public.usuario_sedes us where us.usuario_id=auth.uid() and us.activo order by us.created_at limit 1),');
  d:=replace(d,'p_sede is distinct from (select private.sede_operativa_limitada())','not (p_sede=any(private.sedes_limitadas()))');
  d:=replace(d,'v.sede_actual_id is distinct from (select private.sede_operativa_limitada())','not (v.sede_actual_id=any(private.sedes_limitadas()))');
  d:=replace(d,'p_sede=(select private.sede_operativa_limitada())','p_sede=any(private.sedes_limitadas())');
  d:=replace(d,'(select private.sede_operativa_limitada())=p_sede','p_sede=any(private.sedes_limitadas())');
  d:=replace(d,'c.sede_id=(select private.sede_operativa_limitada())','c.sede_id=any(private.sedes_limitadas())');
  d:=replace(d,'(select private.sede_operativa_limitada())','(select private.sedes_limitadas())');
  d:=replace(d,'private.sede_operativa_limitada()','private.sedes_limitadas()');
  d:=replace(d,'p.sede_id=c.sede_id','c.sede_id=any(private.sedes_usuario(p.id))');
  d:=replace(d,'p.sede_id=p_sede','p_sede=any(private.sedes_usuario(p.id))');
  if d like '%sede_operativa_limitada%' then raise exception 'Function not converted: %',f.oid::regprocedure; end if;
  execute d;
 end loop;
end $$;

-- 2. Editing saved records is a role permission (operador_sede_contrato no longer reads accesos_operativos_sede).
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden) values
 ('registros.editar_guardados','Contratos','Editar registros guardados','Editar contratos pactados y prendas de sus sedes',false,97)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso,activo) select r,'registros.editar_guardados',true from unnest(array['asesora','asesora_lider','franquiciado']) r
on conflict(rol_id,permiso) do update set activo=true;
create or replace function private.operador_sede_contrato(p_contrato uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.tiene_permiso('registros.editar_guardados')
  and exists(select 1 from public.contratos c where c.id=p_contrato and c.sede_id=any(coalesce(private.sedes_usuario(auth.uid()),'{}')))
$$;

-- 5. Retired commission panels leave the role grid.
update public.roles_permisos set activo=false where permiso in ('panel.comisiones','panel.liquidaciones');

-- 6. An active seller ficha needs an ERP user; history of old fichas with references.
create or replace function private.asesora_vendedora_con_usuario() returns trigger language plpgsql set search_path='' as $$
begin
 if coalesce(new.activo,true) and new.aparece_como_vendedora and new.profile_id is null then
  raise exception 'Una ficha activa que aparece como vendedora necesita usuario del ERP.' using errcode='23514';
 end if;
 return new;
end $$;
create trigger asesoras_vendedora_con_usuario before insert or update on public.asesoras for each row execute function private.asesora_vendedora_con_usuario();

create or replace function public.fichas_historial() returns table(id uuid,nombre text,sede_id uuid,referencias bigint) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración.' using errcode='42501'; end if;
 return query select a.id,a.nombre_completo,a.sede_id,x.n from public.asesoras a
  cross join lateral (select (select count(*) from public.contratos where asesora_id=a.id)+(select count(*) from public.citas where asesora_id=a.id)
   +(select count(*) from public.entregas_bitacora where asesora_id=a.id)+(select count(*) from public.primeras_citas where asesora_id=a.id)
   +(select count(*) from public.retablos where asesora_id=a.id)+(select count(*) from public.control_horarios where asesora_id=a.id) n) x
  where a.profile_id is null and a.activo is false and x.n>0 order by a.nombre_completo;
end $$;
revoke all on function public.fichas_historial() from public,anon;
grant execute on function public.fichas_historial() to authenticated;

-- 3. Rol Bodega / entregas eliminado (sin personas con ese rol; aplicado con execute_sql, registrado en roles_bitacora):
-- delete from public.roles where id='bodega';
