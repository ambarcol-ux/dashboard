-- Módulo de proveedores: catálogo (proveedores, sedes, tarifas, paquetes Ámbar), asignación a contratos,
-- pagos, documentos y portal del proveedor (rol 'proveedor').
-- Nada se borra: proveedores y tarifas se desactivan, pagos se anulan y documentos se retiran.
-- Administración usa las tablas directamente (RLS es_admin). Asesoras y proveedores solo a través de las
-- funciones de abajo, que nunca devuelven valor a empresa ni margen a quien no debe verlos.

-- ── Seguridad previa: nadie puede cambiarse a sí mismo el rol, la sede o el estado activo ──────────
create function private.proteger_campos_perfil() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not public.es_admin()
  and (new.rol is distinct from old.rol or new.sede_id is distinct from old.sede_id or new.activo is distinct from old.activo)
 then raise exception 'Solo un administrador puede cambiar el rol, la sede o el estado de un usuario.' using errcode='42501'; end if;
 return new;
end $$;
create trigger profiles_proteger_campos before update on public.profiles for each row execute function private.proteger_campos_perfil();

-- ── Tablas ────────────────────────────────────────────────────────────────────────────────────────
create table public.proveedores (
 id uuid primary key default gen_random_uuid(),
 codigo text not null unique check (codigo ~ '^[A-Z0-9-]{2,20}$'),
 nombre text not null check (length(btrim(nombre)) between 2 and 150),
 tipo_servicio text not null check (length(btrim(tipo_servicio)) between 2 and 60),
 celular text check (celular ~ '^[0-9]{10}$'),
 celular_2 text check (celular_2 ~ '^[0-9]{10}$'),
 correo text check (correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
 documento text check (length(documento)<=30),
 banco text check (length(banco)<=60),
 tipo_cuenta text check (length(tipo_cuenta)<=30),
 numero_cuenta text check (length(numero_cuenta)<=40),
 estado text not null default 'Activo' check (estado in ('Activo','Inactivo')),
 usuario_id uuid unique references public.profiles(id),
 notas text check (length(notas)<=4000),
 created_at timestamptz not null default now(),
 created_by uuid references public.profiles(id) default auth.uid(),
 updated_at timestamptz not null default now()
);
create table public.proveedor_sedes (
 proveedor_id uuid not null references public.proveedores(id),
 sede_id uuid not null references public.sedes(id),
 activa boolean not null default true,
 primary key (proveedor_id,sede_id)
);
create table public.proveedor_tarifas (
 id uuid primary key default gen_random_uuid(),
 codigo text not null unique check (codigo ~ '^[A-Z0-9-]{2,20}$'),
 proveedor_id uuid not null references public.proveedores(id),
 sede_id uuid not null references public.sedes(id),
 servicio text not null check (length(btrim(servicio)) between 2 and 60),
 descripcion text not null default '' check (length(descripcion)<=2000),
 recurso text check (length(recurso)<=150),
 valor_empresa numeric(14,2) not null check (valor_empresa>=0),
 valor_cliente numeric(14,2) not null check (valor_cliente>=0),
 adicional_valor numeric(14,2) not null default 0 check (adicional_valor>=0),
 adicional_detalle text check (length(adicional_detalle)<=500),
 adicional_opcional text check (length(adicional_opcional)<=500),
 vigente_desde date not null default (now() at time zone 'America/Bogota')::date,
 vigente_hasta date,
 aprobado_por uuid references public.profiles(id) default auth.uid(),
 activa boolean not null default true,
 created_at timestamptz not null default now(),
 check (vigente_hasta is null or vigente_hasta>=vigente_desde)
);
create index proveedor_tarifas_sede on public.proveedor_tarifas(sede_id,servicio) where activa;
create table public.paquetes_ambar (
 id uuid primary key default gen_random_uuid(),
 codigo text not null unique check (codigo ~ '^[A-Z0-9-]{2,20}$'),
 sede_id uuid not null references public.sedes(id),
 nombre text not null check (length(btrim(nombre)) between 2 and 150),
 precio_cliente numeric(14,2) not null check (precio_cliente>=0),
 comision_empleada numeric(14,2) not null default 0 check (comision_empleada>=0),
 activo boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.paquete_componentes (
 id uuid primary key default gen_random_uuid(),
 paquete_id uuid not null references public.paquetes_ambar(id),
 servicio text not null check (length(btrim(servicio)) between 2 and 60),
 cantidad integer not null default 1 check (cantidad between 1 and 50),
 unique (paquete_id,servicio)
);
create table public.contrato_servicios (
 id uuid primary key default gen_random_uuid(),
 contrato_id uuid not null references public.contratos(id),
 tarifa_id uuid not null references public.proveedor_tarifas(id),
 proveedor_id uuid not null references public.proveedores(id),
 servicio text not null,
 descripcion text not null default '',
 recurso text,
 fecha_servicio timestamptz not null,
 valor_empresa numeric(14,2) not null,
 valor_cliente numeric(14,2) not null,
 adicional_valor numeric(14,2) not null default 0,
 estado text not null default 'Asignado' check (estado in ('Asignado','Confirmado','Realizado','Cancelado')),
 estado_pago text not null default 'No aplica' check (estado_pago in ('No aplica','Pendiente','Pagado','Anulado')),
 asignado_por uuid not null references public.profiles(id),
 notas text check (length(notas)<=1000),
 created_at timestamptz not null default now(),
 confirmado_at timestamptz,
 realizado_at timestamptz,
 cancelado_at timestamptz,
 cancelado_por uuid references public.profiles(id),
 motivo_cancelacion text
);
create index contrato_servicios_contrato on public.contrato_servicios(contrato_id);
create index contrato_servicios_proveedor on public.contrato_servicios(proveedor_id,fecha_servicio);
create table public.pagos_proveedor (
 id uuid primary key default gen_random_uuid(),
 proveedor_id uuid not null references public.proveedores(id),
 fecha_pago date not null,
 valor_total numeric(14,2) not null check (valor_total>0),
 medio_pago text not null check (medio_pago in ('Transferencia','Efectivo','Nequi','Daviplata','Otro')),
 referencia text check (length(referencia)<=100),
 comprobante_path text,
 registrado_por uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 anulado_at timestamptz,
 anulado_por uuid references public.profiles(id),
 motivo_anulacion text
);
create index pagos_proveedor_proveedor on public.pagos_proveedor(proveedor_id,fecha_pago);
create table public.pago_proveedor_detalle (
 pago_id uuid not null references public.pagos_proveedor(id),
 contrato_servicio_id uuid not null references public.contrato_servicios(id),
 valor numeric(14,2) not null check (valor>=0),
 primary key (pago_id,contrato_servicio_id)
);
create table public.documentos_proveedor (
 id uuid primary key default gen_random_uuid(),
 proveedor_id uuid not null references public.proveedores(id),
 tipo text not null check (tipo in ('Condiciones','Portafolio','Contrato interno','RUT','Certificación bancaria','Acuerdo de precios','Otro')),
 titulo text not null check (length(btrim(titulo)) between 2 and 150),
 archivo_path text not null,
 visibilidad text not null check (visibilidad in ('Asesora','Interno')),
 visible_proveedor boolean not null default false,
 vence_el date,
 activo boolean not null default true,
 subido_por uuid references public.profiles(id) default auth.uid(),
 subido_en timestamptz not null default now()
);
create index documentos_proveedor_proveedor on public.documentos_proveedor(proveedor_id) where activo;

-- Administración trabaja directo sobre el catálogo y los documentos; el resto de tablas solo por funciones.
do $$ declare t text; begin
 foreach t in array array['proveedores','proveedor_sedes','proveedor_tarifas','paquetes_ambar','paquete_componentes','contrato_servicios','pagos_proveedor','pago_proveedor_detalle','documentos_proveedor'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for select to authenticated using (public.es_admin())',t||'_admin_leer',t);
 end loop;
 foreach t in array array['proveedores','proveedor_tarifas','paquetes_ambar','paquete_componentes','documentos_proveedor'] loop
  execute format('grant insert,update on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.es_admin())',t||'_admin_crear',t);
  execute format('create policy %I on public.%I for update to authenticated using (public.es_admin()) with check (public.es_admin())',t||'_admin_editar',t);
 end loop;
 -- proveedor_sedes es una relación: administración la reemplaza con guardar_sedes_proveedor().
end $$;

create function private.tocar_proveedor() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at:=now(); return new; end $$;
create trigger proveedores_updated before update on public.proveedores for each row execute function private.tocar_proveedor();
-- El usuario de acceso solo lo enlaza el servidor (API con service role).
create function private.proteger_usuario_proveedor() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then return new; end if;
 if (tg_op='INSERT' and new.usuario_id is not null) or (tg_op='UPDATE' and new.usuario_id is distinct from old.usuario_id) then
  raise exception 'El acceso del proveedor se crea con el botón Crear usuario.' using errcode='42501'; end if;
 return new;
end $$;
create trigger proveedores_usuario before insert or update of usuario_id on public.proveedores for each row execute function private.proteger_usuario_proveedor();
-- Documentos internos por defecto para los tipos sensibles; un documento interno nunca se marca como de asesora.
create function private.documento_visibilidad() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' and new.tipo in ('Contrato interno','RUT','Certificación bancaria') then new.visibilidad:='Interno'; end if;
 return new;
end $$;
create trigger documentos_proveedor_visibilidad before insert on public.documentos_proveedor for each row execute function private.documento_visibilidad();

-- ── Quién es quién ────────────────────────────────────────────────────────────────────────────────
create function private.prov_rol() returns text language sql stable security definer set search_path='' as $$
 select lower(btrim(coalesce(p.rol,''))) from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true);
$$;
-- Personal de tienda que trabaja con contratos (no contabilidad ni proveedor).
create function private.prov_es_personal() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.prov_rol() not in ('','contabilidad','proveedor'),false);
$$;
create function private.prov_mi_proveedor() returns uuid language sql stable security definer set search_path='' as $$
 select v.id from public.proveedores v where v.usuario_id=auth.uid() and v.estado='Activo' and private.prov_rol()='proveedor';
$$;

-- ── Sedes del proveedor (administración) ─────────────────────────────────────────────────────────
create function private.guardar_sedes_proveedor(p_proveedor uuid,p_sedes uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración gestiona proveedores.' using errcode='42501'; end if;
 if not exists(select 1 from public.proveedores where id=p_proveedor) then raise exception 'Proveedor no encontrado.'; end if;
 if coalesce(cardinality(p_sedes),0)=0 then raise exception 'Elige al menos una sede.'; end if;
 perform 1 from public.proveedores where id=p_proveedor for update;
 update public.proveedor_sedes set activa=(sede_id=any(p_sedes)) where proveedor_id=p_proveedor;
 insert into public.proveedor_sedes(proveedor_id,sede_id) select p_proveedor,s from unnest(p_sedes) s on conflict (proveedor_id,sede_id) do update set activa=true;
end $$;

-- ── Lista de proveedores con conteos y alertas (administración) ──────────────────────────────────
create function private.proveedores_resumen(p_mes date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare desde date:=date_trunc('month',coalesce(p_mes,(now() at time zone 'America/Bogota')::date))::date; hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if not public.es_admin() then raise exception 'Solo administración ve el resumen de proveedores.' using errcode='42501'; end if;
 return jsonb_build_object(
  'proveedores',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'codigo',v.codigo,'nombre',v.nombre,'tipo_servicio',v.tipo_servicio,'celular',v.celular,'correo',v.correo,'estado',v.estado,'tiene_usuario',v.usuario_id is not null,
    'sedes',coalesce((select jsonb_agg(ps.sede_id) from public.proveedor_sedes ps where ps.proveedor_id=v.id and ps.activa),'[]'::jsonb),
    'servicios_mes',(select count(*) from public.contrato_servicios s where s.proveedor_id=v.id and s.estado<>'Cancelado' and (s.fecha_servicio at time zone 'America/Bogota')::date>=desde and (s.fecha_servicio at time zone 'America/Bogota')::date<(desde+interval '1 month')::date),
    'por_pagar',coalesce((select sum(s.valor_empresa) from public.contrato_servicios s where s.proveedor_id=v.id and s.estado_pago='Pendiente'),0)) order by v.nombre) from public.proveedores v),'[]'::jsonb),
  'alertas',jsonb_build_object(
   'documentos_por_vencer',coalesce((select jsonb_agg(jsonb_build_object('proveedor_id',d.proveedor_id,'proveedor',v.nombre,'titulo',d.titulo,'vence_el',d.vence_el) order by d.vence_el) from public.documentos_proveedor d join public.proveedores v on v.id=d.proveedor_id where d.activo and d.vence_el between hoy and hoy+30),'[]'::jsonb),
   'servicios_sin_cerrar',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'proveedor_id',s.proveedor_id,'proveedor',v.nombre,'servicio',s.servicio,'fecha_servicio',s.fecha_servicio,'estado',s.estado,'numero_contrato',c.numero_contrato) order by s.fecha_servicio) from public.contrato_servicios s join public.proveedores v on v.id=s.proveedor_id join public.contratos c on c.id=s.contrato_id where s.estado in ('Asignado','Confirmado') and s.fecha_servicio<now()),'[]'::jsonb),
   'pagos_atrasados',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'proveedor_id',s.proveedor_id,'proveedor',v.nombre,'servicio',s.servicio,'valor_empresa',s.valor_empresa,'realizado_at',s.realizado_at) order by s.realizado_at) from public.contrato_servicios s join public.proveedores v on v.id=s.proveedor_id where s.estado_pago='Pendiente' and s.realizado_at<now()-interval '15 days'),'[]'::jsonb)));
