-- Fase B1 equipo y permisos (aditiva). Revert: drop the new functions, triggers and tables (usuario_sedes, equipo_bitacora),
-- drop columns asesoras.aparece_como_vendedora, profiles.rol_id, profiles.estado_ficha, roles.ve_todas_sedes, pagos.anulado_*,
-- and re-apply the previous bodies of permisos_usuario, corregir_valores_iniciales_contrato, editar_monto_deposito, cambiar_comprobante_deposito.

-- 1. Ficha de asesora para toda persona
alter table public.asesoras add column if not exists aparece_como_vendedora boolean not null default true;
with d as (
 select a.id,row_number() over(partition by a.profile_id order by (lower(btrim(a.nombre_completo))=lower(btrim(coalesce(p.nombre,'')))) desc, coalesce(a.activo,false) desc, a.created_at) rn
 from public.asesoras a join public.profiles p on p.id=a.profile_id)
update public.asesoras a set profile_id=null from d where d.id=a.id and d.rn>1;
create unique index if not exists asesoras_profile_id_key on public.asesoras(profile_id) where profile_id is not null;
-- Unlinked fichas with the same name as a user without ficha are linked to it.
update public.asesoras a set profile_id=m.pid from (
 select distinct on (p.id) p.id pid,a2.id aid from public.profiles p join public.asesoras a2 on a2.profile_id is null and lower(btrim(a2.nombre_completo))=lower(btrim(p.nombre))
 where not exists(select 1 from public.asesoras x where x.profile_id=p.id) order by p.id,a2.created_at) m
where a.id=m.aid and not exists(select 1 from public.asesoras y where y.profile_id=m.pid);
insert into public.asesoras(nombre,nombre_completo,sede_id,profile_id,activo,aparece_como_vendedora)
select coalesce(p.nombre,p.email),case when exists(select 1 from public.asesoras x where lower(x.nombre_completo)=lower(coalesce(p.nombre,p.email))) then coalesce(p.nombre,'')||' · '||coalesce(p.email,p.id::text) else coalesce(p.nombre,p.email,p.id::text) end,
 (select x.id from public.sedes x where x.id=p.sede_id),p.id,coalesce(p.activo,true),false
from public.profiles p where lower(coalesce(p.rol,''))<>'proveedor' and not exists(select 1 from public.asesoras a where a.profile_id=p.id);

-- 2. Rol único, varias sedes, roles que ven todas las sedes
alter table public.profiles add column if not exists rol_id text references public.roles(id);
alter table public.roles add column if not exists ve_todas_sedes boolean not null default false;
update public.roles set ve_todas_sedes=true where id in ('admin','contabilidad');
alter table public.profiles disable trigger validar_profile_sede;
update public.profiles p set rol_id=case
 when lower(p.rol)='admin' then 'admin' when lower(p.rol)='contabilidad' then 'contabilidad'
 when exists(select 1 from public.usuarios_roles u where u.usuario_id=p.id and u.activo and u.rol_id='franquiciado') then 'franquiciado'
 when exists(select 1 from public.usuarios_roles u where u.usuario_id=p.id and u.activo and u.rol_id='asesora_lider') then 'asesora_lider'
 when lower(p.rol)='asesora' then 'asesora' end
where p.rol_id is null;
alter table public.profiles enable trigger validar_profile_sede;
create table if not exists public.usuario_sedes(
 usuario_id uuid not null references public.profiles(id),sede_id uuid not null references public.sedes(id),
 activo boolean not null default true,created_at timestamptz not null default now(),primary key(usuario_id,sede_id));
alter table public.usuario_sedes enable row level security;
revoke all on public.usuario_sedes from anon;
revoke insert,update,delete on public.usuario_sedes from authenticated;
create policy usuario_sedes_ver on public.usuario_sedes for select to authenticated using (usuario_id=(select auth.uid()) or public.es_admin());
insert into public.usuario_sedes(usuario_id,sede_id) select p.id,p.sede_id from public.profiles p join public.sedes s on s.id=p.sede_id on conflict do nothing;
insert into public.usuario_sedes(usuario_id,sede_id) select a.usuario_id,a.sede_id from private.accesos_operativos_sede a on conflict do nothing;

-- 3. Estado de la ficha: existentes pendientes, nuevas confirmadas
alter table public.profiles add column if not exists estado_ficha text not null default 'pendiente';
alter table public.profiles alter column estado_ficha set default 'confirmada';
do $$ begin if not exists(select 1 from pg_constraint where conname='profiles_estado_ficha_check') then
 alter table public.profiles add constraint profiles_estado_ficha_check check (estado_ficha in ('pendiente','confirmada')); end if; end $$;

