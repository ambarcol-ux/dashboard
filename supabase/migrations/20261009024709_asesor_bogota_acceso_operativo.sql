create table private.accesos_operativos_sede(usuario_id uuid primary key references public.profiles(id), sede_id uuid not null references public.sedes(id));
alter table private.accesos_operativos_sede enable row level security;
revoke all on private.accesos_operativos_sede from public,anon,authenticated;
insert into private.accesos_operativos_sede select p.id,s.id from public.profiles p join auth.users u on u.id=p.id cross join public.sedes s where lower(u.email)='asesor1bogotaambar@gmail.com' and s.nombre='Bogotá';
do $$ begin if (select count(*) from private.accesos_operativos_sede)<>1 then raise exception 'Revisa la cuenta y sede Bogotá';end if;end $$;
create function private.sede_operativa_limitada() returns uuid language sql stable security definer set search_path='' as $$ select sede_id from private.accesos_operativos_sede where usuario_id=auth.uid(); $$;
revoke all on function private.sede_operativa_limitada() from public,anon;
grant execute on function private.sede_operativa_limitada() to authenticated;
update public.profiles p set rol='asesora',sede_id=a.sede_id from private.accesos_operativos_sede a where a.usuario_id=p.id;
create policy operaciones_sede_limitada on public.arreglos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=arreglos.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=arreglos.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.asesoras as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (sede_id=(select private.sede_operativa_limitada()))) with check ((select private.sede_operativa_limitada()) is null or (sede_id=(select private.sede_operativa_limitada())));
create policy operaciones_no_insert on public.asesoras as restrictive for insert to authenticated with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_update on public.asesoras as restrictive for update to authenticated using ((select private.sede_operativa_limitada()) is null) with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_delete on public.asesoras as restrictive for delete to authenticated using ((select private.sede_operativa_limitada()) is null);
create policy operaciones_sede_limitada on public.auditoria_montos_deposito as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=auditoria_montos_deposito.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=auditoria_montos_deposito.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.bitacora_cambios as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=bitacora_cambios.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=bitacora_cambios.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.bitacora_citas as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.citas p where p.id=bitacora_citas.cita_id))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.citas p where p.id=bitacora_citas.cita_id)));
create policy operaciones_sede_limitada on public.bitacora_contratos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=bitacora_contratos.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=bitacora_contratos.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.bitacora_eliminaciones_contrato as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=bitacora_eliminaciones_contrato.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=bitacora_eliminaciones_contrato.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.bitacora_pedidos_estrene as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.pedidos_alquiler_estrene p where p.id=bitacora_pedidos_estrene.pedido_id))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.pedidos_alquiler_estrene p where p.id=bitacora_pedidos_estrene.pedido_id)));
create policy operaciones_sede_limitada on public.bitacora_vestidos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.vestidos v where v.id=bitacora_vestidos.vestido_id and v.sede_actual_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.vestidos v where v.id=bitacora_vestidos.vestido_id and v.sede_actual_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.cierres_mensuales_aliados as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (false)) with check ((select private.sede_operativa_limitada()) is null or (false));
create policy operaciones_sede_limitada on public.citas as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (sede_id=(select private.sede_operativa_limitada()))) with check ((select private.sede_operativa_limitada()) is null or (sede_id=(select private.sede_operativa_limitada())));
create policy operaciones_sede_limitada on public.codigos_descuento as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=codigos_descuento.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=codigos_descuento.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.config_escalas as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (true)) with check ((select private.sede_operativa_limitada()) is null or (true));
create policy operaciones_no_insert on public.config_escalas as restrictive for insert to authenticated with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_update on public.config_escalas as restrictive for update to authenticated using ((select private.sede_operativa_limitada()) is null) with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_delete on public.config_escalas as restrictive for delete to authenticated using ((select private.sede_operativa_limitada()) is null);
create policy operaciones_sede_limitada on public.contrato_items_vestidos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=contrato_items_vestidos.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=contrato_items_vestidos.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.contratos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (sede_id=(select private.sede_operativa_limitada()))) with check ((select private.sede_operativa_limitada()) is null or (sede_id=(select private.sede_operativa_limitada())));
create policy operaciones_sede_limitada on public.control_horarios as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (sede_id=(select private.sede_operativa_limitada()))) with check ((select private.sede_operativa_limitada()) is null or (sede_id=(select private.sede_operativa_limitada())));
create policy operaciones_sede_limitada on public.devoluciones_depositos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=devoluciones_depositos.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=devoluciones_depositos.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.entregas_bitacora as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=entregas_bitacora.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=entregas_bitacora.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.historial_cambios_contrato as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=historial_cambios_contrato.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=historial_cambios_contrato.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.historial_solicitudes_depositos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.solicitudes_depositos p where p.id=historial_solicitudes_depositos.solicitud_id))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.solicitudes_depositos p where p.id=historial_solicitudes_depositos.solicitud_id)));
create policy operaciones_sede_limitada on public.mantenimiento_bitacora as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=mantenimiento_bitacora.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=mantenimiento_bitacora.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.mantenimiento_vestidos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=mantenimiento_vestidos.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=mantenimiento_vestidos.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.metas as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or ((tipo='sede' and identificador_id::text=(select private.sede_operativa_limitada())::text) or (tipo='asesora' and identificador_id::text=auth.uid()::text))) with check ((select private.sede_operativa_limitada()) is null or ((tipo='sede' and identificador_id::text=(select private.sede_operativa_limitada())::text) or (tipo='asesora' and identificador_id::text=auth.uid()::text)));
create policy operaciones_no_insert on public.metas as restrictive for insert to authenticated with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_update on public.metas as restrictive for update to authenticated using ((select private.sede_operativa_limitada()) is null) with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_delete on public.metas as restrictive for delete to authenticated using ((select private.sede_operativa_limitada()) is null);
create policy operaciones_sede_limitada on public.movimientos_depositos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=movimientos_depositos.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=movimientos_depositos.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.notas_contrato as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=notas_contrato.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=notas_contrato.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.pagos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=pagos.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=pagos.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.pedidos_alquiler_estrene as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=pedidos_alquiler_estrene.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=pedidos_alquiler_estrene.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.plantillas_contratos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (true)) with check ((select private.sede_operativa_limitada()) is null or (true));
create policy operaciones_no_insert on public.plantillas_contratos as restrictive for insert to authenticated with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_update on public.plantillas_contratos as restrictive for update to authenticated using ((select private.sede_operativa_limitada()) is null) with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_delete on public.plantillas_contratos as restrictive for delete to authenticated using ((select private.sede_operativa_limitada()) is null);
create policy operaciones_sede_limitada on public.prestamos_vestidos_sedes as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.vestidos v where v.id=prestamos_vestidos_sedes.vestido_id and v.sede_actual_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.vestidos v where v.id=prestamos_vestidos_sedes.vestido_id and v.sede_actual_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.primeras_citas as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (sede_id=(select private.sede_operativa_limitada()))) with check ((select private.sede_operativa_limitada()) is null or (sede_id=(select private.sede_operativa_limitada())));
create policy operaciones_sede_limitada on public.primeras_citas_historial as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.primeras_citas p where p.id=primeras_citas_historial.cita_id and p.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.primeras_citas p where p.id=primeras_citas_historial.cita_id and p.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.primeras_citas_mensajes as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.primeras_citas p where p.id=primeras_citas_mensajes.cita_id and p.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.primeras_citas p where p.id=primeras_citas_mensajes.cita_id and p.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.primeras_citas_seguimientos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.primeras_citas p where p.id=primeras_citas_seguimientos.cita_id and p.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.primeras_citas p where p.id=primeras_citas_seguimientos.cita_id and p.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.profiles as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (sede_id=(select private.sede_operativa_limitada()))) with check ((select private.sede_operativa_limitada()) is null or (sede_id=(select private.sede_operativa_limitada())));
create policy operaciones_no_insert on public.profiles as restrictive for insert to authenticated with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_update on public.profiles as restrictive for update to authenticated using ((select private.sede_operativa_limitada()) is null) with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_delete on public.profiles as restrictive for delete to authenticated using ((select private.sede_operativa_limitada()) is null);
create policy operaciones_sede_limitada on public.referidores as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (sede_origen='Bogotá')) with check ((select private.sede_operativa_limitada()) is null or (sede_origen='Bogotá'));
create policy operaciones_no_insert on public.referidores as restrictive for insert to authenticated with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_update on public.referidores as restrictive for update to authenticated using ((select private.sede_operativa_limitada()) is null) with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_delete on public.referidores as restrictive for delete to authenticated using ((select private.sede_operativa_limitada()) is null);
create policy operaciones_sede_limitada on public.sedes as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (id=(select private.sede_operativa_limitada()))) with check ((select private.sede_operativa_limitada()) is null or (id=(select private.sede_operativa_limitada())));
create policy operaciones_no_insert on public.sedes as restrictive for insert to authenticated with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_update on public.sedes as restrictive for update to authenticated using ((select private.sede_operativa_limitada()) is null) with check ((select private.sede_operativa_limitada()) is null);
create policy operaciones_no_delete on public.sedes as restrictive for delete to authenticated using ((select private.sede_operativa_limitada()) is null);
create policy operaciones_sede_limitada on public.solicitudes_depositos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=solicitudes_depositos.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=solicitudes_depositos.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.soportes_depositos_anteriores as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=soportes_depositos_anteriores.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=soportes_depositos_anteriores.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.traslados_bitacora as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.vestidos v where v.id=traslados_bitacora.vestido_id and v.sede_actual_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.vestidos v where v.id=traslados_bitacora.vestido_id and v.sede_actual_id=(select private.sede_operativa_limitada()))));
create policy operaciones_sede_limitada on public.vestidos as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (sede_actual_id=(select private.sede_operativa_limitada()))) with check ((select private.sede_operativa_limitada()) is null or (sede_actual_id=(select private.sede_operativa_limitada())));
create policy operaciones_sede_limitada on public.vestidos_fuera_tienda as restrictive for all to authenticated using ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=vestidos_fuera_tienda.contrato_id and c.sede_id=(select private.sede_operativa_limitada())))) with check ((select private.sede_operativa_limitada()) is null or (exists(select 1 from public.contratos c where c.id=vestidos_fuera_tienda.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))));
CREATE OR REPLACE FUNCTION private.acceso_primera_cita(p_sede uuid, p_modalidad text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select ((select private.sede_operativa_limitada()) is null or p_sede=(select private.sede_operativa_limitada())) and auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.activo is true and (lower(p.rol)='admin' or (lower(p.rol)='asesora' and (p.sede_id=p_sede or p_modalidad='virtual'))));
$function$
;
create or replace view public.kpi_vestidos_populares as select v.id,v.codigo,v.nombre,count(civ.id) as total_alquileres from public.vestidos v left join public.contrato_items_vestidos civ on v.id=civ.vestido_id and ((select private.sede_operativa_limitada()) is null or exists(select 1 from public.contratos c where c.id=civ.contrato_id and c.sede_id=(select private.sede_operativa_limitada()))) where (select private.sede_operativa_limitada()) is null or v.sede_actual_id=(select private.sede_operativa_limitada()) group by v.id,v.codigo,v.nombre order by count(civ.id) desc;
create or replace view public.vista_historial_alquileres as select civ.vestido_id,c.numero_contrato,c.cliente_nombre,c.fecha_evento,c.estado as estado_contrato from public.contrato_items_vestidos civ join public.contratos c on civ.contrato_id=c.id where (select private.sede_operativa_limitada()) is null or c.sede_id=(select private.sede_operativa_limitada());
CREATE OR REPLACE FUNCTION public.validar_y_quemar_codigo(p_codigo text, p_contrato_id text)
 RETURNS TABLE(valido boolean, mensaje text, referidor_id uuid, nombre_aliado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_usado BOOLEAN;
  v_id_referidor UUID;
  v_nombre_aliado TEXT;
  v_existe BOOLEAN;
BEGIN
 IF (select private.sede_operativa_limitada()) is not null AND NOT EXISTS(SELECT 1 FROM public.contratos c WHERE (c.id::text=p_contrato_id OR c.numero_contrato=p_contrato_id) AND c.sede_id=(select private.sede_operativa_limitada())) THEN RAISE EXCEPTION 'Contrato no disponible para Bogotá.' USING ERRCODE='42501'; END IF;

  IF private.es_contabilidad() THEN RAISE EXCEPTION 'Contabilidad solo tiene acceso a depósitos y devoluciones.' USING ERRCODE = '42501'; END IF;
  -- 1. Verificar si el código existe
  SELECT EXISTS(SELECT 1 FROM codigos_descuento WHERE codigo_seguridad = p_codigo) INTO v_existe;
  
  IF NOT v_existe THEN
    valido := FALSE;
    mensaje := 'El código ingresado no existe en el sistema.';
    referidor_id := NULL;
    nombre_aliado := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 2. Verificar si ya fue utilizado
  SELECT usado, co.referidor_id 
  INTO v_usado, v_id_referidor 
  FROM codigos_descuento co 
  WHERE co.codigo_seguridad = p_codigo;
  
  IF v_usado THEN
    valido := FALSE;
    mensaje := 'Este código ya fue utilizado en otro contrato.';
    referidor_id := NULL;
    nombre_aliado := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 3. Si es válido, obtener los datos del aliado
  SELECT r.nombre_aliado INTO v_nombre_aliado FROM referidores r WHERE r.id = v_id_referidor;

  -- 4. Quemar el código amarrándolo al contrato
  UPDATE codigos_descuento 
  SET usado = TRUE, contrato_asociado_id = p_contrato_id 
  WHERE codigo_seguridad = p_codigo;

  -- 5. Retornar éxito con los datos cargados
  valido := TRUE;
  mensaje := 'Código validado y aplicado con éxito.';
  referidor_id := v_id_referidor;
  nombre_aliado := v_nombre_aliado;
  RETURN NEXT;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.validar_y_quemar_codigo(p_codigo text, p_contrato_id text, p_valor_alquiler_base numeric)
 RETURNS TABLE(valido boolean, mensaje text, referidor_id uuid, nombre_aliado text, descuento_cliente numeric, comision_aliado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_usado BOOLEAN;
  v_id_referidor UUID;
  v_nombre_aliado TEXT;
  v_existe BOOLEAN;
  v_descuento NUMERIC;
  v_comision NUMERIC;
BEGIN
 IF (select private.sede_operativa_limitada()) is not null AND NOT EXISTS(SELECT 1 FROM public.contratos c WHERE (c.id::text=p_contrato_id OR c.numero_contrato=p_contrato_id) AND c.sede_id=(select private.sede_operativa_limitada())) THEN RAISE EXCEPTION 'Contrato no disponible para Bogotá.' USING ERRCODE='42501'; END IF;

  IF private.es_contabilidad() THEN RAISE EXCEPTION 'Contabilidad solo tiene acceso a depósitos y devoluciones.' USING ERRCODE = '42501'; END IF;
  -- 1. Verificar si el código existe
  SELECT EXISTS(SELECT 1 FROM codigos_descuento WHERE codigo_seguridad = p_codigo) INTO v_existe;
  
  IF NOT v_existe THEN
    valido := FALSE;
    mensaje := 'El código ingresado no existe.';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 2. Verificar si ya fue utilizado
  SELECT usado, co.referidor_id 
  INTO v_usado, v_id_referidor 
  FROM codigos_descuento co 
  WHERE co.codigo_seguridad = p_codigo;
  
  IF v_usado THEN
    valido := FALSE;
    mensaje := 'Este código ya fue utilizado.';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 3. Obtener dinámicamente los valores desde nuestra tabla config_escalas
  SELECT ce.descuento_cliente, ce.comision_aliado
  INTO v_descuento, v_comision
  FROM config_escalas ce
  WHERE p_valor_alquiler_base >= ce.minimo 
    AND (ce.maximo IS NULL OR p_valor_alquiler_base <= ce.maximo)
  LIMIT 1;

  -- Valores por defecto si algo falla en la búsqueda
  IF v_descuento IS NULL THEN v_descuento := 0; END IF;
  IF v_comision IS NULL THEN v_comision := 0; END IF;

  -- 4. Obtener los datos del aliado
  SELECT r.nombre_aliado INTO v_nombre_aliado FROM referidores r WHERE r.id = v_id_referidor;

  -- 5. Quemar el código amarrándolo al contrato provisional
  UPDATE codigos_descuento 
  SET usado = TRUE, contrato_asociado_id = p_contrato_id 
  WHERE codigo_seguridad = p_codigo;

  -- 6. Sumar la comisión dinámica al saldo acumulado del aliado
  UPDATE referidores
  SET saldo_comisiones = saldo_comisiones + v_comision
  WHERE id = v_id_referidor;

  -- 7. Retornar todos los datos calculados para el frontend
  valido := TRUE;
  mensaje := 'Código aplicado con éxito.';
  referidor_id := v_id_referidor;
  nombre_aliado := v_nombre_aliado;
  descuento_cliente := v_descuento;
  comision_aliado := v_comision;
  RETURN NEXT;
END;
$function$
;
notify pgrst,'reload schema';
