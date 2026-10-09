create or replace function private.operador_sede_contrato(p_contrato uuid) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(
select 1 from private.accesos_operativos_sede a join public.profiles p on p.id=a.usuario_id join public.contratos c on c.id=p_contrato and c.sede_id=a.sede_id
where a.usuario_id=auth.uid() and p.activo is not false and p.sede_id=a.sede_id);
$$;
revoke all on function private.operador_sede_contrato(uuid) from public,anon;
grant execute on function private.operador_sede_contrato(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.editar_contrato_completo_admin(p_contrato uuid, p_datos jsonb, p_vestidos jsonb, p_arreglos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  c public.contratos%rowtype;
  saved public.contratos%rowtype;
  v_principal uuid;
  v_editor text;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (lower(coalesce(p.rol,'')) = 'admin' or private.operador_sede_contrato(p_contrato))
      and coalesce(p.activo,true)
  ) then
    raise exception 'Solo un administrador activo puede editar un contrato pactado.'
      using errcode='42501';
  end if;

  select * into c
  from public.contratos
  where id = p_contrato
  for update;

  if not found then
    raise exception 'Contrato no encontrado.' using errcode='P0002';
  end if;

  if private.sede_operativa_limitada() is not null and (
    (p_datos ? 'sede_id' and (p_datos->>'sede_id')::uuid is distinct from c.sede_id)
    or exists(select 1 from jsonb_to_recordset(p_vestidos) as x(vestido_id uuid)
      where not exists(select 1 from public.vestidos v where v.id=x.vestido_id and v.sede_actual_id=c.sede_id))
  ) then raise exception 'Solo puedes editar contratos y prendas de tu sede.' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_vestidos,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_vestidos,'[]'::jsonb)) = 0 then
    raise exception 'El contrato debe conservar al menos un vestido.'
      using errcode='23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_vestidos,'[]'::jsonb))
      as x(vestido_id uuid)
    where x.vestido_id is null
  ) then
    raise exception 'Hay una referencia de vestido inválida.'
      using errcode='23514';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(coalesce(p_vestidos,'[]'::jsonb))
      as x(vestido_id uuid)
  ) <> (
    select count(distinct x.vestido_id)
    from jsonb_to_recordset(coalesce(p_vestidos,'[]'::jsonb))
      as x(vestido_id uuid)
  ) then
    raise exception 'No puedes repetir el mismo vestido dentro del contrato.'
      using errcode='23514';
  end if;

  select x.vestido_id into v_principal
  from jsonb_to_recordset(p_vestidos)
    as x(vestido_id uuid, tipo_uso text, tipo text, observaciones text)
  limit 1;

  delete from public.contrato_items_vestidos
  where contrato_id = p_contrato;

  update public.contratos
  set
    numero_factura = case when p_datos ? 'numero_factura' then nullif(btrim(p_datos->>'numero_factura'),'') else c.numero_factura end,
    cliente_nombre = case when p_datos ? 'cliente_nombre' then btrim(p_datos->>'cliente_nombre') else c.cliente_nombre end,
    cliente_documento = case when p_datos ? 'cliente_documento' then nullif(btrim(p_datos->>'cliente_documento'),'') else c.cliente_documento end,
    cliente_whatsapp = case when p_datos ? 'cliente_whatsapp' then nullif(btrim(p_datos->>'cliente_whatsapp'),'') else c.cliente_whatsapp end,
    cliente_email = case when p_datos ? 'cliente_email' then nullif(btrim(p_datos->>'cliente_email'),'') else c.cliente_email end,
    cliente_direccion = case when p_datos ? 'cliente_direccion' then nullif(btrim(p_datos->>'cliente_direccion'),'') else c.cliente_direccion end,
    quinceanera_name = case when p_datos ? 'quinceanera_name' then nullif(btrim(p_datos->>'quinceanera_name'),'') else c.quinceanera_name end,
    sede = case when p_datos ? 'sede' then nullif(btrim(p_datos->>'sede'),'') else c.sede end,
    sede_id = case when p_datos ? 'sede_id' then nullif(p_datos->>'sede_id','')::uuid else c.sede_id end,
    asesora = case when p_datos ? 'asesora' then nullif(btrim(p_datos->>'asesora'),'') else c.asesora end,
    asesora_id = case when p_datos ? 'asesora_id' then nullif(p_datos->>'asesora_id','')::uuid else c.asesora_id end,
    tipo_evento = case when p_datos ? 'tipo_evento' then nullif(btrim(p_datos->>'tipo_evento'),'') else c.tipo_evento end,
    tipo_entrega = case when p_datos ? 'tipo_entrega' then nullif(btrim(p_datos->>'tipo_entrega'),'') else c.tipo_entrega end,
    fecha_evento = case when p_datos ? 'fecha_evento' then nullif(p_datos->>'fecha_evento','')::date else c.fecha_evento end,
    fecha_pre_xv = case when p_datos ? 'fecha_pre_xv' then nullif(p_datos->>'fecha_pre_xv','')::date else c.fecha_pre_xv end,
    fecha_cita_medidas = case when p_datos ? 'fecha_cita_medidas' then nullif(p_datos->>'fecha_cita_medidas','')::date else c.fecha_cita_medidas end,
    fecha_prueba_final = case when p_datos ? 'fecha_prueba_final' then nullif(p_datos->>'fecha_prueba_final','')::date else c.fecha_prueba_final end,
    fecha_entrega_envio = case when p_datos ? 'fecha_entrega_envio' then nullif(p_datos->>'fecha_entrega_envio','')::date else c.fecha_entrega_envio end,
    fecha_fotografia = case when p_datos ? 'fecha_fotografia' then nullif(p_datos->>'fecha_fotografia','')::timestamptz else c.fecha_fotografia end,
    fecha_maquillaje = case when p_datos ? 'fecha_maquillaje' then nullif(p_datos->>'fecha_maquillaje','')::timestamptz else c.fecha_maquillaje end,
    valor_total = case when p_datos ? 'valor_total' then coalesce(nullif(p_datos->>'valor_total','')::numeric,0) else c.valor_total end,
    anticipo = case when p_datos ? 'anticipo' then coalesce(nullif(p_datos->>'anticipo','')::numeric,0) else c.anticipo end,
    total_arreglos = case when p_datos ? 'total_arreglos' then coalesce(nullif(p_datos->>'total_arreglos','')::numeric,0) else c.total_arreglos end,
    banco_deposito = case when p_datos ? 'banco_deposito' then nullif(btrim(p_datos->>'banco_deposito'),'') else c.banco_deposito end,
    tipo_cuenta_deposito = case when p_datos ? 'tipo_cuenta_deposito' then nullif(btrim(p_datos->>'tipo_cuenta_deposito'),'') else c.tipo_cuenta_deposito end,
    numero_cuenta_deposito = case when p_datos ? 'numero_cuenta_deposito' then nullif(btrim(p_datos->>'numero_cuenta_deposito'),'') else c.numero_cuenta_deposito end,
    titular_cuenta_deposito = case when p_datos ? 'titular_cuenta_deposito' then nullif(btrim(p_datos->>'titular_cuenta_deposito'),'') else c.titular_cuenta_deposito end,
    accesorios = case when p_datos ? 'accesorios'
      then coalesce(array(select jsonb_array_elements_text(coalesce(p_datos->'accesorios','[]'::jsonb))), '{}'::text[])
      else c.accesorios end,
    metodos_pago = case when p_datos ? 'metodos_pago'
      then coalesce(array(select jsonb_array_elements_text(coalesce(p_datos->'metodos_pago','[]'::jsonb))), '{}'::text[])
      else c.metodos_pago end,
    prexv_componentes = case when p_datos ? 'prexv_componentes'
      then coalesce(array(select jsonb_array_elements_text(coalesce(p_datos->'prexv_componentes','[]'::jsonb))), '{}'::text[])
      else c.prexv_componentes end,
    prexv_fotografo = case when p_datos ? 'prexv_fotografo' then nullif(btrim(p_datos->>'prexv_fotografo'),'') else c.prexv_fotografo end,
    prexv_maquilladora = case when p_datos ? 'prexv_maquilladora' then nullif(btrim(p_datos->>'prexv_maquilladora'),'') else c.prexv_maquilladora end,
    prexv_locacion = case when p_datos ? 'prexv_locacion' then nullif(btrim(p_datos->>'prexv_locacion'),'') else c.prexv_locacion end,
    prexv_fotografo_agendado = case when p_datos ? 'prexv_fotografo_agendado' then coalesce((p_datos->>'prexv_fotografo_agendado')::boolean,false) else c.prexv_fotografo_agendado end,
    prexv_maquilladora_agendada = case when p_datos ? 'prexv_maquilladora_agendada' then coalesce((p_datos->>'prexv_maquilladora_agendada')::boolean,false) else c.prexv_maquilladora_agendada end,
    prexv_locacion_confirmada = case when p_datos ? 'prexv_locacion_confirmada' then coalesce((p_datos->>'prexv_locacion_confirmada')::boolean,false) else c.prexv_locacion_confirmada end,
    autoriza_uso_imagen = case when p_datos ? 'autoriza_uso_imagen' then coalesce((p_datos->>'autoriza_uso_imagen')::boolean,false) else c.autoriza_uso_imagen end,
    fechas_bloqueo_especial = case when p_datos ? 'fechas_bloqueo_especial'
      then coalesce(array(select value::date from jsonb_array_elements_text(coalesce(p_datos->'fechas_bloqueo_especial','[]'::jsonb))), '{}'::date[])
      else c.fechas_bloqueo_especial end,
    vestido_id = v_principal
  where id = p_contrato
  returning * into saved;

  insert into public.contrato_items_vestidos(
    contrato_id, vestido_id, tipo_uso, tipo, observaciones
  )
  select
    p_contrato,
    x.vestido_id,
    coalesce(nullif(x.tipo_uso,''),nullif(x.tipo,''),'XV'),
    coalesce(nullif(x.tipo,''),nullif(x.tipo_uso,''),'XV'),
    nullif(btrim(x.observaciones),'')
  from jsonb_to_recordset(p_vestidos)
    as x(vestido_id uuid, tipo_uso text, tipo text, observaciones text);

  delete from public.arreglos where contrato_id = p_contrato;

  if jsonb_typeof(coalesce(p_arreglos,'[]'::jsonb)) = 'array' then
    insert into public.arreglos(contrato_id,tipo_arreglo,centimetros,precio)
    select
      p_contrato,
      nullif(btrim(x.tipo),''),
      nullif(btrim(x.cm),''),
      coalesce(x.precio,0)
    from jsonb_to_recordset(coalesce(p_arreglos,'[]'::jsonb))
      as x(tipo text, cm text, precio numeric)
    where nullif(btrim(x.tipo),'') is not null;
  end if;

  select coalesce(p.nombre,(select auth.uid())::text)
  into v_editor
  from public.profiles p
  where p.id = (select auth.uid())
  limit 1;

  insert into public.bitacora_contratos(
    contrato_id, accion, detalle, usuario
  ) values (
    p_contrato,
    'Edición completa de contrato',
    'Contrato pactado modificado por administrador desde la pantalla completa de contrato.',
    coalesce(v_editor,(select auth.uid())::text)
  );

  return jsonb_build_object(
    'id', saved.id,
    'numero_contrato', saved.numero_contrato,
    'estado', saved.estado
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.operacion_contrato(p_contrato_id uuid, p_accion text, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare u public.profiles%rowtype; c public.contratos%rowtype;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if not found or lower(u.rol) not in ('admin','asesora') then raise exception 'No tienes permiso para esta operación.'; end if;
 select * into c from public.contratos where id=p_contrato_id for update;
 if not found or (lower(u.rol)<>'admin' and u.sede_id is distinct from c.sede_id) then raise exception 'Contrato no disponible para tu sede.'; end if;
 if p_accion='desistir' then
  if nullif(btrim(p_motivo),'') is null then raise exception 'Indica el motivo del desistimiento.'; end if;
  if lower(coalesce(c.estado,'')) in ('cancelado','anulado','rechazado','finalizado','entregado','mantenimiento') then raise exception 'El estado actual no permite desistir. Gestiona primero el retorno si hubo entrega.'; end if;
  if exists(select 1 from public.entregas_bitacora where contrato_id=c.id and lower(coalesce(tipo_entrega,''))<>'reversion') then raise exception 'El contrato tiene entregas registradas. Gestiona primero el retorno.'; end if;
  update public.contratos set estado='cancelado' where id=c.id;
  if not found then raise exception 'No se pudo actualizar el contrato.'; end if;
  insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,'Desistimiento del contrato',btrim(p_motivo),coalesce(u.nombre,u.email));
 elsif p_accion='eliminar' then
  if lower(u.rol)<>'admin' and not private.operador_sede_contrato(c.id) then raise exception 'Solo administración puede eliminar contratos.'; end if;
  if coalesce(c.valor_deposito,0)<>0 or exists(select 1 from public.pagos where contrato_id=c.id) or exists(select 1 from public.movimientos_depositos where contrato_id=c.id) or exists(select 1 from public.devoluciones_depositos where contrato_id=c.id) or exists(select 1 from public.solicitudes_depositos where contrato_id=c.id) then raise exception 'El contrato tiene movimientos de dinero. Usa Desistir para conservar su trazabilidad.'; end if;
  delete from public.arreglos where contrato_id=c.id;
  delete from public.historial_cambios_contrato where contrato_id=c.id;
  delete from public.mantenimiento_bitacora where contrato_id=c.id;
  delete from public.mantenimiento_vestidos where contrato_id=c.id;
  delete from public.bitacora_contratos where contrato_id=c.id;
  delete from public.contratos where id=c.id;
  if not found then raise exception 'No se pudo eliminar el contrato.'; end if;
 else raise exception 'Acción no válida.';
 end if;
end $function$
;

CREATE OR REPLACE FUNCTION private.proteger_arreglos_contrato_pactado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_contrato uuid;
  v_estado text;
begin
  v_contrato := coalesce(new.contrato_id, old.contrato_id);

  if current_user not in ('anon','authenticated') then
    return coalesce(new,old);
  end if;

  select lower(coalesce(c.estado,'')) into v_estado
  from public.contratos c
  where c.id = v_contrato;

  if v_estado not in ('borrador','pendiente_admin')
     and lower(coalesce(private.current_profile_role(),'')) <> 'admin' and not private.operador_sede_contrato(v_contrato) then
    raise exception 'Solo un administrador puede modificar los arreglos de un contrato pactado.'
      using errcode='42501';
  end if;

  return coalesce(new,old);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.proteger_edicion_contrato_pactado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_role text;
begin
  if lower(coalesce(old.estado,'')) in ('borrador','pendiente_admin') then
    return new;
  end if;

  if current_user not in ('anon','authenticated') then
    return new;
  end if;

  v_role := lower(coalesce(private.current_profile_role(),''));

  if v_role = 'admin' or (private.operador_sede_contrato(old.id) and new.sede_id is not distinct from old.sede_id) then
    return new;
  end if;

  raise exception 'Solo un administrador puede modificar los datos contractuales después de pactado el contrato.'
    using errcode='42501';
end;
$function$
;

CREATE OR REPLACE FUNCTION private.proteger_prendas_contrato_pactado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_contrato uuid;
  v_estado text;
begin
  v_contrato := coalesce(new.contrato_id, old.contrato_id);

  if current_user not in ('anon','authenticated') then
    return coalesce(new,old);
  end if;

  select lower(coalesce(c.estado,'')) into v_estado
  from public.contratos c
  where c.id = v_contrato;

  if v_estado not in ('borrador','pendiente_admin')
     and lower(coalesce(private.current_profile_role(),'')) <> 'admin' and not private.operador_sede_contrato(v_contrato) then
    raise exception 'Solo un administrador puede modificar los vestidos de un contrato pactado.'
      using errcode='42501';
  end if;

  return coalesce(new,old);
end;
$function$
;
create policy operadores_sede_eliminar_contrato on public.contratos for delete to authenticated using (
private.operador_sede_contrato(id) and coalesce(valor_deposito,0)=0
and not exists(select 1 from public.pagos p where p.contrato_id=contratos.id)
and not exists(select 1 from public.movimientos_depositos m where m.contrato_id=contratos.id)
and not exists(select 1 from public.devoluciones_depositos d where d.contrato_id=contratos.id)
and not exists(select 1 from public.solicitudes_depositos s where s.contrato_id=contratos.id));
notify pgrst,'reload schema';