-- «Pago de depósito» dated on a day whose cash register is already closed no longer goes in silently without reaching the cash
-- (private.caja_auto skips closed days): it is refused with a clear message (use today's date or ask administration to reopen that day).
-- Reversible: remove the inserted check from private.gestionar_deposito.
do $mig$
declare d text:=pg_get_functiondef('private.gestionar_deposito(text,jsonb)'::regprocedure);
 a text:='de los últimos 15 días.''; end if;';
begin
 if position('ya está cerrada: registra el pago' in d)>0 then return; end if;
 if (length(d)-length(replace(d,a,'')))/length(a)<>1 then raise exception 'gestionar_deposito: punto de inserción no encontrado'; end if;
 d:=replace(d,a,a||E'\n  if private.caja_dia_cerrado(c.sede_id,fecha) and (private.caja_inicio(c.sede_id) is null or fecha>=private.caja_inicio(c.sede_id)) then raise exception ''La caja de la sede del % ya está cerrada: registra el pago con la fecha de hoy o pide a administración reabrir ese día.'',to_char(fecha,''DD/MM/YYYY''); end if;');
 execute d;
end $mig$;
