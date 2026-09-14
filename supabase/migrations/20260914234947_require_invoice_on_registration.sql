-- Factura is registered after contract creation. Preserve that lifecycle and
-- existing pending contracts; reject every explicit attempt to save it empty.
CREATE OR REPLACE FUNCTION public.require_contract_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Match JavaScript String.trim(), including tabs and Unicode whitespace.
  IF NEW.numero_factura IS NULL OR btrim(NEW.numero_factura,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'El campo Factura es obligatorio. Ingresa el número de factura para guardar.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER require_contract_invoice_on_update
BEFORE UPDATE OF numero_factura ON public.contratos
FOR EACH ROW EXECUTE FUNCTION public.require_contract_invoice();
