begin;
set local statement_timeout='45s';
set local timezone='America/Bogota';
create table if not exists public.auditoria_montos_deposito ("id" uuid default gen_random_uuid() not null, "contrato_id" uuid not null, "monto_anterior" numeric not null, "monto_nuevo" numeric not null, "motivo" text not null, "usuario_id" uuid not null, "created_at" timestamp with time zone default clock_timestamp() not null);
create table if not exists public.prestamos_vestidos_sedes ("id" uuid default gen_random_uuid() not null, "vestido_id" uuid not null, "sede_origen_id" uuid not null, "sede_destino_id" uuid not null, "fecha_desde" date not null, "fecha_hasta" date not null, "estado" text default 'solicitado'::text not null, "motivo" text, "solicitado_por" uuid not null, "aprobado_por" uuid, "created_at" timestamp with time zone default now() not null, "updated_at" timestamp with time zone default now() not null);
create table if not exists public.vestidos_fuera_tienda ("id" uuid default gen_random_uuid() not null, "contrato_id" uuid not null, "vestido_id" uuid not null, "entrega_id" uuid not null, "salida_at" timestamp with time zone not null, "regreso_at" timestamp with time zone, "dias_fuera_cierre" integer, "created_at" timestamp with time zone default now() not null);
alter table public.contratos add column if not exists finalizado_at timestamptz;
create unique index if not exists qa_fuera_abierto on public.vestidos_fuera_tienda(contrato_id,vestido_id) where regreso_at is null;
CREATE OR REPLACE FUNCTION public.contract_invoice_for_issue(contract_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE invoice text;
BEGIN
  SELECT c.numero_factura INTO invoice FROM public.contratos c WHERE c.id = contract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Contrato no disponible';
  END IF;
  IF invoice IS NULL OR btrim(invoice,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'El número de factura es obligatorio';
  END IF;
  RETURN invoice;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.finalizar_contrato_con_deposito(p_contrato uuid, p_descuento numeric, p_motivo text, p_saldo_esperado numeric, p_solicitud_esperada uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 u public.profiles%rowtype; c public.contratos%rowtype;
 s public.solicitudes_depositos%rowtype;
 disponible numeric; solicitud uuid; existente boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión.' USING ERRCODE='42501'; END IF;
 SELECT * INTO u FROM public.profiles WHERE id=auth.uid() AND coalesce(activo,true);
 IF NOT FOUND OR lower(btrim(u.rol)) NOT IN ('admin','asesora') THEN
  RAISE EXCEPTION 'No tienes permiso para finalizar contratos.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO c FROM public.contratos WHERE id=p_contrato FOR UPDATE;
 IF NOT FOUND OR (lower(btrim(u.rol))<>'admin' AND (u.sede_id IS NULL OR u.sede_id IS DISTINCT FROM c.sede_id)) THEN
  RAISE EXCEPTION 'No tienes acceso a este contrato.' USING ERRCODE='42501';
 END IF;
 IF lower(c.estado)='finalizado' THEN
  RETURN jsonb_build_object('finalizado',true,'repetido',true);
 END IF;
 IF lower(coalesce(c.estado,''))<>'mantenimiento' THEN RAISE EXCEPTION 'El contrato debe estar en mantenimiento antes de finalizar.'; END IF;
 IF coalesce(c.saldo,0)+coalesce(c.total_multas,0)>0 THEN RAISE EXCEPTION 'El contrato tiene saldo pendiente. Actualiza los datos antes de finalizar.'; END IF;
 IF nullif(btrim(c.numero_factura),'') IS NULL THEN RAISE EXCEPTION 'Registra la factura antes de finalizar.'; END IF;
 SELECT coalesce(c.valor_deposito,0)-coalesce(sum(d.monto_devuelto+coalesce(d.monto_descuento,0)),0)
 INTO disponible FROM public.devoluciones_depositos d WHERE d.contrato_id=c.id
 AND coalesce(lower(d.estado),'completado') NOT IN ('cancelado','anulado','rechazado');
 IF disponible<0 OR p_saldo_esperado IS DISTINCT FROM disponible THEN RAISE EXCEPTION 'El saldo del depósito cambió. Cierra y vuelve a abrir la confirmación.'; END IF;
 IF p_descuento IS NULL OR p_descuento::text IN ('NaN','Infinity','-Infinity') OR p_descuento<0 OR p_descuento>disponible OR p_descuento<>round(p_descuento,2) THEN
  RAISE EXCEPTION 'El descuento debe estar entre cero y el saldo disponible, con máximo dos decimales.';
 END IF;
 IF p_descuento>0 AND nullif(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Escribe el motivo del descuento.'; END IF;
 SELECT * INTO s FROM public.solicitudes_depositos
 WHERE contrato_id=c.id AND estado IN ('pendiente','en_proceso','pagado') ORDER BY created_at LIMIT 1 FOR UPDATE;
 existente:=FOUND;
 IF (CASE WHEN existente THEN s.id ELSE NULL END) IS DISTINCT FROM p_solicitud_esperada THEN
  RAISE EXCEPTION 'La solicitud de devolución cambió. Cierra y vuelve a abrir la confirmación.';
 END IF;
 IF existente AND p_descuento<>0 THEN RAISE EXCEPTION 'Ya existe una solicitud de devolución; sus importes se conservan.'; END IF;
 -- The existing trigger creates the request; all following edits are in this same transaction.
 UPDATE public.contratos SET estado='finalizado' WHERE id=c.id;
 IF NOT existente AND disponible>0 THEN
  SELECT id INTO solicitud FROM public.solicitudes_depositos
  WHERE contrato_id=c.id AND estado='pendiente' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF solicitud IS NULL THEN RAISE EXCEPTION 'No se pudo crear la solicitud de devolución. No se finalizó el contrato.'; END IF;
  UPDATE public.solicitudes_depositos SET monto=disponible-p_descuento,descuento=p_descuento,
   motivo=CASE WHEN p_descuento>0 THEN btrim(p_motivo) ELSE NULL END WHERE id=solicitud;
  INSERT INTO public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle)
  VALUES(solicitud,'pendiente',u.id,coalesce(u.nombre,u.email),
   'Cierre de contrato. Saldo del depósito: '||disponible||'. Descuento: '||p_descuento||
   '. Devolución: '||(disponible-p_descuento)||CASE WHEN p_descuento>0 THEN '. Motivo: '||btrim(p_motivo) ELSE '' END);
 ELSE solicitud:=s.id;
 END IF;
 UPDATE public.vestidos SET estado='Disponible'
 WHERE id IN (SELECT vestido_id FROM public.contrato_items_vestidos WHERE contrato_id=c.id)
    OR id=c.vestido_id;
 UPDATE public.mantenimiento_bitacora SET estado='finalizado' WHERE contrato_id=c.id AND estado<>'finalizado';
 INSERT INTO public.bitacora_cambios(contrato_id,tipo_evento,motivo,usuario_id)
 VALUES(c.id,'🔓 Liberación Manual','Cierre y liberación manual por '||coalesce(u.nombre,u.email)||
  '. Saldo depósito: '||disponible||'. Descuento registrado en este cierre: '||p_descuento||'. '||coalesce(p_motivo,''),u.id);
 RETURN jsonb_build_object('finalizado',true,'solicitud_id',solicitud,'descuento',CASE WHEN existente THEN s.descuento ELSE p_descuento END,
  'monto_devolver',CASE WHEN existente THEN s.monto ELSE disponible-p_descuento END);
END $function$
;
CREATE OR REPLACE FUNCTION public.finalizar_contrato_con_deposito(p_contrato uuid, p_descuento numeric, p_motivo text, p_saldo_esperado numeric, p_solicitud_esperada uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.finalizar_contrato_con_deposito(p_contrato,p_descuento,p_motivo,p_saldo_esperado,p_solicitud_esperada);
$function$
;
CREATE OR REPLACE FUNCTION private.gestionar_deposito_original(p_accion text, p_datos jsonb)
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
 if private.es_contabilidad() and (p_accion is null or p_accion not in ('proceso','pagar','cancelar')) then raise exception 'Contabilidad solo puede procesar devoluciones pendientes.' using errcode='42501'; end if;
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
CREATE OR REPLACE FUNCTION public.gestionar_deposito(p_accion text, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.gestionar_deposito(p_accion,p_datos); $function$
;
CREATE OR REPLACE FUNCTION private.es_contabilidad()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and lower(btrim(rol))='contabilidad');
$function$
;
CREATE OR REPLACE FUNCTION private.registrar_salida_vestidos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if lower(coalesce(new.tipo_entrega,''))<>'reversion' then
  insert into public.vestidos_fuera_tienda(contrato_id,vestido_id,entrega_id,salida_at)
  select new.contrato_id,i.vestido_id,new.id,coalesce(new.fecha_entrega_real,new.created_at,now()) from public.contrato_items_vestidos i where i.contrato_id=new.contrato_id
  on conflict(contrato_id,vestido_id) where regreso_at is null do nothing;
 end if; return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.cerrar_salida_y_solicitar_devolucion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare saldo numeric; metodo text; solicitante uuid; solicitante_nombre text; begin
 if lower(new.estado)='mantenimiento' and lower(coalesce(old.estado,''))<>'mantenimiento' then
  update public.vestidos_fuera_tienda set regreso_at=clock_timestamp(),dias_fuera_cierre=greatest(1,(clock_timestamp()::date-salida_at::date)) where contrato_id=new.id and regreso_at is null;
 end if;
 if lower(new.estado)='finalizado' and lower(coalesce(old.estado,''))<>'finalizado' then
  new.finalizado_at:=coalesce(new.finalizado_at,clock_timestamp());
  if new.finalizado_at>='2026-09-14 00:00:00-05'::timestamptz then
   select coalesce(new.valor_deposito,0)-coalesce(sum(d.monto_devuelto+coalesce(d.monto_descuento,0)),0) into saldo from public.devoluciones_depositos d where d.contrato_id=new.id and coalesce(lower(d.estado),'completado') not in ('cancelado','anulado','rechazado');
   if saldo>0 and not exists(select 1 from public.solicitudes_depositos s where s.contrato_id=new.id and s.estado in ('pendiente','en_proceso','pagado')) then
    select coalesce((select m.metodo from public.movimientos_depositos m where m.contrato_id=new.id and m.tipo='ingreso' order by m.created_at desc limit 1),'Transferencia') into metodo;
    if metodo not in ('Efectivo','Transferencia') then metodo:='Transferencia'; end if;
    select p.id,p.nombre into solicitante,solicitante_nombre from public.profiles p where p.id=(select auth.uid());
    if solicitante is not null then
     insert into public.solicitudes_depositos(id,contrato_id,monto,descuento,metodo,estado,solicitante_id,solicitante_nombre,recibido_at,banco,tipo_cuenta,cuenta,titular,observaciones)
     values(gen_random_uuid(),new.id,saldo,0,metodo,'pendiente',solicitante,coalesce(solicitante_nombre,'Usuario'),now(),new.banco_deposito,new.tipo_cuenta_deposito,new.numero_cuenta_deposito,new.titular_cuenta_deposito,'Solicitud automática al finalizar contrato');
    end if;
   end if;
  end if;
 end if; return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.assert_vestido_fecha_libre(p_contrato_id uuid, p_vestido_id uuid, p_fecha date, p_tipo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_numero_contrato text;
  v_codigo_vestido text;
  v_tipo_conflicto text;
begin
  if p_vestido_id is null or p_fecha is null then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_vestido_id::text || ':' || p_fecha::text, 0)
  );

  with links as (
    select distinct civ.contrato_id, civ.vestido_id
    from public.contrato_items_vestidos civ
    where civ.vestido_id = p_vestido_id

    union

    select c0.id, c0.vestido_id
    from public.contratos c0
    where c0.vestido_id = p_vestido_id
  )
  select
    c.numero_contrato,
    coalesce(v.codigo, p_vestido_id::text),
    case
      when p_fecha = any(coalesce(c.fechas_bloqueo_especial,'{}'::date[])) then 'FECHA ESPECIAL'
      when c.bloqueo_especial_fecha = p_fecha then 'FECHA ESPECIAL'
      when c.fecha_pre_xv = p_fecha then 'PRE-XV'
      else 'EVENTO'
    end
  into v_numero_contrato, v_codigo_vestido, v_tipo_conflicto
  from links l
  join public.contratos c on c.id = l.contrato_id
  left join public.vestidos v on v.id = l.vestido_id
  where c.id is distinct from p_contrato_id
    and (
      (
        lower(coalesce(c.estado,'')) not in ('cancelado','anulado','rechazado','borrador')
        and (c.fecha_pre_xv = p_fecha or c.fecha_evento = p_fecha)
      )
      or
      (
        lower(coalesce(c.estado,'')) not in ('cancelado','anulado','rechazado')
        and (
          p_fecha = any(coalesce(c.fechas_bloqueo_especial,'{}'::date[]))
          or c.bloqueo_especial_fecha = p_fecha
        )
      )
    )
  order by c.created_at
  limit 1;

  if found then
    raise exception 'El vestido % ya está bloqueado para % el % por % del contrato %.',
      v_codigo_vestido,
      coalesce(p_tipo,'USO'),
      to_char(p_fecha,'YYYY-MM-DD'),
      v_tipo_conflicto,
      coalesce(v_numero_contrato,'SIN NÚMERO')
      using errcode = '23514',
            hint = 'Cambia la fecha o revisa el contrato que ya tiene reservado este vestido.';
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.validar_bloqueo_fechas_contrato()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_fecha date;
begin
  if lower(coalesce(new.estado,'')) in ('cancelado','anulado','rechazado') then
    return new;
  end if;

  if cardinality(coalesce(new.fechas_bloqueo_especial,'{}'::date[])) <>
     (
       select count(distinct d)
       from unnest(coalesce(new.fechas_bloqueo_especial,'{}'::date[])) d
     ) then
    raise exception 'No puedes repetir la misma fecha especial dentro del contrato.'
      using errcode='23514';
  end if;

  for v_id in
    select distinct x.vestido_id
    from (
      select new.vestido_id as vestido_id
      union all
      select civ.vestido_id
      from public.contrato_items_vestidos civ
      where civ.contrato_id = new.id
    ) x
    where x.vestido_id is not null
  loop
    for v_fecha in
      select unnest(coalesce(new.fechas_bloqueo_especial,'{}'::date[]))
    loop
      perform private.assert_vestido_fecha_libre(new.id, v_id, v_fecha, 'FECHA ESPECIAL');
    end loop;

    if new.bloqueo_especial_fecha is not null then
      perform private.assert_vestido_fecha_libre(
        new.id, v_id, new.bloqueo_especial_fecha, 'FECHA ESPECIAL'
      );
    end if;

    if lower(coalesce(new.estado,'')) <> 'borrador' then
      perform private.assert_vestido_fecha_libre(new.id, v_id, new.fecha_pre_xv, 'PRE-XV');

      if new.fecha_evento is distinct from new.fecha_pre_xv then
        perform private.assert_vestido_fecha_libre(new.id, v_id, new.fecha_evento, 'EVENTO');
      end if;
    end if;
  end loop;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.validar_bloqueo_item_vestido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.contratos%rowtype;
  v_fecha date;
begin
  if new.vestido_id is null or new.contrato_id is null then
    return new;
  end if;

  select * into c
  from public.contratos
  where id = new.contrato_id;

  if not found then
    return new;
  end if;

  if lower(coalesce(c.estado,'')) in ('cancelado','anulado','rechazado') then
    return new;
  end if;

  for v_fecha in
    select unnest(coalesce(c.fechas_bloqueo_especial,'{}'::date[]))
  loop
    perform private.assert_vestido_fecha_libre(
      c.id, new.vestido_id, v_fecha, 'FECHA ESPECIAL'
    );
  end loop;

  if c.bloqueo_especial_fecha is not null then
    perform private.assert_vestido_fecha_libre(
      c.id, new.vestido_id, c.bloqueo_especial_fecha, 'FECHA ESPECIAL'
    );
  end if;

  if lower(coalesce(c.estado,'')) <> 'borrador' then
    perform private.assert_vestido_fecha_libre(
      c.id, new.vestido_id, c.fecha_pre_xv, 'PRE-XV'
    );

    if c.fecha_evento is distinct from c.fecha_pre_xv then
      perform private.assert_vestido_fecha_libre(
        c.id, new.vestido_id, c.fecha_evento, 'EVENTO'
      );
    end if;
  end if;

  return new;
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

  if v_role = 'admin' then
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
     and lower(coalesce(private.current_profile_role(),'')) <> 'admin' then
    raise exception 'Solo un administrador puede modificar los vestidos de un contrato pactado.'
      using errcode='42501';
  end if;

  return coalesce(new,old);
end;
$function$
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
     and lower(coalesce(private.current_profile_role(),'')) <> 'admin' then
    raise exception 'Solo un administrador puede modificar los arreglos de un contrato pactado.'
      using errcode='42501';
  end if;

  return coalesce(new,old);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.require_contract_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.numero_factura IS NULL OR btrim(NEW.numero_factura,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'El número de factura es obligatorio';
  END IF;
  RETURN NEW;
END;
$function$
;
drop trigger if exists proteger_arreglos_pactados on public.arreglos;
CREATE TRIGGER proteger_arreglos_pactados BEFORE INSERT OR DELETE OR UPDATE ON public.arreglos FOR EACH ROW EXECUTE FUNCTION private.proteger_arreglos_contrato_pactado();
drop trigger if exists bloquear_vestido_por_fechas_item on public.contrato_items_vestidos;
CREATE TRIGGER bloquear_vestido_por_fechas_item BEFORE INSERT OR UPDATE OF contrato_id, vestido_id ON public.contrato_items_vestidos FOR EACH ROW EXECUTE FUNCTION private.validar_bloqueo_item_vestido();
drop trigger if exists proteger_prendas_pactadas_delete on public.contrato_items_vestidos;
CREATE TRIGGER proteger_prendas_pactadas_delete BEFORE DELETE ON public.contrato_items_vestidos FOR EACH ROW EXECUTE FUNCTION private.proteger_prendas_contrato_pactado();
drop trigger if exists proteger_prendas_pactadas_insert on public.contrato_items_vestidos;
CREATE TRIGGER proteger_prendas_pactadas_insert BEFORE INSERT ON public.contrato_items_vestidos FOR EACH ROW EXECUTE FUNCTION private.proteger_prendas_contrato_pactado();
drop trigger if exists proteger_prendas_pactadas_update on public.contrato_items_vestidos;
CREATE TRIGGER proteger_prendas_pactadas_update BEFORE UPDATE OF contrato_id, vestido_id, tipo_uso, tipo, observaciones ON public.contrato_items_vestidos FOR EACH ROW EXECUTE FUNCTION private.proteger_prendas_contrato_pactado();
drop trigger if exists registrar_salida_vestidos on public.entregas_bitacora;
CREATE TRIGGER registrar_salida_vestidos AFTER INSERT ON public.entregas_bitacora FOR EACH ROW EXECUTE FUNCTION private.registrar_salida_vestidos();
drop trigger if exists bloquear_vestido_por_fechas_contrato on public.contratos;
CREATE TRIGGER bloquear_vestido_por_fechas_contrato BEFORE INSERT OR UPDATE OF fecha_pre_xv, fecha_evento, vestido_id, estado, fechas_bloqueo_especial, bloqueo_especial_referencia, bloqueo_especial_fecha, bloqueo_especial_vestido_id ON public.contratos FOR EACH ROW EXECUTE FUNCTION private.validar_bloqueo_fechas_contrato();
drop trigger if exists cerrar_salida_y_solicitar_devolucion on public.contratos;
CREATE TRIGGER cerrar_salida_y_solicitar_devolucion BEFORE UPDATE OF estado ON public.contratos FOR EACH ROW EXECUTE FUNCTION private.cerrar_salida_y_solicitar_devolucion();
drop trigger if exists proteger_edicion_contrato_pactado on public.contratos;
CREATE TRIGGER proteger_edicion_contrato_pactado BEFORE UPDATE OF numero_contrato, numero_factura, cliente_nombre, cliente_documento, cliente_email, cliente_whatsapp, cliente_direccion, quinceanera_name, sede, sede_id, asesora, asesora_id, tipo_evento, tipo_entrega, fecha_evento, fecha_pre_xv, fecha_cita_medidas, fecha_prueba_final, fecha_entrega_envio, fecha_retorno_prevista, fecha_fotografia, fecha_maquillaje, fechas_bloqueo_especial, valor_total, total_arreglos, observaciones_vestido, observaciones_arreglos, prexv_fotografo, prexv_maquilladora, prexv_locacion, prexv_componentes, autoriza_uso_imagen ON public.contratos FOR EACH ROW WHEN (((old.numero_contrato IS DISTINCT FROM new.numero_contrato) OR (old.numero_factura IS DISTINCT FROM new.numero_factura) OR (old.cliente_nombre IS DISTINCT FROM new.cliente_nombre) OR (old.cliente_documento IS DISTINCT FROM new.cliente_documento) OR (old.cliente_email IS DISTINCT FROM new.cliente_email) OR (old.cliente_whatsapp IS DISTINCT FROM new.cliente_whatsapp) OR (old.cliente_direccion IS DISTINCT FROM new.cliente_direccion) OR (old.quinceanera_name IS DISTINCT FROM new.quinceanera_name) OR (old.sede IS DISTINCT FROM new.sede) OR (old.sede_id IS DISTINCT FROM new.sede_id) OR (old.asesora IS DISTINCT FROM new.asesora) OR (old.asesora_id IS DISTINCT FROM new.asesora_id) OR (old.tipo_evento IS DISTINCT FROM new.tipo_evento) OR (old.tipo_entrega IS DISTINCT FROM new.tipo_entrega) OR (old.fecha_evento IS DISTINCT FROM new.fecha_evento) OR (old.fecha_pre_xv IS DISTINCT FROM new.fecha_pre_xv) OR (old.fecha_cita_medidas IS DISTINCT FROM new.fecha_cita_medidas) OR (old.fecha_prueba_final IS DISTINCT FROM new.fecha_prueba_final) OR (old.fecha_entrega_envio IS DISTINCT FROM new.fecha_entrega_envio) OR (old.fecha_retorno_prevista IS DISTINCT FROM new.fecha_retorno_prevista) OR (old.fecha_fotografia IS DISTINCT FROM new.fecha_fotografia) OR (old.fecha_maquillaje IS DISTINCT FROM new.fecha_maquillaje) OR (old.fechas_bloqueo_especial IS DISTINCT FROM new.fechas_bloqueo_especial) OR (old.valor_total IS DISTINCT FROM new.valor_total) OR (old.total_arreglos IS DISTINCT FROM new.total_arreglos) OR (old.observaciones_vestido IS DISTINCT FROM new.observaciones_vestido) OR (old.observaciones_arreglos IS DISTINCT FROM new.observaciones_arreglos) OR (old.prexv_fotografo IS DISTINCT FROM new.prexv_fotografo) OR (old.prexv_maquilladora IS DISTINCT FROM new.prexv_maquilladora) OR (old.prexv_locacion IS DISTINCT FROM new.prexv_locacion) OR (old.prexv_componentes IS DISTINCT FROM new.prexv_componentes) OR (old.autoriza_uso_imagen IS DISTINCT FROM new.autoriza_uso_imagen))) EXECUTE FUNCTION private.proteger_edicion_contrato_pactado();
drop trigger if exists require_contract_invoice_on_approval on public.contratos;
CREATE TRIGGER require_contract_invoice_on_approval BEFORE UPDATE OF estado_aprobacion ON public.contratos FOR EACH ROW WHEN ((lower(new.estado_aprobacion) = 'aprobado'::text)) EXECUTE FUNCTION require_contract_invoice();
drop trigger if exists require_contract_invoice_on_finalization on public.contratos;
CREATE TRIGGER require_contract_invoice_on_finalization BEFORE UPDATE OF estado ON public.contratos FOR EACH ROW WHEN ((lower(new.estado) = ANY (ARRAY['borrador'::text, 'pendiente_admin'::text, 'firmado'::text, 'finalizado'::text, 'emitido'::text]))) EXECUTE FUNCTION require_contract_invoice();
drop trigger if exists require_contract_invoice_on_save on public.contratos;
CREATE TRIGGER require_contract_invoice_on_save BEFORE INSERT OR UPDATE OF numero_factura, numero_contrato, cliente_nombre, cliente_documento, cliente_whatsapp, cliente_email, cliente_direccion, quinceanera_name, sede, sede_id, asesora, asesora_id, tipo_evento, tipo_entrega, fecha_evento, fecha_pre_xv, fecha_cita_medidas, fecha_prueba_final, fecha_entrega_envio, fecha_retorno_prevista, fecha_fotografia, fecha_maquillaje, prexv_fotografo, prexv_maquilladora, prexv_locacion, observaciones_vestido, observaciones_arreglos, valor_total, anticipo, total_arreglos, valor_deposito, banco_deposito, tipo_cuenta_deposito, numero_cuenta_deposito, titular_cuenta_deposito, accesorios, metodos_pago, vestido_id, autoriza_uso_imagen, firma_base64, fecha_firma_cliente, fecha_firma, url_pdf_firmado ON public.contratos FOR EACH ROW EXECUTE FUNCTION require_contract_invoice();

drop trigger if exists validar_deposito_antes_entrega on public.entregas_bitacora;
drop trigger if exists validar_deposito_estado_entregado on public.contratos;
drop trigger if exists validar_garantia_nuevo_contrato on public.contratos;
drop policy if exists entrega_foto_leer on storage.objects;
drop policy if exists entrega_foto_subir on storage.objects;
alter table public.mantenimiento_bitacora drop column if exists inspeccion_id, drop column if exists cobro_arreglo;
alter table public.solicitudes_depositos drop column if exists descuento_arreglos;
drop table if exists private.enlaces_operaciones cascade;
drop table if exists private.inspecciones_operaciones cascade;
drop table if exists private.cambios_operaciones cascade;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='refrescar_prenda_operaciones' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='rangos_operaciones' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='operacion_contrato' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='liberar_vestidos_operaciones' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='recibir_vestidos_operaciones' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='validar_deposito_entrega' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='firmar_enlace_operaciones' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='arreglos_pendientes' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='resumen_arreglos_devolucion' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crear_enlace_operaciones' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='validar_garantia_nuevo_contrato' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='cambiar_prenda_operaciones' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='consultar_enlace_operaciones' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
do $qa$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cambiar_prenda_operaciones' loop execute 'drop function '||r.sig||' cascade';end loop;end $qa$;
drop function private.gestionar_deposito(text,jsonb); alter function private.gestionar_deposito_original(text,jsonb) rename to gestionar_deposito;
-- SOURCE 20260928201854_operations_contract_actions.sql
-- ERP copia: acciones atómicas, con permisos del usuario y RLS existente.
create or replace function public.operacion_contrato(p_contrato_id uuid,p_accion text,p_motivo text default null)
returns void language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
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
  if lower(u.rol)<>'admin' then raise exception 'Solo administración puede eliminar contratos.'; end if;
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
end $$;
revoke all on function public.operacion_contrato(uuid,text,text) from public,anon;
grant execute on function public.operacion_contrato(uuid,text,text) to authenticated;

create or replace function public.validar_deposito_entrega() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare deposito numeric; estado_contrato text;
begin
 if tg_table_name='contratos' then
  if lower(coalesce(new.estado,''))<>'entregado' or new.estado is not distinct from old.estado then return new; end if;
  deposito:=new.valor_deposito; estado_contrato:=old.estado;
 else
  if lower(coalesce(new.tipo_entrega,''))='reversion' then return new; end if;
  select valor_deposito,estado into deposito,estado_contrato from public.contratos where id=new.contrato_id for update;
 end if;
 if lower(coalesce(estado_contrato,'')) in ('cancelado','anulado','rechazado','finalizado') then raise exception 'No se puede entregar un contrato desistido, anulado o finalizado.'; end if;
 if coalesce(deposito,0)<=0 then raise exception 'Registra el depósito recibido desde Operaciones antes de entregar el vestido.'; end if;
 return new;
end $$;
revoke all on function public.validar_deposito_entrega() from public,anon,authenticated;
create trigger validar_deposito_antes_entrega before insert on public.entregas_bitacora for each row execute function public.validar_deposito_entrega();
create trigger validar_deposito_estado_entregado before update of estado on public.contratos for each row execute function public.validar_deposito_entrega();

-- SOURCE 20260928203420_required_contract_guarantee.sql
alter table public.contratos add column if not exists valor_garantia_acordada numeric(12,2);
comment on column public.contratos.valor_garantia_acordada is 'Garantía pactada al crear el contrato; no representa dinero recibido.';
create or replace function public.validar_garantia_nuevo_contrato() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
begin
 if new.valor_garantia_acordada is null or new.valor_garantia_acordada<=0 or new.valor_garantia_acordada::text in ('NaN','Infinity','-Infinity') then raise exception 'Indica el valor de la garantía acordada, mayor que cero.'; end if;
 if nullif(btrim(new.banco_deposito),'') is null or nullif(btrim(new.tipo_cuenta_deposito),'') is null or nullif(btrim(new.numero_cuenta_deposito),'') is null or nullif(btrim(new.titular_cuenta_deposito),'') is null then raise exception 'Banco, tipo de cuenta, número de cuenta y titular son obligatorios para crear el contrato.'; end if;
 return new;
end $$;
revoke all on function public.validar_garantia_nuevo_contrato() from public,anon,authenticated;
create trigger validar_garantia_nuevo_contrato before insert on public.contratos for each row execute function public.validar_garantia_nuevo_contrato();

-- SOURCE 20260928204216_secure_operations_return.sql
-- Scoped public signing and transactional return inspection for ERP copia.
create table private.enlaces_operaciones (
 token text primary key default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
 contrato_id uuid not null references public.contratos(id) on delete cascade,
 entrega_id uuid references public.entregas_bitacora(id) on delete cascade,
 tipo text not null check(tipo in ('firma','entrega')),
 expires_at timestamptz not null default now()+interval '7 days',
 created_by uuid not null, used_at timestamptz
);
alter table private.enlaces_operaciones enable row level security;
revoke all on private.enlaces_operaciones from public,anon,authenticated;
create table private.inspecciones_operaciones (
 id uuid primary key, contrato_id uuid not null references public.contratos(id),
 prendas jsonb not null, cobro numeric(12,2) not null check(cobro>=0),
 usuario_id uuid not null, created_at timestamptz not null default now()
);
alter table private.inspecciones_operaciones enable row level security;
revoke all on private.inspecciones_operaciones from public,anon,authenticated;
alter table public.mantenimiento_bitacora add column inspeccion_id uuid references private.inspecciones_operaciones(id), add column cobro_arreglo numeric(12,2) not null default 0;
alter table public.solicitudes_depositos add column descuento_arreglos numeric(12,2) not null default 0;

-- These narrow APIs deliberately serve bearer links without granting table access.
create function public.crear_enlace_operaciones(p_contrato uuid,p_tipo text,p_entrega uuid default null)
returns text language plpgsql security definer set search_path='' as $$
declare c public.contratos%rowtype; u public.profiles%rowtype; result text;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if not found or lower(u.rol) not in ('admin','asesora') then raise exception 'No autorizado.';end if;
 select * into c from public.contratos where id=p_contrato for update;
 if not found or (lower(u.rol)<>'admin' and u.sede_id is distinct from c.sede_id) then raise exception 'Contrato no disponible.';end if;
 if lower(coalesce(c.estado,'')) in ('cancelado','anulado','rechazado','finalizado') then raise exception 'El contrato está cerrado.';end if;
 if nullif(btrim(c.numero_factura),'') is null then raise exception 'El número de factura es obligatorio';end if;
 if p_tipo='firma' then
  if c.estado_aprobacion='pendiente_admin' then raise exception 'Requiere aprobación administrativa.';end if;
  if p_entrega is not null then raise exception 'Enlace no válido.';end if;
 elsif p_tipo='entrega' then
  if not exists(select 1 from public.entregas_bitacora where id=p_entrega and contrato_id=c.id and lower(coalesce(tipo_entrega,''))<>'reversion') then raise exception 'Entrega no disponible.';end if;
 else raise exception 'Tipo no válido.';end if;
 insert into private.enlaces_operaciones(contrato_id,tipo,entrega_id,created_by) values(c.id,p_tipo,p_entrega,u.id) returning token into result;
 return result;
end $$;

create function public.consultar_enlace_operaciones(p_id uuid,p_token text,p_tipo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l private.enlaces_operaciones%rowtype; c jsonb; e jsonb;
begin
 select * into l from private.enlaces_operaciones where token=p_token and tipo=p_tipo and expires_at>now() and case when p_tipo='firma' then contrato_id=p_id else entrega_id=p_id end;
 if not found then raise exception 'Enlace inválido o vencido. Solicita uno nuevo.';end if;
 select jsonb_build_object(
 'id',x.id,'numero_contrato',x.numero_contrato,'sede',x.sede,'cliente_nombre',x.cliente_nombre,'cliente_documento',x.cliente_documento,'cliente_email',x.cliente_email,'cliente_whatsapp',x.cliente_whatsapp,'cliente_direccion',x.cliente_direccion,
 'fecha_evento',x.fecha_evento,'valor_total',x.valor_total,'anticipo',x.anticipo,'saldo',x.saldo,'created_at',x.created_at,'firma_base64',x.firma_base64,'estado',x.estado,'tipo_evento',x.tipo_evento,'fecha_pre_xv',x.fecha_pre_xv,'prexv_componentes',x.prexv_componentes,'prexv_fotografo',x.prexv_fotografo,'prexv_maquilladora',x.prexv_maquilladora,'prexv_locacion',x.prexv_locacion,'fecha_cita_medidas',x.fecha_cita_medidas,'fecha_prueba_final',x.fecha_prueba_final,'fecha_entrega_envio',x.fecha_entrega_envio,'tipo_entrega',x.tipo_entrega,'accesorios',x.accesorios,'total_arreglos',x.total_arreglos,'metodos_pago',x.metodos_pago,'banco_deposito',x.banco_deposito,'tipo_cuenta_deposito',x.tipo_cuenta_deposito,'numero_cuenta_deposito',x.numero_cuenta_deposito,'titular_cuenta_deposito',x.titular_cuenta_deposito,'asesora',x.asesora,'quinceanera_name',x.quinceanera_name,
 'arreglos',coalesce((select jsonb_agg(to_jsonb(a)) from public.arreglos a where a.contrato_id=x.id),'[]'::jsonb),
 'vestidos',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'vestido_id',i.vestido_id,'tipo',i.tipo,'observaciones',i.observaciones,'vestido',jsonb_build_object('id',v.id,'codigo',v.codigo,'nombre',v.nombre))) from public.contrato_items_vestidos i join public.vestidos v on v.id=i.vestido_id where i.contrato_id=x.id),'[]'::jsonb)) into c from public.contratos x where x.id=l.contrato_id;
 if p_tipo='entrega' then select jsonb_build_object('id',id,'contrato_id',contrato_id,'tipo_entrega',tipo_entrega,'fotos_uris',fotos_uris,'firma_cliente',firma_cliente,'finalizado',finalizado,'nombre_recibe',nombre_recibe,'documento_recibe',documento_recibe) into e from public.entregas_bitacora where id=l.entrega_id;end if;
 return jsonb_build_object('contrato',c,'entrega',e);
end $$;

create function public.firmar_enlace_operaciones(p_id uuid,p_token text,p_tipo text,p_firma text,p_nombre text default null,p_documento text default null)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare l private.enlaces_operaciones%rowtype; c public.contratos%rowtype; e public.entregas_bitacora%rowtype;
begin
 if p_firma is null or p_firma !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(p_firma)>1000000 then raise exception 'Firma inválida.';end if;
 select * into l from private.enlaces_operaciones where token=p_token and tipo=p_tipo and expires_at>now() and case when p_tipo='firma' then contrato_id=p_id else entrega_id=p_id end for update;
 if not found then raise exception 'Enlace inválido o vencido.';end if;
 select * into c from public.contratos where id=l.contrato_id for update;
 if lower(coalesce(c.estado,'')) in ('cancelado','anulado','rechazado','finalizado','mantenimiento') then raise exception 'El estado del contrato no permite firmar.';end if;
 if nullif(btrim(c.numero_factura),'') is null then raise exception 'El número de factura es obligatorio';end if;
 if p_tipo='firma' then
  if c.estado_aprobacion='pendiente_admin' then raise exception 'Requiere aprobación.';end if;
  if c.firma_base64 is not null and c.firma_base64<>'' then
   if c.firma_base64=p_firma then return;end if;raise exception 'El contrato ya fue firmado.';
  end if;
  if c.estado='entregado' then raise exception 'Contrato ya entregado.';end if;
  update public.contratos set firma_base64=p_firma,fecha_firma_cliente=now(),estado='firmado' where id=c.id;
 else
  if nullif(btrim(p_nombre),'') is null or nullif(btrim(p_documento),'') is null then raise exception 'Indica nombre y documento de quien recibe.';end if;
  if coalesce(c.saldo,0)>0 or coalesce(c.valor_deposito,0)<=0 then raise exception 'Completa el pago y registra el depósito antes de entregar.';end if;
  select * into e from public.entregas_bitacora where id=l.entrega_id for update;
  if e.finalizado or nullif(e.firma_cliente,'') is not null then
   if e.firma_cliente=p_firma then return;end if;raise exception 'La entrega ya fue firmada.';
  end if;
  update public.entregas_bitacora set firma_cliente=p_firma,finalizado=true,nombre_recibe=btrim(p_nombre),documento_recibe=btrim(p_documento),fecha_entrega_real=now() where id=e.id;
  update public.contratos set estado='entregado',entregado_prexv=case when e.tipo_entrega in ('PREXV','AMBOS') then true else entregado_prexv end,fecha_entrega_prexv=case when e.tipo_entrega in ('PREXV','AMBOS') then now() else fecha_entrega_prexv end,entregado_evento=case when coalesce(e.tipo_entrega,'EVENTO') in ('EVENTO','AMBOS') then true else entregado_evento end,fecha_entrega_evento=case when coalesce(e.tipo_entrega,'EVENTO') in ('EVENTO','AMBOS') then now() else fecha_entrega_evento end where id=c.id;
  update public.vestidos set estado='Alquilado' where id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id);
 end if;
 update private.enlaces_operaciones set used_at=now() where token=p_token;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,case when p_tipo='firma' then 'Firma de contrato' else 'Firma de entrega' end,'Firma registrada mediante enlace protegido.','Cliente');