create table if not exists public.equipo_bitacora(id bigserial primary key,usuario_id uuid,tipo text not null,detalle jsonb not null default '{}',hecho_por uuid default auth.uid(),fecha timestamptz not null default now());
alter table public.equipo_bitacora enable row level security;
revoke all on public.equipo_bitacora from anon;
revoke insert,update,delete on public.equipo_bitacora from authenticated;
create policy equipo_bitacora_admin on public.equipo_bitacora for select to authenticated using (public.es_admin());

-- Only administration changes rol_id / estado_ficha.
create or replace function private.profiles_proteger_ficha() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') and not public.es_admin() then
  if tg_op='INSERT' then new.rol_id:=null; new.estado_ficha:='pendiente';
  elsif new.rol_id is distinct from old.rol_id or new.estado_ficha is distinct from old.estado_ficha then
   raise exception 'Solo administración cambia el rol o el estado de la ficha.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
create trigger profiles_proteger_ficha before insert or update on public.profiles for each row execute function private.profiles_proteger_ficha();

-- Helpers: roles and sedes of a person (confirmada: rol_id + usuario_sedes; pendiente: as today).
create or replace function private.roles_usuario(p_usuario uuid) returns text[] language sql stable security definer set search_path='' as $$
 select case when p.estado_ficha='confirmada' then array_remove(array[p.rol_id],null)
  else array(select lower(btrim(p.rol)) union select u.rol_id from public.usuarios_roles u where u.usuario_id=p.id and u.activo) end
 from public.profiles p where p.id=p_usuario and coalesce(p.activo,true)
$$;
create or replace function private.sedes_usuario(p_usuario uuid) returns uuid[] language sql stable security definer set search_path='' as $$
 select case
  when exists(select 1 from public.roles r where r.ve_todas_sedes and r.id=any(private.roles_usuario(p.id))) then array(select id from public.sedes)
  when p.estado_ficha='confirmada' then array(select us.sede_id from public.usuario_sedes us where us.usuario_id=p.id and us.activo)
  else array(select p.sede_id where p.sede_id is not null union select a.sede_id from private.accesos_operativos_sede a where a.usuario_id=p.id) end
 from public.profiles p where p.id=p_usuario
$$;

-- Permissions: confirmada = only its role.
create or replace function private.permisos_usuario(p_usuario uuid) returns text[] language sql stable security definer set search_path='' as $$
 select case
 when exists(select 1 from public.profiles p where p.id=p_usuario and coalesce(p.activo,true) and p.estado_ficha='confirmada') then
  case when (select rol_id from public.profiles where id=p_usuario)='admin' then (select coalesce(array_agg(codigo order by codigo),'{}') from public.permisos)
  else (select coalesce(array_agg(distinct rp.permiso order by rp.permiso),'{}') from public.roles_permisos rp
   where rp.activo and rp.rol_id=(select rol_id from public.profiles where id=p_usuario)
    and not exists(select 1 from public.permisos x where x.codigo=rp.permiso and x.solo_admin)) end
 when exists(select 1 from public.profiles p where p.id=p_usuario and coalesce(p.activo,true) and lower(btrim(p.rol))='admin') or exists(select 1 from public.usuarios_roles u where u.usuario_id=p_usuario and u.rol_id='admin' and u.activo)
  then (select coalesce(array_agg(codigo order by codigo),'{}') from public.permisos)
 else (select coalesce(array_agg(distinct rp.permiso order by rp.permiso),'{}') from public.roles_permisos rp
   where rp.activo and rp.rol_id in (select lower(btrim(p.rol)) from public.profiles p where p.id=p_usuario and coalesce(p.activo,true) union select u.rol_id from public.usuarios_roles u where u.usuario_id=p_usuario and u.activo)
    and not exists(select 1 from public.permisos x where x.codigo=rp.permiso and x.solo_admin)) end;
$$;

create or replace function public.permisos_de(p_usuario uuid) returns text[] language plpgsql stable security definer set search_path='' as $$
begin if not public.es_admin() then raise exception 'Solo administración.' using errcode='42501'; end if; return private.permisos_usuario(p_usuario); end $$;

