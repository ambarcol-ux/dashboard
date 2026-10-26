-- Depósitos: cédula del titular en la solicitud de devolución; la asesora líder (permiso) edita los datos mientras esté Pendiente; validación de campos.
alter table public.solicitudes_depositos add column if not exists titular_cedula text;

-- La solicitud guarda también la cédula del titular (se ajusta solo el insert de gestionar_deposito).
do $do$ declare d text:=pg_get_functiondef('private.gestionar_deposito'::regproc); begin
 if position('titular_cedula' in d)=0 then
  d:=replace(d,'solicitante_nombre,banco,tipo_cuenta,cuenta,titular)','solicitante_nombre,banco,tipo_cuenta,cuenta,titular,titular_cedula)');
  d:=replace(d,'p_datos->>''cuenta'',p_datos->>''titular'') returning * into s;','p_datos->>''cuenta'',p_datos->>''titular'',nullif(regexp_replace(coalesce(p_datos->>''titular_cedula'',''''),''\D'','''',''g''),'''')) returning * into s;');
  execute d;
 end if;
end $do$;

insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden) values
 ('depositos.editar_datos_devolucion','Depósitos','Editar datos de devolución','Titular, cédula, banco, tipo y número de cuenta mientras la solicitud está Pendiente',false,60)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso) select r,'depositos.editar_datos_devolucion' from unnest(array['admin','contabilidad','asesora_lider']) r on conflict do nothing;

create or replace function private.editar_datos_devolucion(p_datos jsonb) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 u public.profiles%rowtype; s public.solicitudes_depositos%rowtype; rol text;
 oid uuid:=nullif(p_datos->>'id','')::uuid;
 v_banco text:=nullif(btrim(p_datos->>'banco'),''); v_tipo_cuenta text:=nullif(btrim(p_datos->>'tipo_cuenta'),'');
 v_cuenta text:=nullif(btrim(p_datos->>'cuenta'),''); v_titular text:=nullif(btrim(p_datos->>'titular'),'');
 v_cedula text:=nullif(regexp_replace(coalesce(p_datos->>'titular_cedula',''),'\D','','g'),'');
 v_observaciones text:=nullif(btrim(p_datos->>'observaciones'),''); detalle text;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 rol:=lower(btrim(coalesce(u.rol,'')));
 if u.id is null or not (rol in ('admin','contabilidad') or private.tiene_permiso('depositos.editar_datos_devolucion')) then
  raise exception 'No tienes permiso para editar los datos de devolución.' using errcode='42501'; end if;
 if oid is null then raise exception 'Solicitud no válida.'; end if;
 select * into s from public.solicitudes_depositos where id=oid for update;
 if not found then raise exception 'Solicitud no encontrada.'; end if;
 if not private.acceso_deposito(s.contrato_id) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 if rol='contabilidad' and s.estado in ('pagado','devuelto','cancelado') then raise exception 'Contabilidad no puede editar una devolución ya pagada, devuelta o cancelada.' using errcode='42501'; end if;
 if rol not in ('admin','contabilidad') and s.estado<>'pendiente' then raise exception 'Solo se pueden editar solicitudes en Pendiente de devolución.' using errcode='42501'; end if;
 if s.metodo='Transferencia' then
  if v_banco is null or v_tipo_cuenta is null or v_cuenta is null or v_titular is null or v_cedula is null then raise exception 'Completa titular, cédula, banco, tipo y número de cuenta.'; end if;
  if v_tipo_cuenta not in ('Ahorros','Corriente') then raise exception 'El tipo de cuenta debe ser Ahorros o Corriente.'; end if;
  if v_cuenta !~ '^[0-9][0-9 -]{3,29}$' then raise exception 'El número de cuenta solo lleva números (y guiones).'; end if;
  if v_cedula !~ '^[0-9]{5,15}$' then raise exception 'La cédula del titular debe tener entre 5 y 15 números.'; end if;
 end if;
 if row(s.banco,s.tipo_cuenta,s.cuenta,s.titular,s.titular_cedula,s.observaciones) is not distinct from row(v_banco,v_tipo_cuenta,v_cuenta,v_titular,v_cedula,v_observaciones) then
  return jsonb_build_object('id',oid,'sin_cambios',true); end if;
 detalle:=concat_ws(' | ',
  case when s.banco is distinct from v_banco then 'Banco: '||coalesce(s.banco,'(vacío)')||' → '||coalesce(v_banco,'(vacío)') end,
  case when s.tipo_cuenta is distinct from v_tipo_cuenta then 'Tipo de cuenta: '||coalesce(s.tipo_cuenta,'(vacío)')||' → '||coalesce(v_tipo_cuenta,'(vacío)') end,
  case when s.cuenta is distinct from v_cuenta then 'Cuenta: '||coalesce(s.cuenta,'(vacío)')||' → '||coalesce(v_cuenta,'(vacío)') end,
  case when s.titular is distinct from v_titular then 'Titular: '||coalesce(s.titular,'(vacío)')||' → '||coalesce(v_titular,'(vacío)') end,
  case when s.titular_cedula is distinct from v_cedula then 'Cédula: '||coalesce(s.titular_cedula,'(vacío)')||' → '||coalesce(v_cedula,'(vacío)') end,
  case when s.observaciones is distinct from v_observaciones then 'Observaciones actualizadas' end);
 update public.solicitudes_depositos set banco=v_banco,tipo_cuenta=v_tipo_cuenta,cuenta=v_cuenta,titular=v_titular,titular_cedula=v_cedula,observaciones=v_observaciones where id=oid;
 insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle) values(oid,s.estado,u.id,coalesce(u.nombre,u.email),'Datos de devolución editados. '||detalle);
 return jsonb_build_object('id',oid,'ok',true);
end $function$;
