-- Single balance rule (same as lib/saldo.ts): saldo = valor_total + total_arreglos - anticipo (non-annulled abonos).
-- Code only: existing rows are not touched. Revert: drop trigger contratos_saldo_estado on public.contratos;
--   drop function private.contratos_saldo_estado(); drop function public.saldo_contrato(numeric,numeric,numeric);
--   re-apply the previous definitions of private.anular_movimiento_caja and private.cartera_contratos.
create or replace function public.saldo_contrato(p_valor_total numeric, p_total_arreglos numeric, p_anticipo numeric)
returns numeric language sql immutable set search_path='' as $$
 select round(coalesce(p_valor_total,0)+coalesce(p_total_arreglos,0)-coalesce(p_anticipo,0),2)
$$;
grant execute on function public.saldo_contrato(numeric,numeric,numeric) to authenticated, service_role;

-- Estado follows the balance: "Pagado Totalmente" cannot be set by hand with saldo > 0, and is recalculated when values or abonos change.
create or replace function private.contratos_saldo_estado()
returns trigger language plpgsql set search_path='' as $$
declare s numeric:=public.saldo_contrato(new.valor_total,new.total_arreglos,new.anticipo);
 cambio boolean:=tg_op='UPDATE' and (new.valor_total is distinct from old.valor_total or new.total_arreglos is distinct from old.total_arreglos or new.anticipo is distinct from old.anticipo);
 pagado boolean:=lower(coalesce(new.estado,''))='pagado totalmente';
begin
 if pagado and s>0 then
  if tg_op='INSERT' or lower(coalesce(old.estado,''))<>'pagado totalmente' then
   raise exception 'No se puede marcar Pagado totalmente: el contrato tiene saldo pendiente.' using errcode='23514';
  elsif cambio then new.estado:='firmado';
  end if;
 elsif cambio and s<=0 and lower(coalesce(new.estado,''))='firmado' then
  new.estado:='Pagado Totalmente';
 end if;
 return new;
end $$;
drop trigger if exists contratos_saldo_estado on public.contratos;
create trigger contratos_saldo_estado before insert or update on public.contratos for each row execute function private.contratos_saldo_estado();

-- Annulling an abono in caja subtracts it from the contract (correcting it already adjusts anticipo in editar_movimiento_caja).
do $$ declare d text:=pg_get_functiondef('private.anular_movimiento_caja(uuid,text)'::regprocedure); begin
 d:=replace(d,' update public.caja_movimientos set anulado_at=now(),anulado_por=u.id,motivo_anulacion=reason where id=p_id;',
  ' update public.caja_movimientos set anulado_at=now(),anulado_por=u.id,motivo_anulacion=reason where id=p_id;
 if m.origen=''pago'' then
  update public.contratos k set anticipo=coalesce(k.anticipo,0)-m.valor from public.pagos p where p.id=m.origen_id and k.id=p.contrato_id;
 end if;');
 if d not like '%m.origen=''pago'' then%' then raise exception 'patch anular failed'; end if;
 execute d;
end $$;

-- Receivables use the same rule.
do $$ declare d text:=pg_get_functiondef('private.cartera_contratos(uuid)'::regprocedure); begin
 d:=replace(d,'coalesce(c.saldo,0)','public.saldo_contrato(c.valor_total,c.total_arreglos,c.anticipo)');
 if d like '%coalesce(c.saldo%' then raise exception 'patch cartera failed'; end if;
 execute d;
end $$;