end $$;
revoke all on function public.crear_enlace_operaciones(uuid,text,uuid) from public,anon;
grant execute on function public.crear_enlace_operaciones(uuid,text,uuid) to authenticated;
revoke all on function public.consultar_enlace_operaciones(uuid,text,text) from public;
revoke all on function public.firmar_enlace_operaciones(uuid,text,text,text,text,text) from public;
grant execute on function public.consultar_enlace_operaciones(uuid,text,text),public.firmar_enlace_operaciones(uuid,text,text,text,text,text) to anon,authenticated;
-- Existing legacy link permissions retained during transition.
create function private.arreglos_pendientes(p_contrato uuid) returns numeric
language sql set search_path='' as $$
 select greatest(0,coalesce((select sum(cobro) from private.inspecciones_operaciones where contrato_id=p_contrato),0)-coalesce((select sum(descuento_arreglos) from public.solicitudes_depositos where contrato_id=p_contrato and estado='devuelto'),0));
$$;
revoke all on function private.arreglos_pendientes(uuid) from public,anon,authenticated;
create function public.resumen_arreglos_devolucion(p_contrato uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pendientes numeric; detalle text;
begin
 if auth.uid() is null or not private.acceso_deposito(p_contrato) then raise exception 'No autorizado.';end if;
 pendientes:=private.arreglos_pendientes(p_contrato);
 select string_agg(x.value->>'descripcion','; ') into detalle from private.inspecciones_operaciones i cross join lateral jsonb_array_elements(i.prendas) x where i.contrato_id=p_contrato and coalesce((x.value->>'cobro')::numeric,0)>0;
 return jsonb_build_object('pendiente',pendientes,'motivo',coalesce(detalle,'Arreglos registrados al recibir el vestido'));
end $$;
revoke all on function public.resumen_arreglos_devolucion(uuid) from public,anon;
grant execute on function public.resumen_arreglos_devolucion(uuid) to authenticated;

create function public.recibir_vestidos_operaciones(p_contrato uuid,p_operacion uuid,p_prendas jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c public.contratos%rowtype; u public.profiles%rowtype; prior private.inspecciones_operaciones%rowtype; item jsonb; total numeric:=0; importe numeric; dias integer; vid uuid; disponible numeric; ultimo date:=current_date;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if not found or lower(u.rol) not in ('admin','asesora') then raise exception 'No autorizado.';end if;
 select * into c from public.contratos where id=p_contrato for update;
 if not found or (lower(u.rol)<>'admin' and u.sede_id is distinct from c.sede_id) then raise exception 'Contrato no disponible para tu sede.';end if;
 select * into prior from private.inspecciones_operaciones where id=p_operacion;
 if found then
  if prior.contrato_id<>c.id or prior.prendas<>p_prendas then raise exception 'Operación ya utilizada con otros datos.';end if;
  return jsonb_build_object('id',prior.id,'cobro',prior.cobro,'repetido',true);
 end if;
 if p_operacion is null or jsonb_typeof(p_prendas) is distinct from 'array' or jsonb_array_length(p_prendas)=0 then raise exception 'Revisa todos los vestidos.';end if;
 if c.estado<>'entregado' then raise exception 'Solo se reciben vestidos de un contrato entregado.';end if;
 if exists(select 1 from public.solicitudes_depositos where contrato_id=c.id and estado in ('pendiente','en_proceso','pagado')) then raise exception 'Hay una devolución de dinero en trámite. Resuélvela antes de registrar otra recepción.';end if;
 if jsonb_array_length(p_prendas)<>(select count(*) from (select vestido_id from public.contrato_items_vestidos where contrato_id=c.id union select c.vestido_id where c.vestido_id is not null) dresses) or jsonb_array_length(p_prendas)<>(select count(distinct value->>'vestido_id') from jsonb_array_elements(p_prendas)) then raise exception 'Debes revisar cada vestido del contrato una sola vez.';end if;
 for item in select value from jsonb_array_elements(p_prendas) loop
  vid:=(item->>'vestido_id')::uuid;
  if vid is distinct from c.vestido_id and not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=vid) then raise exception 'Vestido ajeno al contrato.';end if;
  if jsonb_typeof(item->'necesita_arreglo') is distinct from 'boolean' then raise exception 'Indica si cada vestido necesita arreglo.';end if;
  importe:=(item->>'cobro')::numeric;dias:=(item->>'dias')::integer;
  if importe is null or importe::text in ('NaN','Infinity','-Infinity') or importe<0 or importe<>round(importe,2) or dias is null or dias<1 or dias>60 then raise exception 'Revisa el cobro y los días estimados.';end if;
  if (item->>'necesita_arreglo')::boolean then
   if nullif(btrim(item->>'descripcion'),'') is null then raise exception 'Describe el arreglo necesario.';end if;
  elsif importe<>0 then raise exception 'Un vestido sin arreglo no puede tener cobro.';end if;
  total:=total+importe;ultimo:=greatest(ultimo,(now() at time zone 'America/Bogota')::date+dias);
 end loop;
 select coalesce(c.valor_deposito,0)-coalesce(sum(monto_devuelto+coalesce(monto_descuento,0)),0)-private.arreglos_pendientes(c.id) into disponible from public.devoluciones_depositos where contrato_id=c.id and coalesce(lower(estado),'completado') not in ('cancelado','anulado','rechazado');
 if total>disponible then raise exception 'El cobro por arreglos supera el depósito disponible (%).',disponible;end if;
 insert into private.inspecciones_operaciones(id,contrato_id,prendas,cobro,usuario_id) values(p_operacion,c.id,p_prendas,total,u.id);
 for item in select value from jsonb_array_elements(p_prendas) loop
  insert into public.mantenimiento_bitacora(contrato_id,vestido_id,tipo,tipo_mantenimiento,descripcion_danos,cobro_arreglo,dias_estimados,fecha_salida_estimada,estado,completado,usuario_id,inspeccion_id)
  values(c.id,(item->>'vestido_id')::uuid,case when (item->>'necesita_arreglo')::boolean then 'SASTRERÍA' else 'LAVANDERÍA' end,case when (item->>'necesita_arreglo')::boolean then 'SASTRERÍA' else 'LAVANDERÍA' end,nullif(btrim(item->>'descripcion'),''),(item->>'cobro')::numeric,(item->>'dias')::integer,now()+make_interval(days=>(item->>'dias')::integer),'en proceso',false,u.id,p_operacion);
  update public.vestidos set estado='EN MANTENIMIENTO' where id=(item->>'vestido_id')::uuid;
 end loop;
 update public.contratos set estado='mantenimiento',fecha_disponibilidad_real=ultimo where id=c.id;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,'Devolución de vestidos revisada',jsonb_build_object('inspeccion',p_operacion,'prendas',p_prendas,'descuento_del_deposito',total)::text,coalesce(u.nombre,u.email));
 return jsonb_build_object('id',p_operacion,'cobro',total,'devolucion_estimada',disponible-total);
