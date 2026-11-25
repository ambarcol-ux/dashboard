-- Deposit return («pagar»): the payment date can be the real one, up to 15 days back, even if the request was created later (cash
-- returned before the paperwork). As with «Pago de depósito», a date whose cash register is already closed is refused with a clear
-- message instead of leaving the return out of the cash silently. Reversible: restore the previous date check in private.gestionar_deposito.
do $mig$
declare d text:=pg_get_functiondef('private.gestionar_deposito(text,jsonb)'::regprocedure);
 a text:='fecha<(s.created_at at time zone ''America/Bogota'')::date then raise exception ''Revisa la fecha de pago.''; end if;';
begin
 if position('pide a administración reabrir ese día antes de registrar la devolución' in d)>0 then return; end if;
 if (length(d)-length(replace(d,a,'')))/length(a)<>1 then raise exception 'gestionar_deposito: punto de inserción no encontrado'; end if;
 d:=replace(d,a,'fecha<least((s.created_at at time zone ''America/Bogota'')::date,(now() at time zone ''America/Bogota'')::date-15) then raise exception ''Revisa la fecha de pago (puede ser de hasta 15 días atrás).''; end if;'
  ||E'\n  if private.caja_dia_cerrado(c.sede_id,fecha) and (private.caja_inicio(c.sede_id) is null or fecha>=private.caja_inicio(c.sede_id)) then raise exception ''La caja de la sede del % ya está cerrada: usa la fecha de hoy o pide a administración reabrir ese día antes de registrar la devolución.'',to_char(fecha,''DD/MM/YYYY''); end if;');
 execute d;
end $mig$;
