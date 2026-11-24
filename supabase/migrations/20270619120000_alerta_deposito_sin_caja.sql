-- Inicio › «Contratos con datos por revisar»: new case for contracts from November with the deposit marked as paid under the old rule
-- (deposito_pagado_previo) and no deposit income in the cash register. Administration fixes them with the real date and method.
-- Reversible: remove the added WHEN line from private.alertas_inicio_sede.
do $mig$
declare d text:=pg_get_functiondef('private.alertas_inicio_sede(uuid)'::regprocedure);
 a text:='then ''Saldo no cuadra con el total''';
begin
 if position('sin entrada a caja' in d)>0 then return; end if;
 if (length(d)-length(replace(d,a,'')))/length(a)<>1 then raise exception 'alertas_inicio_sede: punto de inserción no encontrado'; end if;
 d:=replace(d,a,a||E'\n       when coalesce(c.deposito_pagado_previo,0)>0 and c.created_at>=''2026-11-01'' and not exists(select 1 from public.caja_movimientos k where k.contrato_id=c.id and k.origen=''deposito'' and k.anulado_at is null) then ''Depósito marcado como pagado sin entrada a caja: confirma con administración la fecha y el medio del pago''');
 execute d;
end $mig$;