end $$;
revoke all on function public.recibir_vestidos_operaciones(uuid,uuid,jsonb) from public,anon;
grant execute on function public.recibir_vestidos_operaciones(uuid,uuid,jsonb) to authenticated;

create function public.liberar_vestidos_operaciones(p_contrato uuid) returns text
language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare c public.contratos%rowtype; u public.profiles%rowtype; nuevo text; vid uuid;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true) and lower(rol)='admin';
 if not found then raise exception 'Solo administración puede liberar los vestidos.';end if;
 select * into c from public.contratos where id=p_contrato for update;
 if not found then raise exception 'Contrato no encontrado.';end if;
 if c.estado='finalizado' then return 'finalizado';end if;
 if c.estado<>'mantenimiento' then raise exception 'Primero registra la recepción y revisión de los vestidos.';end if;
 if c.vestido_id is null and not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id) then raise exception 'No hay vestidos vinculados.';end if;
 if not (coalesce(c.entregado_prexv,false) and not coalesce(c.entregado_evento,false)) and coalesce(c.saldo,0)+coalesce(c.total_multas,0)<=0 then raise exception 'Revisa el depósito antes de finalizar el contrato.';end if;
 for vid in select id from public.vestidos where id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id) order by id loop
  perform 1 from public.vestidos where id=vid for update;
  if exists(select 1 from public.mantenimiento_bitacora where vestido_id=vid and contrato_id<>c.id and not coalesce(completado,false) and lower(coalesce(estado,'')) not in ('finalizado','completado','cancelado')) then raise exception 'Un vestido tiene otro mantenimiento activo.';end if;
  update public.vestidos set estado='Disponible' where id=vid;
  if not found then raise exception 'No se pudo liberar un vestido.';end if;
 end loop;
 update public.mantenimiento_bitacora set estado='finalizado',completado=true where contrato_id=c.id and estado is distinct from 'finalizado';
 nuevo:=case when coalesce(c.saldo,0)+coalesce(c.total_multas,0)<=0 then 'finalizado' else 'firmado' end;
 update public.contratos set estado=nuevo where id=c.id;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,'Liberación de vestidos','Vestidos disponibles y mantenimiento cerrado. Estado del contrato: '||nuevo,coalesce(u.nombre,u.email));
 return nuevo;
