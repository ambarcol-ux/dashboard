-- Day of a contract payment. Most payments are saved with only their date (00:00 UTC): that date is the day. Payments saved with their
-- hour are read in Colombia time. Fixes 20270501120000, which read every payment in Colombia time and moved date-only payments to the
-- previous day (cash register, pending payments, Siigo match and Siigo receipt date).
-- Reversible: restore the previous definitions (20270501120000 and 20270429120000).

create or replace function private.dia_pago(p timestamptz) returns date
language sql immutable set search_path='' as $$
 select case when p is null then null when (p at time zone 'UTC')::time='00:00' then (p at time zone 'UTC')::date else (p at time zone 'America/Bogota')::date end;
$$;

do $$
declare f text; d text;
begin
 foreach f in array array['private.caja_auto_pago()','private.caja_dia(uuid,date)','private.caja_abonos_pendientes()','public.siigo_conciliacion(uuid,date,date)','private.siigo_pago_recibo()'] loop
  d:=pg_get_functiondef(f::regprocedure);
  d:=replace(d,'(coalesce(new.fecha_pago,now()) at time zone ''America/Bogota'')::date','coalesce(private.dia_pago(new.fecha_pago),private.caja_hoy())');
  d:=replace(d,'(p.fecha_pago at time zone ''America/Bogota'')::date','private.dia_pago(p.fecha_pago)');
  execute d;
 end loop;
end $$;