end $$;

-- ── Catálogo para asesoras (sin valor a empresa ni margen) ───────────────────────────────────────
create function private.catalogo_proveedores(p_sede uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare admin boolean:=public.es_admin(); hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if not private.prov_es_personal() then raise exception 'No tienes acceso al catálogo de proveedores.' using errcode='42501'; end if;
 if (select private.sede_operativa_limitada()) is not null and p_sede is distinct from (select private.sede_operativa_limitada()) then raise exception 'Tu cuenta solo ve el catálogo de su sede.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('tarifa_id',t.id,'codigo',t.codigo,'servicio',t.servicio,'descripcion',t.descripcion,'recurso',t.recurso,'valor_cliente',t.valor_cliente,
   'adicional_opcional',t.adicional_opcional,'proveedor_id',v.id,'proveedor',v.nombre,'celular',v.celular,
   'tiene_condiciones',exists(select 1 from public.documentos_proveedor d where d.proveedor_id=v.id and d.activo and d.visibilidad='Asesora'))
   ||case when admin then jsonb_build_object('valor_empresa',t.valor_empresa,'adicional_valor',t.adicional_valor,'adicional_detalle',t.adicional_detalle) else '{}'::jsonb end
   order by t.servicio,v.nombre,t.valor_cliente)
  from public.proveedor_tarifas t join public.proveedores v on v.id=t.proveedor_id
  where t.sede_id=p_sede and t.activa and v.estado='Activo' and t.vigente_desde<=hoy and (t.vigente_hasta is null or t.vigente_hasta>=hoy)),'[]'::jsonb);
