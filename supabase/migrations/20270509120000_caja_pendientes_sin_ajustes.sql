-- Abonos pendientes de caja: the «Ajuste:» payments (made so the ERP matches Siigo) are not money of the day and never go to the cash
-- register, so they are not listed as pending (private.caja_abonos_pendientes, used by Cierres de caja and public.caja_pendientes).
-- Reversible: restore private.caja_abonos_pendientes from 20270503120000_caja_dia_del_pago.sql.
do $$
declare d text:=pg_get_functiondef('private.caja_abonos_pendientes()'::regprocedure);
begin
 if position('Ajuste:' in d)=0 then
  d:=replace(d,'p.valor_pagado>0 and p.anulado_at is null','p.valor_pagado>0 and p.anulado_at is null and coalesce(p.observaciones,'''') not like ''Ajuste:%''');
  execute d;
 end if;
end $$;