-- Save a person (datos, rol, sedes, activo, vendedora) and optionally confirm.
create or replace function public.guardar_persona(p_usuario uuid,p_datos jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; r public.roles; f uuid; sedes uuid[]; antes jsonb; confirmar boolean:=p_datos->>'estado'='confirmada'; n int;
begin
 if not public.es_admin() then raise exception 'Solo administración.' using errcode='42501'; end if;
 select * into p from public.profiles where id=p_usuario for update;
 if p.id is null then raise exception 'Persona no encontrada.'; end if;
 antes:=jsonb_build_object('nombre',p.nombre,'rol_id',p.rol_id,'activo',p.activo,'estado',p.estado_ficha,'sedes',(select jsonb_agg(sede_id) from public.usuario_sedes where usuario_id=p.id and activo));
 select id into f from public.asesoras where profile_id=p.id;
 if f is null then
  insert into public.asesoras(nombre,nombre_completo,sede_id,profile_id,activo,aparece_como_vendedora)
  values(coalesce(p.nombre,p.email),case when exists(select 1 from public.asesoras x where lower(x.nombre_completo)=lower(coalesce(p.nombre,p.email))) then coalesce(p.nombre,'')||' · '||coalesce(p.email,p.id::text) else coalesce(p.nombre,p.email,p.id::text) end,(select x.id from public.sedes x where x.id=p.sede_id),p.id,coalesce(p.activo,true),false) returning id into f;
 end if;
 if p_datos ? 'nombre' and length(btrim(p_datos->>'nombre'))>=3 then
  update public.profiles set nombre=btrim(p_datos->>'nombre') where id=p.id;
  update public.asesoras set nombre=btrim(p_datos->>'nombre'),nombre_completo=btrim(p_datos->>'nombre') where id=f;
 end if;
 if p_datos ? 'activo' then
  update public.profiles set activo=(p_datos->>'activo')::boolean where id=p.id;
  update public.asesoras set activo=(p_datos->>'activo')::boolean where id=f;
 end if;
 if p_datos ? 'vendedora' then update public.asesoras set aparece_como_vendedora=(p_datos->>'vendedora')::boolean where id=f; end if;
 if p_datos ? 'rol_id' then
  select * into r from public.roles where id=p_datos->>'rol_id';
  if r.id is null then raise exception 'Rol no válido.'; end if;
  update public.profiles set rol_id=r.id where id=p.id;
 end if;
 if p_datos ? 'sedes' then
  sedes:=array(select (jsonb_array_elements_text(p_datos->'sedes'))::uuid);
  insert into public.usuario_sedes(usuario_id,sede_id,activo) select p.id,s,true from unnest(sedes) s on conflict(usuario_id,sede_id) do update set activo=true;
  update public.usuario_sedes set activo=false where usuario_id=p.id and not (sede_id=any(sedes));
  update public.asesoras set sede_id=coalesce(sedes[1],sede_id) where id=f;
 end if;
 if confirmar then
  if (select rol_id from public.profiles where id=p.id) is null then raise exception 'Elige el rol antes de confirmar.'; end if;
  update public.profiles set estado_ficha='confirmada' where id=p.id;
  insert into public.accesos_paneles_bitacora(usuario_id,panel,estado_anterior,estado_nuevo,cambiado_por)
   select a.usuario_id,a.panel,a.estado,'defecto',auth.uid() from public.accesos_paneles a where a.usuario_id=p.id and a.estado<>'defecto';
  update public.accesos_paneles set estado='defecto',actualizado_por=auth.uid(),actualizado_at=now() where usuario_id=p.id and estado<>'defecto';
  update public.usuarios_roles set activo=false where usuario_id=p.id and rol_id is distinct from (select rol_id from public.profiles where id=p.id);
 end if;
 -- Confirmed people: legacy fields follow the role and the first sede.
 select * into p from public.profiles where id=p.id;
 if p.estado_ficha='confirmada' then
  select * into r from public.roles where id=p.rol_id;
  update public.profiles set rol=case when r.id in ('admin','contabilidad') then r.id else 'asesora' end,
   sede_id=case when r.ve_todas_sedes then null else (select us.sede_id from public.usuario_sedes us where us.usuario_id=p.id and us.activo order by us.created_at limit 1) end
  where id=p.id and lower(coalesce(rol,''))<>'proveedor';
 end if;
 insert into public.equipo_bitacora(usuario_id,tipo,detalle) values(p.id,case when confirmar then 'confirmacion' else 'ficha' end,
  jsonb_build_object('antes',antes,'despues',jsonb_build_object('nombre',(select nombre from public.profiles where id=p.id),'rol_id',(select rol_id from public.profiles where id=p.id),'activo',(select activo from public.profiles where id=p.id),'estado',(select estado_ficha from public.profiles where id=p.id),'sedes',(select jsonb_agg(sede_id) from public.usuario_sedes where usuario_id=p.id and activo))));
 return jsonb_build_object('ok',true);
end $$;

-- Link a ficha to a user (unique): the user's previous ficha is released.
create or replace function public.unir_ficha(p_ficha uuid,p_usuario uuid) returns void language plpgsql security definer set search_path='' as $$
declare prev uuid;
begin
 if not public.es_admin() then raise exception 'Solo administración.' using errcode='42501'; end if;
 select id into prev from public.asesoras where profile_id=p_usuario and id<>p_ficha;
 if prev is not null then update public.asesoras set profile_id=null,activo=case when aparece_como_vendedora then activo else false end where id=prev; end if;
 update public.asesoras set profile_id=null where id=p_ficha and profile_id is not null and profile_id<>p_usuario;
 update public.asesoras set profile_id=p_usuario where id=p_ficha;
 insert into public.equipo_bitacora(usuario_id,tipo,detalle) values(p_usuario,'ficha',jsonb_build_object('unir_ficha',p_ficha,'ficha_anterior',prev));
end $$;

-- "Pasar a todo el rol": add or remove one permission on a role.
create or replace function public.pasar_permiso_a_rol(p_rol text,p_permiso text,p_agregar boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración.' using errcode='42501'; end if;
 if p_rol='admin' then raise exception 'El Administrador ya tiene todos los permisos.'; end if;
 if not exists(select 1 from public.permisos where codigo=p_permiso) then raise exception 'Permiso desconocido.'; end if;
 insert into public.roles_permisos(rol_id,permiso,activo) values(p_rol,p_permiso,p_agregar) on conflict(rol_id,permiso) do update set activo=p_agregar;
 insert into public.roles_bitacora(tipo,objetivo,detalle,usuario) values('permisos_rol',p_rol,jsonb_build_object(case when p_agregar then 'agregados' else 'quitados' end,jsonb_build_array(p_permiso)),auth.uid());
end $$;

create or replace function public.guardar_rol_sedes(p_rol text,p_ve boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración.' using errcode='42501'; end if;
 if p_rol='admin' then raise exception 'El Administrador siempre ve todas las sedes.'; end if;
 update public.roles set ve_todas_sedes=p_ve where id=p_rol;
 insert into public.roles_bitacora(tipo,objetivo,detalle,usuario) values('sedes_rol',p_rol,jsonb_build_object('ve_todas_sedes',p_ve),auth.uid());
end $$;

-- 8. Correcciones de pagos y depósitos
alter table public.pagos add column if not exists anulado_at timestamptz, add column if not exists anulado_por uuid, add column if not exists motivo_anulacion text;
insert into public.roles_permisos(rol_id,permiso,activo) select r,'contratos.corregir_valores_iniciales',true from unnest(array['franquiciado','contabilidad']) r on conflict(rol_id,permiso) do update set activo=true;

create or replace function private.puede_corregir(p_sede uuid,p_fecha date) returns void language plpgsql stable security definer set search_path='' as $$
declare roles text[]:=coalesce(private.roles_usuario(auth.uid()),'{}');
begin
 if public.es_admin() or 'contabilidad'=any(roles) then return; end if;
 if p_sede is not null and p_fecha is not null and private.caja_dia_cerrado(p_sede,p_fecha) then
  raise exception 'Este día ya tiene cierre de caja. Solicita la corrección a Contabilidad.' using errcode='42501';
 end if;
 if not (roles && array['asesora_lider','franquiciado']) then raise exception 'No tienes permiso para corregir pagos.' using errcode='42501'; end if;
 if p_sede is null or not (p_sede=any(coalesce(private.sedes_usuario(auth.uid()),'{}'))) then raise exception 'El contrato no es de tu sede.' using errcode='42501'; end if;
end $$;

create or replace function private.fecha_deposito_contrato(p_contrato uuid) returns date language sql stable security definer set search_path='' as $$
 select coalesce((select m.fecha from public.caja_movimientos m where m.contrato_id=p_contrato and m.origen='deposito' and m.anulado_at is null order by m.fecha limit 1),
  (select (created_at at time zone 'America/Bogota')::date from public.contratos where id=p_contrato))
$$;

create or replace function private.corregir_valores_iniciales_contrato(p_contrato uuid, p_anticipo numeric, p_deposito numeric, p_motivo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c record; pg record; cm record; m text:=btrim(coalesce(p_motivo,'')); cambios int:=0;
begin
 if length(m)<10 then raise exception 'El motivo es obligatorio (mínimo 10 caracteres).'; end if;
 select id,anticipo,valor_deposito,estado,sede_id,created_at into c from public.contratos where id=p_contrato for update;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if p_anticipo is not null and p_anticipo is distinct from coalesce(c.anticipo,0) then
  if p_anticipo<=0 or p_anticipo<>round(p_anticipo,2) then raise exception 'Revisa el valor del abono inicial.'; end if;
  select id,valor_pagado,fecha_pago into pg from public.pagos where contrato_id=p_contrato and anulado_at is null
   order by (observaciones ilike 'Abono inicial%') desc, created_at limit 1 for update;
  if pg.id is null then raise exception 'El contrato no tiene un pago inicial registrado para corregir.'; end if;
  select id,sede_id,fecha into cm from public.caja_movimientos where origen='pago' and origen_id=pg.id and anulado_at is null limit 1 for update;
  perform private.puede_corregir(coalesce(cm.sede_id,c.sede_id),coalesce(cm.fecha,(pg.fecha_pago at time zone 'America/Bogota')::date));
  update public.pagos set valor_pagado=p_anticipo, updated_at=now() where id=pg.id;
  if cm.id is not null then update public.caja_movimientos set valor=p_anticipo where id=cm.id; end if;
  update public.contratos set anticipo=p_anticipo where id=p_contrato;
  insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo,valor_anterior,valor_nuevo)
   values(p_contrato,auth.uid(),m,'Abono inicial',coalesce(c.anticipo,0),p_anticipo);
  cambios:=cambios+1;
 end if;
 if p_deposito is not null and p_deposito is distinct from coalesce(c.valor_deposito,0) then
  if p_deposito<0 or p_deposito>=1000000000000 or p_deposito<>round(p_deposito,2) then raise exception 'Revisa el valor del depósito.'; end if;
  perform private.puede_corregir(c.sede_id,private.fecha_deposito_contrato(p_contrato));
  update public.contratos set valor_deposito=p_deposito where id=p_contrato;
  insert into public.auditoria_montos_deposito(contrato_id,monto_anterior,monto_nuevo,motivo,usuario_id) values(p_contrato,coalesce(c.valor_deposito,0),p_deposito,m,auth.uid());
  insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo,valor_anterior,valor_nuevo)
   values(p_contrato,auth.uid(),m,'Valor del depósito de garantía',coalesce(c.valor_deposito,0),p_deposito);
  cambios:=cambios+1;
 end if;
 return jsonb_build_object('ok',true,'cambios',cambios,'saldo',(select saldo from public.contratos where id=p_contrato));
end $$;

create or replace function private.editar_monto_deposito(p_contrato uuid,p_monto numeric,p_motivo text) returns numeric language plpgsql security definer set search_path='' as $$
declare anterior numeric; sede uuid;
begin
 if p_monto is null or p_monto<0 or p_monto>=1000000000000 or p_monto<>round(p_monto,2) then raise exception 'Monto inválido.'; end if;
 if nullif(btrim(p_motivo),'') is null or length(btrim(p_motivo))<5 then raise exception 'El motivo es obligatorio (mínimo 5 caracteres).'; end if;
 select valor_deposito,sede_id into anterior,sede from public.contratos where id=p_contrato for update;
 if not found then raise exception 'Contrato no encontrado.'; end if;
 if not public.es_admin() and not private.tiene_permiso('depositos.modificar_valor') then perform private.puede_corregir(sede,private.fecha_deposito_contrato(p_contrato)); end if;
 if not public.es_admin() and private.tiene_permiso('depositos.modificar_valor') and not private.acceso_deposito(p_contrato) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 update public.contratos set valor_deposito=p_monto where id=p_contrato;
 insert into public.auditoria_montos_deposito(contrato_id,monto_anterior,monto_nuevo,motivo,usuario_id) values(p_contrato,coalesce(anterior,0),p_monto,btrim(p_motivo),(select auth.uid()));
 insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo,valor_anterior,valor_nuevo) values(p_contrato,auth.uid(),btrim(p_motivo),'Valor del depósito de garantía',coalesce(anterior,0),p_monto);
 return p_monto;
end $$;

do $$ declare d text:=pg_get_functiondef('private.cambiar_comprobante_deposito(text,uuid,text,text)'::regprocedure); begin
 d:=replace(d,' if nuevo is not null and lower(btrim(u.rol)) not in (''admin'',''contabilidad'') and not private.tiene_permiso(''depositos.eliminar_comprobante'') then raise exception ''No tienes permiso para reemplazar comprobantes.'' using errcode=''42501''; end if;','');
 d:=replace(d,' if not private.acceso_deposito(cid)',' if not public.es_admin() and not private.tiene_permiso(''depositos.eliminar_comprobante'') and lower(btrim(u.rol))<>''contabilidad'' then perform private.puede_corregir((select sede_id from public.contratos where id=cid),private.fecha_deposito_contrato(cid)); end if;
 if not private.acceso_deposito(cid)');
 d:=replace(d,' values(cid,case when nuevo is null then',' values(cid,case when nuevo is null then');
 d:=replace(d,'''usuario_id'',u.id)::text,coalesce(u.nombre,u.email));','''usuario_id'',u.id)::text,coalesce(u.nombre,u.email));
 insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo) values(cid,u.id,reason,''Comprobante de depósito'');');
 if d not like '%puede_corregir%' or d not like '%Comprobante de depósito''%' then raise exception 'patch comprobante failed'; end if;
 execute d;
