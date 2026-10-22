-- Módulo de Retablos: catálogo de tipos, un retablo por contrato (sin columnas nuevas en contratos),
-- estados PENDIENTE → PENDIENTE_RECOGER → ENTREGADO (con retroceso a PENDIENTE) e historial.
-- Si el contrato se anula, el retablo queda ANULADO (no se borra).

create table if not exists public.retablo_tipos(
 id uuid primary key default gen_random_uuid(),
 nombre text not null check(length(btrim(nombre)) between 2 and 80),
 ancho_cm numeric(6,1) not null check(ancho_cm>0),
 alto_cm numeric(6,1) not null check(alto_cm>0),
 valor numeric(12,2) not null check(valor>0),
 valor_cliente numeric(12,2) not null check(valor_cliente>0),
 valor_empresa numeric(12,2) not null check(valor_empresa>0),
 activo boolean not null default true,
 creado_en timestamptz not null default now(),
 actualizado_por uuid references public.profiles(id),
 actualizado_en timestamptz not null default now()
);

create table if not exists public.retablos(
 id uuid primary key default gen_random_uuid(),
 contrato_id uuid not null unique references public.contratos(id),
 tipo_id uuid not null references public.retablo_tipos(id),
 cliente_nombre text not null,
 cliente_cedula text not null default '',
 numero_factura text,
 valor_cliente numeric(12,2) not null,
 valor_empresa numeric(12,2) not null,
 estado text not null default 'PENDIENTE' check(estado in ('PENDIENTE','PENDIENTE_RECOGER','ENTREGADO','ANULADO')),
 asesora_id uuid references public.profiles(id), -- usuario del ERP que vendió (lo ve en su panel)
 asesora_nombre text not null default '',
 sede_id uuid references public.sedes(id),
 observaciones text not null default '',
 creado_por uuid references public.profiles(id),
 creado_en timestamptz not null default now(),
 entregado_en timestamptz
);
create index if not exists retablos_estado on public.retablos(estado,creado_en desc);

create table if not exists public.retablo_historial(
 id uuid primary key default gen_random_uuid(),
 retablo_id uuid not null references public.retablos(id),
 estado_anterior text,
 estado_nuevo text not null,
 nota text not null default '',
 usuario_id uuid references public.profiles(id),
 fecha timestamptz not null default now()
);
create index if not exists retablo_historial_retablo on public.retablo_historial(retablo_id,fecha);

alter table public.retablo_tipos enable row level security;
alter table public.retablos enable row level security;
alter table public.retablo_historial enable row level security;
revoke all on public.retablo_tipos, public.retablos, public.retablo_historial from anon, authenticated;

-- Permisos: panel (asesoras ven solo sus retablos), ver todos, cambiar estado, catálogo y valor empresa (administrador).
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden) values
 ('panel.retablos','Operaciones','Ver Retablos','',false,16),
 ('retablos.ver_todos','Retablos','Ver los retablos de todas las asesoras','Sin este permiso solo se ven los propios',false,210),
 ('retablos.cambiar_estado','Retablos','Cambiar el estado de un retablo','Pendiente → Pendiente por recoger → Entregado',false,211),
 ('retablos.catalogo','Retablos','Crear y editar tipos de retablo','',true,212),
 ('retablos.valor_empresa','Retablos','Ver el valor empresa','',true,213)
on conflict (codigo) do nothing;
insert into public.roles(id,nombre,descripcion,sistema) values('bodega','Bodega / entregas','Entrega retablos: ve todos y cambia su estado',true) on conflict (id) do nothing;
insert into public.roles_permisos(rol_id,permiso) values
 ('asesora','panel.retablos'),('asesora_lider','panel.retablos'),
 ('bodega','panel.retablos'),('bodega','retablos.ver_todos'),('bodega','retablos.cambiar_estado')
on conflict do nothing;

create or replace function private.retablo_puede(p text) returns boolean language sql stable security definer set search_path='' as $$ select private.tiene_permiso(p); $$;
create or replace function private.retablo_ve(r public.retablos) returns boolean language sql stable security definer set search_path='' as $$
 select private.tiene_permiso('retablos.ver_todos') or (private.tiene_permiso('panel.retablos') and r.asesora_id=auth.uid());
$$;

