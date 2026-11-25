-- The contract date (fecha_elaboracion) can be any past date (adjustments); it still cannot be in the future.
-- Reversible: restore the 15-day lower bound in private.contratos_fecha_elaboracion_valida.
create or replace function private.contratos_fecha_elaboracion_valida() returns trigger language plpgsql set search_path='' as $$
declare hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if new.fecha_elaboracion is null then new.fecha_elaboracion:=hoy; end if;
 if new.fecha_elaboracion>hoy then raise exception 'La fecha de elaboración no puede ser futura.'; end if;
 return new;
end $$;
