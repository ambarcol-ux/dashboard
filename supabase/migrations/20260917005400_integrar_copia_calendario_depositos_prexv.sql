-- Source: ambarcol-ux/ambar-erp-copia @ a389f5f; destination: dashboard @ 3583fdf.
-- No clone/seed migrations, no updates of historical contracts.
-- Dependencies used by ERP COPIA, scoped to the requested integration.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create function private.current_profile_role() returns text language sql stable security definer set search_path='' as $$
 select lower(coalesce(p.rol,'')) from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) limit 1;
$$;
create function private.current_profile_sede_id() returns uuid language sql stable security definer set search_path='' as $$
 select p.sede_id from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) limit 1;
$$;
revoke all on function private.current_profile_role(),private.current_profile_sede_id() from public,anon;
grant execute on function private.current_profile_role(),private.current_profile_sede_id() to authenticated;
-- Avoid the old self-referencing admin policy when checking Accounting restrictions.
alter policy "Admins pueden editar cualquier perfil" on public.profiles
 using ((select private.current_profile_role())='admin') with check ((select private.current_profile_role())='admin');

-- Source migration: 20260913231732_depositos_contratos_movimientos.sql
-- ERP copia: deposit amounts remain cumulative in contratos.valor_deposito.
-- Available guarantee = cumulative amount - completed returns - applied deductions.
create table public.movimientos_depositos (
 id uuid primary key,
 contrato_id uuid not null references public.contratos(id) on delete restrict,
 tipo text not null check(tipo in ('ingreso','devolucion')),
 monto numeric(14,2) not null check(monto>=0),
 descuento numeric(14,2) not null default 0 check(descuento>=0),
 fecha date not null,
 metodo text not null,
 motivo text,
 observaciones text,
 comprobante_path text,
 fecha_pago_deposito date,
 usuario_id uuid not null references auth.users(id),
 devolucion_id uuid unique references public.devoluciones_depositos(id) on delete restrict,
 created_at timestamptz not null default now(),
 check(monto+descuento>0),
 check(tipo='devolucion' or descuento=0)
);
create index movimientos_depositos_contrato_idx on public.movimientos_depositos(contrato_id,created_at);
create index if not exists devoluciones_depositos_contrato_idx on public.devoluciones_depositos(contrato_id);
alter table public.movimientos_depositos enable row level security;
revoke all on public.movimientos_depositos from anon,authenticated;
grant select,insert on public.movimientos_depositos to authenticated;
create policy movimientos_depositos_leer on public.movimientos_depositos for select to authenticated using (
 exists(select 1 from public.contratos c join public.profiles p on p.id=auth.uid() where c.id=contrato_id and coalesce(p.activo,true) and (p.rol='admin' or p.sede_id=c.sede_id))
);
create policy movimientos_depositos_insertar on public.movimientos_depositos for insert to authenticated with check (
 usuario_id=auth.uid() and exists(select 1 from public.contratos c join public.profiles p on p.id=auth.uid() where c.id=contrato_id and coalesce(p.activo,true) and (p.rol='admin' or p.sede_id=c.sede_id))
);
alter table public.devoluciones_depositos add column if not exists comprobante_path text;

-- Enforce available balance even for an older client still using the legacy return table.
create function public.validar_devolucion_deposito() returns trigger language plpgsql security invoker set search_path='' as $$
declare c public.contratos%rowtype; usado numeric;
begin
 if auth.uid() is null then raise exception 'Inicia sesión para registrar devoluciones.'; end if;
 if tg_op='UPDATE' and new.contrato_id is distinct from old.contrato_id then raise exception 'No se puede mover una devolución a otro contrato.'; end if;
 select * into c from public.contratos where id=new.contrato_id for update;
 if not found then raise exception 'Contrato no encontrado.'; end if;
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) and (p.rol='admin' or p.sede_id=c.sede_id)) then raise exception 'No tienes acceso a este contrato.'; end if;
 if new.monto_devuelto is null or new.monto_devuelto<0 or coalesce(new.monto_descuento,0)<0 or new.monto_devuelto+coalesce(new.monto_descuento,0)<=0 then raise exception 'La devolución o descuento debe ser mayor que cero.'; end if;
 if coalesce(new.monto_descuento,0)>0 and nullif(btrim(new.motivo_descuento),'') is null then raise exception 'Escribe el motivo del descuento.'; end if;
 if new.fecha_devolucion>(now() at time zone 'America/Bogota')::date then raise exception 'No puedes registrar una devolución futura.'; end if;
 select coalesce(sum(monto_devuelto+coalesce(monto_descuento,0)),0) into usado from public.devoluciones_depositos d where d.contrato_id=c.id and d.id<>new.id and coalesce(lower(d.estado),'completado') not in ('cancelado','anulado','rechazado');
 if coalesce(lower(new.estado),'completado') not in ('cancelado','anulado','rechazado') and new.monto_devuelto+coalesce(new.monto_descuento,0)>coalesce(c.valor_deposito,0)-usado then raise exception 'La devolución supera el saldo disponible del depósito.'; end if;
 return new;
end $$;
revoke all on function public.validar_devolucion_deposito() from public,anon;
create trigger validar_devolucion_deposito before insert or update on public.devoluciones_depositos for each row execute function public.validar_devolucion_deposito();

-- Side effects and ledger entry are committed atomically, including direct INSERTs.
create function public.aplicar_movimiento_deposito() returns trigger language plpgsql security invoker set search_path='' as $$
declare c public.contratos%rowtype; dev uuid; usuario text;
begin
 if auth.uid() is null or new.usuario_id<>auth.uid() then raise exception 'Usuario de depósito inválido.'; end if;
 select * into c from public.contratos where id=new.contrato_id for update;
 if not found then raise exception 'Contrato no encontrado.'; end if;
 select p.nombre into usuario from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) and (p.rol='admin' or p.sede_id=c.sede_id);
 if not found then raise exception 'No tienes acceso a este contrato.'; end if;
 if new.fecha>(now() at time zone 'America/Bogota')::date then raise exception 'La fecha no puede estar en el futuro.'; end if;
 if new.metodo not in ('Efectivo','Transferencia','Tarjeta','Otro') then raise exception 'Método de pago inválido.'; end if;
 if new.comprobante_path is not null and (split_part(new.comprobante_path,'/',1)<>c.id::text or not exists(select 1 from storage.objects where bucket_id='comprobantes_depositos' and name=new.comprobante_path)) then raise exception 'Comprobante no válido para este contrato.'; end if;
 if new.tipo='ingreso' then
  update public.contratos set valor_deposito=coalesce(valor_deposito,0)+new.monto where id=c.id;
  new.devolucion_id:=null;
 elsif new.tipo='devolucion' then
  if new.fecha_pago_deposito>new.fecha then raise exception 'La fecha de pago no puede ser posterior a la devolución.'; end if;
  insert into public.devoluciones_depositos(contrato_id,monto_deposito_original,monto_descuento,motivo_descuento,monto_devuelto,fecha_devolucion,fecha_pago_deposito,comprobante_path,observaciones,estado,sede)
  values(c.id,coalesce(c.valor_deposito,0),new.descuento,new.motivo,new.monto,new.fecha,new.fecha_pago_deposito,new.comprobante_path,new.observaciones,'completado',c.sede) returning id into dev;
  new.devolucion_id:=dev;
 end if;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario)
 values(c.id,case when new.tipo='ingreso' then 'Depósito recibido' else 'Devolución de depósito' end,
 jsonb_build_object('movimiento_id',new.id,'monto',new.monto,'descuento',new.descuento,'fecha',new.fecha,'metodo',new.metodo)::text,coalesce(usuario,auth.uid()::text));
 return new;
end $$;
revoke all on function public.aplicar_movimiento_deposito() from public,anon;
create trigger aplicar_movimiento_deposito before insert on public.movimientos_depositos for each row execute function public.aplicar_movimiento_deposito();

