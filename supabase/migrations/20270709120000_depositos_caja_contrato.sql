-- Depósitos y devoluciones › historial: shows the deposit income registered in Caja for a contract (e.g. a part paid in cash
-- without a receipt), for reference. Read-only; same access as the sede's Caja.
-- Reversión: drop function public.depositos_caja_contrato(uuid); drop function private.depositos_caja_contrato(uuid);
create or replace function private.depositos_caja_contrato(p_contrato uuid)
returns table(id uuid, fecha date, valor numeric, medio text, descripcion text)
language plpgsql stable security definer set search_path='' as $$
declare v_sede uuid;
begin
 select c.sede_id into v_sede from public.contratos c where c.id=p_contrato;
 if v_sede is null or not private.caja_ver(v_sede) then return; end if;
 return query select m.id,m.fecha,m.valor,m.medio,m.descripcion from public.caja_movimientos m
  where m.contrato_id=p_contrato and m.origen='deposito' and m.tipo='ingreso' and m.anulado_at is null order by m.fecha,m.created_at;
end $$;
revoke all on function private.depositos_caja_contrato(uuid) from public, anon;
grant execute on function private.depositos_caja_contrato(uuid) to authenticated;

create or replace function public.depositos_caja_contrato(p_contrato uuid)
returns table(id uuid, fecha date, valor numeric, medio text, descripcion text)
language sql stable set search_path='' as $$ select * from private.depositos_caja_contrato(p_contrato); $$;
revoke all on function public.depositos_caja_contrato(uuid) from public, anon;
grant execute on function public.depositos_caja_contrato(uuid) to authenticated;