end $$;

create function private.documentos_proveedor_asesora(p_proveedor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.prov_es_personal() then raise exception 'No tienes acceso a los documentos de proveedores.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'tipo',d.tipo,'titulo',d.titulo,'archivo_path',d.archivo_path,'vence_el',d.vence_el) order by d.tipo,d.titulo)
  from public.documentos_proveedor d where d.proveedor_id=p_proveedor and d.activo and (d.visibilidad='Asesora' or public.es_admin())),'[]'::jsonb);
end $$;

-- ── Servicios de un contrato ─────────────────────────────────────────────────────────────────────
-- La visibilidad del contrato la decide el RLS de contratos en el wrapper público (security invoker).
create function private.servicios_contrato(p_contrato uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare admin boolean:=public.es_admin();
begin
 if not private.prov_es_personal() then raise exception 'No tienes acceso a los proveedores del contrato.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'servicio',s.servicio,'descripcion',s.descripcion,'recurso',s.recurso,'fecha_servicio',s.fecha_servicio,'valor_cliente',s.valor_cliente,
   'estado',s.estado,'estado_pago',s.estado_pago,'notas',s.notas,'proveedor_id',v.id,'proveedor',v.nombre,'celular',v.celular,'asignado_por',coalesce(u.nombre,u.email),'motivo_cancelacion',s.motivo_cancelacion)
   ||case when admin then jsonb_build_object('valor_empresa',s.valor_empresa,'adicional_valor',s.adicional_valor) else '{}'::jsonb end order by s.fecha_servicio)
  from public.contrato_servicios s join public.proveedores v on v.id=s.proveedor_id left join public.profiles u on u.id=s.asignado_por where s.contrato_id=p_contrato),'[]'::jsonb);
