-- No backfill or UPDATE: historical contracts retain their original data.
CREATE OR REPLACE FUNCTION public.require_contract_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.numero_factura IS NULL OR btrim(NEW.numero_factura,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'El número de factura es obligatorio';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS require_contract_invoice_on_update ON public.contratos;
CREATE TRIGGER require_contract_invoice_on_save
BEFORE INSERT OR UPDATE OF
  numero_factura, numero_contrato, cliente_nombre, cliente_documento,
  cliente_whatsapp, cliente_email, cliente_direccion, quinceanera_name,
  sede, sede_id, asesora, asesora_id, tipo_evento, tipo_entrega,
  fecha_evento, fecha_pre_xv, fecha_cita_medidas, fecha_prueba_final,
  fecha_entrega_envio, fecha_retorno_prevista, fecha_fotografia, fecha_maquillaje,
  prexv_fotografo, prexv_maquilladora, prexv_locacion, observaciones_vestido,
  observaciones_arreglos, valor_total, anticipo, total_arreglos,
  valor_deposito, banco_deposito, tipo_cuenta_deposito,
  numero_cuenta_deposito, titular_cuenta_deposito, accesorios,
  metodos_pago, vestido_id, autoriza_uso_imagen,
  firma_base64, fecha_firma_cliente, fecha_firma, url_pdf_firmado
ON public.contratos
FOR EACH ROW EXECUTE FUNCTION public.require_contract_invoice();

-- Retain operational cancellation/maintenance flows on historical rows.
-- Signing, finalizing and issuing always require an invoice, including via API.
CREATE TRIGGER require_contract_invoice_on_finalization
BEFORE UPDATE OF estado ON public.contratos
FOR EACH ROW
WHEN (lower(NEW.estado) IN ('borrador', 'pendiente_admin', 'firmado', 'finalizado', 'emitido'))
EXECUTE FUNCTION public.require_contract_invoice();

CREATE TRIGGER require_contract_invoice_on_approval
BEFORE UPDATE OF estado_aprobacion ON public.contratos
FOR EACH ROW WHEN (lower(NEW.estado_aprobacion) = 'aprobado')
EXECUTE FUNCTION public.require_contract_invoice();

CREATE FUNCTION public.contract_invoice_for_issue(contract_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
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
$$;
REVOKE ALL ON FUNCTION public.contract_invoice_for_issue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contract_invoice_for_issue(uuid) TO authenticated;
