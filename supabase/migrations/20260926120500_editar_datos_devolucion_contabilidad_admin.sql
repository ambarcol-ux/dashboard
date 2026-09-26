create or replace function private.editar_datos_devolucion(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  u public.profiles%rowtype;
  s public.solicitudes_depositos%rowtype;
  oid uuid := nullif(p_datos->>'id','')::uuid;
  v_banco text := nullif(btrim(p_datos->>'banco'),'');
  v_tipo_cuenta text := nullif(btrim(p_datos->>'tipo_cuenta'),'');
  v_cuenta text := nullif(btrim(p_datos->>'cuenta'),'');
  v_titular text := nullif(btrim(p_datos->>'titular'),'');
  v_observaciones text := nullif(btrim(p_datos->>'observaciones'),'');
  detalle text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;

  select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
  if not found or lower(btrim(coalesce(u.rol,''))) not in ('admin','contabilidad') then
    raise exception 'Solo Administrador o Contabilidad pueden editar los datos de devolución.' using errcode='42501';
  end if;

  if oid is null then raise exception 'Solicitud no válida.'; end if;

  select * into s from public.solicitudes_depositos where id=oid for update;
  if not found then raise exception 'Solicitud no encontrada.'; end if;
  if not private.acceso_deposito(s.contrato_id) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;

  if lower(btrim(coalesce(u.rol,'')))='contabilidad' and s.estado in ('pagado','devuelto','cancelado') then
    raise exception 'Contabilidad no puede editar una devolución ya pagada, devuelta o cancelada.' using errcode='42501';
  end if;

  if s.metodo='Transferencia' and (v_banco is null or v_tipo_cuenta is null or v_cuenta is null or v_titular is null) then
    raise exception 'Completa banco, tipo de cuenta, número de cuenta y titular.';
  end if;

  if row(s.banco,s.tipo_cuenta,s.cuenta,s.titular,s.observaciones)
     is not distinct from row(v_banco,v_tipo_cuenta,v_cuenta,v_titular,v_observaciones) then
    return jsonb_build_object('id',oid,'sin_cambios',true);
  end if;

  detalle := concat_ws(' | ',
    case when s.banco is distinct from v_banco then 'Banco: '||coalesce(s.banco,'(vacío)')||' → '||coalesce(v_banco,'(vacío)') end,
    case when s.tipo_cuenta is distinct from v_tipo_cuenta then 'Tipo de cuenta: '||coalesce(s.tipo_cuenta,'(vacío)')||' → '||coalesce(v_tipo_cuenta,'(vacío)') end,
    case when s.cuenta is distinct from v_cuenta then 'Cuenta: '||coalesce(s.cuenta,'(vacío)')||' → '||coalesce(v_cuenta,'(vacío)') end,
    case when s.titular is distinct from v_titular then 'Titular: '||coalesce(s.titular,'(vacío)')||' → '||coalesce(v_titular,'(vacío)') end,
    case when s.observaciones is distinct from v_observaciones then 'Observaciones actualizadas' end
  );

  update public.solicitudes_depositos
  set banco=v_banco,tipo_cuenta=v_tipo_cuenta,cuenta=v_cuenta,titular=v_titular,observaciones=v_observaciones
  where id=oid;

  insert into public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle)
  values (oid,s.estado,u.id,coalesce(u.nombre,u.email),'Datos de devolución editados. '||detalle);

  return jsonb_build_object('id',oid,'ok',true);
end
$$;

revoke all on function private.editar_datos_devolucion(jsonb) from public,anon,authenticated;

create or replace function public.editar_datos_devolucion(p_datos jsonb)
returns jsonb
language sql
security invoker
set search_path=''
as $$ select private.editar_datos_devolucion(p_datos); $$;

revoke all on function public.editar_datos_devolucion(jsonb) from public,anon;
grant execute on function public.editar_datos_devolucion(jsonb) to authenticated;

notify pgrst,'reload schema';