end $$;

create function private.asignar_servicio_contrato(p_contrato uuid,p_tarifa uuid,p_fecha timestamptz,p_notas text,p_forzar boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare c record; t public.proveedor_tarifas; v public.proveedores; choque text; new_id uuid; hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if not private.prov_es_personal() then raise exception 'No puedes asignar proveedores.' using errcode='42501'; end if;
 select id,sede_id,estado into c from public.contratos where id=p_contrato;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if lower(coalesce(c.estado,'')) in ('anulado','cancelado') then raise exception 'El contrato está anulado.'; end if;
 select * into t from public.proveedor_tarifas where id=p_tarifa;
 if t.id is null or not t.activa or t.vigente_desde>hoy or (t.vigente_hasta is not null and t.vigente_hasta<hoy) then raise exception 'La tarifa ya no está vigente.'; end if;
 if t.sede_id is distinct from c.sede_id then raise exception 'La tarifa no corresponde a la sede del contrato.'; end if;
 select * into v from public.proveedores where id=t.proveedor_id;
 if v.estado<>'Activo' then raise exception 'El proveedor % está inactivo.',v.nombre; end if;
 if p_fecha is null then raise exception 'Indica la fecha y hora del servicio.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('proveedor:'||v.id::text,0));
 select string_agg(x.servicio||' del contrato '||coalesce(k.numero_contrato,'?')||' a las '||to_char(x.fecha_servicio at time zone 'America/Bogota','HH12:MI AM'),'; ') into choque
  from public.contrato_servicios x join public.contratos k on k.id=x.contrato_id
  where x.proveedor_id=v.id and x.estado<>'Cancelado' and abs(extract(epoch from x.fecha_servicio-p_fecha))<3600;
 if choque is not null and not coalesce(p_forzar,false) then
  raise exception 'CHOQUE_HORARIO: % ya tiene asignado: %.',v.nombre,choque using errcode='P0001'; end if;
 insert into public.contrato_servicios(contrato_id,tarifa_id,proveedor_id,servicio,descripcion,recurso,fecha_servicio,valor_empresa,valor_cliente,adicional_valor,asignado_por,notas)
 values(p_contrato,t.id,v.id,t.servicio,t.descripcion,t.recurso,p_fecha,t.valor_empresa,t.valor_cliente,t.adicional_valor,auth.uid(),nullif(btrim(coalesce(p_notas,'')),''))
 returning id into new_id;
 return new_id;
end $$;

-- Asignado → Confirmado → Realizado (queda Pendiente de pago). Cancelado con motivo si no está pagado.
create function private.cambiar_estado_servicio(p_id uuid,p_estado text,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare s public.contrato_servicios; reason text:=btrim(coalesce(p_motivo,''));
begin
 if not private.prov_es_personal() then raise exception 'No puedes cambiar servicios de proveedores.' using errcode='42501'; end if;
 select * into s from public.contrato_servicios where id=p_id for update;
 if s.id is null then raise exception 'Servicio no encontrado.'; end if;
 if s.estado='Cancelado' then raise exception 'El servicio ya está cancelado.'; end if;
 if p_estado='Confirmado' and s.estado='Asignado' then
  update public.contrato_servicios set estado='Confirmado',confirmado_at=now() where id=p_id;
 elsif p_estado='Realizado' and s.estado in ('Asignado','Confirmado') then
  update public.contrato_servicios set estado='Realizado',realizado_at=now(),estado_pago=case when valor_empresa>0 then 'Pendiente' else 'No aplica' end where id=p_id;
 elsif p_estado='Cancelado' then
  if s.estado_pago='Pagado' then raise exception 'El servicio ya se pagó: primero hay que anular el pago.'; end if;
  if length(reason)<5 then raise exception 'Escribe el motivo de la cancelación.'; end if;
  update public.contrato_servicios set estado='Cancelado',estado_pago='No aplica',cancelado_at=now(),cancelado_por=auth.uid(),motivo_cancelacion=reason where id=p_id;
 else raise exception 'No se puede pasar de % a %.',s.estado,p_estado; end if;
end $$;

-- ── Pagos (administración) ───────────────────────────────────────────────────────────────────────
create function private.servicios_por_pagar(p_sede uuid,p_proveedor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración registra pagos a proveedores.' using errcode='42501'; end if;
 return jsonb_build_object(
  'pendientes',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'proveedor_id',v.id,'proveedor',v.nombre,'servicio',s.servicio,'descripcion',s.descripcion,'fecha_servicio',s.fecha_servicio,'estado',s.estado,
    'valor_empresa',s.valor_empresa,'adicional_valor',s.adicional_valor,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'sede_id',c.sede_id,'realizado_at',s.realizado_at,'banco',v.banco,'tipo_cuenta',v.tipo_cuenta,'numero_cuenta',v.numero_cuenta) order by v.nombre,s.fecha_servicio)
   from public.contrato_servicios s join public.proveedores v on v.id=s.proveedor_id join public.contratos c on c.id=s.contrato_id
   where s.estado<>'Cancelado' and s.estado_pago in ('Pendiente','No aplica') and s.valor_empresa>0 and (s.estado='Realizado' or s.estado_pago='Pendiente')
    and (p_sede is null or c.sede_id=p_sede) and (p_proveedor is null or v.id=p_proveedor)),'[]'::jsonb),
  'pagos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'proveedor_id',v.id,'proveedor',v.nombre,'fecha_pago',p.fecha_pago,'valor_total',p.valor_total,'medio_pago',p.medio_pago,'referencia',p.referencia,
    'comprobante_path',p.comprobante_path,'registrado_por',coalesce(u.nombre,u.email),'anulado_at',p.anulado_at,'motivo_anulacion',p.motivo_anulacion,
    'servicios',(select count(*) from public.pago_proveedor_detalle d where d.pago_id=p.id)) order by p.fecha_pago desc,p.created_at desc)
   from (select * from public.pagos_proveedor where (p_proveedor is null or proveedor_id=p_proveedor) order by fecha_pago desc,created_at desc limit 100) p
   join public.proveedores v on v.id=p.proveedor_id left join public.profiles u on u.id=p.registrado_por),'[]'::jsonb));