create function public.registrar_movimiento_deposito(p_operacion uuid,p_contrato uuid,p_tipo text,p_monto numeric,p_descuento numeric,p_fecha date,p_metodo text,p_motivo text,p_observaciones text,p_comprobante text,p_fecha_pago date,p_saldo_esperado numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.contratos%rowtype; anterior public.movimientos_depositos%rowtype; usado numeric; disponible numeric;
begin
 if auth.uid() is null then raise exception 'Inicia sesión para gestionar depósitos.'; end if;
 if p_operacion is null or p_contrato is null or p_tipo is null or p_tipo not in ('ingreso','devolucion') or p_fecha is null or p_metodo is null or p_monto is null or p_descuento is null or p_monto<0 or p_descuento<0 or p_monto+p_descuento<=0 or p_monto>999999999999.99 or p_descuento>999999999999.99 or p_monto<>round(p_monto,2) or p_descuento<>round(p_descuento,2) then raise exception 'Revisa el tipo, fecha y montos del movimiento.'; end if;
 if p_tipo='ingreso' and (p_monto<=0 or p_descuento<>0) then raise exception 'El ingreso debe ser positivo y no lleva descuento.'; end if;
 select * into c from public.contratos where id=p_contrato for update;
 if not found then raise exception 'Contrato no encontrado.'; end if;
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) and (p.rol='admin' or p.sede_id=c.sede_id)) then raise exception 'No tienes acceso a este contrato.'; end if;
 select * into anterior from public.movimientos_depositos where id=p_operacion;
 if found then
  if anterior.contrato_id<>p_contrato or anterior.tipo<>p_tipo or anterior.monto<>p_monto or anterior.descuento<>p_descuento or anterior.fecha<>p_fecha or anterior.metodo<>p_metodo or anterior.motivo is distinct from nullif(btrim(p_motivo),'') or anterior.observaciones is distinct from nullif(btrim(p_observaciones),'') or anterior.comprobante_path is distinct from p_comprobante or anterior.fecha_pago_deposito is distinct from p_fecha_pago then raise exception 'Esta operación ya fue registrada con otros datos. Actualiza el contrato.'; end if;
  return jsonb_build_object('id',anterior.id,'repetido',true);
 end if;
 select coalesce(sum(monto_devuelto+coalesce(monto_descuento,0)),0) into usado from public.devoluciones_depositos where contrato_id=c.id and coalesce(lower(estado),'completado') not in ('cancelado','anulado','rechazado');
 disponible:=coalesce(c.valor_deposito,0)-usado;
 if p_tipo='devolucion' and (p_saldo_esperado is null or disponible<>p_saldo_esperado) then raise exception 'El saldo cambió. Actualiza el contrato antes de devolver.'; end if;
 insert into public.movimientos_depositos(id,contrato_id,tipo,monto,descuento,fecha,metodo,motivo,observaciones,comprobante_path,fecha_pago_deposito,usuario_id)
 values(p_operacion,c.id,p_tipo,p_monto,p_descuento,p_fecha,p_metodo,nullif(btrim(p_motivo),''),nullif(btrim(p_observaciones),''),p_comprobante,p_fecha_pago,auth.uid());
 return jsonb_build_object('id',p_operacion,'repetido',false);
end $$;
revoke all on function public.registrar_movimiento_deposito(uuid,uuid,text,numeric,numeric,date,text,text,text,text,date,numeric) from public,anon;
grant execute on function public.registrar_movimiento_deposito(uuid,uuid,text,numeric,numeric,date,text,text,text,text,date,numeric) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('comprobantes_depositos','comprobantes_depositos',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy deposito_comprobante_leer on storage.objects for select to authenticated using(bucket_id='comprobantes_depositos' and exists(select 1 from public.contratos c join public.profiles p on p.id=auth.uid() where c.id::text=split_part(name,'/',1) and coalesce(p.activo,true) and (p.rol='admin' or p.sede_id=c.sede_id)));
create policy deposito_comprobante_subir on storage.objects for insert to authenticated with check(bucket_id='comprobantes_depositos' and exists(select 1 from public.contratos c join public.profiles p on p.id=auth.uid() where c.id::text=split_part(name,'/',1) and coalesce(p.activo,true) and (p.rol='admin' or p.sede_id=c.sede_id)));
create policy deposito_comprobante_limpiar on storage.objects for delete to authenticated using(bucket_id='comprobantes_depositos' and owner_id=auth.uid()::text and not exists(select 1 from public.movimientos_depositos m where m.comprobante_path=name));
notify pgrst,'reload schema';


-- Source migration: 20260913235504_depositos_montos_finitos.sql
alter table public.movimientos_depositos add constraint movimientos_montos_finitos check(monto<1000000000000 and descuento<1000000000000);
create index movimientos_depositos_usuario_idx on public.movimientos_depositos(usuario_id);


-- Source migration: 20260913235846_depositos_politicas_eficientes.sql
alter policy movimientos_depositos_leer on public.movimientos_depositos using (
 exists(select 1 from public.contratos c join public.profiles p on p.id=(select auth.uid()) where c.id=contrato_id and coalesce(p.activo,true) and (p.rol='admin' or p.sede_id=c.sede_id)));
alter policy movimientos_depositos_insertar on public.movimientos_depositos with check (
 usuario_id=(select auth.uid()) and exists(select 1 from public.contratos c join public.profiles p on p.id=(select auth.uid()) where c.id=contrato_id and coalesce(p.activo,true) and (p.rol='admin' or p.sede_id=c.sede_id)));
alter policy deposito_comprobante_leer on storage.objects using(bucket_id='comprobantes_depositos' and exists(select 1 from public.contratos c join public.profiles p on p.id=(select auth.uid()) where c.id::text=split_part(name,'/',1) and coalesce(p.activo,true) and (p.rol='admin' or p.sede_id=c.sede_id)));
alter policy deposito_comprobante_subir on storage.objects with check(bucket_id='comprobantes_depositos' and exists(select 1 from public.contratos c join public.profiles p on p.id=(select auth.uid()) where c.id::text=split_part(name,'/',1) and coalesce(p.activo,true) and (p.rol='admin' or p.sede_id=c.sede_id)));
alter policy deposito_comprobante_limpiar on storage.objects using(bucket_id='comprobantes_depositos' and owner_id=(select auth.uid())::text and not exists(select 1 from public.movimientos_depositos m where m.comprobante_path=name));


-- Source migration: 20260915012429_flujo_devoluciones_contabilidad.sql
-- Only ERP copia. Private functions own atomic writes; exposed functions are invokers.
create table public.solicitudes_depositos (
 id uuid primary key, contrato_id uuid not null references public.contratos(id),
 monto numeric(14,2) not null check(monto>=0 and monto<1000000000000), descuento numeric(14,2) not null default 0 check(descuento>=0 and descuento<1000000000000),
 metodo text not null check(metodo in ('Efectivo','Transferencia')), motivo text, observaciones text,
 estado text not null default 'pendiente' check(estado in ('pendiente','en_proceso','pagado','devuelto','cancelado')),
 solicitante_id uuid not null references public.profiles(id), solicitante_nombre text not null,
 responsable_id uuid references public.profiles(id), responsable_nombre text,
 recibido_at timestamptz not null default now(), created_at timestamptz not null default now(),
 pago_at timestamptz, comprobante_path text, fecha_pago date,
 banco text, tipo_cuenta text, cuenta text, titular text,
 check(monto+descuento>0)
);
create unique index solicitudes_depositos_abierta on public.solicitudes_depositos(contrato_id) where estado in ('pendiente','en_proceso','pagado');
create index solicitudes_depositos_estado on public.solicitudes_depositos(estado,created_at);
create table public.historial_solicitudes_depositos (
 id uuid primary key default gen_random_uuid(), solicitud_id uuid not null references public.solicitudes_depositos(id),
 estado text not null, usuario_id uuid not null references public.profiles(id), usuario_nombre text not null,
 detalle text, created_at timestamptz not null default clock_timestamp()
);
create index historial_solicitudes_depositos_solicitud on public.historial_solicitudes_depositos(solicitud_id,created_at);
create table public.soportes_depositos_anteriores (
 contrato_id uuid primary key references public.contratos(id), monto numeric(14,2) not null check(monto>0),
 metodo text not null check(metodo in ('Efectivo','Transferencia','Tarjeta','Otro')),
 comprobante_path text not null, usuario_id uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
alter table public.solicitudes_depositos enable row level security;
alter table public.historial_solicitudes_depositos enable row level security;
alter table public.soportes_depositos_anteriores enable row level security;
revoke all on public.solicitudes_depositos,public.historial_solicitudes_depositos,public.soportes_depositos_anteriores from anon,authenticated;
grant select on public.solicitudes_depositos,public.historial_solicitudes_depositos,public.soportes_depositos_anteriores to authenticated;

create function private.acceso_deposito(p_contrato uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p join public.contratos c on c.id=p_contrato where p.id=auth.uid() and coalesce(p.activo,true) and (lower(p.rol) in ('admin','contabilidad') or p.sede_id=c.sede_id));
$$;
revoke all on function private.acceso_deposito(uuid) from public,anon;
grant execute on function private.acceso_deposito(uuid) to authenticated;
create policy solicitudes_leer on public.solicitudes_depositos for select to authenticated using(private.acceso_deposito(contrato_id));
create policy historial_solicitudes_leer on public.historial_solicitudes_depositos for select to authenticated using(exists(select 1 from public.solicitudes_depositos s where s.id=solicitud_id));
create policy soportes_anteriores_leer on public.soportes_depositos_anteriores for select to authenticated using(private.acceso_deposito(contrato_id));
create policy contabilidad_contratos_leer on public.contratos for select to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and coalesce(p.activo,true) and lower(p.rol)='contabilidad'));
create policy depositos_movimientos_leer_v2 on public.movimientos_depositos for select to authenticated using(private.acceso_deposito(contrato_id));
create policy depositos_devoluciones_leer_v2 on public.devoluciones_depositos for select to authenticated using(private.acceso_deposito(contrato_id));
create policy deposito_comprobante_leer_v2 on storage.objects for select to authenticated using(bucket_id='comprobantes_depositos' and exists(select 1 from public.contratos c where c.id::text=split_part(name,'/',1) and private.acceso_deposito(c.id)));
create policy deposito_comprobante_subir_v2 on storage.objects for insert to authenticated with check(bucket_id='comprobantes_depositos' and exists(select 1 from public.contratos c where c.id::text=split_part(name,'/',1) and private.acceso_deposito(c.id)));
drop policy deposito_comprobante_limpiar on storage.objects;
-- Financial history cannot be overwritten/deleted or bypassed by older clients.
revoke insert,update,delete on public.movimientos_depositos,public.devoluciones_depositos from anon,authenticated;
revoke execute on function public.registrar_movimiento_deposito(uuid,uuid,text,numeric,numeric,date,text,text,text,text,date,numeric) from public,anon,authenticated;

