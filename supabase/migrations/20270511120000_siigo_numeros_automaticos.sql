-- Siigo numbers are not typed in the ERP: the receipt number of a contract payment (pagos.numero_recibo) is the one Siigo gives when
-- the receipt is created (RC-…), or «Incluido en FV-…» when the payment went inside the invoice. The invoice number already arrives by
-- itself (private siigo_resultado_servidor). Only empty or «SIIGO-PENDIENTE» numbers are filled; typed ones are kept.
-- Reversible: drop trigger siigo_numero_recibo_pago on public.siigo_documentos; drop function private.siigo_numero_recibo_pago().

create or replace function private.siigo_numero_recibo_pago() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.tipo='recibo_caja' and new.origen='pago' and new.estado='enviado' and coalesce(new.siigo_numero,'')<>'' then
  update public.pagos set numero_recibo=new.siigo_numero
  where id=new.origen_id and (coalesce(btrim(numero_recibo),'')='' or numero_recibo ilike 'siigo%');
 end if;
 return new;
end $$;
create or replace trigger siigo_numero_recibo_pago after insert or update of estado, siigo_numero on public.siigo_documentos
 for each row execute function private.siigo_numero_recibo_pago();

-- Receipts already sent.
update public.pagos p set numero_recibo=d.siigo_numero
from public.siigo_documentos d
where d.tipo='recibo_caja' and d.origen='pago' and d.origen_id=p.id and d.estado='enviado' and coalesce(d.siigo_numero,'')<>''
 and (coalesce(btrim(p.numero_recibo),'')='' or p.numero_recibo ilike 'siigo%');
