-- Contabilidad: recepción y trazabilidad; contratos completos siguen restringidos.
create function private.contratos_depositos_contabilidad() returns table (id uuid, numero_contrato text, numero_factura text, cliente_nombre text, cliente_documento text, valor_deposito numeric, sede text, sede_id uuid, estado text, cliente_whatsapp text, whatsapp text, created_at timestamptz, banco_deposito text, tipo_cuenta_deposito text, numero_cuenta_deposito text, titular_cuenta_deposito text) language sql stable security definer set search_path='' as $$
select c.id,c.numero_contrato,c.numero_factura,c.cliente_nombre,c.cliente_documento,c.valor_deposito,c.sede,c.sede_id,c.estado,c.cliente_whatsapp,c.whatsapp,c.created_at,c.banco_deposito,c.tipo_cuenta_deposito,c.numero_cuenta_deposito,c.titular_cuenta_deposito from public.contratos c
where exists(select 1 from public.profiles p where p.id=auth.uid() and lower(btrim(p.rol))='contabilidad' and coalesce(p.activo,true)) order by c.id;
$$;
create function public.contratos_depositos_contabilidad() returns table (id uuid, numero_contrato text, numero_factura text, cliente_nombre text, cliente_documento text, valor_deposito numeric, sede text, sede_id uuid, estado text, cliente_whatsapp text, whatsapp text, created_at timestamptz, banco_deposito text, tipo_cuenta_deposito text, numero_cuenta_deposito text, titular_cuenta_deposito text) language sql stable security invoker set search_path='' as $$ select * from private.contratos_depositos_contabilidad(); $$;
revoke all on function private.contratos_depositos_contabilidad(),public.contratos_depositos_contabilidad() from public,anon;
grant execute on function private.contratos_depositos_contabilidad(),public.contratos_depositos_contabilidad() to authenticated;
CREATE OR REPLACE FUNCTION private.gestionar_deposito(p_accion text, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if private.es_contabilidad() and (p_accion is null or p_accion not in ('ingreso','soporte','proceso','pagar','cancelar')) then raise exception 'Contabilidad puede registrar ingresos, comprobantes y procesar devoluciones.' using errcode='42501'; end if;
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
end $function$
;
drop policy contabilidad_bandeja_exclusiva on public.movimientos_depositos;
create policy contabilidad_no_insert_directo on public.movimientos_depositos as restrictive for insert to authenticated  with check (not private.es_contabilidad());
create policy contabilidad_no_update_directo on public.movimientos_depositos as restrictive for update to authenticated using (not private.es_contabilidad()) with check (not private.es_contabilidad());
create policy contabilidad_no_delete_directo on public.movimientos_depositos as restrictive for delete to authenticated using (not private.es_contabilidad()) ;
drop policy contabilidad_bandeja_exclusiva on public.devoluciones_depositos;
create policy contabilidad_no_insert_directo on public.devoluciones_depositos as restrictive for insert to authenticated  with check (not private.es_contabilidad());
create policy contabilidad_no_update_directo on public.devoluciones_depositos as restrictive for update to authenticated using (not private.es_contabilidad()) with check (not private.es_contabilidad());
create policy contabilidad_no_delete_directo on public.devoluciones_depositos as restrictive for delete to authenticated using (not private.es_contabilidad()) ;
drop policy contabilidad_bandeja_exclusiva on public.soportes_depositos_anteriores;
create policy contabilidad_no_insert_directo on public.soportes_depositos_anteriores as restrictive for insert to authenticated  with check (not private.es_contabilidad());
create policy contabilidad_no_update_directo on public.soportes_depositos_anteriores as restrictive for update to authenticated using (not private.es_contabilidad()) with check (not private.es_contabilidad());
create policy contabilidad_no_delete_directo on public.soportes_depositos_anteriores as restrictive for delete to authenticated using (not private.es_contabilidad()) ;
drop policy contabilidad_solicitudes_pendientes on public.solicitudes_depositos;
drop policy contabilidad_historial_pendiente on public.historial_solicitudes_depositos;
create function private.comprobante_contabilidad(p_path text,p_historico boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and lower(btrim(p.rol))='contabilidad' and coalesce(p.activo,true))
 and (exists(select 1 from public.contratos c where c.id::text=split_part(p_path,'/',1))
 or (p_historico and exists(select 1 from public.devoluciones_depositos d where d.comprobante_path=p_path or d.comprobante_url like '%/storage/v1/object/public/comprobantes_depositos/'||p_path)));
$$;
revoke all on function private.comprobante_contabilidad(text,boolean) from public,anon;
grant execute on function private.comprobante_contabilidad(text,boolean) to authenticated;
alter policy contabilidad_comprobantes_pendientes on storage.objects using (not private.es_contabilidad() or (bucket_id='comprobantes_depositos' and private.comprobante_contabilidad(name,true)));
alter policy contabilidad_comprobante_salida on storage.objects with check (not private.es_contabilidad() or (bucket_id='comprobantes_depositos' and private.comprobante_contabilidad(name,false)));
alter policy contabilidad_leer_comprobante_pendiente on storage.objects using (bucket_id='comprobantes_depositos' and private.comprobante_contabilidad(name,true));
alter policy contabilidad_subir_comprobante_asignado on storage.objects with check (bucket_id='comprobantes_depositos' and private.comprobante_contabilidad(name,false));
notify pgrst,'reload schema';