end $$;

create or replace function public.anular_pago_contrato(p_pago uuid,p_motivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare pg public.pagos; c record; cm record; m text:=btrim(coalesce(p_motivo,''));
begin
 if length(m)<10 then raise exception 'El motivo es obligatorio (mínimo 10 caracteres).'; end if;
 select * into pg from public.pagos where id=p_pago for update;
 if pg.id is null then raise exception 'Pago no encontrado.'; end if;
 if pg.anulado_at is not null then raise exception 'El pago ya está anulado.'; end if;
 select id,sede_id,anticipo into c from public.contratos where id=pg.contrato_id for update;
 select id,sede_id,fecha into cm from public.caja_movimientos where origen='pago' and origen_id=pg.id and anulado_at is null limit 1 for update;
 perform private.puede_corregir(coalesce(cm.sede_id,c.sede_id),coalesce(cm.fecha,(pg.fecha_pago at time zone 'America/Bogota')::date));
 update public.pagos set anulado_at=now(),anulado_por=auth.uid(),motivo_anulacion=m,updated_at=now() where id=pg.id;
 if cm.id is not null then update public.caja_movimientos set anulado_at=now(),anulado_por=auth.uid(),motivo_anulacion=m where id=cm.id; end if;
 update public.contratos set anticipo=coalesce(anticipo,0)-pg.valor_pagado where id=c.id;
 insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo,valor_anterior,valor_nuevo) values(c.id,auth.uid(),m,'Pago anulado',pg.valor_pagado,0);
 return jsonb_build_object('ok',true,'saldo',(select saldo from public.contratos where id=c.id));