end $$;

create function private.registrar_pago_proveedor(p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare prov uuid:=(p_datos->>'proveedor_id')::uuid; ids uuid[]; f date:=(p_datos->>'fecha_pago')::date; med text:=p_datos->>'medio_pago';
 ref text:=nullif(btrim(coalesce(p_datos->>'referencia','')),''); path text:=nullif(btrim(coalesce(p_datos->>'comprobante_path','')),'');
 n int; total numeric; new_id uuid;
begin
 if not public.es_admin() then raise exception 'Solo administración registra pagos a proveedores.' using errcode='42501'; end if;
 select array_agg(distinct x::uuid) into ids from jsonb_array_elements_text(coalesce(p_datos->'servicios','[]'::jsonb)) x;
 if prov is null or coalesce(cardinality(ids),0)=0 then raise exception 'Elige los servicios que vas a pagar.'; end if;
 if f is null or f>(now() at time zone 'America/Bogota')::date then raise exception 'Revisa la fecha del pago.'; end if;
 if med not in ('Transferencia','Efectivo','Nequi','Daviplata','Otro') then raise exception 'Elige el medio de pago.'; end if;
 if path is not null and (split_part(path,'/',1)<>prov::text or not exists(select 1 from storage.objects where bucket_id='comprobantes_proveedores' and name=path)) then raise exception 'El comprobante no es válido.'; end if;
 perform 1 from public.contrato_servicios where id=any(ids) for update;
 select count(*),sum(valor_empresa) into n,total from public.contrato_servicios where id=any(ids) and proveedor_id=prov and estado='Realizado' and estado_pago='Pendiente';
 if n<>cardinality(ids) then raise exception 'Solo se pueden pagar servicios realizados y pendientes de este proveedor. Recarga la lista.'; end if;
 if total<=0 then raise exception 'El total a pagar debe ser mayor que cero.'; end if;
 insert into public.pagos_proveedor(proveedor_id,fecha_pago,valor_total,medio_pago,referencia,comprobante_path,registrado_por)
 values(prov,f,total,med,ref,path,auth.uid()) returning id into new_id;
 insert into public.pago_proveedor_detalle(pago_id,contrato_servicio_id,valor) select new_id,id,valor_empresa from public.contrato_servicios where id=any(ids);
 update public.contrato_servicios set estado_pago='Pagado' where id=any(ids);
 return new_id;
end $$;

create function private.anular_pago_proveedor(p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare p public.pagos_proveedor; reason text:=btrim(coalesce(p_motivo,''));
begin
 if not public.es_admin() then raise exception 'Solo administración anula pagos a proveedores.' using errcode='42501'; end if;
 select * into p from public.pagos_proveedor where id=p_id for update;
 if p.id is null then raise exception 'Pago no encontrado.'; end if;
 if p.anulado_at is not null then raise exception 'El pago ya está anulado.'; end if;
 if length(reason)<5 then raise exception 'Escribe el motivo de la anulación.'; end if;
 update public.pagos_proveedor set anulado_at=now(),anulado_por=auth.uid(),motivo_anulacion=reason where id=p_id;
 update public.contrato_servicios set estado_pago='Pendiente' where id in (select contrato_servicio_id from public.pago_proveedor_detalle where pago_id=p_id) and estado_pago='Pagado';
end $$;

-- ── Portal del proveedor (todo filtrado por el proveedor de la sesión) ───────────────────────────
create function private.portal_proveedor() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.prov_mi_proveedor();
begin
 if me is null then raise exception 'Tu usuario no está enlazado a un proveedor activo.' using errcode='42501'; end if;
 return jsonb_build_object(
  'proveedor',(select jsonb_build_object('id',v.id,'codigo',v.codigo,'nombre',v.nombre,'tipo_servicio',v.tipo_servicio,'celular',v.celular,'celular_2',v.celular_2,'correo',v.correo,'banco',v.banco,'tipo_cuenta',v.tipo_cuenta,'numero_cuenta',v.numero_cuenta) from public.proveedores v where v.id=me),
  'servicios',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'servicio',s.servicio,'descripcion',s.descripcion,'recurso',s.recurso,'fecha_servicio',s.fecha_servicio,'estado',s.estado,'estado_pago',s.estado_pago,
    'valor_empresa',s.valor_empresa,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'sede',sd.nombre,'lugar',s.notas) order by s.fecha_servicio desc)
   from public.contrato_servicios s join public.contratos c on c.id=s.contrato_id left join public.sedes sd on sd.id=c.sede_id where s.proveedor_id=me and s.estado<>'Cancelado'),'[]'::jsonb),
  'tarifas',coalesce((select jsonb_agg(jsonb_build_object('codigo',t.codigo,'servicio',t.servicio,'descripcion',t.descripcion,'recurso',t.recurso,'valor_empresa',t.valor_empresa,'sede',sd.nombre) order by sd.nombre,t.servicio)
   from public.proveedor_tarifas t join public.sedes sd on sd.id=t.sede_id where t.proveedor_id=me and t.activa),'[]'::jsonb),
  'pagos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'fecha_pago',p.fecha_pago,'valor_total',p.valor_total,'medio_pago',p.medio_pago,'referencia',p.referencia,'comprobante_path',p.comprobante_path,'anulado',p.anulado_at is not null) order by p.fecha_pago desc)
   from public.pagos_proveedor p where p.proveedor_id=me),'[]'::jsonb),
  'documentos',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'tipo',d.tipo,'titulo',d.titulo,'archivo_path',d.archivo_path,'vence_el',d.vence_el) order by d.subido_en desc)
   from public.documentos_proveedor d where d.proveedor_id=me and d.activo and d.visible_proveedor),'[]'::jsonb));
