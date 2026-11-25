-- The contract date (fecha_elaboracion) can be any past date (adjustments); it still cannot be in the future.
-- Reversible: restore the 15-day lower bound in private.contratos_fecha_elaboracion_valida.
create or replace function private.contratos_fecha_elaboracion_valida() returns trigger language plpgsql set search_path='' as $$
declare hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if new.fecha_elaboracion is null then new.fecha_elaboracion:=hoy; end if;
 if new.fecha_elaboracion>hoy then raise exception 'La fecha de elaboración no puede ser futura.'; end if;
 return new;
end $$;

-- Correcting the date of a saved contract («Fechas del contrato») no longer has the 15-day limit; future dates and closed cash days
-- are still refused.
do $mig$
declare d text:=pg_get_functiondef((select oid from pg_proc where proname='cambiar_fecha_elaboracion' and pronamespace='private'::regnamespace limit 1));
 a text:='if p_fecha<creado-15 then raise exception ''Solo se puede mover hasta 15 días antes de la creación (%).'',to_char(creado-15,''DD/MM/YYYY''); end if;';
begin
 if position(a in d)=0 then return; end if;
 d:=replace(d,a,'');
 execute d;
end $mig$;
