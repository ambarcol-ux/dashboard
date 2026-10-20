-- Roles y permisos (guía del 20/10/2026): catálogo único de permisos, roles editables por el Administrador,
-- varios roles por usuario (se suman los permisos), validación en el servidor y rol Asesora líder.
create table public.permisos (
 codigo text primary key check (codigo ~ '^[a-z_]+\.[a-z0-9_-]+(\.[a-z_]+)?$'),
 modulo text not null,
 accion text not null,
 descripcion text not null default '',
 solo_admin boolean not null default false,
 orden integer not null default 0
);
create table public.roles (
 id text primary key check (id ~ '^[a-z_]{3,40}$'),
 nombre text not null,
 descripcion text not null default '',
 sistema boolean not null default false
);
create table public.roles_permisos (
 rol_id text not null references public.roles(id) on delete cascade,
 permiso text not null references public.permisos(codigo) on delete cascade,
 activo boolean not null default true,
 primary key (rol_id,permiso)
);
create table public.usuarios_roles (
 usuario_id uuid not null references public.profiles(id) on delete cascade,
 rol_id text not null references public.roles(id) on delete cascade,
 activo boolean not null default true,
 asignado_por uuid references public.profiles(id), asignado_at timestamptz not null default now(),
 primary key (usuario_id,rol_id)
);
create table public.roles_bitacora (
 id bigint generated always as identity primary key,
 tipo text not null, objetivo text not null, detalle jsonb not null,
 usuario uuid references public.profiles(id), fecha_hora timestamptz not null default now()
);
alter table public.permisos enable row level security;
alter table public.roles enable row level security;
alter table public.roles_permisos enable row level security;
alter table public.usuarios_roles enable row level security;
alter table public.roles_bitacora enable row level security;
revoke all on public.permisos,public.roles,public.roles_permisos,public.usuarios_roles,public.roles_bitacora from public,anon,authenticated;
grant select on public.permisos,public.roles,public.roles_permisos,public.usuarios_roles,public.roles_bitacora to authenticated;
create policy permisos_leer on public.permisos for select to authenticated using (true);
create policy roles_leer on public.roles for select to authenticated using (true);
create policy roles_permisos_leer on public.roles_permisos for select to authenticated using (true);
create policy usuarios_roles_leer on public.usuarios_roles for select to authenticated using (usuario_id=(select auth.uid()) or (select public.es_admin()));
create policy roles_bitacora_admin on public.roles_bitacora for select to authenticated using ((select public.es_admin()));

-- Catálogo: un permiso "ver" por panel del menú y las acciones de la guía. Los módulos nuevos agregan aquí sus permisos.
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden) values
 ('panel.dashboard','Operaciones','Ver Dashboard','',false,10),
 ('panel.calendario','Operaciones','Ver Calendario de contratos','',false,11),
 ('panel.primeras-citas','Operaciones','Ver Primeras visitas','',false,12),
 ('panel.disponibilidad','Operaciones','Ver Agenda de vestidos','',false,13),
 ('panel.pedidos_estrene','Operaciones','Ver Pedidos estrene','',false,14),
 ('panel.inventory','Operaciones','Ver Gestión de inventario','',false,15),
 ('panel.reports','Operaciones','Ver Reportes y estadísticas','',false,16),
 ('panel.depositos','Depósitos','Ver Depósitos y devoluciones','Ver los depósitos de su sede, registrar recepción, cargar comprobante y solicitar devolución',false,20),
 ('depositos.modificar_valor','Depósitos','Modificar valor del depósito','Pide motivo y guarda el valor anterior y el nuevo',false,21),
 ('depositos.eliminar_comprobante','Depósitos','Reemplazar o eliminar comprobante','Pide motivo; el archivo queda en el historial',false,22),
 ('depositos.exportar','Depósitos','Exportar','Descargar el listado de depósitos pendientes',false,23),
 ('contratos.editar_fecha_evento','Contratos','Editar fecha de evento','Pide motivo y guarda fecha anterior y nueva',false,30),
 ('contratos.editar_fecha_prueba_final','Contratos','Editar fecha de prueba final','Pide motivo y guarda fecha anterior y nueva',false,31),
 ('panel.caja','Finanzas','Ver Cierres de caja','',false,40),
 ('panel.proveedores-catalogo','Proveedores','Ver Catálogo de proveedores','',false,50),
 ('panel.proveedores','Proveedores','Gestión de proveedores','Datos bancarios y pagos: solo el rol Administrador',true,51),
 ('panel.proveedores-pagos','Proveedores','Pagos a proveedores','Solo el rol Administrador',true,52),
 ('panel.metas','Ventas y CRM','Ver Metas y ventas','',false,60),
 ('panel.aliados_directos','Red de aliados','Ver Aliados directos','',false,70),
 ('panel.aliados_admin','Red de aliados','Ver Gestión de aliados','',false,71),
 ('panel.comisiones','Red de aliados','Ver Config. comisiones','',false,72),
 ('panel.liquidaciones','Red de aliados','Ver Cierre de mes (aliados)','',false,73),
 ('panel.horarios','Administración','Ver Control de asistencia','',false,80),
 ('panel.users','Administración','Gestión de equipo','Crear usuarios y cambiar roles: solo el rol Administrador',true,81),
 ('panel.config','Administración','Configuración base','Solo el rol Administrador',true,82),
 ('panel.clausulas','Administración','Cláusulas del contrato','Solo el rol Administrador',true,83),
 ('panel.siigo','Administración','Facturación por sede','Solo el rol Administrador',true,84),
 ('panel.accesos','Administración','Accesos, roles y permisos','Solo el rol Administrador',true,85),
 ('panel.manual','Soporte','Ver Manual de usuario','',false,90);

