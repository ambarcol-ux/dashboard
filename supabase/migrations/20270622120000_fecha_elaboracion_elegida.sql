-- The contract date (fecha_elaboracion) is chosen in the calendar by whoever makes the contract: on insert it must be today or up to
-- 15 days back (default stays today for other paths), and the Siigo invoice of the contract uses that date instead of the save day.
-- Reversible: drop trigger contratos_fecha_elaboracion_valida and restore 'fecha',(now() at time zone 'America/Bogota')::date in
-- private.siigo_encolar_factura.
create or replace function private.contratos_fecha_elaboracion_valida() returns trigger language plpgsql set search_path='' as $$
declare hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if new.fecha_elaboracion is null then new.fecha_elaboracion:=hoy; end if;
 if new.fecha_elaboracion>hoy or new.fecha_elaboracion<hoy-15 then
  raise exception 'La fecha de elaboración debe ser de hoy o de los últimos 15 días.';
 end if;
 return new;
end $$;
create or replace trigger contratos_fecha_elaboracion_valida before insert on public.contratos for each row execute function private.contratos_fecha_elaboracion_valida();

do $mig$
declare d text:=pg_get_functiondef('private.siigo_encolar_factura(uuid,text,text,text,uuid)'::regprocedure);
 a text:='''fecha'',(now() at time zone ''America/Bogota'')::date';
begin
 if position('c.fecha_elaboracion' in d)>0 then return; end if;
 if (length(d)-length(replace(d,a,'')))/length(a)<>1 then raise exception 'siigo_encolar_factura: punto no encontrado'; end if;
 d:=replace(d,a,'''fecha'',least(coalesce(c.fecha_elaboracion,(now() at time zone ''America/Bogota'')::date),(now() at time zone ''America/Bogota'')::date)');
 execute d;
end $mig$;
