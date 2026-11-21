-- «Fecha del pago» in Nuevo abono: the payment can carry the real date the customer paid (today or up to 15 days back). The payment,
-- its cash-register movement (private.caja_auto_pago) and its Siigo receipt (private.siigo_pago_recibo) all take that date. A closed
-- cash-register day must be reopened first. Same checks as private.registrar_abono_contrato / registrar_pago_con_soporte.
-- Reversible: drop function public.registrar_abono_contrato(uuid,numeric,text,text,text,jsonb,date);
--             drop function private.registrar_abono_contrato_fecha(uuid,numeric,text,text,text,jsonb,date).

create or replace function private.registrar_abono_contrato_fecha(p_contrato uuid, p_valor numeric, p_medio text, p_recibo text, p_observaciones text, p_soportes jsonb, p_fecha date)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.contratos; files jsonb; nuevo uuid; s jsonb; hoy date:=private.caja_hoy(); f date:=coalesce(p_fecha,private.caja_hoy());
begin
 if not private.prov_es_personal() then raise exception 'No puedes registrar pagos.' using errcode='42501'; end if;
 select * into c from public.contratos where id=p_contrato for update;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if f>hoy then raise exception 'La fecha del pago no puede ser futura.'; end if;
 if f<hoy-15 then raise exception 'La fecha del pago solo puede ser de los últimos 15 días (desde el %).',to_char(hoy-15,'DD/MM/YYYY'); end if;
 if private.caja_dia_cerrado(c.sede_id,f) then raise exception 'La caja del % ya está cerrada: pide reabrirla en Cierres de caja para registrar el abono en esa fecha.',to_char(f,'DD/MM/YYYY'); end if;
 if p_valor is null or p_valor<=0 or p_valor<>round(p_valor,2) then raise exception 'Revisa el valor del pago.'; end if;
 if length(btrim(coalesce(p_medio,'')))<2 then raise exception 'Indica el medio de pago.'; end if;
 if exists(select 1 from public.pagos where contrato_id=p_contrato and anulado_at is null and valor_pagado=p_valor
   and coalesce(btrim(numero_recibo),'')=coalesce(btrim(p_recibo),'') and created_at>now()-interval '10 minutes') then
  raise exception 'Este abono ya quedó registrado hace un momento (mismo valor y recibo). Recarga la página para verlo.';
 end if;
 files:=private.soportes_validos(p_soportes);
 insert into public.pagos(contrato_id,valor_pagado,medio_pago,numero_recibo,observaciones,fecha_pago)
 values(p_contrato,p_valor,btrim(p_medio),coalesce(btrim(p_recibo),''),coalesce(p_observaciones,''),f::timestamp at time zone 'UTC')
 returning id into nuevo;
 for s in select * from jsonb_array_elements(files) loop
  insert into public.soportes_pago(pago_id,archivo_path,nombre,tipo,tamano) values(nuevo,s->>'path',s->>'nombre',s->>'tipo',(s->>'tamano')::int);
 end loop;
 update public.contratos set anticipo=coalesce(anticipo,0)+p_valor where id=p_contrato;
 return nuevo;
end $$;
revoke all on function private.registrar_abono_contrato_fecha(uuid,numeric,text,text,text,jsonb,date) from public, anon;
grant execute on function private.registrar_abono_contrato_fecha(uuid,numeric,text,text,text,jsonb,date) to authenticated;

create or replace function public.registrar_abono_contrato(p_contrato uuid, p_valor numeric, p_medio text, p_recibo text, p_observaciones text, p_soportes jsonb, p_fecha date)
returns uuid language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.contratos where id=p_contrato) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 return private.registrar_abono_contrato_fecha(p_contrato,p_valor,p_medio,p_recibo,p_observaciones,p_soportes,p_fecha);
end $$;
revoke all on function public.registrar_abono_contrato(uuid,numeric,text,text,text,jsonb,date) from public, anon;
grant execute on function public.registrar_abono_contrato(uuid,numeric,text,text,text,jsonb,date) to authenticated;