create or replace function private.retablo_json(r public.retablos) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'contrato_id',r.contrato_id,'numero_contrato',(select numero_contrato from public.contratos where id=r.contrato_id),
  'tipo_id',r.tipo_id,'tipo',(select nombre from public.retablo_tipos where id=r.tipo_id),'cliente_nombre',r.cliente_nombre,'cliente_cedula',r.cliente_cedula,
  'numero_factura',r.numero_factura,'valor_cliente',r.valor_cliente,'valor_empresa',case when private.tiene_permiso('retablos.valor_empresa') then r.valor_empresa end,
  'estado',r.estado,'asesora_id',r.asesora_id,'asesora',coalesce(nullif(r.asesora_nombre,''),(select coalesce(nombre,email) from public.profiles where id=r.asesora_id)),
  'sede',(select nombre from public.sedes where id=r.sede_id),'observaciones',r.observaciones,'creado_en',r.creado_en,'entregado_en',r.entregado_en);
$$;

-- Catálogo
create or replace function private.retablo_tipos_lista(p_todos boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare admin boolean:=private.tiene_permiso('retablos.catalogo'); empresa boolean:=private.tiene_permiso('retablos.valor_empresa');
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'nombre',t.nombre,'ancho_cm',t.ancho_cm,'alto_cm',t.alto_cm,'valor',case when admin then t.valor end,
   'valor_cliente',t.valor_cliente,'valor_empresa',case when empresa then t.valor_empresa end,'activo',t.activo,
   'usos',(select count(*) from public.retablos r where r.tipo_id=t.id)) order by not t.activo,t.ancho_cm,t.alto_cm,t.nombre)
  from public.retablo_tipos t where t.activo or (p_todos and admin)),'[]'::jsonb);
end $$;

create or replace function private.guardar_retablo_tipo(p_datos jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=nullif(p_datos->>'id','')::uuid; nombre text:=btrim(coalesce(p_datos->>'nombre','')); old public.retablo_tipos;
 ancho numeric:=(p_datos->>'ancho_cm')::numeric; alto numeric:=(p_datos->>'alto_cm')::numeric; v numeric:=(p_datos->>'valor')::numeric;
 vc numeric:=(p_datos->>'valor_cliente')::numeric; ve numeric:=(p_datos->>'valor_empresa')::numeric; act boolean:=coalesce((p_datos->>'activo')::boolean,true);
begin
 if not private.tiene_permiso('retablos.catalogo') then raise exception 'Solo el administrador puede editar el catálogo de retablos.' using errcode='42501'; end if;
 if length(nombre) not between 2 and 80 then raise exception 'Escribe el nombre del tipo.'; end if;
 if coalesce(ancho,0)<=0 or coalesce(alto,0)<=0 or coalesce(v,0)<=0 or coalesce(vc,0)<=0 or coalesce(ve,0)<=0 then raise exception 'La medida y los valores deben ser mayores que cero.'; end if;
 if v_id is null then
  insert into public.retablo_tipos(nombre,ancho_cm,alto_cm,valor,valor_cliente,valor_empresa,activo,actualizado_por) values(nombre,ancho,alto,v,vc,ve,act,auth.uid()) returning id into v_id;
 else
  select * into old from public.retablo_tipos where id=v_id for update;
  if old.id is null then raise exception 'Tipo no encontrado.'; end if;
  update public.retablo_tipos set nombre=btrim(p_datos->>'nombre'),ancho_cm=ancho,alto_cm=alto,valor=v,valor_cliente=vc,valor_empresa=ve,activo=act,actualizado_por=auth.uid(),actualizado_en=now() where id=v_id;
 end if;
 return v_id;
end $$;

-- Lo único que conoce el contrato: crear, cambiar de tipo o quitar el retablo de un contrato (p_tipo null = sin retablo).
create or replace function private.guardar_retablo_contrato(p_contrato uuid, p_tipo uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contratos; t public.retablo_tipos; r public.retablos; prev text;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.contratos where id=p_contrato;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) and (lower(btrim(p.rol))='admin' or p.sede_id=c.sede_id or private.tiene_permiso('retablos.ver_todos'))) then
  raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 select * into r from public.retablos where contrato_id=p_contrato for update;
 if p_tipo is null then
  if r.id is null or r.estado='ANULADO' then return null; end if;
  if r.estado<>'PENDIENTE' then raise exception 'El retablo ya está % y no se puede quitar del contrato.', case r.estado when 'PENDIENTE_RECOGER' then 'listo para recoger' else lower(r.estado) end; end if;
  update public.retablos set estado='ANULADO' where id=r.id;
  insert into public.retablo_historial(retablo_id,estado_anterior,estado_nuevo,nota,usuario_id) values(r.id,r.estado,'ANULADO','Quitado del contrato',auth.uid());
  return null;
 end if;
 select * into t from public.retablo_tipos where id=p_tipo and activo;
 if t.id is null then raise exception 'Elige un tipo de retablo activo.'; end if;
 if r.id is null then
  insert into public.retablos(contrato_id,tipo_id,cliente_nombre,cliente_cedula,numero_factura,valor_cliente,valor_empresa,asesora_id,asesora_nombre,sede_id,creado_por)
  values(c.id,t.id,coalesce(c.cliente_nombre,''),coalesce(c.cliente_documento,''),nullif(c.numero_factura,''),t.valor_cliente,t.valor_empresa,auth.uid(),coalesce(nullif(btrim(c.asesora),''),(select coalesce(nombre,email) from public.profiles where id=auth.uid()),''),c.sede_id,auth.uid())
  returning * into r;
  insert into public.retablo_historial(retablo_id,estado_anterior,estado_nuevo,usuario_id) values(r.id,null,'PENDIENTE',auth.uid());
 elsif r.estado='ANULADO' or r.tipo_id<>t.id then
  if r.estado in ('PENDIENTE_RECOGER','ENTREGADO') then raise exception 'El retablo ya está en producción o entregado: no se puede cambiar el tipo.'; end if;
  prev:=r.estado;
  update public.retablos set tipo_id=t.id,valor_cliente=t.valor_cliente,valor_empresa=t.valor_empresa,estado='PENDIENTE',
   cliente_nombre=coalesce(c.cliente_nombre,''),cliente_cedula=coalesce(c.cliente_documento,''),numero_factura=nullif(c.numero_factura,'') where id=r.id returning * into r;
  insert into public.retablo_historial(retablo_id,estado_anterior,estado_nuevo,nota,usuario_id) values(r.id,prev,'PENDIENTE','Tipo: '||t.nombre,auth.uid());
 end if;
 return private.retablo_json(r);