create function private.comprobante_deposito(p_contrato uuid,p_path text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if nullif(btrim(p_path),'') is null or split_part(p_path,'/',1)<>p_contrato::text or not exists(select 1 from storage.objects where bucket_id='comprobantes_depositos' and name=p_path) then raise exception 'El comprobante es obligatorio y debe pertenecer a este contrato.'; end if;
end $$;
revoke all on function private.comprobante_deposito(uuid,text) from public,anon,authenticated;

create function private.gestionar_deposito(p_accion text,p_datos jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 u public.profiles%rowtype; c public.contratos%rowtype; s public.solicitudes_depositos%rowtype;
 cid uuid:=(p_datos->>'contrato_id')::uuid; oid uuid:=(p_datos->>'id')::uuid;
 n numeric:=(p_datos->>'monto')::numeric; d numeric:=coalesce((p_datos->>'descuento')::numeric,0);
 usado numeric; saldo numeric; respaldado numeric; efectivo numeric; fecha date:=(p_datos->>'fecha')::date;
 metodo text:=p_datos->>'metodo'; path text:=p_datos->>'comprobante_path';
 begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if not found then raise exception 'Perfil no autorizado.'; end if;
 if p_accion in ('proceso','pagar','cancelar') then
  select contrato_id into cid from public.solicitudes_depositos where id=oid;
 end if;
 select * into c from public.contratos where id=cid for update;
 if not found or not private.acceso_deposito(cid) then raise exception 'No tienes acceso a este contrato.'; end if;
 select coalesce(sum(monto_devuelto+coalesce(monto_descuento,0)),0) into usado from public.devoluciones_depositos where contrato_id=cid and coalesce(lower(estado),'completado') not in ('cancelado','anulado','rechazado');
 saldo:=coalesce(c.valor_deposito,0)-usado;
 if p_accion in ('ingreso','solicitar') and (oid is null or n is null or n::text in ('NaN','Infinity','-Infinity') or d::text in ('NaN','Infinity','-Infinity') or n<0 or d<0 or n+d<=0 or n+d>=1000000000000 or n<>round(n,2) or d<>round(d,2)) then raise exception 'Revisa los montos.'; end if;
 if p_accion='ingreso' then
  if n<=0 or d<>0 or fecha is null then raise exception 'Revisa monto y fecha de ingreso.'; end if;
  perform private.comprobante_deposito(cid,path);
  if exists(select 1 from public.movimientos_depositos where id=oid) then
   if not exists(select 1 from public.movimientos_depositos m where m.id=oid and m.contrato_id=cid and m.tipo='ingreso' and m.monto=n and m.fecha=fecha and m.comprobante_path=path and m.metodo=metodo) then raise exception 'Operación ya utilizada.'; end if;
   return jsonb_build_object('id',oid,'repetido',true);
  end if;
  insert into public.movimientos_depositos(id,contrato_id,tipo,monto,fecha,metodo,observaciones,comprobante_path,usuario_id) values(oid,cid,'ingreso',n,fecha,metodo,p_datos->>'observaciones',path,u.id);
 elsif p_accion='soporte' then
  perform private.comprobante_deposito(cid,path);
  select coalesce(c.valor_deposito,0)-coalesce(sum(monto),0) into respaldado from public.movimientos_depositos where contrato_id=cid and tipo='ingreso';
  if respaldado<=0 then raise exception 'No hay depósito anterior por respaldar.'; end if;
  insert into public.soportes_depositos_anteriores(contrato_id,monto,metodo,comprobante_path,usuario_id) values(cid,respaldado,metodo,path,u.id);
  insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(cid,'Comprobante de depósito anterior',jsonb_build_object('monto',respaldado,'metodo',metodo,'comprobante',path)::text,u.nombre);
 elsif p_accion='solicitar' then
  select * into s from public.solicitudes_depositos where id=oid;
  if found then
   if s.contrato_id<>cid or s.monto<>n or s.descuento<>d or s.metodo is distinct from metodo or s.solicitante_id<>u.id then raise exception 'Operación ya utilizada con otros datos.'; end if;
   return jsonb_build_object('id',oid,'repetido',true);
  end if;
  if (p_datos->>'recibido')::boolean is distinct from true then raise exception 'Confirma que el vestido fue recibido y revisado.'; end if;
  if c.estado not in ('mantenimiento','finalizado','devuelto') then raise exception 'Registra primero el retorno físico del vestido en el contrato.'; end if;
  if n+d>saldo or (p_datos->>'saldo_esperado')::numeric is distinct from saldo then raise exception 'El saldo cambió o la devolución supera el saldo. Actualiza el contrato.'; end if;
  if d>0 and nullif(btrim(p_datos->>'motivo'),'') is null then raise exception 'Escribe el motivo del descuento.'; end if;
  select coalesce(sum(monto),0) into respaldado from public.movimientos_depositos where contrato_id=cid and tipo='ingreso' and comprobante_path is not null;
  select respaldado+coalesce(sum(monto),0) into respaldado from public.soportes_depositos_anteriores where contrato_id=cid;
  if respaldado<coalesce(c.valor_deposito,0) then raise exception 'Carga el comprobante del depósito anterior antes de solicitar su devolución.'; end if;
  if metodo='Efectivo' then
   select coalesce(sum(case when m.tipo='ingreso' and m.metodo='Efectivo' then m.monto when m.tipo='devolucion' then -m.monto-m.descuento else 0 end),0) into efectivo from public.movimientos_depositos m where m.contrato_id=cid;
   select efectivo+coalesce(sum(monto),0) into efectivo from public.soportes_depositos_anteriores a where a.contrato_id=cid and a.metodo='Efectivo';
   if efectivo<n+d then raise exception 'La devolución en efectivo requiere entrada en efectivo suficiente.'; end if;
   perform private.comprobante_deposito(cid,path);
  elsif metodo='Transferencia' then
   if nullif(btrim(p_datos->>'banco'),'') is null or nullif(btrim(p_datos->>'cuenta'),'') is null or nullif(btrim(p_datos->>'titular'),'') is null or nullif(btrim(p_datos->>'tipo_cuenta'),'') is null then raise exception 'Completa los datos bancarios de la devolución.'; end if;
  else raise exception 'Selecciona Efectivo o Transferencia.';
  end if;
  insert into public.solicitudes_depositos(id,contrato_id,monto,descuento,metodo,motivo,observaciones,solicitante_id,solicitante_nombre,banco,tipo_cuenta,cuenta,titular)
  values(oid,cid,n,d,metodo,p_datos->>'motivo',p_datos->>'observaciones',u.id,coalesce(u.nombre,u.email),p_datos->>'banco',p_datos->>'tipo_cuenta',p_datos->>'cuenta',p_datos->>'titular') returning * into s;
  insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,'pendiente',u.id,s.solicitante_nombre,'Vestido recibido y revisado. Solicitud creada.');
  if metodo='Efectivo' then
   update public.solicitudes_depositos set estado='en_proceso',responsable_id=u.id,responsable_nombre=coalesce(u.nombre,u.email) where id=oid;
   insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,'en_proceso',u.id,s.solicitante_nombre,'Devolución en efectivo sin autorización previa.');
  else return jsonb_build_object('id',oid,'estado','pendiente'); end if;
 elsif p_accion in ('proceso','pagar','cancelar') then
  select * into s from public.solicitudes_depositos where id=oid for update;
  if p_accion='cancelar' then
   if s.estado<>'pendiente' or (s.solicitante_id<>u.id and lower(u.rol) not in ('admin','contabilidad')) or nullif(btrim(p_datos->>'motivo'),'') is null then raise exception 'Solo puedes cancelar una solicitud pendiente indicando el motivo.'; end if;
   update public.solicitudes_depositos set estado='cancelado' where id=oid;
   insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,'cancelado',u.id,coalesce(u.nombre,u.email),p_datos->>'motivo');
   return jsonb_build_object('id',oid,'estado','cancelado');
  end if;
  if lower(u.rol) not in ('admin','contabilidad') then raise exception 'Solo Contabilidad puede gestionar el pago de transferencias.'; end if;
  if p_accion='proceso' then
   if s.estado='en_proceso' and s.responsable_id=u.id then return jsonb_build_object('id',oid,'repetido',true); end if;
   if s.estado<>'pendiente' then raise exception 'La solicitud ya fue tomada o pagada. Actualiza la bandeja.'; end if;
   update public.solicitudes_depositos set estado='en_proceso',responsable_id=u.id,responsable_nombre=coalesce(u.nombre,u.email) where id=oid;
   insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre) values(oid,'en_proceso',u.id,coalesce(u.nombre,u.email));
   return jsonb_build_object('id',oid,'estado','en_proceso');
  end if;
  if s.estado='devuelto' then
   if s.comprobante_path is distinct from path or s.fecha_pago is distinct from fecha then raise exception 'Pago ya registrado con otros datos.'; end if;
   return jsonb_build_object('id',oid,'repetido',true);
  end if;
  if s.estado<>'en_proceso' or s.responsable_id<>u.id then raise exception 'El pago debe registrarlo la persona que tomó la solicitud.'; end if;
 else raise exception 'Acción no válida.';
 end if;
 if p_accion='pagar' or (p_accion='solicitar' and metodo='Efectivo') then
  perform private.comprobante_deposito(cid,path);
  if fecha is null or fecha>(now() at time zone 'America/Bogota')::date or fecha<(s.created_at at time zone 'America/Bogota')::date then raise exception 'Revisa la fecha de pago.'; end if;
  update public.solicitudes_depositos set estado='pagado',pago_at=now(),fecha_pago=fecha,comprobante_path=path where id=oid;
  insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre) values(oid,'pagado',u.id,coalesce(u.nombre,u.email));
  insert into public.movimientos_depositos(id,contrato_id,tipo,monto,descuento,fecha,metodo,motivo,observaciones,comprobante_path,usuario_id) values(oid,cid,'devolucion',s.monto,s.descuento,fecha,s.metodo,s.motivo,s.observaciones,path,u.id);
  update public.solicitudes_depositos set estado='devuelto' where id=oid;
  insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,'devuelto',u.id,coalesce(u.nombre,u.email),'Comprobante cargado. Depósito devuelto.');
 end if;
 return jsonb_build_object('id',oid,'ok',true);