end $$;
revoke all on function public.liberar_vestidos_operaciones(uuid) from public,anon;
grant execute on function public.liberar_vestidos_operaciones(uuid) to authenticated;

-- Preserve the existing financial workflow, enforcing the inspection deduction server-side.
alter function private.gestionar_deposito(text,jsonb) rename to gestionar_deposito_original;
revoke all on function private.gestionar_deposito_original(text,jsonb) from public,anon,authenticated;
create function private.gestionar_deposito(p_accion text,p_datos jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cid uuid; pendiente numeric; result jsonb; oid uuid:=(p_datos->>'id')::uuid;
begin
 if p_accion='solicitar' then
  cid:=(p_datos->>'contrato_id')::uuid;
  if auth.uid() is null or not private.acceso_deposito(cid) then raise exception 'No autorizado.';end if;
  perform 1 from public.contratos where id=cid for update;
  if not exists(select 1 from public.solicitudes_depositos where id=oid) then
   pendiente:=private.arreglos_pendientes(cid);
   if coalesce((p_datos->>'descuento')::numeric,0)<pendiente then raise exception 'Debes descontar los arreglos registrados: %.',pendiente;end if;
  end if;
 end if;
 result:=private.gestionar_deposito_original(p_accion,p_datos);
 if p_accion='solicitar' and pendiente is not null then update public.solicitudes_depositos set descuento_arreglos=pendiente where id=oid;end if;
 return result;
end $$;
revoke all on function private.gestionar_deposito(text,jsonb) from public,anon;
grant execute on function private.gestionar_deposito(text,jsonb) to authenticated;

-- SOURCE 20260928224647_single_contract_deposit.sql
create or replace function private.gestionar_deposito(p_accion text,p_datos jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cid uuid; pendiente numeric; result jsonb; oid uuid:=(p_datos->>'id')::uuid;
begin
 if p_accion='ingreso' then
  cid:=(p_datos->>'contrato_id')::uuid;
  if auth.uid() is null or not private.acceso_deposito(cid) then raise exception 'No autorizado.';end if;
  -- Serialize all receipts on the contract, including requests from different tabs.
  perform 1 from public.contratos where id=cid for update;
  -- Preserve exact retries; the original function checks their payload matches.
  if not exists(select 1 from public.movimientos_depositos where id=oid) and (
   exists(select 1 from public.contratos where id=cid and coalesce(valor_deposito,0)>0)
   or exists(select 1 from public.movimientos_depositos where contrato_id=cid and tipo='ingreso')
  ) then raise exception 'Este contrato ya tiene un depósito registrado. No se permite registrarlo nuevamente.';end if;
 end if;
 if p_accion='solicitar' then
  cid:=(p_datos->>'contrato_id')::uuid;
  if auth.uid() is null or not private.acceso_deposito(cid) then raise exception 'No autorizado.';end if;
  perform 1 from public.contratos where id=cid for update;
  if not exists(select 1 from public.solicitudes_depositos where id=oid) then
   pendiente:=private.arreglos_pendientes(cid);
   if coalesce((p_datos->>'descuento')::numeric,0)<pendiente then raise exception 'Debes descontar los arreglos registrados: %.',pendiente;end if;
  end if;
 end if;
 result:=private.gestionar_deposito_original(p_accion,p_datos);
 if p_accion='solicitar' and pendiente is not null then update public.solicitudes_depositos set descuento_arreglos=pendiente where id=oid;end if;
 return result;
end $$;
revoke all on function private.gestionar_deposito(text,jsonb) from public,anon;
grant execute on function private.gestionar_deposito(text,jsonb) to authenticated;

-- SOURCE 20260928225621_delivery_return_order.sql
create or replace function public.recibir_vestidos_operaciones(p_contrato uuid,p_operacion uuid,p_prendas jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare c public.contratos%rowtype; u public.profiles%rowtype; prior private.inspecciones_operaciones%rowtype; item jsonb; total numeric:=0; importe numeric; dias integer; vid uuid; disponible numeric; ultimo date:=current_date;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if not found or lower(u.rol) not in ('admin','asesora') then raise exception 'No autorizado.';end if;
 select * into c from public.contratos where id=p_contrato for update;
 if not found or (lower(u.rol)<>'admin' and u.sede_id is distinct from c.sede_id) then raise exception 'Contrato no disponible para tu sede.';end if;
 select * into prior from private.inspecciones_operaciones where id=p_operacion;
 if found then
  if prior.contrato_id<>c.id or prior.prendas<>p_prendas then raise exception 'Operación ya utilizada con otros datos.';end if;
  return jsonb_build_object('id',prior.id,'cobro',prior.cobro,'repetido',true);
 end if;
 if p_operacion is null or jsonb_typeof(p_prendas) is distinct from 'array' or jsonb_array_length(p_prendas)=0 then raise exception 'Revisa todos los vestidos.';end if;
 if not exists(select 1 from public.entregas_bitacora where contrato_id=c.id and finalizado=true and nullif(firma_cliente,'') is not null and lower(coalesce(tipo_entrega,''))<>'reversion') then raise exception 'Primero confirma la entrega con la firma de quien recibe.';end if;
 if c.estado<>'entregado' then raise exception 'Solo se reciben vestidos de un contrato entregado.';end if;
 if exists(select 1 from public.solicitudes_depositos where contrato_id=c.id and estado in ('pendiente','en_proceso','pagado')) then raise exception 'Hay una devolución de dinero en trámite. Resuélvela antes de registrar otra recepción.';end if;
 if jsonb_array_length(p_prendas)<>(select count(*) from (select vestido_id from public.contrato_items_vestidos where contrato_id=c.id union select c.vestido_id where c.vestido_id is not null) dresses) or jsonb_array_length(p_prendas)<>(select count(distinct value->>'vestido_id') from jsonb_array_elements(p_prendas)) then raise exception 'Debes revisar cada vestido del contrato una sola vez.';end if;
 for item in select value from jsonb_array_elements(p_prendas) loop
  vid:=(item->>'vestido_id')::uuid;
  if vid is distinct from c.vestido_id and not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=vid) then raise exception 'Vestido ajeno al contrato.';end if;
  if jsonb_typeof(item->'necesita_arreglo') is distinct from 'boolean' then raise exception 'Indica si cada vestido necesita arreglo.';end if;
  importe:=(item->>'cobro')::numeric;dias:=(item->>'dias')::integer;
  if importe is null or importe::text in ('NaN','Infinity','-Infinity') or importe<0 or importe<>round(importe,2) or dias is null or dias<1 or dias>60 then raise exception 'Revisa el cobro y los días estimados.';end if;
  if (item->>'necesita_arreglo')::boolean then
   if nullif(btrim(item->>'descripcion'),'') is null then raise exception 'Describe el arreglo necesario.';end if;
  elsif importe<>0 then raise exception 'Un vestido sin arreglo no puede tener cobro.';end if;
  total:=total+importe;ultimo:=greatest(ultimo,(now() at time zone 'America/Bogota')::date+dias);
 end loop;
 select coalesce(c.valor_deposito,0)-coalesce(sum(monto_devuelto+coalesce(monto_descuento,0)),0)-private.arreglos_pendientes(c.id) into disponible from public.devoluciones_depositos where contrato_id=c.id and coalesce(lower(estado),'completado') not in ('cancelado','anulado','rechazado');
 if total>disponible then raise exception 'El cobro por arreglos supera el depósito disponible (%).',disponible;end if;
 insert into private.inspecciones_operaciones(id,contrato_id,prendas,cobro,usuario_id) values(p_operacion,c.id,p_prendas,total,u.id);
 for item in select value from jsonb_array_elements(p_prendas) loop
  insert into public.mantenimiento_bitacora(contrato_id,vestido_id,tipo,tipo_mantenimiento,descripcion_danos,cobro_arreglo,dias_estimados,fecha_salida_estimada,estado,completado,usuario_id,inspeccion_id)
  values(c.id,(item->>'vestido_id')::uuid,case when (item->>'necesita_arreglo')::boolean then 'SASTRERÍA' else 'LAVANDERÍA' end,case when (item->>'necesita_arreglo')::boolean then 'SASTRERÍA' else 'LAVANDERÍA' end,nullif(btrim(item->>'descripcion'),''),(item->>'cobro')::numeric,(item->>'dias')::integer,now()+make_interval(days=>(item->>'dias')::integer),'en proceso',false,u.id,p_operacion);
  update public.vestidos set estado='EN MANTENIMIENTO' where id=(item->>'vestido_id')::uuid;
 end loop;
 update public.contratos set estado='mantenimiento',fecha_disponibilidad_real=ultimo where id=c.id;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,'Devolución de vestidos revisada',jsonb_build_object('inspeccion',p_operacion,'prendas',p_prendas,'descuento_del_deposito',total)::text,coalesce(u.nombre,u.email));
 return jsonb_build_object('id',p_operacion,'cobro',total,'devolucion_estimada',disponible-total);
end $$;
revoke all on function public.recibir_vestidos_operaciones(uuid,uuid,jsonb) from public,anon;
grant execute on function public.recibir_vestidos_operaciones(uuid,uuid,jsonb) to authenticated;

create or replace function public.liberar_vestidos_operaciones(p_contrato uuid) returns text
language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare c public.contratos%rowtype; u public.profiles%rowtype; nuevo text; vid uuid;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true) and lower(rol)='admin';
 if not found then raise exception 'Solo administración puede liberar los vestidos.';end if;
 select * into c from public.contratos where id=p_contrato for update;
 if not found then raise exception 'Contrato no encontrado.';end if;
 if c.estado='finalizado' then return 'finalizado';end if;
 if c.estado<>'mantenimiento' then raise exception 'Primero registra la recepción y revisión de los vestidos.';end if;
 if c.vestido_id is null and not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id) then raise exception 'No hay vestidos vinculados.';end if;
 if not (coalesce(c.entregado_prexv,false) and not coalesce(c.entregado_evento,false)) and coalesce(c.saldo,0)+coalesce(c.total_multas,0)<=0 then raise exception 'Revisa el depósito antes de finalizar el contrato.';end if;
 for vid in select id from public.vestidos where id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id) order by id loop
  perform 1 from public.vestidos where id=vid for update;
  if exists(select 1 from public.mantenimiento_bitacora where vestido_id=vid and contrato_id<>c.id and not coalesce(completado,false) and lower(coalesce(estado,'')) not in ('finalizado','completado','cancelado')) then raise exception 'Un vestido tiene otro mantenimiento activo.';end if;
  update public.vestidos set estado='Disponible' where id=vid;
  if not found then raise exception 'No se pudo liberar un vestido.';end if;
 end loop;
 update public.mantenimiento_bitacora set estado='finalizado',completado=true where contrato_id=c.id and estado is distinct from 'finalizado';
 nuevo:=case when coalesce(c.entregado_prexv,false) and not coalesce(c.entregado_evento,false) then 'firmado' when coalesce(c.saldo,0)+coalesce(c.total_multas,0)<=0 then 'finalizado' else 'firmado' end;
 update public.contratos set estado=nuevo where id=c.id;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,'Liberación de vestidos','Vestidos disponibles y mantenimiento cerrado. Estado del contrato: '||nuevo,coalesce(u.nombre,u.email));
 return nuevo;