insert into public.roles(id,nombre,descripcion,sistema) values
 ('admin','Administrador','Todos los permisos de todos los módulos.',true),
 ('asesora','Asesora','Operación de su sede.',true),
 ('asesora_lider','Asesora líder','Asesora con funciones de líder de tienda.',true),
 ('contabilidad','Contabilidad','Depósitos, caja y pagos.',true);
-- Mismos accesos que hoy tiene cada rol; la líder suma las funciones de la guía.
insert into public.roles_permisos(rol_id,permiso) select 'asesora',p from unnest(array['panel.dashboard','panel.calendario','panel.primeras-citas','panel.disponibilidad','panel.pedidos_estrene','panel.depositos','panel.caja','panel.proveedores-catalogo','panel.metas','panel.aliados_directos','panel.manual']) p;
insert into public.roles_permisos(rol_id,permiso) select 'asesora_lider',p from unnest(array['panel.dashboard','panel.calendario','panel.primeras-citas','panel.disponibilidad','panel.pedidos_estrene','panel.depositos','panel.caja','panel.proveedores-catalogo','panel.metas','panel.aliados_directos','panel.manual',
 'depositos.modificar_valor','depositos.eliminar_comprobante','depositos.exportar','contratos.editar_fecha_evento','contratos.editar_fecha_prueba_final']) p;
insert into public.roles_permisos(rol_id,permiso) select 'contabilidad',p from unnest(array['panel.depositos','panel.caja','panel.aliados_directos','depositos.exportar']) p;
-- Líderes de tienda identificadas en el ERP (Bogotá: OVE BOGOTA, Villavicencio, Pereira).
insert into public.usuarios_roles(usuario_id,rol_id) select id,'asesora_lider' from public.profiles where lower(email) in ('liderbogota@ambarcouture.com','lidervillavo@ambarcouture.com','liderpereira@ambarcouture.com') on conflict do nothing;

-- Permisos efectivos: el rol del perfil más los roles asignados (se suman). El Administrador los tiene todos.
create function private.permisos_usuario(p_usuario uuid) returns text[] language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.profiles p where p.id=p_usuario and coalesce(p.activo,true) and lower(btrim(p.rol))='admin') or exists(select 1 from public.usuarios_roles u where u.usuario_id=p_usuario and u.rol_id='admin' and u.activo)
  then (select coalesce(array_agg(codigo order by codigo),'{}') from public.permisos)
  else (select coalesce(array_agg(distinct rp.permiso order by rp.permiso),'{}') from public.roles_permisos rp
   where rp.activo and rp.rol_id in (select lower(btrim(p.rol)) from public.profiles p where p.id=p_usuario and coalesce(p.activo,true) union select u.rol_id from public.usuarios_roles u where u.usuario_id=p_usuario and u.activo)
    and not exists(select 1 from public.permisos x where x.codigo=rp.permiso and x.solo_admin)) end;
