
CREATE OR REPLACE FUNCTION private.finalizar_contrato_con_deposito(
 p_contrato uuid, p_descuento numeric, p_motivo text,
 p_saldo_esperado numeric, p_solicitud_esperada uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
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
END $fn$;
REVOKE ALL ON FUNCTION private.finalizar_contrato_con_deposito(uuid,numeric,text,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.finalizar_contrato_con_deposito(uuid,numeric,text,numeric,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.finalizar_contrato_con_deposito(
 p_contrato uuid,p_descuento numeric,p_motivo text,p_saldo_esperado numeric,p_solicitud_esperada uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.finalizar_contrato_con_deposito(p_contrato,p_descuento,p_motivo,p_saldo_esperado,p_solicitud_esperada);
$fn$;
REVOKE ALL ON FUNCTION public.finalizar_contrato_con_deposito(uuid,numeric,text,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalizar_contrato_con_deposito(uuid,numeric,text,numeric,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
