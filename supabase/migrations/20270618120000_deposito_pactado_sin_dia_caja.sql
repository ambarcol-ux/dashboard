-- The agreed deposit (valor_deposito) no longer depends on the cash register of the day the contract was created: it does not move
-- the cash (payments go through «Pago de depósito»). Role, store and reason checks stay; it cannot drop below what she already paid.
-- Reversible: restore «perform private.puede_corregir(c.sede_id,private.fecha_deposito_contrato(p_contrato));».
do $mig$
declare d text:=pg_get_functiondef('private.corregir_valores_iniciales_contrato(uuid,numeric,numeric,text)'::regprocedure);
 a text:='perform private.puede_corregir(c.sede_id,private.fecha_deposito_contrato(p_contrato));';
begin
 if position(a in d)=0 then return; end if;
 d:=replace(d,a,'perform private.puede_corregir(c.sede_id,null);'||E'\n  if p_deposito<private.deposito_pagado(p_contrato) then raise exception ''El depósito pactado no puede ser menor a lo que la clienta ya pagó de depósito ($%).'',to_char(private.deposito_pagado(p_contrato),''FM999G999G999''); end if;');
 execute d;
end $mig$;