end $$;

create function private.confirmar_servicio_proveedor(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.prov_mi_proveedor();
begin
 if me is null then raise exception 'Tu usuario no está enlazado a un proveedor activo.' using errcode='42501'; end if;
 update public.contrato_servicios set estado='Confirmado',confirmado_at=now() where id=p_id and proveedor_id=me and estado='Asignado';
 if not found then raise exception 'Ese servicio no está pendiente de confirmar.'; end if;
end $$;

create function private.actualizar_datos_proveedor(p_datos jsonb) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.prov_mi_proveedor();
begin
 if me is null then raise exception 'Tu usuario no está enlazado a un proveedor activo.' using errcode='42501'; end if;
 update public.proveedores set celular=nullif(btrim(p_datos->>'celular'),''),correo=nullif(btrim(p_datos->>'correo'),''),banco=nullif(btrim(p_datos->>'banco'),''),
  tipo_cuenta=nullif(btrim(p_datos->>'tipo_cuenta'),''),numero_cuenta=nullif(btrim(p_datos->>'numero_cuenta'),'') where id=me;
end $$;

-- ── Wrappers públicos ────────────────────────────────────────────────────────────────────────────
create function public.guardar_sedes_proveedor(p_proveedor uuid,p_sedes uuid[]) returns void language sql security invoker set search_path='' as $$ select private.guardar_sedes_proveedor(p_proveedor,p_sedes); $$;
create function public.proveedores_resumen(p_mes date) returns jsonb language sql stable security invoker set search_path='' as $$ select private.proveedores_resumen(p_mes); $$;
create function public.catalogo_proveedores(p_sede uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.catalogo_proveedores(p_sede); $$;
create function public.documentos_proveedor_asesora(p_proveedor uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.documentos_proveedor_asesora(p_proveedor); $$;
-- Los tres siguientes exigen que quien llama pueda ver el contrato (RLS de contratos, evaluado como el usuario).
create function public.servicios_contrato(p_contrato uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.contratos where id=p_contrato) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 return private.servicios_contrato(p_contrato);
end $$;
create function public.asignar_servicio_contrato(p_contrato uuid,p_tarifa uuid,p_fecha timestamptz,p_notas text,p_forzar boolean) returns uuid language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.contratos where id=p_contrato) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 return private.asignar_servicio_contrato(p_contrato,p_tarifa,p_fecha,p_notas,p_forzar);
end $$;
create function public.cambiar_estado_servicio(p_id uuid,p_estado text,p_motivo text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.contratos c where c.id=private.contrato_de_servicio(p_id)) then raise exception 'No tienes acceso a este servicio.' using errcode='42501'; end if;
 perform private.cambiar_estado_servicio(p_id,p_estado,p_motivo);
end $$;
create function public.servicios_por_pagar(p_sede uuid,p_proveedor uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.servicios_por_pagar(p_sede,p_proveedor); $$;
create function public.registrar_pago_proveedor(p_datos jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.registrar_pago_proveedor(p_datos); $$;
create function public.anular_pago_proveedor(p_id uuid,p_motivo text) returns void language sql security invoker set search_path='' as $$ select private.anular_pago_proveedor(p_id,p_motivo); $$;
create function public.portal_proveedor() returns jsonb language sql stable security invoker set search_path='' as $$ select private.portal_proveedor(); $$;
create function public.confirmar_servicio_proveedor(p_id uuid) returns void language sql security invoker set search_path='' as $$ select private.confirmar_servicio_proveedor(p_id); $$;
create function public.actualizar_datos_proveedor(p_datos jsonb) returns void language sql security invoker set search_path='' as $$ select private.actualizar_datos_proveedor(p_datos); $$;

create function private.contrato_de_servicio(p_id uuid) returns uuid language sql stable security definer set search_path='' as $$
 select contrato_id from public.contrato_servicios where id=p_id;
$$;

do $$ declare f text; begin
 foreach f in array array[
  'private.proteger_campos_perfil()','private.tocar_proveedor()','private.proteger_usuario_proveedor()','private.documento_visibilidad()',
  'private.prov_rol()','private.prov_es_personal()','private.prov_mi_proveedor()','private.contrato_de_servicio(uuid)',
  'private.guardar_sedes_proveedor(uuid,uuid[])','private.proveedores_resumen(date)','private.catalogo_proveedores(uuid)','private.documentos_proveedor_asesora(uuid)',
  'private.servicios_contrato(uuid)','private.asignar_servicio_contrato(uuid,uuid,timestamptz,text,boolean)','private.cambiar_estado_servicio(uuid,text,text)',
  'private.servicios_por_pagar(uuid,uuid)','private.registrar_pago_proveedor(jsonb)','private.anular_pago_proveedor(uuid,text)',
  'private.portal_proveedor()','private.confirmar_servicio_proveedor(uuid)','private.actualizar_datos_proveedor(jsonb)',
  'public.guardar_sedes_proveedor(uuid,uuid[])','public.proveedores_resumen(date)','public.catalogo_proveedores(uuid)','public.documentos_proveedor_asesora(uuid)',
  'public.servicios_contrato(uuid)','public.asignar_servicio_contrato(uuid,uuid,timestamptz,text,boolean)','public.cambiar_estado_servicio(uuid,text,text)',
  'public.servicios_por_pagar(uuid,uuid)','public.registrar_pago_proveedor(jsonb)','public.anular_pago_proveedor(uuid,text)',
  'public.portal_proveedor()','public.confirmar_servicio_proveedor(uuid)','public.actualizar_datos_proveedor(jsonb)'] loop
  execute 'revoke all on function '||f||' from public,anon';
  if f not in ('private.proteger_campos_perfil()','private.tocar_proveedor()','private.proteger_usuario_proveedor()','private.documento_visibilidad()') then
   execute 'grant execute on function '||f||' to authenticated'; end if;
 end loop;
end $$;

-- ── Archivos: documentos y comprobantes en buckets privados, ruta <proveedor_id>/<archivo> ─────────
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('documentos_proveedores','documentos_proveedores',false,15728640,array['application/pdf','image/jpeg','image/png','image/webp']),
 ('comprobantes_proveedores','comprobantes_proveedores',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create function private.prov_puede_leer_archivo(p_bucket text,p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select public.es_admin()
  or (p_bucket='documentos_proveedores' and exists(select 1 from public.documentos_proveedor d where d.archivo_path=p_name and d.activo
       and ((d.visibilidad='Asesora' and private.prov_es_personal()) or (d.visible_proveedor and d.proveedor_id=private.prov_mi_proveedor()))))
  or (p_bucket='comprobantes_proveedores' and exists(select 1 from public.pagos_proveedor p where p.comprobante_path=p_name and p.proveedor_id=private.prov_mi_proveedor()));
$$;
revoke all on function private.prov_puede_leer_archivo(text,text) from public,anon;
grant execute on function private.prov_puede_leer_archivo(text,text) to authenticated;
create policy proveedores_archivos_leer on storage.objects for select to authenticated
 using (bucket_id in ('documentos_proveedores','comprobantes_proveedores') and private.prov_puede_leer_archivo(bucket_id,name));
create policy proveedores_archivos_subir on storage.objects for insert to authenticated
 with check (bucket_id in ('documentos_proveedores','comprobantes_proveedores') and public.es_admin());
-- Un usuario proveedor no toca ningún otro bucket.
create policy proveedor_solo_sus_archivos on storage.objects as restrictive for all to authenticated
 using (private.current_profile_role() is distinct from 'proveedor' or bucket_id in ('documentos_proveedores','comprobantes_proveedores'))
 with check (private.current_profile_role() is distinct from 'proveedor');

-- ── Un usuario proveedor solo ve su propio perfil ────────────────────────────────────────────────
create policy proveedor_perfil_propio on public.profiles as restrictive for select to authenticated
 using ((select private.current_profile_role()) is distinct from 'proveedor' or id=(select auth.uid()));

-- ── Guardia de la API: un usuario proveedor solo puede llamar a su portal ────────────────────────
-- PostgREST ejecuta esta función antes de cada petición (pgrst.db_pre_request). Para cualquier otro
-- usuario termina en la primera consulta y no cambia nada.
create function public.guardia_proveedor() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then return; end if;
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and lower(btrim(coalesce(p.rol,'')))='proveedor') then return; end if;
 if current_setting('request.path',true) in ('/rpc/portal_proveedor','/rpc/confirmar_servicio_proveedor','/rpc/actualizar_datos_proveedor') then return; end if;
 if current_setting('request.path',true)='/profiles' and current_setting('request.method',true) in ('GET','HEAD') then return; end if;
 raise sqlstate 'PT403' using message='Los proveedores solo tienen acceso a su portal.';
end $$;
revoke all on function public.guardia_proveedor() from public;
-- PostgREST la ejecuta con el rol de cada petición: anon, authenticated y service_role.
grant execute on function public.guardia_proveedor() to anon,authenticated,service_role;

-- Las restricciones del proveedor no dependen de que su perfil esté activo.
create function private.es_usuario_proveedor() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and lower(btrim(coalesce(p.rol,'')))='proveedor');
$$;
revoke all on function private.es_usuario_proveedor() from public,anon;
grant execute on function private.es_usuario_proveedor() to authenticated;
alter policy proveedor_perfil_propio on public.profiles using (not (select private.es_usuario_proveedor()) or id=(select auth.uid()));
alter policy proveedor_solo_sus_archivos on storage.objects
 using (not (select private.es_usuario_proveedor()) or bucket_id in ('documentos_proveedores','comprobantes_proveedores'))
 with check (not (select private.es_usuario_proveedor()));

-- Activa la guardia en PostgREST (antes de cada petición).
alter role authenticator set pgrst.db_pre_request = 'public.guardia_proveedor';
notify pgrst, 'reload config';