end $$;
revoke all on function private.gestionar_deposito(text,jsonb) from public,anon;
grant execute on function private.gestionar_deposito(text,jsonb) to authenticated;
create function public.gestionar_deposito(p_accion text,p_datos jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.gestionar_deposito(p_accion,p_datos); $$;
revoke all on function public.gestionar_deposito(text,jsonb) from public,anon;
grant execute on function public.gestionar_deposito(text,jsonb) to authenticated;

-- Prevent unreceipted amounts from being added via contract creation/editing.
create function private.proteger_valor_deposito() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
  if (tg_op='INSERT' and coalesce(new.valor_deposito,0)<>0) or (tg_op='UPDATE' and new.valor_deposito is distinct from old.valor_deposito) then raise exception 'Registra el depósito con su comprobante desde Depósitos y devoluciones.'; end if;
 end if;
 return new;
end $$;
revoke all on function private.proteger_valor_deposito() from public,anon,authenticated;
create trigger proteger_valor_deposito before insert or update on public.contratos for each row execute function private.proteger_valor_deposito();
notify pgrst,'reload schema';

create or replace function public.validar_devolucion_deposito() returns trigger language plpgsql security invoker set search_path='' as $$
declare c public.contratos%rowtype; usado numeric;
begin
 if auth.uid() is null then raise exception 'Inicia sesión para registrar devoluciones.'; end if;
 if tg_op='UPDATE' and new.contrato_id is distinct from old.contrato_id then raise exception 'No se puede mover una devolución a otro contrato.'; end if;
 select * into c from public.contratos where id=new.contrato_id for update;
 if not found then raise exception 'Contrato no encontrado.'; end if;
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) and (lower(p.rol) in ('admin','contabilidad') or p.sede_id=c.sede_id)) then raise exception 'No tienes acceso a este contrato.'; end if;
 if new.monto_devuelto is null or new.monto_devuelto<0 or coalesce(new.monto_descuento,0)<0 or new.monto_devuelto+coalesce(new.monto_descuento,0)<=0 then raise exception 'La devolución o descuento debe ser mayor que cero.'; end if;
 if coalesce(new.monto_descuento,0)>0 and nullif(btrim(new.motivo_descuento),'') is null then raise exception 'Escribe el motivo del descuento.'; end if;
 if new.fecha_devolucion>(now() at time zone 'America/Bogota')::date then raise exception 'No puedes registrar una devolución futura.'; end if;
 select coalesce(sum(monto_devuelto+coalesce(monto_descuento,0)),0) into usado from public.devoluciones_depositos d where d.contrato_id=c.id and d.id<>new.id and coalesce(lower(d.estado),'completado') not in ('cancelado','anulado','rechazado');
 if coalesce(lower(new.estado),'completado') not in ('cancelado','anulado','rechazado') and new.monto_devuelto+coalesce(new.monto_descuento,0)>coalesce(c.valor_deposito,0)-usado then raise exception 'La devolución supera el saldo disponible del depósito.'; end if;
 return new;
end $$;

create or replace function public.aplicar_movimiento_deposito() returns trigger language plpgsql security invoker set search_path='' as $$
declare c public.contratos%rowtype; dev uuid; usuario text;
begin
 if auth.uid() is null or new.usuario_id<>auth.uid() then raise exception 'Usuario de depósito inválido.'; end if;
 select * into c from public.contratos where id=new.contrato_id for update;
 if not found then raise exception 'Contrato no encontrado.'; end if;
 select p.nombre into usuario from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true) and (lower(p.rol) in ('admin','contabilidad') or p.sede_id=c.sede_id);
 if not found then raise exception 'No tienes acceso a este contrato.'; end if;
 if new.fecha>(now() at time zone 'America/Bogota')::date then raise exception 'La fecha no puede estar en el futuro.'; end if;
 if new.metodo not in ('Efectivo','Transferencia','Tarjeta','Otro') then raise exception 'Método de pago inválido.'; end if;
 if new.comprobante_path is not null and (split_part(new.comprobante_path,'/',1)<>c.id::text or not exists(select 1 from storage.objects where bucket_id='comprobantes_depositos' and name=new.comprobante_path)) then raise exception 'Comprobante no válido para este contrato.'; end if;
 perform private.comprobante_deposito(c.id,new.comprobante_path);
 if new.tipo='ingreso' then
  update public.contratos set valor_deposito=coalesce(valor_deposito,0)+new.monto where id=c.id;
  new.devolucion_id:=null;
 elsif new.tipo='devolucion' then
  if new.fecha_pago_deposito>new.fecha then raise exception 'La fecha de pago no puede ser posterior a la devolución.'; end if;
  insert into public.devoluciones_depositos(contrato_id,monto_deposito_original,monto_descuento,motivo_descuento,monto_devuelto,fecha_devolucion,fecha_pago_deposito,comprobante_path,observaciones,estado,sede)
  values(c.id,coalesce(c.valor_deposito,0),new.descuento,new.motivo,new.monto,new.fecha,new.fecha_pago_deposito,new.comprobante_path,new.observaciones,'completado',c.sede) returning id into dev;
  new.devolucion_id:=dev;
 end if;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario)
 values(c.id,case when new.tipo='ingreso' then 'Depósito recibido' else 'Devolución de depósito' end,
 jsonb_build_object('movimiento_id',new.id,'monto',new.monto,'descuento',new.descuento,'fecha',new.fecha,'metodo',new.metodo)::text,coalesce(usuario,auth.uid()::text));
 return new;
