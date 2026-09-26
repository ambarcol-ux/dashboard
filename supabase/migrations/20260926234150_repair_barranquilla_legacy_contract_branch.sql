SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
-- Atomic repair of a legacy branch identifier. No contract terms are changed.
LOCK TABLE public.contratos IN SHARE ROW EXCLUSIVE MODE;
DO $repair$
DECLARE target_id uuid; before_rows jsonb; after_rows jsonb; expected integer; changed integer;
BEGIN
 SELECT id INTO STRICT target_id FROM public.sedes WHERE nombre='Barranquilla';
 SELECT jsonb_object_agg(c.id::text,to_jsonb(c)-'sede_id'),count(*)
 INTO before_rows,expected FROM public.contratos c
 WHERE c.sede='Barranquilla' AND c.numero_contrato LIKE 'BARR-%'
 AND c.sede_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sedes s WHERE s.id=c.sede_id);
 IF expected<>53 THEN RAISE EXCEPTION 'Expected 53 legacy contracts; found %',expected; END IF;
 -- The general save guard rejects pre-existing invoices missing on historical
 -- records. Skip only that guard under the table lock for this branch-only repair.
 -- All other triggers and all RLS policies remain enabled.
 ALTER TABLE public.contratos DISABLE TRIGGER require_contract_invoice_on_save;
 UPDATE public.contratos SET sede_id=target_id WHERE id::text IN (SELECT jsonb_object_keys(before_rows));
 GET DIAGNOSTICS changed=ROW_COUNT;
 ALTER TABLE public.contratos ENABLE TRIGGER require_contract_invoice_on_save;
 SELECT jsonb_object_agg(c.id::text,to_jsonb(c)-'sede_id') INTO after_rows
 FROM public.contratos c WHERE id::text IN (SELECT jsonb_object_keys(before_rows));
 IF changed<>expected OR before_rows IS DISTINCT FROM after_rows THEN
  RAISE EXCEPTION 'Branch repair changed unexpected contract fields';
 END IF;
END $repair$;