$$;
create function private.tiene_permiso(p_codigo text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and p_codigo=any(private.permisos_usuario(auth.uid()));
$$;
create function public.mis_permisos() returns text[] language sql stable security invoker set search_path='' as $$ select private.permisos_usuario(auth.uid()); $$;

-- Administración de roles (solo Administrador), con bitácora.
create function private.guardar_permisos_rol(p_rol text,p_permisos text[]) returns integer language plpgsql security definer set search_path='' as $$
declare antes text[]; despues text[];
begin
 if not public.es_admin() then raise exception 'Solo el Administrador cambia permisos.' using errcode='42501'; end if;
 if p_rol='admin' then raise exception 'El rol Administrador siempre tiene todos los permisos.'; end if;
 if not exists(select 1 from public.roles where id=p_rol) then raise exception 'Rol no encontrado.'; end if;
 if exists(select 1 from unnest(coalesce(p_permisos,'{}')) x where not exists(select 1 from public.permisos p where p.codigo=x)) then raise exception 'Hay permisos que no existen en el catálogo.'; end if;
 select coalesce(array_agg(permiso order by permiso),'{}') into antes from public.roles_permisos where rol_id=p_rol and activo;
 insert into public.roles_permisos(rol_id,permiso,activo) select p_rol,x.codigo,x.codigo=any(coalesce(p_permisos,'{}')) from public.permisos x
 on conflict (rol_id,permiso) do update set activo=excluded.activo;
 select coalesce(array_agg(permiso order by permiso),'{}') into despues from public.roles_permisos where rol_id=p_rol and activo;
 insert into public.roles_bitacora(tipo,objetivo,detalle,usuario) values('permisos_rol',p_rol,jsonb_build_object('agregados',(select coalesce(jsonb_agg(x),'[]') from unnest(despues) x where not x=any(antes)),'quitados',(select coalesce(jsonb_agg(x),'[]') from unnest(antes) x where not x=any(despues))),auth.uid());
 return coalesce(array_length(despues,1),0);
end $$;
create function private.crear_rol(p_id text,p_nombre text,p_descripcion text) returns text language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo el Administrador crea roles.' using errcode='42501'; end if;
 if p_id !~ '^[a-z_]{3,40}$' or length(btrim(coalesce(p_nombre,'')))<3 then raise exception 'Escribe un nombre de rol válido.'; end if;
 insert into public.roles(id,nombre,descripcion) values(p_id,btrim(p_nombre),btrim(coalesce(p_descripcion,'')));
 insert into public.roles_bitacora(tipo,objetivo,detalle,usuario) values('crear_rol',p_id,jsonb_build_object('nombre',p_nombre),auth.uid());
 return p_id;
exception when unique_violation then raise exception 'Ya existe un rol con ese nombre.';
end $$;
create function private.guardar_roles_usuario(p_usuario uuid,p_roles text[]) returns integer language plpgsql security definer set search_path='' as $$
declare antes text[];
begin
 if not public.es_admin() then raise exception 'Solo el Administrador asigna roles.' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_usuario) then raise exception 'Usuario no encontrado.'; end if;
 if exists(select 1 from public.profiles where id=p_usuario and lower(btrim(rol))='proveedor') then raise exception 'Los proveedores solo usan su portal.'; end if;
 if 'admin'=any(coalesce(p_roles,'{}')) then raise exception 'El rol Administrador se asigna en Gestión de equipo.'; end if;
 select coalesce(array_agg(rol_id order by rol_id),'{}') into antes from public.usuarios_roles where usuario_id=p_usuario and activo;
 insert into public.usuarios_roles(usuario_id,rol_id,activo,asignado_por) select p_usuario,r.id,r.id=any(coalesce(p_roles,'{}')),auth.uid() from public.roles r where r.id<>'admin'
 on conflict (usuario_id,rol_id) do update set activo=excluded.activo,asignado_por=excluded.asignado_por,asignado_at=now();
 insert into public.roles_bitacora(tipo,objetivo,detalle,usuario) values('roles_usuario',p_usuario::text,jsonb_build_object('antes',antes,'despues',coalesce(p_roles,'{}')),auth.uid());
 return (select count(*) from public.usuarios_roles where usuario_id=p_usuario and activo);