end $$;
revoke all on function public.liberar_vestidos_operaciones(uuid) from public,anon;
grant execute on function public.liberar_vestidos_operaciones(uuid) to authenticated;


-- SOURCE 20260929001915_delivery_photo_storage.sql
-- ERP copia: evidence stays private; only authorized staff issue expiring photo URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fotos-entregas','fotos-entregas',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
alter table public.entregas_bitacora add column if not exists fotos_paths text[] not null default '{}';
alter table public.entregas_bitacora alter column fecha_entrega_real drop default;
create policy entrega_foto_leer on storage.objects for select to authenticated using (
 bucket_id='fotos-entregas' and exists(select 1 from public.contratos c join public.profiles p on p.id=auth.uid()
 where c.id::text=split_part(name,'/',1) and coalesce(p.activo,true) and (lower(p.rol)='admin' or (lower(p.rol)='asesora' and p.sede_id=c.sede_id)))
);
create policy entrega_foto_subir on storage.objects for insert to authenticated with check (
 bucket_id='fotos-entregas' and exists(select 1 from public.contratos c join public.profiles p on p.id=auth.uid()
 where c.id::text=split_part(name,'/',1) and coalesce(p.activo,true) and (lower(p.rol)='admin' or (lower(p.rol)='asesora' and p.sede_id=c.sede_id)))
);

create or replace function public.consultar_enlace_operaciones(p_id uuid,p_token text,p_tipo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l private.enlaces_operaciones%rowtype; c jsonb; e jsonb;
begin
 select * into l from private.enlaces_operaciones where token=p_token and tipo=p_tipo and expires_at>now() and case when p_tipo='firma' then contrato_id=p_id else entrega_id=p_id end;
 if not found then raise exception 'Enlace inválido o vencido. Solicita uno nuevo.';end if;
 select jsonb_build_object(
 'id',x.id,'numero_contrato',x.numero_contrato,'sede',x.sede,'cliente_nombre',x.cliente_nombre,'cliente_documento',x.cliente_documento,'cliente_email',x.cliente_email,'cliente_whatsapp',x.cliente_whatsapp,'cliente_direccion',x.cliente_direccion,
 'fecha_evento',x.fecha_evento,'valor_total',x.valor_total,'anticipo',x.anticipo,'saldo',x.saldo,'created_at',x.created_at,'firma_base64',x.firma_base64,'estado',x.estado,'tipo_evento',x.tipo_evento,'fecha_pre_xv',x.fecha_pre_xv,'prexv_componentes',x.prexv_componentes,'prexv_fotografo',x.prexv_fotografo,'prexv_maquilladora',x.prexv_maquilladora,'prexv_locacion',x.prexv_locacion,'fecha_cita_medidas',x.fecha_cita_medidas,'fecha_prueba_final',x.fecha_prueba_final,'fecha_entrega_envio',x.fecha_entrega_envio,'tipo_entrega',x.tipo_entrega,'accesorios',x.accesorios,'total_arreglos',x.total_arreglos,'metodos_pago',x.metodos_pago,'banco_deposito',x.banco_deposito,'tipo_cuenta_deposito',x.tipo_cuenta_deposito,'numero_cuenta_deposito',x.numero_cuenta_deposito,'titular_cuenta_deposito',x.titular_cuenta_deposito,'asesora',x.asesora,'quinceanera_name',x.quinceanera_name,
 'arreglos',coalesce((select jsonb_agg(to_jsonb(a)) from public.arreglos a where a.contrato_id=x.id),'[]'::jsonb),
 'vestidos',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'vestido_id',i.vestido_id,'tipo',i.tipo,'observaciones',i.observaciones,'vestido',jsonb_build_object('id',v.id,'codigo',v.codigo,'nombre',v.nombre))) from public.contrato_items_vestidos i join public.vestidos v on v.id=i.vestido_id where i.contrato_id=x.id),'[]'::jsonb)) into c from public.contratos x where x.id=l.contrato_id;
 if p_tipo='entrega' then select jsonb_build_object('id',id,'contrato_id',contrato_id,'tipo_entrega',tipo_entrega,'observaciones',observaciones,'estado_fisico_accesorios',estado_fisico_accesorios,'fotos_uris',fotos_uris,'firma_cliente',firma_cliente,'finalizado',finalizado,'nombre_recibe',nombre_recibe,'documento_recibe',documento_recibe) into e from public.entregas_bitacora where id=l.entrega_id;end if;
 return jsonb_build_object('contrato',c,'entrega',e);
end $$;


-- SOURCE 20260929004256_atomic_dress_changes_and_reversal.sql
alter table public.entregas_bitacora add column if not exists anulada_at timestamptz, add column if not exists motivo_anulacion text;
create table private.cambios_operaciones(id uuid primary key,contrato_id uuid not null references public.contratos(id) on delete cascade,usuario_id uuid not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now());
alter table private.cambios_operaciones enable row level security;
revoke all on private.cambios_operaciones from public,anon,authenticated;

-- Same strict date ranges used by the calendar, inclusive of preparation and care days.
create function private.rangos_operaciones(c public.contratos) returns setof daterange
language sql immutable set search_path='' as $$
 select daterange(coalesce(c.fecha_entrega_envio::date,c.fecha_evento::date)-case when c.tipo_evento in ('PreXV','Fotografía') then 2 else 5 end,
 greatest(coalesce(c.fecha_disponibilidad_real::date,c.fecha_evento::date+case when c.tipo_evento in ('PreXV','Fotografía') then 2 else 5 end),coalesce(c.fecha_entrega_envio::date,c.fecha_evento::date)),'[]') where c.fecha_evento is not null
 union all select daterange(c.fecha_pre_xv::date,c.fecha_pre_xv::date+2,'[]') where c.fecha_pre_xv is not null;
$$;
revoke all on function private.rangos_operaciones(public.contratos) from public,anon,authenticated;

create function private.refrescar_prenda_operaciones(p_vestido uuid) returns void language plpgsql set search_path='' as $$
begin
 update public.vestidos v set estado=case
 when exists(select 1 from public.mantenimiento_bitacora m where m.vestido_id=v.id and not coalesce(m.completado,false) and lower(coalesce(m.estado,'')) not in ('finalizado','completado','cancelado')) or lower(coalesce(v.estado,'')) in ('en mantenimiento','mantenimiento','lavanderia','lavandería') then 'EN MANTENIMIENTO'
 when exists(select 1 from public.contratos c where lower(c.estado)='entregado' and (c.vestido_id=v.id or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=c.id and i.vestido_id=v.id))) then 'Alquilado'
 when exists(select 1 from public.contratos c where lower(c.estado) not in ('cancelado','cancelada','anulado','anulada','rechazado','finalizado','liquidado','historial') and (c.vestido_id=v.id or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=c.id and i.vestido_id=v.id))) then 'Reservado'
 else 'Disponible' end where v.id=p_vestido;
end $$;
revoke all on function private.refrescar_prenda_operaciones(uuid) from public,anon,authenticated;

-- Definer is isolated in private to inspect reservations across sites and revoke private links.
create function private.cambiar_prenda_operaciones(p_contrato uuid,p_accion text,p_vestido uuid,p_motivo text,p_operacion uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.contratos%rowtype; u public.profiles%rowtype; v public.vestidos%rowtype; prior private.cambios_operaciones%rowtype;
 payload jsonb:=jsonb_build_object('accion',p_accion,'vestido',p_vestido,'motivo',btrim(coalesce(p_motivo,''))); result jsonb; principal uuid; vid uuid;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if not found or lower(u.rol) not in ('admin','asesora') then raise exception 'No autorizado.';end if;
 if p_operacion is null then raise exception 'Falta el identificador de operación.';end if;
 select * into c from public.contratos where id=p_contrato for update;
 if not found or (lower(u.rol)<>'admin' and u.sede_id is distinct from c.sede_id) then raise exception 'Contrato no disponible para tu sede.';end if;
 select * into prior from private.cambios_operaciones where id=p_operacion;
 if found then
  if prior.contrato_id<>c.id or prior.usuario_id<>u.id or prior.payload<>payload then raise exception 'Operación utilizada con otros datos.';end if;
  return prior.result||'{"repetido":true}'::jsonb;
 end if;
 if p_accion not in ('asignar','quitar','revertir') then raise exception 'Acción inválida.';end if;
 if p_accion='revertir' then
  if lower(u.rol)<>'admin' then raise exception 'Solo administración puede revertir.';end if;
  if lower(c.estado)<>'finalizado' then raise exception 'Solo se puede revertir un contrato finalizado.';end if;
  if length(btrim(coalesce(p_motivo,'')))<10 then raise exception 'Escribe un motivo de al menos 10 caracteres.';end if;
  if exists(select 1 from public.devoluciones_depositos where contrato_id=c.id and coalesce(lower(estado),'completado') not in ('cancelado','anulado','rechazado'))
   or exists(select 1 from public.solicitudes_depositos where contrato_id=c.id and estado in ('pendiente','en_proceso','pagado','devuelto'))
   or private.arreglos_pendientes(c.id)>0 then raise exception 'Hay devoluciones o descuentos registrados. No se puede reabrir el contrato conservando ese depósito como disponible.';end if;
 else
  if lower(c.estado) in ('entregado','mantenimiento','finalizado','liquidado','cancelado','anulado','rechazado') then raise exception 'El estado del contrato no permite cambiar prendas.';end if;
  if lower(u.rol)<>'admin' and (lower(c.estado)='firmado' or nullif(c.firma_base64,'') is not null) then raise exception 'Solo administración puede cambiar prendas de un contrato firmado.';end if;
  if p_vestido is null then raise exception 'Selecciona una prenda.';end if;
  if p_accion='quitar' and length(btrim(coalesce(p_motivo,'')))<5 then raise exception 'Escribe un motivo de al menos 5 caracteres.';end if;
 end if;
 -- Contract first, then all affected dresses in a consistent order.
 for vid in select id from public.vestidos where id=p_vestido or id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id) order by id loop
  perform 1 from public.vestidos where id=vid for update;
 end loop;
 if p_accion='asignar' then
  select * into v from public.vestidos where id=p_vestido;
  if not found or (lower(u.rol)<>'admin' and v.sede_id is distinct from u.sede_id) then raise exception 'Prenda no disponible para tu sede.';end if;
  if lower(coalesce(v.estado,'')) in ('en mantenimiento','mantenimiento','lavandería','lavanderia','alquilado') then raise exception 'La prenda está entregada o en mantenimiento.';end if;
  if exists(select 1 from public.mantenimiento_bitacora where vestido_id=v.id and not coalesce(completado,false) and lower(coalesce(estado,'')) not in ('finalizado','completado','cancelado')) then raise exception 'La prenda tiene mantenimiento activo.';end if;
  if exists(select 1 from public.contratos other_c where other_c.id<>c.id and lower(other_c.estado) not in ('cancelado','cancelada','anulado','anulada','rechazado','finalizado','liquidado','historial')
   and (other_c.vestido_id=v.id or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=other_c.id and i.vestido_id=v.id))
   and exists(select 1 from private.rangos_operaciones(c) a,private.rangos_operaciones(other_c) b where a&&b)) then raise exception 'La prenda tiene otra reserva en esas fechas.';end if;
  -- Preserve a legacy primary dress rather than silently replacing it.
  if c.vestido_id is not null and not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=c.vestido_id) then
   insert into public.contrato_items_vestidos(contrato_id,vestido_id,tipo,tipo_uso) values(c.id,c.vestido_id,'XV','XV');
  end if;
  if not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=v.id) then
   insert into public.contrato_items_vestidos(contrato_id,vestido_id,tipo,tipo_uso) values(c.id,v.id,'XV','XV');
  end if;
  principal:=coalesce(c.vestido_id,v.id);
 elsif p_accion='quitar' then
  select * into v from public.vestidos where id=p_vestido;
  if not found or (c.vestido_id is distinct from p_vestido and not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=p_vestido)) then raise exception 'La prenda ya no pertenece al contrato.';end if;
  delete from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=p_vestido;
  if c.vestido_id is not null and c.vestido_id<>p_vestido then principal:=c.vestido_id;
  else select vestido_id into principal from public.contrato_items_vestidos where contrato_id=c.id order by vestido_id limit 1;end if;
  insert into public.bitacora_eliminaciones_contrato(contrato_id,vestido_id,codigo_vestido_eliminado,detalle,usuario_id,motivo)
  values(c.id,v.id,v.codigo,btrim(p_motivo),u.id,'Retiro de prenda desde Operaciones');
 else
  if not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id) and c.vestido_id is null then raise exception 'El contrato no tiene prendas para reabrir.';end if;
  for vid in select id from public.vestidos where id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id) loop
   if exists(select 1 from public.mantenimiento_bitacora where vestido_id=vid and not coalesce(completado,false) and lower(coalesce(estado,'')) not in ('finalizado','completado','cancelado')) then raise exception 'Una prenda tiene mantenimiento activo.';end if;
   if exists(select 1 from public.contratos o where o.id<>c.id and lower(o.estado) not in ('cancelado','anulado','rechazado','finalizado','liquidado','historial') and (o.vestido_id=vid or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=o.id and i.vestido_id=vid)) and (lower(o.estado)='entregado' or exists(select 1 from private.rangos_operaciones(c) a,private.rangos_operaciones(o) b where a&&b))) then raise exception 'Una prenda tiene otra reserva incompatible.';end if;
  end loop;
  update private.enlaces_operaciones set expires_at=now() where contrato_id=c.id;
  update public.entregas_bitacora set anulada_at=now(),motivo_anulacion=btrim(p_motivo) where contrato_id=c.id and lower(coalesce(tipo_entrega,''))<>'reversion' and anulada_at is null;
  update public.contratos set estado='firmado',entregado_prexv=false,entregado_evento=false,fecha_entrega_prexv=null,fecha_entrega_evento=null,estado_entrega='Pendiente',estado_entrega_envio='Pendiente' where id=c.id;
  insert into public.entregas_bitacora(contrato_id,tipo_entrega,observaciones,usuario_id) values(c.id,'reversion',btrim(p_motivo),u.id);
  for vid in select id from public.vestidos where id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id) loop perform private.refrescar_prenda_operaciones(vid);end loop;
 end if;
 if p_accion<>'revertir' then
  update public.contratos set vestido_id=principal,referencia_vestido=(select codigo from public.vestidos where id=principal) where id=c.id;
  perform private.refrescar_prenda_operaciones(p_vestido);
 end if;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,case p_accion when 'asignar' then 'Asignación de prenda' when 'quitar' then 'Retiro de prenda' else 'REVERSIÓN' end,payload::text,coalesce(u.nombre,u.email));
 result:=jsonb_build_object('contrato_id',c.id,'accion',p_accion,'vestido_principal',case when p_accion='revertir' then c.vestido_id else principal end);
 insert into private.cambios_operaciones(id,contrato_id,usuario_id,payload,result) values(p_operacion,c.id,u.id,payload,result);
 return result;