end $$;

-- Source migration: 20260915013213_permisos_flujo_depositos.sql
grant usage on schema private to authenticated;

-- Source migration: 20260915013353_respaldos_depositos_anteriores.sql
create or replace function private.gestionar_deposito(p_accion text,p_datos jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 u public.profiles%rowtype; c public.contratos%rowtype; s public.solicitudes_depositos%rowtype;
 cid uuid:=(p_datos->>'contrato_id')::uuid; oid uuid:=(p_datos->>'id')::uuid;
 n numeric:=(p_datos->>'monto')::numeric; d numeric:=coalesce((p_datos->>'descuento')::numeric,0);
 usado numeric; saldo numeric; respaldado numeric; efectivo numeric; fecha date:=(p_datos->>'fecha')::date;
 metodo text:=p_datos->>'metodo'; path text:=p_datos->>'comprobante_path';
 begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if not found then raise exception 'Perfil no autorizado.'; end if;
 if p_accion in ('proceso','pagar','cancelar') then
  select contrato_id into cid from public.solicitudes_depositos where id=oid;
 end if;
 select * into c from public.contratos where id=cid for update;
 if not found or not private.acceso_deposito(cid) then raise exception 'No tienes acceso a este contrato.'; end if;
 select coalesce(sum(monto_devuelto+coalesce(monto_descuento,0)),0) into usado from public.devoluciones_depositos where contrato_id=cid and coalesce(lower(estado),'completado') not in ('cancelado','anulado','rechazado');
 saldo:=coalesce(c.valor_deposito,0)-usado;
 if p_accion in ('ingreso','solicitar') and (oid is null or n is null or n::text in ('NaN','Infinity','-Infinity') or d::text in ('NaN','Infinity','-Infinity') or n<0 or d<0 or n+d<=0 or n+d>=1000000000000 or n<>round(n,2) or d<>round(d,2)) then raise exception 'Revisa los montos.'; end if;
 if p_accion='ingreso' then
  if n<=0 or d<>0 or fecha is null then raise exception 'Revisa monto y fecha de ingreso.'; end if;
  perform private.comprobante_deposito(cid,path);
  if exists(select 1 from public.movimientos_depositos where id=oid) then
   if not exists(select 1 from public.movimientos_depositos m where m.id=oid and m.contrato_id=cid and m.tipo='ingreso' and m.monto=n and m.fecha=fecha and m.comprobante_path=path and m.metodo=metodo) then raise exception 'Operación ya utilizada.'; end if;
   return jsonb_build_object('id',oid,'repetido',true);
  end if;
  insert into public.movimientos_depositos(id,contrato_id,tipo,monto,fecha,metodo,observaciones,comprobante_path,usuario_id) values(oid,cid,'ingreso',n,fecha,metodo,p_datos->>'observaciones',path,u.id);
 elsif p_accion='soporte' then
  perform private.comprobante_deposito(cid,path);
  select coalesce(c.valor_deposito,0)-coalesce(sum(monto),0) into respaldado from public.movimientos_depositos where contrato_id=cid and tipo='ingreso' and comprobante_path is not null;
  if respaldado<=0 then raise exception 'No hay depósito anterior por respaldar.'; end if;
  insert into public.soportes_depositos_anteriores(contrato_id,monto,metodo,comprobante_path,usuario_id) values(cid,respaldado,metodo,path,u.id);
  insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(cid,'Comprobante de depósito anterior',jsonb_build_object('monto',respaldado,'metodo',metodo,'comprobante',path)::text,u.nombre);
 elsif p_accion='solicitar' then
  select * into s from public.solicitudes_depositos where id=oid;
  if found then
   if s.contrato_id<>cid or s.monto<>n or s.descuento<>d or s.metodo is distinct from metodo or s.solicitante_id<>u.id or s.motivo is distinct from p_datos->>'motivo' or s.banco is distinct from p_datos->>'banco' or s.cuenta is distinct from p_datos->>'cuenta' or s.titular is distinct from p_datos->>'titular' then raise exception 'Operación ya utilizada con otros datos.'; end if;
   return jsonb_build_object('id',oid,'repetido',true);
  end if;
  if (p_datos->>'recibido')::boolean is distinct from true then raise exception 'Confirma que el vestido fue recibido y revisado.'; end if;
  if c.estado not in ('mantenimiento','finalizado','devuelto') then raise exception 'Registra primero el retorno físico del vestido en el contrato.'; end if;
  if n+d>saldo or (p_datos->>'saldo_esperado')::numeric is distinct from saldo then raise exception 'El saldo cambió o la devolución supera el saldo. Actualiza el contrato.'; end if;
  if d>0 and nullif(btrim(p_datos->>'motivo'),'') is null then raise exception 'Escribe el motivo del descuento.'; end if;
  select coalesce(sum(monto),0) into respaldado from public.movimientos_depositos where contrato_id=cid and tipo='ingreso' and comprobante_path is not null;
  select respaldado+coalesce(sum(monto),0) into respaldado from public.soportes_depositos_anteriores where contrato_id=cid;
  if respaldado<coalesce(c.valor_deposito,0) then raise exception 'Carga el comprobante del depósito anterior antes de solicitar su devolución.'; end if;
  if metodo='Efectivo' then
   select coalesce(sum(case when m.tipo='ingreso' and m.metodo='Efectivo' and m.comprobante_path is not null then m.monto when m.tipo='devolucion' then -m.monto-m.descuento else 0 end),0) into efectivo from public.movimientos_depositos m where m.contrato_id=cid;
   select efectivo+coalesce(sum(monto),0) into efectivo from public.soportes_depositos_anteriores a where a.contrato_id=cid and a.metodo='Efectivo';
   if efectivo<n+d then raise exception 'La devolución en efectivo requiere entrada en efectivo suficiente.'; end if;
   perform private.comprobante_deposito(cid,path);
  elsif metodo='Transferencia' then
   if nullif(btrim(p_datos->>'banco'),'') is null or nullif(btrim(p_datos->>'cuenta'),'') is null or nullif(btrim(p_datos->>'titular'),'') is null or nullif(btrim(p_datos->>'tipo_cuenta'),'') is null then raise exception 'Completa los datos bancarios de la devolución.'; end if;
  else raise exception 'Selecciona Efectivo o Transferencia.';
  end if;
  insert into public.solicitudes_depositos(id,contrato_id,monto,descuento,metodo,motivo,observaciones,solicitante_id,solicitante_nombre,banco,tipo_cuenta,cuenta,titular)
  values(oid,cid,n,d,metodo,p_datos->>'motivo',p_datos->>'observaciones',u.id,coalesce(u.nombre,u.email),p_datos->>'banco',p_datos->>'tipo_cuenta',p_datos->>'cuenta',p_datos->>'titular') returning * into s;
  insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,'pendiente',u.id,s.solicitante_nombre,'Vestido recibido y revisado. Solicitud creada.');
  if metodo='Efectivo' then
   update public.solicitudes_depositos set estado='en_proceso',responsable_id=u.id,responsable_nombre=coalesce(u.nombre,u.email) where id=oid;
   insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,'en_proceso',u.id,s.solicitante_nombre,'Devolución en efectivo sin autorización previa.');
  else return jsonb_build_object('id',oid,'estado','pendiente'); end if;
 elsif p_accion in ('proceso','pagar','cancelar') then
  select * into s from public.solicitudes_depositos where id=oid for update;
  if p_accion='cancelar' then
   if s.estado<>'pendiente' or (s.solicitante_id<>u.id and lower(u.rol) not in ('admin','contabilidad')) or nullif(btrim(p_datos->>'motivo'),'') is null then raise exception 'Solo puedes cancelar una solicitud pendiente indicando el motivo.'; end if;
   update public.solicitudes_depositos set estado='cancelado' where id=oid;
   insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,'cancelado',u.id,coalesce(u.nombre,u.email),p_datos->>'motivo');
   return jsonb_build_object('id',oid,'estado','cancelado');
  end if;
  if lower(u.rol) not in ('admin','contabilidad') then raise exception 'Solo Contabilidad puede gestionar el pago de transferencias.'; end if;
  if p_accion='proceso' then
   if s.estado='en_proceso' and s.responsable_id=u.id then return jsonb_build_object('id',oid,'repetido',true); end if;
   if s.estado<>'pendiente' then raise exception 'La solicitud ya fue tomada o pagada. Actualiza la bandeja.'; end if;
   update public.solicitudes_depositos set estado='en_proceso',responsable_id=u.id,responsable_nombre=coalesce(u.nombre,u.email) where id=oid;
   insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre) values(oid,'en_proceso',u.id,coalesce(u.nombre,u.email));
   return jsonb_build_object('id',oid,'estado','en_proceso');
  end if;
  if s.estado='devuelto' then
   if s.comprobante_path is distinct from path or s.fecha_pago is distinct from fecha then raise exception 'Pago ya registrado con otros datos.'; end if;
   return jsonb_build_object('id',oid,'repetido',true);
  end if;
  if s.estado<>'en_proceso' or s.responsable_id<>u.id then raise exception 'El pago debe registrarlo la persona que tomó la solicitud.'; end if;
 else raise exception 'Acción no válida.';
 end if;
 if p_accion='pagar' or (p_accion='solicitar' and metodo='Efectivo') then
  perform private.comprobante_deposito(cid,path);
  if fecha is null or fecha>(now() at time zone 'America/Bogota')::date or fecha<(s.created_at at time zone 'America/Bogota')::date then raise exception 'Revisa la fecha de pago.'; end if;
  update public.solicitudes_depositos set estado='pagado',pago_at=now(),fecha_pago=fecha,comprobante_path=path where id=oid;
  insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre) values(oid,'pagado',u.id,coalesce(u.nombre,u.email));
  insert into public.movimientos_depositos(id,contrato_id,tipo,monto,descuento,fecha,metodo,motivo,observaciones,comprobante_path,usuario_id) values(oid,cid,'devolucion',s.monto,s.descuento,fecha,s.metodo,s.motivo,s.observaciones,path,u.id);
  update public.solicitudes_depositos set estado='devuelto' where id=oid;
  insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,'devuelto',u.id,coalesce(u.nombre,u.email),'Comprobante cargado. Depósito devuelto.');
 end if;
 return jsonb_build_object('id',oid,'ok',true);
