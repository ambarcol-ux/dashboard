-- New contract: the initial payment may be saved without its support («El soporte lo adjunto después»). Only the first payment of a
-- contract created in the last 2 hours; later payments keep requiring the support. The support is attached afterwards from the
-- contract (agregar_soporte_pago) or Cierres de caja, and the day's cash register still cannot be closed while a support is missing.
-- Reversible: drop function public.registrar_abono_inicial_sin_soporte(uuid,numeric,text).

create or replace function public.registrar_abono_inicial_sin_soporte(p_contrato uuid, p_valor numeric, p_medio text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.contratos; new_id uuid;
begin
 if not private.prov_es_personal() then raise exception 'No puedes registrar pagos.' using errcode='42501'; end if;
 select * into c from public.contratos where id=p_contrato;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if not public.es_admin() and not (c.sede_id=any(coalesce(private.sedes_usuario(auth.uid()),'{}'))) then raise exception 'El contrato no es de tu sede.' using errcode='42501'; end if;
 if c.created_at<now()-interval '2 hours' then raise exception 'Solo el abono inicial de un contrato recién creado puede quedar sin soporte.'; end if;
 if exists(select 1 from public.pagos where contrato_id=p_contrato) then raise exception 'El contrato ya tiene abonos: adjunta el soporte para registrar este.'; end if;
 if p_valor is null or p_valor<=0 or p_valor<>round(p_valor,2) then raise exception 'Revisa el valor del pago.'; end if;
 if length(btrim(coalesce(p_medio,'')))<2 then raise exception 'Indica el medio de pago.'; end if;
 insert into public.pagos(contrato_id,valor_pagado,medio_pago,numero_recibo,observaciones,fecha_pago)
 values(p_contrato,p_valor,btrim(p_medio),'','Abono inicial al firmar contrato (soporte pendiente)',((now() at time zone 'America/Bogota')::date)::timestamp at time zone 'UTC')
 returning id into new_id;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario)
 values(p_contrato,'Abono sin soporte',format('Abono inicial de $%s guardado sin soporte: se debe adjuntar antes del cierre de caja.',to_char(p_valor,'FM999G999G999')),
  coalesce((select nombre from public.profiles where id=auth.uid()),'ERP'));
 return new_id;
end $$;
revoke all on function public.registrar_abono_inicial_sin_soporte(uuid,numeric,text) from public, anon;
grant execute on function public.registrar_abono_inicial_sin_soporte(uuid,numeric,text) to authenticated;