end $$;
revoke all on function private.cambiar_prenda_operaciones(uuid,text,uuid,text,uuid) from public,anon;
grant execute on function private.cambiar_prenda_operaciones(uuid,text,uuid,text,uuid) to authenticated;
create function public.cambiar_prenda_operaciones(p_contrato uuid,p_accion text,p_vestido uuid,p_motivo text,p_operacion uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.cambiar_prenda_operaciones(p_contrato,p_accion,p_vestido,p_motivo,p_operacion); $$;
revoke all on function public.cambiar_prenda_operaciones(uuid,text,uuid,text,uuid) from public,anon;
grant execute on function public.cambiar_prenda_operaciones(uuid,text,uuid,text,uuid) to authenticated;

create or replace function public.crear_enlace_operaciones(p_contrato uuid,p_tipo text,p_entrega uuid default null)
returns text language plpgsql security definer set search_path='' as $$
declare c public.contratos%rowtype; u public.profiles%rowtype; result text;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if not found or lower(u.rol) not in ('admin','asesora') then raise exception 'No autorizado.';end if;
 select * into c from public.contratos where id=p_contrato for update;
 if not found or (lower(u.rol)<>'admin' and u.sede_id is distinct from c.sede_id) then raise exception 'Contrato no disponible.';end if;
 if lower(coalesce(c.estado,'')) in ('cancelado','anulado','rechazado','finalizado') then raise exception 'El contrato está cerrado.';end if;
 if nullif(btrim(c.numero_factura),'') is null then raise exception 'El número de factura es obligatorio';end if;
 if p_tipo='firma' then
  if c.estado_aprobacion='pendiente_admin' then raise exception 'Requiere aprobación administrativa.';end if;
  if p_entrega is not null then raise exception 'Enlace no válido.';end if;
 elsif p_tipo='entrega' then
  if not exists(select 1 from public.entregas_bitacora where id=p_entrega and contrato_id=c.id and anulada_at is null and lower(coalesce(tipo_entrega,''))<>'reversion') then raise exception 'Entrega no disponible.';end if;
 else raise exception 'Tipo no válido.';end if;
 insert into private.enlaces_operaciones(contrato_id,tipo,entrega_id,created_by) values(c.id,p_tipo,p_entrega,u.id) returning token into result;
 return result;
end $$;


create or replace function public.firmar_enlace_operaciones(p_id uuid,p_token text,p_tipo text,p_firma text,p_nombre text default null,p_documento text default null)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare l private.enlaces_operaciones%rowtype; c public.contratos%rowtype; e public.entregas_bitacora%rowtype;
begin
 if p_firma is null or p_firma !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(p_firma)>1000000 then raise exception 'Firma inválida.';end if;
 select * into l from private.enlaces_operaciones where token=p_token and tipo=p_tipo and expires_at>now() and case when p_tipo='firma' then contrato_id=p_id else entrega_id=p_id end;
 if not found then raise exception 'Enlace inválido o vencido.';end if;
 select * into c from public.contratos where id=l.contrato_id for update;
 select * into l from private.enlaces_operaciones where token=p_token and expires_at>now() for update;
 if not found then raise exception 'Enlace inválido o vencido.';end if;
 if lower(coalesce(c.estado,'')) in ('cancelado','anulado','rechazado','finalizado','mantenimiento') then raise exception 'El estado del contrato no permite firmar.';end if;
 if nullif(btrim(c.numero_factura),'') is null then raise exception 'El número de factura es obligatorio';end if;
 if p_tipo='firma' then
  if c.estado_aprobacion='pendiente_admin' then raise exception 'Requiere aprobación.';end if;
  if c.firma_base64 is not null and c.firma_base64<>'' then
   if c.firma_base64=p_firma then return;end if;raise exception 'El contrato ya fue firmado.';
  end if;
  if c.estado='entregado' then raise exception 'Contrato ya entregado.';end if;
  update public.contratos set firma_base64=p_firma,fecha_firma_cliente=now(),estado='firmado' where id=c.id;
 else
  if nullif(btrim(p_nombre),'') is null or nullif(btrim(p_documento),'') is null then raise exception 'Indica nombre y documento de quien recibe.';end if;
  if coalesce(c.saldo,0)>0 or coalesce(c.valor_deposito,0)<=0 then raise exception 'Completa el pago y registra el depósito antes de entregar.';end if;
  select * into e from public.entregas_bitacora where id=l.entrega_id for update;
  if e.anulada_at is not null then raise exception 'La entrega fue revertida. Solicita una nueva acta.';end if;
  if e.finalizado or nullif(e.firma_cliente,'') is not null then
   if e.firma_cliente=p_firma then return;end if;raise exception 'La entrega ya fue firmada.';
  end if;
  update public.entregas_bitacora set firma_cliente=p_firma,finalizado=true,nombre_recibe=btrim(p_nombre),documento_recibe=btrim(p_documento),fecha_entrega_real=now() where id=e.id;
  update public.contratos set estado='entregado',entregado_prexv=case when e.tipo_entrega in ('PREXV','AMBOS') then true else entregado_prexv end,fecha_entrega_prexv=case when e.tipo_entrega in ('PREXV','AMBOS') then now() else fecha_entrega_prexv end,entregado_evento=case when coalesce(e.tipo_entrega,'EVENTO') in ('EVENTO','AMBOS') then true else entregado_evento end,fecha_entrega_evento=case when coalesce(e.tipo_entrega,'EVENTO') in ('EVENTO','AMBOS') then now() else fecha_entrega_evento end where id=c.id;
  update public.vestidos set estado='Alquilado' where id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id);
 end if;
 update private.enlaces_operaciones set used_at=now() where token=p_token;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,case when p_tipo='firma' then 'Firma de contrato' else 'Firma de entrega' end,'Firma registrada mediante enlace protegido.','Cliente');
end $$;

-- SOURCE 20260929004759_inventory_trigger_scope.sql
create or replace function public.funcion_sincronizar_conteo_vestidos() returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$ begin if tg_op='INSERT' then update public.contratos set vestidos_count=(select count(*) from public.contrato_items_vestidos where contrato_id=new.contrato_id) where id=new.contrato_id; elsif tg_op='DELETE' then update public.contratos set vestidos_count=(select count(*) from public.contrato_items_vestidos where contrato_id=old.contrato_id) where id=old.contrato_id;end if; return null;end $$;

-- SOURCE 20260929005112_correct_reversal_delivery_fields.sql
create or replace function private.cambiar_prenda_operaciones(p_contrato uuid,p_accion text,p_vestido uuid,p_motivo text,p_operacion uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.contratos%rowtype; u public.profiles%rowtype; v public.vestidos%rowtype; prior private.cambios_operaciones%rowtype;
 payload jsonb:=jsonb_build_object('accion',p_accion,'vestido',p_vestido,'motivo',btrim(coalesce(p_motivo,''))); result jsonb; principal uuid; vid uuid;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if not found or lower(u.rol) not in ('admin','asesora') then raise exception 'No autorizado.';end if;
 if p_operacion is null then raise exception 'Falta el identificador de operación.';end if;
 select * into c from public.contratos where id=p_contrato for update;
 if not found or (lower(u.rol)<>'admin' and u.sede_id is distinct from c.sede_id) then raise exception 'Contrato no disponible para tu sede.';end if;
 select * into prior from private.cambios_operaciones where id=p_operacion;
 if found then
  if prior.contrato_id<>c.id or prior.usuario_id<>u.id or prior.payload<>payload then raise exception 'Operación utilizada con otros datos.';end if;
  return prior.result||'{"repetido":true}'::jsonb;
 end if;
 if p_accion not in ('asignar','quitar','revertir') then raise exception 'Acción inválida.';end if;
 if p_accion='revertir' then
  if lower(u.rol)<>'admin' then raise exception 'Solo administración puede revertir.';end if;
  if lower(c.estado)<>'finalizado' then raise exception 'Solo se puede revertir un contrato finalizado.';end if;
  if length(btrim(coalesce(p_motivo,'')))<10 then raise exception 'Escribe un motivo de al menos 10 caracteres.';end if;
  if exists(select 1 from public.devoluciones_depositos where contrato_id=c.id and coalesce(lower(estado),'completado') not in ('cancelado','anulado','rechazado'))
   or exists(select 1 from public.solicitudes_depositos where contrato_id=c.id and estado in ('pendiente','en_proceso','pagado','devuelto'))
   or private.arreglos_pendientes(c.id)>0 then raise exception 'Hay devoluciones o descuentos registrados. No se puede reabrir el contrato conservando ese depósito como disponible.';end if;
 else
  if lower(c.estado) in ('entregado','mantenimiento','finalizado','liquidado','cancelado','anulado','rechazado') then raise exception 'El estado del contrato no permite cambiar prendas.';end if;
  if lower(u.rol)<>'admin' and (lower(c.estado)='firmado' or nullif(c.firma_base64,'') is not null) then raise exception 'Solo administración puede cambiar prendas de un contrato firmado.';end if;
  if p_vestido is null then raise exception 'Selecciona una prenda.';end if;
  if p_accion='quitar' and length(btrim(coalesce(p_motivo,'')))<5 then raise exception 'Escribe un motivo de al menos 5 caracteres.';end if;
 end if;
 -- Contract first, then all affected dresses in a consistent order.
 for vid in select id from public.vestidos where id=p_vestido or id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id) order by id loop
  perform 1 from public.vestidos where id=vid for update;
 end loop;
 if p_accion='asignar' then
  select * into v from public.vestidos where id=p_vestido;
  if not found or (lower(u.rol)<>'admin' and v.sede_id is distinct from u.sede_id) then raise exception 'Prenda no disponible para tu sede.';end if;
  if lower(coalesce(v.estado,'')) in ('en mantenimiento','mantenimiento','lavandería','lavanderia','alquilado') then raise exception 'La prenda está entregada o en mantenimiento.';end if;
  if exists(select 1 from public.mantenimiento_bitacora where vestido_id=v.id and not coalesce(completado,false) and lower(coalesce(estado,'')) not in ('finalizado','completado','cancelado')) then raise exception 'La prenda tiene mantenimiento activo.';end if;
  if exists(select 1 from public.contratos other_c where other_c.id<>c.id and lower(other_c.estado) not in ('cancelado','cancelada','anulado','anulada','rechazado','finalizado','liquidado','historial')
   and (other_c.vestido_id=v.id or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=other_c.id and i.vestido_id=v.id))
   and exists(select 1 from private.rangos_operaciones(c) a,private.rangos_operaciones(other_c) b where a&&b)) then raise exception 'La prenda tiene otra reserva en esas fechas.';end if;
  -- Preserve a legacy primary dress rather than silently replacing it.
  if c.vestido_id is not null and not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=c.vestido_id) then
   insert into public.contrato_items_vestidos(contrato_id,vestido_id,tipo,tipo_uso) values(c.id,c.vestido_id,'XV','XV');
  end if;
  if not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=v.id) then
   insert into public.contrato_items_vestidos(contrato_id,vestido_id,tipo,tipo_uso) values(c.id,v.id,'XV','XV');
  end if;
  principal:=coalesce(c.vestido_id,v.id);
 elsif p_accion='quitar' then
  select * into v from public.vestidos where id=p_vestido;
  if not found or (c.vestido_id is distinct from p_vestido and not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=p_vestido)) then raise exception 'La prenda ya no pertenece al contrato.';end if;
  delete from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=p_vestido;
  if c.vestido_id is not null and c.vestido_id<>p_vestido then principal:=c.vestido_id;
  else select vestido_id into principal from public.contrato_items_vestidos where contrato_id=c.id order by vestido_id limit 1;end if;
  insert into public.bitacora_eliminaciones_contrato(contrato_id,vestido_id,codigo_vestido_eliminado,detalle,usuario_id,motivo)
  values(c.id,v.id,v.codigo,btrim(p_motivo),u.id,'Retiro de prenda desde Operaciones');
 else
  if not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id) and c.vestido_id is null then raise exception 'El contrato no tiene prendas para reabrir.';end if;
  for vid in select id from public.vestidos where id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id) loop
   if exists(select 1 from public.mantenimiento_bitacora where vestido_id=vid and not coalesce(completado,false) and lower(coalesce(estado,'')) not in ('finalizado','completado','cancelado')) then raise exception 'Una prenda tiene mantenimiento activo.';end if;
   if exists(select 1 from public.contratos o where o.id<>c.id and lower(o.estado) not in ('cancelado','anulado','rechazado','finalizado','liquidado','historial') and (o.vestido_id=vid or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=o.id and i.vestido_id=vid)) and (lower(o.estado)='entregado' or exists(select 1 from private.rangos_operaciones(c) a,private.rangos_operaciones(o) b where a&&b))) then raise exception 'Una prenda tiene otra reserva incompatible.';end if;
  end loop;
  update private.enlaces_operaciones set expires_at=now() where contrato_id=c.id;
  update public.entregas_bitacora set anulada_at=now(),motivo_anulacion=btrim(p_motivo) where contrato_id=c.id and lower(coalesce(tipo_entrega,''))<>'reversion' and anulada_at is null;
  update public.contratos set estado='firmado',entregado_prexv=false,entregado_evento=false,fecha_entrega_prexv=null,fecha_entrega_evento=null,estado_entrega='Pendiente',finalizado_at=null where id=c.id;
  update public.vestidos_fuera_tienda set regreso_at=coalesce(regreso_at,now()),dias_fuera_cierre=coalesce(dias_fuera_cierre,greatest(1,current_date-salida_at::date)) where contrato_id=c.id and regreso_at is null;
  insert into public.entregas_bitacora(contrato_id,tipo_entrega,observaciones,usuario_id) values(c.id,'reversion',btrim(p_motivo),u.id);
  for vid in select id from public.vestidos where id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id) loop perform private.refrescar_prenda_operaciones(vid);end loop;
 end if;
 if p_accion<>'revertir' then
  update public.contratos set vestido_id=principal,referencia_vestido=(select codigo from public.vestidos where id=principal) where id=c.id;
  perform private.refrescar_prenda_operaciones(p_vestido);
 end if;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,case p_accion when 'asignar' then 'Asignación de prenda' when 'quitar' then 'Retiro de prenda' else 'REVERSIÓN' end,payload::text,coalesce(u.nombre,u.email));
 result:=jsonb_build_object('contrato_id',c.id,'accion',p_accion,'vestido_principal',case when p_accion='revertir' then c.vestido_id else principal end);
 insert into private.cambios_operaciones(id,contrato_id,usuario_id,payload,result) values(p_operacion,c.id,u.id,payload,result);
 return result;