end $$;

-- Source migration: 20260915020400_confirmar_recepcion_desde_depositos.sql
create or replace function private.gestionar_deposito(p_accion text,p_datos jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 u public.profiles%rowtype; c public.contratos%rowtype; s public.solicitudes_depositos%rowtype;
 cid uuid:=(p_datos->>'contrato_id')::uuid; oid uuid:=(p_datos->>'id')::uuid;
 n numeric:=(p_datos->>'monto')::numeric; d numeric:=coalesce((p_datos->>'descuento')::numeric,0);
 usado numeric; saldo numeric; respaldado numeric; efectivo numeric; fecha date:=(p_datos->>'fecha')::date;
 metodo text:=p_datos->>'metodo'; path text:=p_datos->>'comprobante_path';
 begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if not found then raise exception 'Perfil no autorizado.'; end if;
 if p_accion in ('proceso','pagar','cancelar') then
  select contrato_id into cid from public.solicitudes_depositos where id=oid;
 end if;
 select * into c from public.contratos where id=cid for update;
 if not found or not private.acceso_deposito(cid) then raise exception 'No tienes acceso a este contrato.'; end if;
 select coalesce(sum(monto_devuelto+coalesce(monto_descuento,0)),0) into usado from public.devoluciones_depositos where contrato_id=cid and coalesce(lower(estado),'completado') not in ('cancelado','anulado','rechazado');
 saldo:=coalesce(c.valor_deposito,0)-usado;
 if p_accion in ('ingreso','solicitar') and (oid is null or n is null or n::text in ('NaN','Infinity','-Infinity') or d::text in ('NaN','Infinity','-Infinity') or n<0 or d<0 or n+d<=0 or n+d>=1000000000000 or n<>round(n,2) or d<>round(d,2)) then raise exception 'Revisa los montos.'; end if;
 if p_accion='ingreso' then
  if n<=0 or d<>0 or fecha is null then raise exception 'Revisa monto y fecha de ingreso.'; end if;
  perform private.comprobante_deposito(cid,path);
  if exists(select 1 from public.movimientos_depositos where id=oid) then
   if not exists(select 1 from public.movimientos_depositos m where m.id=oid and m.contrato_id=cid and m.tipo='ingreso' and m.monto=n and m.fecha=fecha and m.comprobante_path=path and m.metodo=metodo) then raise exception 'Operación ya utilizada.'; end if;
   return jsonb_build_object('id',oid,'repetido',true);
  end if;
  insert into public.movimientos_depositos(id,contrato_id,tipo,monto,fecha,metodo,observaciones,comprobante_path,usuario_id) values(oid,cid,'ingreso',n,fecha,metodo,p_datos->>'observaciones',path,u.id);
 elsif p_accion='soporte' then
  perform private.comprobante_deposito(cid,path);
  select coalesce(c.valor_deposito,0)-coalesce(sum(monto),0) into respaldado from public.movimientos_depositos where contrato_id=cid and tipo='ingreso' and comprobante_path is not null;
  if respaldado<=0 then raise exception 'No hay depósito anterior por respaldar.'; end if;
  insert into public.soportes_depositos_anteriores(contrato_id,monto,metodo,comprobante_path,usuario_id) values(cid,respaldado,metodo,path,u.id);
  insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(cid,'Comprobante de depósito anterior',jsonb_build_object('monto',respaldado,'metodo',metodo,'comprobante',path)::text,u.nombre);
 elsif p_accion='solicitar' then
  select * into s from public.solicitudes_depositos where id=oid;
  if found then
   if s.contrato_id<>cid or s.monto<>n or s.descuento<>d or s.metodo is distinct from metodo or s.solicitante_id<>u.id or s.motivo is distinct from p_datos->>'motivo' or s.banco is distinct from p_datos->>'banco' or s.cuenta is distinct from p_datos->>'cuenta' or s.titular is distinct from p_datos->>'titular' then raise exception 'Operación ya utilizada con otros datos.'; end if;
   return jsonb_build_object('id',oid,'repetido',true);
  end if;
  if (p_datos->>'recibido')::boolean is distinct from true then raise exception 'Confirma que el vestido fue recibido y revisado.'; end if;
  -- The required confirmation above records receipt independently of contract logistics.
  if n+d>saldo or (p_datos->>'saldo_esperado')::numeric is distinct from saldo then raise exception 'El saldo cambió o la devolución supera el saldo. Actualiza el contrato.'; end if;
  if d>0 and nullif(btrim(p_datos->>'motivo'),'') is null then raise exception 'Escribe el motivo del descuento.'; end if;
  select coalesce(sum(monto),0) into respaldado from public.movimientos_depositos where contrato_id=cid and tipo='ingreso' and comprobante_path is not null;
  select respaldado+coalesce(sum(monto),0) into respaldado from public.soportes_depositos_anteriores where contrato_id=cid;
  if respaldado<coalesce(c.valor_deposito,0) then raise exception 'Carga el comprobante del depósito anterior antes de solicitar su devolución.'; end if;
  if metodo='Efectivo' then
   select coalesce(sum(case when m.tipo='ingreso' and m.metodo='Efectivo' and m.comprobante_path is not null then m.monto when m.tipo='devolucion' then -m.monto-m.descuento else 0 end),0) into efectivo from public.movimientos_depositos m where m.contrato_id=cid;
   select efectivo+coalesce(sum(monto),0) into efectivo from public.soportes_depositos_anteriores a where a.contrato_id=cid and a.metodo='Efectivo';
   if efectivo<n+d then raise exception 'La devolución en efectivo requiere entrada en efectivo suficiente.'; end if;
   perform private.comprobante_deposito(cid,path);
  elsif metodo='Transferencia' then
   if nullif(btrim(p_datos->>'banco'),'') is null or nullif(btrim(p_datos->>'cuenta'),'') is null or nullif(btrim(p_datos->>'titular'),'') is null or nullif(btrim(p_datos->>'tipo_cuenta'),'') is null then raise exception 'Completa los datos bancarios de la devolución.'; end if;
  else raise exception 'Selecciona Efectivo o Transferencia.';
  end if;
  insert into public.solicitudes_depositos(id,contrato_id,monto,descuento,metodo,motivo,observaciones,solicitante_id,solicitante_nombre,banco,tipo_cuenta,cuenta,titular)
  values(oid,cid,n,d,metodo,p_datos->>'motivo',p_datos->>'observaciones',u.id,coalesce(u.nombre,u.email),p_datos->>'banco',p_datos->>'tipo_cuenta',p_datos->>'cuenta',p_datos->>'titular') returning * into s;
  insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,'pendiente',u.id,s.solicitante_nombre,'Vestido recibido y revisado: confirmación registrada por la solicitante. Estado del contrato al confirmar: '||coalesce(c.estado,'sin estado')||'. Solicitud creada.');
  if metodo='Efectivo' then
   update public.solicitudes_depositos set estado='en_proceso',responsable_id=u.id,responsable_nombre=coalesce(u.nombre,u.email) where id=oid;
   insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,'en_proceso',u.id,s.solicitante_nombre,'Devolución en efectivo sin autorización previa.');
  else return jsonb_build_object('id',oid,'estado','pendiente'); end if;
 elsif p_accion in ('proceso','pagar','cancelar') then
  select * into s from public.solicitudes_depositos where id=oid for update;
  if p_accion='cancelar' then
   if s.estado<>'pendiente' or (s.solicitante_id<>u.id and lower(u.rol) not in ('admin','contabilidad')) or nullif(btrim(p_datos->>'motivo'),'') is null then raise exception 'Solo puedes cancelar una solicitud pendiente indicando el motivo.'; end if;
   update public.solicitudes_depositos set estado='cancelado' where id=oid;
   insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,'cancelado',u.id,coalesce(u.nombre,u.email),p_datos->>'motivo');
   return jsonb_build_object('id',oid,'estado','cancelado');
  end if;
  if lower(u.rol) not in ('admin','contabilidad') then raise exception 'Solo Contabilidad puede gestionar el pago de transferencias.'; end if;
  if p_accion='proceso' then
   if s.estado='en_proceso' and s.responsable_id=u.id then return jsonb_build_object('id',oid,'repetido',true); end if;
   if s.estado<>'pendiente' then raise exception 'La solicitud ya fue tomada o pagada. Actualiza la bandeja.'; end if;
   update public.solicitudes_depositos set estado='en_proceso',responsable_id=u.id,responsable_nombre=coalesce(u.nombre,u.email) where id=oid;
   insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre) values(oid,'en_proceso',u.id,coalesce(u.nombre,u.email));
   return jsonb_build_object('id',oid,'estado','en_proceso');
  end if;
  if s.estado='devuelto' then
   if s.comprobante_path is distinct from path or s.fecha_pago is distinct from fecha then raise exception 'Pago ya registrado con otros datos.'; end if;
   return jsonb_build_object('id',oid,'repetido',true);
  end if;
  if s.estado<>'en_proceso' or s.responsable_id<>u.id then raise exception 'El pago debe registrarlo la persona que tomó la solicitud.'; end if;
 else raise exception 'Acción no válida.';
 end if;
 if p_accion='pagar' or (p_accion='solicitar' and metodo='Efectivo') then
  perform private.comprobante_deposito(cid,path);
  if fecha is null or fecha>(now() at time zone 'America/Bogota')::date or fecha<(s.created_at at time zone 'America/Bogota')::date then raise exception 'Revisa la fecha de pago.'; end if;
  update public.solicitudes_depositos set estado='pagado',pago_at=now(),fecha_pago=fecha,comprobante_path=path where id=oid;
  insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre) values(oid,'pagado',u.id,coalesce(u.nombre,u.email));
  insert into public.movimientos_depositos(id,contrato_id,tipo,monto,descuento,fecha,metodo,motivo,observaciones,comprobante_path,usuario_id) values(oid,cid,'devolucion',s.monto,s.descuento,fecha,s.metodo,s.motivo,s.observaciones,path,u.id);
  update public.solicitudes_depositos set estado='devuelto' where id=oid;
  insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,'devuelto',u.id,coalesce(u.nombre,u.email),'Comprobante cargado. Depósito devuelto.');
 end if;
 return jsonb_build_object('id',oid,'ok',true);