end $$;
create function public.guardar_permisos_rol(p_rol text,p_permisos text[]) returns integer language sql security invoker set search_path='' as $$ select private.guardar_permisos_rol(p_rol,p_permisos); $$;
create function public.crear_rol(p_id text,p_nombre text,p_descripcion text) returns text language sql security invoker set search_path='' as $$ select private.crear_rol(p_id,p_nombre,p_descripcion); $$;
create function public.guardar_roles_usuario(p_usuario uuid,p_roles text[]) returns integer language sql security invoker set search_path='' as $$ select private.guardar_roles_usuario(p_usuario,p_roles); $$;

-- Depósitos: modificar valor con permiso (no solo Administrador), con motivo, auditoría y alcance de sede.
create or replace function private.editar_monto_deposito(p_contrato uuid,p_monto numeric,p_motivo text) returns numeric language plpgsql security definer set search_path='' as $$
declare anterior numeric; begin
 if not private.tiene_permiso('depositos.modificar_valor') then raise exception 'No tienes permiso para modificar el valor del depósito.' using errcode='42501'; end if;
 if not public.es_admin() and not private.acceso_deposito(p_contrato) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 if p_monto is null or p_monto<0 or p_monto>=1000000000000 or p_monto<>round(p_monto,2) then raise exception 'Monto inválido.'; end if;
 if nullif(btrim(p_motivo),'') is null or length(btrim(p_motivo))<5 then raise exception 'El motivo es obligatorio (mínimo 5 caracteres).'; end if;
 select valor_deposito into anterior from public.contratos where id=p_contrato for update;
 if not found then raise exception 'Contrato no encontrado.'; end if;
 update public.contratos set valor_deposito=p_monto where id=p_contrato;
 insert into public.auditoria_montos_deposito(contrato_id,monto_anterior,monto_nuevo,motivo,usuario_id) values(p_contrato,coalesce(anterior,0),p_monto,btrim(p_motivo),(select auth.uid()));
 return p_monto;
end $$;

-- Contratos: cambiar fecha de evento o de prueba final con permiso, motivo y bitácora.
create function private.cambiar_fecha_contrato(p_contrato uuid,p_campo text,p_fecha date,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare c public.contratos; u public.profiles; anterior date; reason text:=btrim(coalesce(p_motivo,''));
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if u.id is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 if p_campo not in ('fecha_evento','fecha_prueba_final') then raise exception 'Campo no válido.'; end if;
 if not private.tiene_permiso('contratos.editar_'||p_campo) then raise exception 'No tienes permiso para cambiar esta fecha.' using errcode='42501'; end if;
 if p_fecha is null then raise exception 'Selecciona la nueva fecha.'; end if;
 if length(reason)<5 then raise exception 'Escribe el motivo del cambio (mínimo 5 caracteres).'; end if;
 select * into c from public.contratos where id=p_contrato for update;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if not public.es_admin() and c.sede_id is distinct from coalesce(private.sede_operativa_limitada(),u.sede_id) then raise exception 'El contrato no es de tu sede.' using errcode='42501'; end if;
 if lower(coalesce(c.estado,'')) in ('cancelado','anulado','finalizado') then raise exception 'El contrato ya está cerrado.'; end if;
 if p_campo='fecha_evento' then anterior:=c.fecha_evento; update public.contratos set fecha_evento=p_fecha where id=c.id;
 else anterior:=c.fecha_prueba_final; update public.contratos set fecha_prueba_final=p_fecha where id=c.id; end if;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario)
 values(c.id,case when p_campo='fecha_evento' then 'Cambio de fecha de evento' else 'Cambio de fecha de prueba final' end,
  jsonb_build_object('anterior',anterior,'nueva',p_fecha,'motivo',reason,'usuario_id',u.id)::text,coalesce(u.nombre,u.email));
end $$;
create function public.cambiar_fecha_contrato(p_contrato uuid,p_campo text,p_fecha date,p_motivo text) returns void language sql security invoker set search_path='' as $$ select private.cambiar_fecha_contrato(p_contrato,p_campo,p_fecha,p_motivo); $$;

revoke all on function private.permisos_usuario(uuid),private.tiene_permiso(text),public.mis_permisos(),private.guardar_permisos_rol(text,text[]),private.crear_rol(text,text,text),private.guardar_roles_usuario(uuid,text[]),
 public.guardar_permisos_rol(text,text[]),public.crear_rol(text,text,text),public.guardar_roles_usuario(uuid,text[]),private.cambiar_fecha_contrato(uuid,text,date,text),public.cambiar_fecha_contrato(uuid,text,date,text) from public,anon;