end $$;

create or replace function private.retablo_de_contrato(p_contrato uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.retablos;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into r from public.retablos where contrato_id=p_contrato and estado<>'ANULADO';
 if r.id is null then return null; end if;
 return private.retablo_json(r);
end $$;

-- Transiciones permitidas: PENDIENTE → PENDIENTE_RECOGER; PENDIENTE_RECOGER → ENTREGADO | PENDIENTE. ENTREGADO es final.
create or replace function private.cambiar_estado_retablo(p_id uuid, p_estado text, p_nota text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.retablos;
begin
 if not private.tiene_permiso('retablos.cambiar_estado') then raise exception 'No tienes permiso para cambiar el estado de los retablos.' using errcode='42501'; end if;
 select * into r from public.retablos where id=p_id for update;
 if r.id is null or not private.retablo_ve(r) then raise exception 'Retablo no encontrado.'; end if;
 if not ((r.estado='PENDIENTE' and p_estado='PENDIENTE_RECOGER') or (r.estado='PENDIENTE_RECOGER' and p_estado in ('ENTREGADO','PENDIENTE'))) then
  raise exception 'No se puede pasar de % a %.', r.estado, p_estado; end if;
 if r.estado='PENDIENTE_RECOGER' and p_estado='PENDIENTE' and length(btrim(coalesce(p_nota,'')))<3 then raise exception 'Escribe qué hay que corregir.'; end if;
 update public.retablos set estado=p_estado,entregado_en=case when p_estado='ENTREGADO' then now() else entregado_en end where id=p_id;
 insert into public.retablo_historial(retablo_id,estado_anterior,estado_nuevo,nota,usuario_id) values(p_id,r.estado,p_estado,btrim(coalesce(p_nota,'')),auth.uid());
end $$;

create or replace function private.retablos_panel()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not (private.tiene_permiso('panel.retablos') or private.tiene_permiso('retablos.ver_todos')) then raise exception 'No tienes acceso a Retablos.' using errcode='42501'; end if;
 return jsonb_build_object(
  'puede_cambiar',private.tiene_permiso('retablos.cambiar_estado'),'ve_todos',private.tiene_permiso('retablos.ver_todos'),
  've_empresa',private.tiene_permiso('retablos.valor_empresa'),'catalogo',private.tiene_permiso('retablos.catalogo'),
  'retablos',coalesce((select jsonb_agg(private.retablo_json(r) order by case r.estado when 'PENDIENTE' then 0 when 'PENDIENTE_RECOGER' then 1 when 'ENTREGADO' then 2 else 3 end, r.creado_en desc)
   from public.retablos r where private.retablo_ve(r)),'[]'::jsonb));
end $$;

create or replace function private.retablo_historial_lista(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.retablos;
begin
 select * into r from public.retablos where id=p_id;
 if r.id is null or not private.retablo_ve(r) then raise exception 'Retablo no encontrado.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('fecha',h.fecha,'estado_anterior',h.estado_anterior,'estado_nuevo',h.estado_nuevo,'nota',h.nota,'usuario',(select coalesce(nombre,email) from public.profiles where id=h.usuario_id)) order by h.fecha)
  from public.retablo_historial h where h.retablo_id=p_id),'[]'::jsonb);
end $$;

-- Contrato anulado → retablo anulado (si aún no se entregó).
create or replace function private.retablo_contrato_anulado()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if lower(coalesce(new.estado,'')) in ('anulado','cancelado','rechazado') and lower(coalesce(old.estado,'')) not in ('anulado','cancelado','rechazado') then
  insert into public.retablo_historial(retablo_id,estado_anterior,estado_nuevo,nota,usuario_id)
  select r.id,r.estado,'ANULADO','Contrato '||lower(new.estado),auth.uid() from public.retablos r where r.contrato_id=new.id and r.estado in ('PENDIENTE','PENDIENTE_RECOGER');
  update public.retablos set estado='ANULADO' where contrato_id=new.id and estado in ('PENDIENTE','PENDIENTE_RECOGER');
 end if;
 return new;
end $$;
create or replace trigger retablo_contrato_anulado after update of estado on public.contratos for each row execute function private.retablo_contrato_anulado();

create or replace function public.retablo_tipos_lista(p_todos boolean default false) returns jsonb language sql stable set search_path='' as $$ select private.retablo_tipos_lista(p_todos); $$;
create or replace function public.guardar_retablo_tipo(p_datos jsonb) returns uuid language sql set search_path='' as $$ select private.guardar_retablo_tipo(p_datos); $$;
create or replace function public.guardar_retablo_contrato(p_contrato uuid, p_tipo uuid) returns jsonb language sql set search_path='' as $$ select private.guardar_retablo_contrato(p_contrato,p_tipo); $$;
create or replace function public.retablo_de_contrato(p_contrato uuid) returns jsonb language sql stable set search_path='' as $$ select private.retablo_de_contrato(p_contrato); $$;
create or replace function public.cambiar_estado_retablo(p_id uuid, p_estado text, p_nota text) returns void language sql set search_path='' as $$ select private.cambiar_estado_retablo(p_id,p_estado,p_nota); $$;
create or replace function public.retablos_panel() returns jsonb language sql stable set search_path='' as $$ select private.retablos_panel(); $$;
create or replace function public.retablo_historial_lista(p_id uuid) returns jsonb language sql stable set search_path='' as $$ select private.retablo_historial_lista(p_id); $$;

revoke all on function private.retablo_puede(text), private.retablo_ve(public.retablos), private.retablo_json(public.retablos), private.retablo_tipos_lista(boolean), private.guardar_retablo_tipo(jsonb),
 private.guardar_retablo_contrato(uuid,uuid), private.retablo_de_contrato(uuid), private.cambiar_estado_retablo(uuid,text,text), private.retablos_panel(), private.retablo_historial_lista(uuid), private.retablo_contrato_anulado() from public, anon;
revoke all on function public.retablo_tipos_lista(boolean), public.guardar_retablo_tipo(jsonb), public.guardar_retablo_contrato(uuid,uuid), public.retablo_de_contrato(uuid), public.cambiar_estado_retablo(uuid,text,text), public.retablos_panel(), public.retablo_historial_lista(uuid) from public, anon;
grant execute on function private.retablo_tipos_lista(boolean), private.guardar_retablo_tipo(jsonb), private.guardar_retablo_contrato(uuid,uuid), private.retablo_de_contrato(uuid), private.cambiar_estado_retablo(uuid,text,text), private.retablos_panel(), private.retablo_historial_lista(uuid), private.retablo_ve(public.retablos), private.retablo_json(public.retablos) to authenticated;
grant execute on function public.retablo_tipos_lista(boolean), public.guardar_retablo_tipo(jsonb), public.guardar_retablo_contrato(uuid,uuid), public.retablo_de_contrato(uuid), public.cambiar_estado_retablo(uuid,text,text), public.retablos_panel(), public.retablo_historial_lista(uuid) to authenticated;