end $$;

-- SOURCE 20260929005205_exclude_annulled_delivery_receipts.sql
CREATE OR REPLACE FUNCTION public.recibir_vestidos_operaciones(p_contrato uuid, p_operacion uuid, p_prendas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare c public.contratos%rowtype; u public.profiles%rowtype; prior private.inspecciones_operaciones%rowtype; item jsonb; total numeric:=0; importe numeric; dias integer; vid uuid; disponible numeric; ultimo date:=current_date;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if not found or lower(u.rol) not in ('admin','asesora') then raise exception 'No autorizado.';end if;
 select * into c from public.contratos where id=p_contrato for update;
 if not found or (lower(u.rol)<>'admin' and u.sede_id is distinct from c.sede_id) then raise exception 'Contrato no disponible para tu sede.';end if;
 select * into prior from private.inspecciones_operaciones where id=p_operacion;
 if found then
  if prior.contrato_id<>c.id or prior.prendas<>p_prendas then raise exception 'Operación ya utilizada con otros datos.';end if;
  return jsonb_build_object('id',prior.id,'cobro',prior.cobro,'repetido',true);
 end if;
 if p_operacion is null or jsonb_typeof(p_prendas) is distinct from 'array' or jsonb_array_length(p_prendas)=0 then raise exception 'Revisa todos los vestidos.';end if;
 if not exists(select 1 from public.entregas_bitacora where contrato_id=c.id and anulada_at is null and finalizado=true and nullif(firma_cliente,'') is not null and lower(coalesce(tipo_entrega,''))<>'reversion') then raise exception 'Primero confirma la entrega con la firma de quien recibe.';end if;
 if c.estado<>'entregado' then raise exception 'Solo se reciben vestidos de un contrato entregado.';end if;
 if exists(select 1 from public.solicitudes_depositos where contrato_id=c.id and estado in ('pendiente','en_proceso','pagado')) then raise exception 'Hay una devolución de dinero en trámite. Resuélvela antes de registrar otra recepción.';end if;
 if jsonb_array_length(p_prendas)<>(select count(*) from (select vestido_id from public.contrato_items_vestidos where contrato_id=c.id union select c.vestido_id where c.vestido_id is not null) dresses) or jsonb_array_length(p_prendas)<>(select count(distinct value->>'vestido_id') from jsonb_array_elements(p_prendas)) then raise exception 'Debes revisar cada vestido del contrato una sola vez.';end if;
 for item in select value from jsonb_array_elements(p_prendas) loop
  vid:=(item->>'vestido_id')::uuid;
  if vid is distinct from c.vestido_id and not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=vid) then raise exception 'Vestido ajeno al contrato.';end if;
  if jsonb_typeof(item->'necesita_arreglo') is distinct from 'boolean' then raise exception 'Indica si cada vestido necesita arreglo.';end if;
  importe:=(item->>'cobro')::numeric;dias:=(item->>'dias')::integer;
  if importe is null or importe::text in ('NaN','Infinity','-Infinity') or importe<0 or importe<>round(importe,2) or dias is null or dias<1 or dias>60 then raise exception 'Revisa el cobro y los días estimados.';end if;
  if (item->>'necesita_arreglo')::boolean then
   if nullif(btrim(item->>'descripcion'),'') is null then raise exception 'Describe el arreglo necesario.';end if;
  elsif importe<>0 then raise exception 'Un vestido sin arreglo no puede tener cobro.';end if;
  total:=total+importe;ultimo:=greatest(ultimo,(now() at time zone 'America/Bogota')::date+dias);
 end loop;
 select coalesce(c.valor_deposito,0)-coalesce(sum(monto_devuelto+coalesce(monto_descuento,0)),0)-private.arreglos_pendientes(c.id) into disponible from public.devoluciones_depositos where contrato_id=c.id and coalesce(lower(estado),'completado') not in ('cancelado','anulado','rechazado');
 if total>disponible then raise exception 'El cobro por arreglos supera el depósito disponible (%).',disponible;end if;
 insert into private.inspecciones_operaciones(id,contrato_id,prendas,cobro,usuario_id) values(p_operacion,c.id,p_prendas,total,u.id);
 for item in select value from jsonb_array_elements(p_prendas) loop
  insert into public.mantenimiento_bitacora(contrato_id,vestido_id,tipo,tipo_mantenimiento,descripcion_danos,cobro_arreglo,dias_estimados,fecha_salida_estimada,estado,completado,usuario_id,inspeccion_id)
  values(c.id,(item->>'vestido_id')::uuid,case when (item->>'necesita_arreglo')::boolean then 'SASTRERÍA' else 'LAVANDERÍA' end,case when (item->>'necesita_arreglo')::boolean then 'SASTRERÍA' else 'LAVANDERÍA' end,nullif(btrim(item->>'descripcion'),''),(item->>'cobro')::numeric,(item->>'dias')::integer,now()+make_interval(days=>(item->>'dias')::integer),'en proceso',false,u.id,p_operacion);
  update public.vestidos set estado='EN MANTENIMIENTO' where id=(item->>'vestido_id')::uuid;
 end loop;
 update public.contratos set estado='mantenimiento',fecha_disponibilidad_real=ultimo where id=c.id;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,'Devolución de vestidos revisada',jsonb_build_object('inspeccion',p_operacion,'prendas',p_prendas,'descuento_del_deposito',total)::text,coalesce(u.nombre,u.email));
 return jsonb_build_object('id',p_operacion,'cobro',total,'devolucion_estimada',disponible-total);
end $function$;

-- SOURCE 20260929005237_validate_inventory_actions.sql
create or replace function private.cambiar_prenda_operaciones(p_contrato uuid,p_accion text,p_vestido uuid,p_motivo text,p_operacion uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.contratos%rowtype; u public.profiles%rowtype; v public.vestidos%rowtype; prior private.cambios_operaciones%rowtype;
 payload jsonb:=jsonb_build_object('accion',p_accion,'vestido',p_vestido,'motivo',btrim(coalesce(p_motivo,''))); result jsonb; principal uuid; vid uuid;
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true);
 if not found or coalesce(lower(u.rol),'') not in ('admin','asesora') then raise exception 'No autorizado.';end if;
 if p_operacion is null then raise exception 'Falta el identificador de operación.';end if;
 select * into c from public.contratos where id=p_contrato for update;
 if not found or (lower(u.rol)<>'admin' and u.sede_id is distinct from c.sede_id) then raise exception 'Contrato no disponible para tu sede.';end if;
 select * into prior from private.cambios_operaciones where id=p_operacion;
 if found then
  if prior.contrato_id<>c.id or prior.usuario_id<>u.id or prior.payload<>payload then raise exception 'Operación utilizada con otros datos.';end if;
  return prior.result||'{"repetido":true}'::jsonb;
 end if;
 if p_accion is null or p_accion not in ('asignar','quitar','revertir') then raise exception 'Acción inválida.';end if;
 if p_accion='revertir' then
  if lower(u.rol)<>'admin' then raise exception 'Solo administración puede revertir.';end if;
  if lower(c.estado)<>'finalizado' then raise exception 'Solo se puede revertir un contrato finalizado.';end if;
  if length(btrim(coalesce(p_motivo,'')))<10 then raise exception 'Escribe un motivo de al menos 10 caracteres.';end if;
  if exists(select 1 from public.devoluciones_depositos where contrato_id=c.id and coalesce(lower(estado),'completado') not in ('cancelado','anulado','rechazado'))
   or exists(select 1 from public.solicitudes_depositos where contrato_id=c.id and estado in ('pendiente','en_proceso','pagado','devuelto'))
   or private.arreglos_pendientes(c.id)>0 then raise exception 'Hay devoluciones o descuentos registrados. No se puede reabrir el contrato conservando ese depósito como disponible.';end if;
 else
  if lower(c.estado) in ('entregado','mantenimiento','finalizado','liquidado','cancelado','anulado','rechazado') then raise exception 'El estado del contrato no permite cambiar prendas.';end if;
  if lower(u.rol)<>'admin' and (lower(c.estado)='firmado' or nullif(c.firma_base64,'') is not null) then raise exception 'Solo administración puede cambiar prendas de un contrato firmado.';end if;
  if p_vestido is null then raise exception 'Selecciona una prenda.';end if;
  if p_accion='quitar' and length(btrim(coalesce(p_motivo,'')))<5 then raise exception 'Escribe un motivo de al menos 5 caracteres.';end if;
 end if;
 -- Contract first, then all affected dresses in a consistent order.
 for vid in select id from public.vestidos where id=p_vestido or id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id) order by id loop
  perform 1 from public.vestidos where id=vid for update;
 end loop;
 if p_accion='asignar' then
  select * into v from public.vestidos where id=p_vestido;
  if not found or (lower(u.rol)<>'admin' and v.sede_id is distinct from u.sede_id) then raise exception 'Prenda no disponible para tu sede.';end if;
  if lower(coalesce(v.estado,'')) in ('en mantenimiento','mantenimiento','lavandería','lavanderia','alquilado') then raise exception 'La prenda está entregada o en mantenimiento.';end if;
  if exists(select 1 from public.mantenimiento_bitacora where vestido_id=v.id and not coalesce(completado,false) and lower(coalesce(estado,'')) not in ('finalizado','completado','cancelado')) then raise exception 'La prenda tiene mantenimiento activo.';end if;
  if exists(select 1 from public.contratos other_c where other_c.id<>c.id and lower(other_c.estado) not in ('cancelado','cancelada','anulado','anulada','rechazado','finalizado','liquidado','historial')
   and (other_c.vestido_id=v.id or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=other_c.id and i.vestido_id=v.id))
   and exists(select 1 from private.rangos_operaciones(c) a,private.rangos_operaciones(other_c) b where a&&b)) then raise exception 'La prenda tiene otra reserva en esas fechas.';end if;
  -- Preserve a legacy primary dress rather than silently replacing it.
  if c.vestido_id is not null and not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=c.vestido_id) then
   insert into public.contrato_items_vestidos(contrato_id,vestido_id,tipo,tipo_uso) values(c.id,c.vestido_id,'XV','XV');
  end if;
  if not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=v.id) then
   insert into public.contrato_items_vestidos(contrato_id,vestido_id,tipo,tipo_uso) values(c.id,v.id,'XV','XV');
  end if;
  principal:=coalesce(c.vestido_id,v.id);
 elsif p_accion='quitar' then
  select * into v from public.vestidos where id=p_vestido;
  if not found or (c.vestido_id is distinct from p_vestido and not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=p_vestido)) then raise exception 'La prenda ya no pertenece al contrato.';end if;
  delete from public.contrato_items_vestidos where contrato_id=c.id and vestido_id=p_vestido;
  if c.vestido_id is not null and c.vestido_id<>p_vestido then principal:=c.vestido_id;
  else select vestido_id into principal from public.contrato_items_vestidos where contrato_id=c.id order by vestido_id limit 1;end if;
  insert into public.bitacora_eliminaciones_contrato(contrato_id,vestido_id,codigo_vestido_eliminado,detalle,usuario_id,motivo)
  values(c.id,v.id,v.codigo,btrim(p_motivo),u.id,'Retiro de prenda desde Operaciones');
 else
  if not exists(select 1 from public.contrato_items_vestidos where contrato_id=c.id) and c.vestido_id is null then raise exception 'El contrato no tiene prendas para reabrir.';end if;
  for vid in select id from public.vestidos where id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id) loop
   if exists(select 1 from public.mantenimiento_bitacora where vestido_id=vid and not coalesce(completado,false) and lower(coalesce(estado,'')) not in ('finalizado','completado','cancelado')) then raise exception 'Una prenda tiene mantenimiento activo.';end if;
   if exists(select 1 from public.contratos o where o.id<>c.id and lower(o.estado) not in ('cancelado','anulado','rechazado','finalizado','liquidado','historial') and (o.vestido_id=vid or exists(select 1 from public.contrato_items_vestidos i where i.contrato_id=o.id and i.vestido_id=vid)) and (lower(o.estado)='entregado' or exists(select 1 from private.rangos_operaciones(c) a,private.rangos_operaciones(o) b where a&&b))) then raise exception 'Una prenda tiene otra reserva incompatible.';end if;
  end loop;
  update private.enlaces_operaciones set expires_at=now() where contrato_id=c.id;
  update public.entregas_bitacora set anulada_at=now(),motivo_anulacion=btrim(p_motivo) where contrato_id=c.id and lower(coalesce(tipo_entrega,''))<>'reversion' and anulada_at is null;
  update public.contratos set estado='firmado',entregado_prexv=false,entregado_evento=false,fecha_entrega_prexv=null,fecha_entrega_evento=null,estado_entrega='Pendiente',finalizado_at=null where id=c.id;
  update public.vestidos_fuera_tienda set regreso_at=coalesce(regreso_at,now()),dias_fuera_cierre=coalesce(dias_fuera_cierre,greatest(1,current_date-salida_at::date)) where contrato_id=c.id and regreso_at is null;
  insert into public.entregas_bitacora(contrato_id,tipo_entrega,observaciones,usuario_id) values(c.id,'reversion',btrim(p_motivo),u.id);
  for vid in select id from public.vestidos where id=c.vestido_id or id in(select vestido_id from public.contrato_items_vestidos where contrato_id=c.id) loop perform private.refrescar_prenda_operaciones(vid);end loop;
 end if;
 if p_accion<>'revertir' then
  update public.contratos set vestido_id=principal,referencia_vestido=(select codigo from public.vestidos where id=principal) where id=c.id;
  perform private.refrescar_prenda_operaciones(p_vestido);
 end if;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(c.id,case p_accion when 'asignar' then 'Asignación de prenda' when 'quitar' then 'Retiro de prenda' else 'REVERSIÓN' end,payload::text,coalesce(u.nombre,u.email));
 result:=jsonb_build_object('contrato_id',c.id,'accion',p_accion,'vestido_principal',case when p_accion='revertir' then c.vestido_id else principal end);
 insert into private.cambios_operaciones(id,contrato_id,usuario_id,payload,result) values(p_operacion,c.id,u.id,payload,result);
 return result;