end $$;

revoke all on function public.permisos_de(uuid),public.guardar_persona(uuid,jsonb),public.unir_ficha(uuid,uuid),public.pasar_permiso_a_rol(text,text,boolean),public.guardar_rol_sedes(text,boolean),public.anular_pago_contrato(uuid,text) from public,anon;
grant execute on function public.permisos_de(uuid),public.guardar_persona(uuid,jsonb),public.unir_ficha(uuid,uuid),public.pasar_permiso_a_rol(text,text,boolean),public.guardar_rol_sedes(text,boolean),public.anular_pago_contrato(uuid,text) to authenticated;
revoke all on function private.roles_usuario(uuid),private.sedes_usuario(uuid),private.puede_corregir(uuid,date),private.fecha_deposito_contrato(uuid) from public,anon;
grant execute on function private.roles_usuario(uuid),private.sedes_usuario(uuid),private.puede_corregir(uuid,date),private.fecha_deposito_contrato(uuid) to authenticated;

-- Fix: guardar_persona keeps only ids that exist in sedes (a profile could hold a removed sede id).
do $$ declare d text:=pg_get_functiondef('public.guardar_persona(uuid,jsonb)'::regprocedure); begin
 d:=replace(d,'sedes:=array(select (jsonb_array_elements_text(p_datos->''sedes''))::uuid);',
  'sedes:=array(select s.id from public.sedes s where s.id::text in (select jsonb_array_elements_text(p_datos->''sedes'')));');
 execute d;
end $$;