end $$;

-- Source migration: 20260915022041_contabilidad_acceso_exclusivo_depositos.sql
-- Restrictive policies intersect existing site permissions, including accounts with a site.
-- Deposit RPCs remain the only writers; contract data is read-only for Accounting.
do $migration$
declare t record;
begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relname not in (
  'contratos','profiles','movimientos_depositos','devoluciones_depositos',
  'solicitudes_depositos','historial_solicitudes_depositos','soportes_depositos_anteriores'
 ) loop
  execute format('create policy contabilidad_solo_depositos on public.%I as restrictive for all to authenticated using ((select private.current_profile_role()) is distinct from ''contabilidad'') with check ((select private.current_profile_role()) is distinct from ''contabilidad'')',t.relname);
 end loop;
 for t in select unnest(array['contratos','profiles']) as relname loop
  execute format('create policy contabilidad_sin_insertar on public.%I as restrictive for insert to authenticated with check ((select private.current_profile_role()) is distinct from ''contabilidad'')',t.relname);
  execute format('create policy contabilidad_sin_editar on public.%I as restrictive for update to authenticated using ((select private.current_profile_role()) is distinct from ''contabilidad'') with check ((select private.current_profile_role()) is distinct from ''contabilidad'')',t.relname);
  execute format('create policy contabilidad_sin_eliminar on public.%I as restrictive for delete to authenticated using ((select private.current_profile_role()) is distinct from ''contabilidad'')',t.relname);
 end loop;
end $migration$;
create policy contabilidad_solo_comprobantes on storage.objects as restrictive for all to authenticated
using ((select private.current_profile_role()) is distinct from 'contabilidad' or bucket_id='comprobantes_depositos')
with check ((select private.current_profile_role()) is distinct from 'contabilidad' or bucket_id='comprobantes_depositos');
-- Existing definer discount RPCs bypass table policies; explicitly deny Accounting.
do $migration$
declare f record; definition text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='validar_y_quemar_codigo' loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,E'BEGIN\n',E'BEGIN\n  IF private.current_profile_role() = ''contabilidad'' THEN RAISE EXCEPTION ''Contabilidad solo tiene acceso a depósitos y devoluciones.'' USING ERRCODE = ''42501''; END IF;\n');
  execute definition;
 end loop;
end $migration$;

-- Source migration: 20260915151546_prexv_componentes_confirmaciones.sql
-- Additive migration. NULL means legacy/unknown, [] explicitly means no services.
-- No existing contract or signature is rewritten.
alter table public.contratos
 add column prexv_componentes text[],
 add column prexv_fotografo_agendado boolean not null default false,
 add column prexv_maquilladora_agendada boolean not null default false,
 add column prexv_locacion_confirmada boolean not null default false;
alter table public.contratos add constraint prexv_componentes_validos check (
 prexv_componentes is null or (prexv_componentes <@ array['fotos','maquillaje','locacion']::text[] and array_position(prexv_componentes,null) is null)
);
create function private.validar_prexv() returns trigger language plpgsql security invoker set search_path = '' as $$
declare changed boolean; role_name text;
begin
 if TG_OP='INSERT' then
  changed := new.prexv_componentes is not null or new.prexv_fotografo_agendado or new.prexv_maquilladora_agendada or new.prexv_locacion_confirmada;
 else
  changed := row(new.prexv_componentes,new.prexv_fotografo,new.prexv_maquilladora,new.prexv_locacion,new.prexv_fotografo_agendado,new.prexv_maquilladora_agendada,new.prexv_locacion_confirmada)
   is distinct from row(old.prexv_componentes,old.prexv_fotografo,old.prexv_maquilladora,old.prexv_locacion,old.prexv_fotografo_agendado,old.prexv_maquilladora_agendada,old.prexv_locacion_confirmada);
 end if;
 -- Existing public signature flow may still update signature fields, never logistics.
 if changed and current_user in ('anon','authenticated') then
  role_name := private.current_profile_role();
  if auth.uid() is null or role_name is null or role_name not in ('admin','asesora') then
   raise exception 'Solo el equipo autorizado puede editar PRE-XV.' using errcode='42501';
  end if;
 end if;
 if new.prexv_componentes is null then
  if new.prexv_fotografo_agendado or new.prexv_maquilladora_agendada or new.prexv_locacion_confirmada then
   raise exception 'Selecciona primero los componentes PRE-XV contratados.';
  end if;
  return new;
 end if;
 if cardinality(new.prexv_componentes)>0 and new.fecha_pre_xv is null then
  raise exception 'Indica la fecha de sesión PRE-XV.';
 end if;
 if TG_OP='UPDATE' then
  -- A prior reservation must be reconfirmed after a provider or date changes.
  if new.fecha_pre_xv is distinct from old.fecha_pre_xv then
   new.prexv_fotografo_agendado:=false; new.prexv_maquilladora_agendada:=false; new.prexv_locacion_confirmada:=false;
  end if;
  if new.prexv_fotografo is distinct from old.prexv_fotografo or new.fecha_fotografia is distinct from old.fecha_fotografia or not coalesce(old.prexv_componentes @> array['fotos'],false) then new.prexv_fotografo_agendado:=false; end if;
  if new.prexv_maquilladora is distinct from old.prexv_maquilladora or new.fecha_maquillaje is distinct from old.fecha_maquillaje or not coalesce(old.prexv_componentes @> array['maquillaje'],false) then new.prexv_maquilladora_agendada:=false; end if;
  if new.prexv_locacion is distinct from old.prexv_locacion or not coalesce(old.prexv_componentes @> array['locacion'],false) then new.prexv_locacion_confirmada:=false; end if;
 end if;
 if not (new.prexv_componentes @> array['fotos']) then new.prexv_fotografo_agendado:=false; end if;
 if not (new.prexv_componentes @> array['maquillaje']) then new.prexv_maquilladora_agendada:=false; end if;
 if not (new.prexv_componentes @> array['locacion']) then new.prexv_locacion_confirmada:=false; end if;
 if new.prexv_fotografo_agendado and nullif(btrim(new.prexv_fotografo),'') is null then raise exception 'Indica el nombre del fotógrafo antes de confirmar.'; end if;
 if new.prexv_maquilladora_agendada and nullif(btrim(new.prexv_maquilladora),'') is null then raise exception 'Indica el nombre de la maquilladora antes de confirmar.'; end if;
 if new.prexv_locacion_confirmada and nullif(btrim(new.prexv_locacion),'') is null then raise exception 'Indica la locación antes de confirmar.'; end if;
 return new;