end $$;

-- Integration with the existing production workflows. No historical row updates.
CREATE OR REPLACE FUNCTION private.registrar_salida_vestidos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if lower(coalesce(new.tipo_entrega,''))<>'reversion' and new.anulada_at is null and new.finalizado and nullif(new.firma_cliente,'') is not null then
  insert into public.vestidos_fuera_tienda(contrato_id,vestido_id,entrega_id,salida_at)
  select new.contrato_id,i.vestido_id,new.id,coalesce(new.fecha_entrega_real,new.created_at,now()) from (select vestido_id from public.contrato_items_vestidos where contrato_id=new.contrato_id union select vestido_id from public.contratos where id=new.contrato_id and vestido_id is not null) i
  on conflict(contrato_id,vestido_id) where regreso_at is null do nothing;
 end if; return new;
end $function$
;

drop trigger if exists registrar_salida_vestidos on public.entregas_bitacora;
create trigger registrar_salida_vestidos after insert or update of firma_cliente,finalizado on public.entregas_bitacora for each row execute function private.registrar_salida_vestidos();
CREATE OR REPLACE FUNCTION private.cerrar_salida_y_solicitar_devolucion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pendiente numeric; saldo numeric; metodo text; solicitante uuid; solicitante_nombre text; begin
 if lower(new.estado)='mantenimiento' and lower(coalesce(old.estado,''))<>'mantenimiento' then
  update public.vestidos_fuera_tienda set regreso_at=clock_timestamp(),dias_fuera_cierre=greatest(1,(clock_timestamp()::date-salida_at::date)) where contrato_id=new.id and regreso_at is null;
 end if;
 if lower(new.estado)='finalizado' and lower(coalesce(old.estado,''))<>'finalizado' then
  new.finalizado_at:=coalesce(new.finalizado_at,clock_timestamp());
  if new.finalizado_at>='2026-09-14 00:00:00-05'::timestamptz then
   select coalesce(new.valor_deposito,0)-coalesce(sum(d.monto_devuelto+coalesce(d.monto_descuento,0)),0) into saldo from public.devoluciones_depositos d where d.contrato_id=new.id and coalesce(lower(d.estado),'completado') not in ('cancelado','anulado','rechazado');
   pendiente:=private.arreglos_pendientes(new.id);
   if pendiente>saldo then raise exception 'Los arreglos superan el saldo disponible.';end if;
   if exists(select 1 from public.solicitudes_depositos where contrato_id=new.id and estado in ('pendiente','en_proceso','pagado') and pendiente>coalesce(descuento_arreglos,0)) then raise exception 'Hay descuentos nuevos y una solicitud existente. Revisa la solicitud antes de finalizar.';end if;
   if saldo>0 and not exists(select 1 from public.solicitudes_depositos s where s.contrato_id=new.id and s.estado in ('pendiente','en_proceso','pagado')) then
    select coalesce((select m.metodo from public.movimientos_depositos m where m.contrato_id=new.id and m.tipo='ingreso' order by m.created_at desc limit 1),'Transferencia') into metodo;
    if metodo not in ('Efectivo','Transferencia') then metodo:='Transferencia'; end if;
    select p.id,p.nombre into solicitante,solicitante_nombre from public.profiles p where p.id=(select auth.uid());
    if solicitante is not null then
     insert into public.solicitudes_depositos(id,contrato_id,monto,descuento,descuento_arreglos,motivo,metodo,estado,solicitante_id,solicitante_nombre,recibido_at,banco,tipo_cuenta,cuenta,titular,observaciones)
     values(gen_random_uuid(),new.id,saldo-pendiente,pendiente,pendiente,case when pendiente>0 then 'Arreglos registrados en la inspección de devolución' else null end,metodo,'pendiente',solicitante,coalesce(solicitante_nombre,'Usuario'),now(),new.banco_deposito,new.tipo_cuenta_deposito,new.numero_cuenta_deposito,new.titular_cuenta_deposito,'Solicitud automática al finalizar contrato');
    end if;
   end if;
  end if;
 end if; return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.finalizar_contrato_con_deposito(p_contrato uuid, p_descuento numeric, p_motivo text, p_saldo_esperado numeric, p_solicitud_esperada uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 u public.profiles%rowtype; c public.contratos%rowtype;
 s public.solicitudes_depositos%rowtype;
 pendiente numeric; disponible numeric; solicitud uuid; existente boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión.' USING ERRCODE='42501'; END IF;
 SELECT * INTO u FROM public.profiles WHERE id=auth.uid() AND coalesce(activo,true);
 IF NOT FOUND OR lower(btrim(u.rol)) NOT IN ('admin','asesora') THEN
  RAISE EXCEPTION 'No tienes permiso para finalizar contratos.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO c FROM public.contratos WHERE id=p_contrato FOR UPDATE;
 IF NOT FOUND OR (lower(btrim(u.rol))<>'admin' AND (u.sede_id IS NULL OR u.sede_id IS DISTINCT FROM c.sede_id)) THEN
  RAISE EXCEPTION 'No tienes acceso a este contrato.' USING ERRCODE='42501';
 END IF;
 IF lower(c.estado)='finalizado' THEN
  RETURN jsonb_build_object('finalizado',true,'repetido',true);
 END IF;
 IF lower(coalesce(c.estado,''))<>'mantenimiento' THEN RAISE EXCEPTION 'El contrato debe estar en mantenimiento antes de finalizar.'; END IF;
 IF coalesce(c.entregado_prexv,false) AND NOT coalesce(c.entregado_evento,false) THEN RAISE EXCEPTION 'Falta la entrega del evento. Libera los vestidos para continuar el contrato.'; END IF;
 IF coalesce(c.saldo,0)+coalesce(c.total_multas,0)>0 THEN RAISE EXCEPTION 'El contrato tiene saldo pendiente. Actualiza los datos antes de finalizar.'; END IF;
 IF nullif(btrim(c.numero_factura),'') IS NULL THEN RAISE EXCEPTION 'Registra la factura antes de finalizar.'; END IF;
 SELECT coalesce(c.valor_deposito,0)-coalesce(sum(d.monto_devuelto+coalesce(d.monto_descuento,0)),0)
 INTO disponible FROM public.devoluciones_depositos d WHERE d.contrato_id=c.id
 AND coalesce(lower(d.estado),'completado') NOT IN ('cancelado','anulado','rechazado');
 IF disponible<0 OR p_saldo_esperado IS DISTINCT FROM disponible THEN RAISE EXCEPTION 'El saldo del depósito cambió. Cierra y vuelve a abrir la confirmación.'; END IF;
 IF p_descuento IS NULL OR p_descuento::text IN ('NaN','Infinity','-Infinity') OR p_descuento<0 OR p_descuento>disponible OR p_descuento<>round(p_descuento,2) THEN
  RAISE EXCEPTION 'El descuento debe estar entre cero y el saldo disponible, con máximo dos decimales.';
 END IF;
 pendiente:=private.arreglos_pendientes(c.id);

 IF p_descuento>0 AND nullif(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Escribe el motivo del descuento.'; END IF;
 SELECT * INTO s FROM public.solicitudes_depositos
 WHERE contrato_id=c.id AND estado IN ('pendiente','en_proceso','pagado') ORDER BY created_at LIMIT 1 FOR UPDATE;
 existente:=FOUND;
 IF NOT existente AND p_descuento<pendiente THEN RAISE EXCEPTION 'Debes descontar los arreglos registrados: %.',pendiente; END IF;
 IF existente AND pendiente>coalesce(s.descuento_arreglos,0) THEN RAISE EXCEPTION 'Hay arreglos nuevos no incluidos en la solicitud existente.'; END IF;
 IF (CASE WHEN existente THEN s.id ELSE NULL END) IS DISTINCT FROM p_solicitud_esperada THEN
  RAISE EXCEPTION 'La solicitud de devolución cambió. Cierra y vuelve a abrir la confirmación.';
 END IF;
 IF existente AND p_descuento<>0 THEN RAISE EXCEPTION 'Ya existe una solicitud de devolución; sus importes se conservan.'; END IF;
 -- The existing trigger creates the request; all following edits are in this same transaction.
 UPDATE public.contratos SET estado='finalizado' WHERE id=c.id;
 IF NOT existente AND disponible>0 THEN
  SELECT id INTO solicitud FROM public.solicitudes_depositos
  WHERE contrato_id=c.id AND estado='pendiente' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF solicitud IS NULL THEN RAISE EXCEPTION 'No se pudo crear la solicitud de devolución. No se finalizó el contrato.'; END IF;
  UPDATE public.solicitudes_depositos SET monto=disponible-p_descuento,descuento=p_descuento,descuento_arreglos=pendiente,
   motivo=CASE WHEN p_descuento>0 THEN btrim(p_motivo) ELSE NULL END WHERE id=solicitud;
  INSERT INTO public.historial_solicitudes_depositos(solicitud_id,estado,usuario_id,usuario_nombre,detalle)
  VALUES(solicitud,'pendiente',u.id,coalesce(u.nombre,u.email),
   'Cierre de contrato. Saldo del depósito: '||disponible||'. Descuento: '||p_descuento||
   '. Devolución: '||(disponible-p_descuento)||CASE WHEN p_descuento>0 THEN '. Motivo: '||btrim(p_motivo) ELSE '' END);
 ELSE solicitud:=s.id;
 END IF;
 UPDATE public.mantenimiento_bitacora SET estado='finalizado',completado=true WHERE contrato_id=c.id AND estado IS DISTINCT FROM 'finalizado';
 UPDATE public.vestidos SET estado='Disponible' WHERE id=c.vestido_id OR id IN (SELECT vestido_id FROM public.contrato_items_vestidos WHERE contrato_id=c.id);
 PERFORM private.refrescar_prenda_operaciones(v.id) FROM public.vestidos v
 WHERE v.id=c.vestido_id OR v.id IN (SELECT vestido_id FROM public.contrato_items_vestidos WHERE contrato_id=c.id);
 INSERT INTO public.bitacora_cambios(contrato_id,tipo_evento,motivo,usuario_id)
 VALUES(c.id,'🔓 Liberación Manual','Cierre y liberación manual por '||coalesce(u.nombre,u.email)||
  '. Saldo depósito: '||disponible||'. Descuento registrado en este cierre: '||p_descuento||'. '||coalesce(p_motivo,''),u.id);
 RETURN jsonb_build_object('finalizado',true,'solicitud_id',solicitud,'descuento',CASE WHEN existente THEN s.descuento ELSE p_descuento END,
  'monto_devolver',CASE WHEN existente THEN s.monto ELSE disponible-p_descuento END);
END $function$
;
