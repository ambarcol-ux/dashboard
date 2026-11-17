-- Abono to a contract in ONE transaction: the payment with its receipts and the contract's anticipo, all or nothing.
-- Before, the browser saved the payment and then updated the anticipo; when the second step failed the payment stayed and a retry
-- duplicated it (BOG-2026-0008, recibo 223). The same abono (same contract, value and receipt number) within 10 minutes is rejected.
-- Reversible: drop both functions (the page goes back to registrar_pago_con_soporte + update).
create or replace function private.registrar_abono_contrato(p_contrato uuid,p_valor numeric,p_medio text,p_recibo text,p_observaciones text,p_soportes jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.contratos; nuevo uuid;
begin
 select * into c from public.contratos where id=p_contrato for update;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if exists(select 1 from public.pagos where contrato_id=p_contrato and anulado_at is null and valor_pagado=p_valor
   and coalesce(btrim(numero_recibo),'')=coalesce(btrim(p_recibo),'') and created_at>now()-interval '10 minutes') then
  raise exception 'Este abono ya quedó registrado hace un momento (mismo valor y recibo). Recarga la página para verlo.';
 end if;
 nuevo:=private.registrar_pago_con_soporte(p_contrato,p_valor,p_medio,p_recibo,p_observaciones,p_soportes);
 update public.contratos set anticipo=coalesce(anticipo,0)+p_valor where id=p_contrato;
 return nuevo;
end $$;

create or replace function public.registrar_abono_contrato(p_contrato uuid,p_valor numeric,p_medio text,p_recibo text,p_observaciones text,p_soportes jsonb) returns uuid
language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.contratos where id=p_contrato) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 return private.registrar_abono_contrato(p_contrato,p_valor,p_medio,p_recibo,p_observaciones,p_soportes);
end $$;
revoke all on function public.registrar_abono_contrato(uuid,numeric,text,text,text,jsonb) from public, anon;
grant execute on function public.registrar_abono_contrato(uuid,numeric,text,text,text,jsonb) to authenticated;
revoke all on function private.registrar_abono_contrato(uuid,numeric,text,text,text,jsonb) from public, anon;
grant execute on function private.registrar_abono_contrato(uuid,numeric,text,text,text,jsonb) to authenticated;
