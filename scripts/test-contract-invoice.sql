-- Run inside a transaction after the migration; the caller must ROLLBACK.
DO $$
DECLARE
  test_id uuid := gen_random_uuid();
  v text;
  field_name text;
  invoice text;
BEGIN
  FOREACH v IN ARRAY ARRAY[NULL, '', ' ', E'\t\n', U&'\00A0', U&'\2003', U&'\FEFF'] LOOP
    BEGIN
      INSERT INTO public.contratos(id, numero_contrato, estado, cliente_nombre,
        cliente_documento, cliente_email, fecha_evento, valor_total, sede, whatsapp, numero_factura)
      VALUES(test_id, 'TEST-INVOICE-' || test_id, 'borrador', 'PRUEBA TEMPORAL',
        'PRUEBA', 'test@example.invalid', current_date + 100, 100, 'PRUEBA', '', v);
      RAISE EXCEPTION 'Accepted an empty invoice on INSERT';
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM <> 'El número de factura es obligatorio' THEN RAISE; END IF;
    END;
  END LOOP;

  INSERT INTO public.contratos(id, numero_contrato, estado, cliente_nombre,
    cliente_documento, cliente_email, fecha_evento, valor_total, sede, whatsapp, numero_factura)
  VALUES(test_id, 'TEST-INVOICE-' || test_id, 'borrador', 'PRUEBA TEMPORAL',
    'PRUEBA', 'test@example.invalid', current_date + 100, 100, 'PRUEBA', '', 'FAC-TEST-001');
  SELECT public.contract_invoice_for_issue(test_id) INTO invoice;
  IF invoice <> 'FAC-TEST-001' THEN RAISE EXCEPTION 'Invoice not persisted'; END IF;

  FOREACH v IN ARRAY ARRAY[NULL, '', ' ', E'\t\n', U&'\00A0', U&'\2003', U&'\FEFF'] LOOP
    BEGIN
      UPDATE public.contratos SET numero_factura = v WHERE id = test_id;
      RAISE EXCEPTION 'Accepted empty invoice on UPDATE';
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM <> 'El número de factura es obligatorio' THEN RAISE; END IF;
    END;
  END LOOP;
  UPDATE public.contratos SET numero_factura='FAC-TEST-002', cliente_nombre='PRUEBA EDITADA'
    WHERE id=test_id;
  IF NOT EXISTS(SELECT 1 FROM public.contratos WHERE id=test_id AND numero_factura='FAC-TEST-002'
    AND cliente_nombre='PRUEBA EDITADA' AND valor_total=100) THEN
    RAISE EXCEPTION 'Edit/read-back or financial preservation failed';
  END IF;
  UPDATE public.contratos SET estado='firmado', firma_base64='TEST-ONLY' WHERE id=test_id;
  UPDATE public.contratos SET estado='finalizado' WHERE id=test_id;

  -- A pre-migration fixture is created by the test runner, never a real contract.
  SELECT id INTO test_id FROM public.contratos WHERE numero_contrato = current_setting('test.legacy_contract');
  IF test_id IS NULL THEN RAISE EXCEPTION 'Missing legacy fixture'; END IF;
  BEGIN
    PERFORM public.contract_invoice_for_issue(test_id);
    RAISE EXCEPTION 'Issued legacy contract without invoice';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'El número de factura es obligatorio' THEN RAISE; END IF;
  END;
  FOREACH v IN ARRAY ARRAY['firmado','finalizado','emitido'] LOOP
    BEGIN
      UPDATE public.contratos SET estado=v WHERE id=test_id;
      RAISE EXCEPTION 'Finalized legacy contract without invoice';
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM <> 'El número de factura es obligatorio' THEN RAISE; END IF;
    END;
  END LOOP;
  BEGIN
    UPDATE public.contratos SET cliente_nombre='EVASION SIN FACTURA' WHERE id=test_id;
    RAISE EXCEPTION 'Bypassed validation by omitting invoice';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'El número de factura es obligatorio' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.contratos SET estado_aprobacion='aprobado' WHERE id=test_id;
    RAISE EXCEPTION 'Approved contract without invoice';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'El número de factura es obligatorio' THEN RAISE; END IF;
  END;
  UPDATE public.contratos SET estado='mantenimiento' WHERE id=test_id;
  UPDATE public.contratos SET estado_medidas='Asistió' WHERE id=test_id;
  UPDATE public.contratos SET estado='anulado' WHERE id=test_id;
  UPDATE public.contratos SET numero_factura='FAC-LEGACY-001', cliente_nombre='PRUEBA EDITADA' WHERE id=test_id;
  IF public.contract_invoice_for_issue(test_id) <> 'FAC-LEGACY-001' THEN
    RAISE EXCEPTION 'Legacy invoice registration failed';
  END IF;
END;
$$;
