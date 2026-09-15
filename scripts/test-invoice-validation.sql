-- Run after the migration. All test data is temporary and rolled back.
BEGIN;
CREATE TEMP TABLE invoice_validation_test (id integer, numero_factura text, other_field text);
INSERT INTO invoice_validation_test VALUES (1, NULL, 'original'), (2, 'FAC-123', 'original');
CREATE TRIGGER invoice_test BEFORE UPDATE OF numero_factura ON invoice_validation_test
FOR EACH ROW EXECUTE FUNCTION public.require_contract_invoice();
DO $$
DECLARE v text; i integer; failures integer := 0;
BEGIN
  FOREACH i IN ARRAY ARRAY[1,2] LOOP
    FOREACH v IN ARRAY ARRAY[NULL, '', ' ', E'\t\n', U&'\00A0', U&'\2003'] LOOP
      BEGIN
        UPDATE invoice_validation_test SET numero_factura = v WHERE id = i;
        RAISE EXCEPTION 'Empty invoice accepted';
      EXCEPTION WHEN check_violation THEN
        IF SQLERRM <> 'El número de factura es obligatorio' THEN RAISE; END IF;
        failures := failures + 1;
      END;
    END LOOP;
  END LOOP;
  IF failures <> 12 THEN RAISE EXCEPTION 'Missing validation'; END IF;
  UPDATE invoice_validation_test SET other_field = 'edited' WHERE id = 1;
  IF NOT EXISTS (SELECT 1 FROM invoice_validation_test WHERE id = 1 AND numero_factura IS NULL AND other_field='edited') THEN RAISE EXCEPTION 'Legacy edit broken'; END IF;
  UPDATE invoice_validation_test SET numero_factura='FAC-456';
  IF (SELECT count(*) FROM invoice_validation_test WHERE numero_factura='FAC-456') <> 2 THEN RAISE EXCEPTION 'Valid invoice rejected'; END IF;
END $$;
SELECT 'PASS: 12 empty writes rejected, legacy unrelated update and valid invoices accepted' result;
ROLLBACK;