grant execute on function private.permisos_usuario(uuid),private.tiene_permiso(text),public.mis_permisos(),private.guardar_permisos_rol(text,text[]),private.crear_rol(text,text,text),private.guardar_roles_usuario(uuid,text[]),
 public.guardar_permisos_rol(text,text[]),public.crear_rol(text,text,text),public.guardar_roles_usuario(uuid,text[]),private.cambiar_fecha_contrato(uuid,text,date,text),public.cambiar_fecha_contrato(uuid,text,date,text) to authenticated;


-- Comprobantes de depósito: reemplazar (Contabilidad, Administrador o quien tenga el permiso) y eliminar solo con permiso.
-- El archivo nunca se borra: queda en la bitácora del contrato con usuario, fecha, hora y motivo.
create or replace function private.cambiar_comprobante_deposito(p_tipo text,p_id uuid,p_path text,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare u public.profiles; mov public.movimientos_depositos; cid uuid; anterior text;
 nuevo text:=nullif(btrim(coalesce(p_path,'')),''); reason text:=btrim(coalesce(p_motivo,''));
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if u.id is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 if nuevo is null and not private.tiene_permiso('depositos.eliminar_comprobante') then raise exception 'No tienes permiso para eliminar comprobantes.' using errcode='42501'; end if;
 if nuevo is not null and lower(btrim(u.rol)) not in ('admin','contabilidad') and not private.tiene_permiso('depositos.eliminar_comprobante') then raise exception 'No tienes permiso para reemplazar comprobantes.' using errcode='42501'; end if;
 if length(reason) not between 5 and 500 then raise exception 'Escribe el motivo del cambio (mínimo 5 caracteres).'; end if;
 if p_tipo='movimiento' then
  select * into mov from public.movimientos_depositos where id=p_id for update;
  if not found then raise exception 'Movimiento no encontrado.'; end if;
  cid:=mov.contrato_id;anterior:=mov.comprobante_path;
 elsif p_tipo='soporte' then
  select s.comprobante_path into anterior from public.soportes_depositos_anteriores s where s.contrato_id=p_id for update;
  if not found then raise exception 'Comprobante del depósito anterior no encontrado.'; end if;
  if nuevo is null then raise exception 'El comprobante del depósito anterior solo se puede reemplazar.'; end if;
  cid:=p_id;
 else raise exception 'Tipo de comprobante inválido.';
 end if;
 if not private.acceso_deposito(cid) or ((select private.sede_operativa_limitada()) is not null and not exists(select 1 from public.contratos c where c.id=cid and c.sede_id=(select private.sede_operativa_limitada()))) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 if nuevo is not distinct from anterior then raise exception 'Selecciona un comprobante diferente al actual.'; end if;
 if nuevo is not null then perform private.comprobante_deposito(cid,nuevo); end if;
 if p_tipo='movimiento' then
  update public.movimientos_depositos set comprobante_path=nuevo where id=mov.id;
  update public.solicitudes_depositos set comprobante_path=nuevo where id=mov.id;
 else
  update public.soportes_depositos_anteriores set comprobante_path=nuevo where contrato_id=cid;
 end if;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario)
 values(cid,case when nuevo is null then 'Comprobante de depósito eliminado' when anterior is null then 'Comprobante de depósito adjuntado' else 'Comprobante de depósito reemplazado' end,
  jsonb_build_object('registro',p_tipo,'id',p_id,'tipo_movimiento',mov.tipo,'monto',mov.monto,'anterior',anterior,'nuevo',nuevo,'motivo',reason,'usuario_id',u.id)::text,coalesce(u.nombre,u.email));
end $$;

-- Contabilidad: los paneles de su rol (o de roles asignados) también abren sus tablas, salvo que el Administrador se los quite.
create or replace function private.contabilidad_lee(p_tabla text) returns boolean language sql stable security definer set search_path='' as $$
 select private.es_contabilidad() and exists(select 1 from (
   select a.panel from public.accesos_paneles a where a.usuario_id=auth.uid() and a.estado='permitido'
   union select substr(x,7) from unnest(private.permisos_usuario(auth.uid())) x where x like 'panel.%'
  ) g
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
  ) m(panel,tablas) on m.panel=g.panel
  where p_tabla=any(m.tablas) and not exists(select 1 from public.accesos_paneles b where b.usuario_id=auth.uid() and b.panel=g.panel and b.estado='bloqueado'));
$$;
