-- Depósitos › «Pago de depósito»: 20270520120000_depositos_pago_estados patched private.gestionar_deposito_original, but the screen calls
-- private.gestionar_deposito (the one public.gestionar_deposito uses), which still inserted «ingreso» without es_pago: the trigger then
-- ADDED the amount to the agreed deposit instead of counting it as paid. The same four changes are applied to the live function:
-- es_pago + chosen account + payment date, and return balances/receipts measured on what was paid. No payment was registered yet with
-- the old version (0 rows), so no data needs fixing. Reversible: re-apply private.gestionar_deposito from 20260917005400.
-- what was paid; the return keeps the account it was paid from.
do $do$
declare d text:=pg_get_functiondef('private.gestionar_deposito'::regproc); n int:=0;
begin
 if position($x$saldo:=coalesce(c.valor_deposito,0)-usado;$x$ in d)>0 then n:=n+1; end if;
 d:=replace(d,$x$saldo:=coalesce(c.valor_deposito,0)-usado;$x$,$x$saldo:=private.deposito_pagado(c.id)-usado;$x$);
 if position($x$values(oid,cid,'ingreso',n,fecha,metodo,p_datos->>'observaciones',path,u.id);$x$ in d)>0 then n:=n+1; end if;
 d:=replace(d,$x$insert into public.movimientos_depositos(id,contrato_id,tipo,monto,fecha,metodo,observaciones,comprobante_path,usuario_id) values(oid,cid,'ingreso',n,fecha,metodo,p_datos->>'observaciones',path,u.id);$x$,
  $x$if fecha>(now() at time zone 'America/Bogota')::date or fecha<(now() at time zone 'America/Bogota')::date-15 then raise exception 'La fecha del pago debe ser de hoy o de los últimos 15 días.'; end if;
  insert into public.movimientos_depositos(id,contrato_id,tipo,monto,fecha,metodo,observaciones,comprobante_path,usuario_id,es_pago,cuenta_id,fecha_pago_deposito) values(oid,cid,'ingreso',n,fecha,metodo,p_datos->>'observaciones',path,u.id,true,nullif(p_datos->>'cuenta_id','')::uuid,fecha);$x$);
 if position($x$if respaldado<coalesce(c.valor_deposito,0) then$x$ in d)>0 then n:=n+1; end if;
 d:=replace(d,$x$if respaldado<coalesce(c.valor_deposito,0) then$x$,$x$if respaldado<private.deposito_pagado(c.id) then$x$);
 if position($x$values(oid,cid,'devolucion',s.monto,s.descuento,fecha,s.metodo,s.motivo,s.observaciones,path,u.id);$x$ in d)>0 then n:=n+1; end if;
 d:=replace(d,$x$insert into public.movimientos_depositos(id,contrato_id,tipo,monto,descuento,fecha,metodo,motivo,observaciones,comprobante_path,usuario_id) values(oid,cid,'devolucion',s.monto,s.descuento,fecha,s.metodo,s.motivo,s.observaciones,path,u.id);$x$,
  $x$insert into public.movimientos_depositos(id,contrato_id,tipo,monto,descuento,fecha,metodo,motivo,observaciones,comprobante_path,usuario_id,cuenta_id) values(oid,cid,'devolucion',s.monto,s.descuento,fecha,s.metodo,s.motivo,s.observaciones,path,u.id,nullif(p_datos->>'cuenta_id','')::uuid);$x$);
 if n<4 then raise exception 'gestionar_deposito: solo % de 4 textos encontrados', n; end if;
 execute d;
end $do$;