end $$;
create trigger validar_prexv before insert or update on public.contratos for each row execute function private.validar_prexv();

-- Source migration: 20260915153559_prexv_proteger_reprogramaciones.sql
-- Protect booking dates as well as supplier assignments.
create or replace function private.validar_prexv() returns trigger language plpgsql security invoker set search_path = '' as $$
declare changed boolean; role_name text;
begin
 if TG_OP='INSERT' then
  changed := new.prexv_componentes is not null or new.prexv_fotografo_agendado or new.prexv_maquilladora_agendada or new.prexv_locacion_confirmada;
 else
  changed := row(new.prexv_componentes,new.prexv_fotografo,new.prexv_maquilladora,new.prexv_locacion,new.prexv_fotografo_agendado,new.prexv_maquilladora_agendada,new.prexv_locacion_confirmada)
   is distinct from row(old.prexv_componentes,old.prexv_fotografo,old.prexv_maquilladora,old.prexv_locacion,old.prexv_fotografo_agendado,old.prexv_maquilladora_agendada,old.prexv_locacion_confirmada);
 end if;
 -- Existing public signature flow may still update signature fields, never logistics.
 if changed and current_user in ('anon','authenticated') then
  role_name := private.current_profile_role();
  if auth.uid() is null or role_name is null or role_name not in ('admin','asesora') then
   raise exception 'Solo el equipo autorizado puede editar PRE-XV.' using errcode='42501';
  end if;
 end if;
 if TG_OP='UPDATE' and new.prexv_componentes is not null and row(new.fecha_pre_xv,new.fecha_fotografia,new.fecha_maquillaje) is distinct from row(old.fecha_pre_xv,old.fecha_fotografia,old.fecha_maquillaje) and current_user in ('anon','authenticated') then
  role_name:=private.current_profile_role();
  if auth.uid() is null or role_name is null or role_name not in ('admin','asesora') then raise exception 'Solo el equipo autorizado puede reprogramar PRE-XV.' using errcode='42501'; end if;
 end if;
 if new.prexv_componentes is null then
  if new.prexv_fotografo_agendado or new.prexv_maquilladora_agendada or new.prexv_locacion_confirmada then
   raise exception 'Selecciona primero los componentes PRE-XV contratados.';
  end if;
  return new;
 end if;
 if cardinality(new.prexv_componentes)>0 and new.fecha_pre_xv is null then
  raise exception 'Indica la fecha de sesión PRE-XV.';
 end if;
 if TG_OP='UPDATE' then
  -- A prior reservation must be reconfirmed after a provider or date changes.
  if new.fecha_pre_xv is distinct from old.fecha_pre_xv then
   new.prexv_fotografo_agendado:=false; new.prexv_maquilladora_agendada:=false; new.prexv_locacion_confirmada:=false;
  end if;
  if new.prexv_fotografo is distinct from old.prexv_fotografo or new.fecha_fotografia is distinct from old.fecha_fotografia or not coalesce(old.prexv_componentes @> array['fotos'],false) then new.prexv_fotografo_agendado:=false; end if;
  if new.prexv_maquilladora is distinct from old.prexv_maquilladora or new.fecha_maquillaje is distinct from old.fecha_maquillaje or not coalesce(old.prexv_componentes @> array['maquillaje'],false) then new.prexv_maquilladora_agendada:=false; end if;
  if new.prexv_locacion is distinct from old.prexv_locacion or not coalesce(old.prexv_componentes @> array['locacion'],false) then new.prexv_locacion_confirmada:=false; end if;
 end if;
 if not (new.prexv_componentes @> array['fotos']) then new.prexv_fotografo_agendado:=false; end if;
 if not (new.prexv_componentes @> array['maquillaje']) then new.prexv_maquilladora_agendada:=false; end if;
 if not (new.prexv_componentes @> array['locacion']) then new.prexv_locacion_confirmada:=false; end if;
 if new.prexv_fotografo_agendado and nullif(btrim(new.prexv_fotografo),'') is null then raise exception 'Indica el nombre del fotógrafo antes de confirmar.'; end if;
 if new.prexv_maquilladora_agendada and nullif(btrim(new.prexv_maquilladora),'') is null then raise exception 'Indica el nombre de la maquilladora antes de confirmar.'; end if;
 if new.prexv_locacion_confirmada and nullif(btrim(new.prexv_locacion),'') is null then raise exception 'Indica la locación antes de confirmar.'; end if;
 return new;
end $$;

-- Retain other roles' existing access; Accounting can only read its own profile.
create policy contabilidad_perfil_propio on public.profiles as restrictive for select to authenticated
 using ((select private.current_profile_role()) is distinct from 'contabilidad' or id=(select auth.uid()));
-- Replace the former unrestricted financial/storage access with COPIA's scoped access.
drop policy "Permitir todo en devoluciones_depositos" on public.devoluciones_depositos;
revoke all on public.devoluciones_depositos from anon;
grant select on public.devoluciones_depositos to authenticated;
drop policy "Acceso publico comprobantes" on storage.objects;
update storage.buckets set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'] where id='comprobantes_depositos';
-- Historical receipts used public URLs rather than contract-prefixed paths.
create policy deposito_comprobante_historico_leer on storage.objects for select to authenticated
 using (bucket_id='comprobantes_depositos' and exists(
  select 1 from public.devoluciones_depositos d where private.acceso_deposito(d.contrato_id)
  and (d.comprobante_path=name or d.comprobante_url like '%/storage/v1/object/public/comprobantes_depositos/'||name)
 ));
-- Preserve existing cross-site saved-record permissions, but prevent newly added
-- PRE-XV operations from bypassing the calendar API's site check via the Data API.
create function private.validar_sede_prexv() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='authenticated' and (TG_OP='INSERT' or row(new.prexv_componentes,new.prexv_fotografo,new.prexv_maquilladora,new.prexv_locacion,new.prexv_fotografo_agendado,new.prexv_maquilladora_agendada,new.prexv_locacion_confirmada,new.fecha_pre_xv,new.fecha_fotografia,new.fecha_maquillaje)
 is distinct from row(old.prexv_componentes,old.prexv_fotografo,old.prexv_maquilladora,old.prexv_locacion,old.prexv_fotografo_agendado,old.prexv_maquilladora_agendada,old.prexv_locacion_confirmada,old.fecha_pre_xv,old.fecha_fotografia,old.fecha_maquillaje))
 and new.prexv_componentes is not null then
  if private.current_profile_role() is distinct from 'admin'
   and coalesce((auth.jwt()->'app_metadata'->>'can_edit_saved_records')::boolean,false) is not true
   and (private.current_profile_sede_id() is null or new.sede_id is distinct from private.current_profile_sede_id()) then
    raise exception 'No tienes acceso a PRE-XV de esta sede.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.validar_sede_prexv() from public,anon,authenticated;
create trigger validar_sede_prexv before insert or update on public.contratos for each row execute function private.validar_sede_prexv();
notify pgrst,'reload schema';
