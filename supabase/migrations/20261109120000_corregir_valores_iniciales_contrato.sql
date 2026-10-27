-- Owner/admin correction of the initial payment and guarantee deposit of a signed contract.
-- Corrects the existing initial payment (pagos + its caja movement); logs to historial_cambios_contrato.
-- Revert: drop function public.corregir_valores_iniciales_contrato(uuid,numeric,numeric,text);
--         drop function private.corregir_valores_iniciales_contrato(uuid,numeric,numeric,text);
--         alter table public.historial_cambios_contrato drop column campo, drop column valor_anterior, drop column valor_nuevo;

alter table public.historial_cambios_contrato
  add column if not exists campo text,
  add column if not exists valor_anterior numeric,
  add column if not exists valor_nuevo numeric;

create or replace function private.corregir_valores_iniciales_contrato(p_contrato uuid, p_anticipo numeric, p_deposito numeric, p_motivo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c record; pg record; cm record; m text:=btrim(coalesce(p_motivo,'')); cambios int:=0;
begin
 if not public.es_admin() then raise exception 'Solo el propietario/administrador puede corregir estos valores.' using errcode='42501'; end if;
 if length(m)<10 then raise exception 'El motivo es obligatorio (mínimo 10 caracteres).'; end if;
 select id,anticipo,valor_deposito,estado into c from public.contratos where id=p_contrato for update;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if lower(coalesce(c.estado,'')) in ('borrador','pendiente_admin') then raise exception 'Solo aplica a contratos pactados.'; end if;

 if p_anticipo is not null and p_anticipo is distinct from coalesce(c.anticipo,0) then
  if p_anticipo<=0 or p_anticipo<>round(p_anticipo,2) then raise exception 'Revisa el valor del abono inicial.'; end if;
  select id,valor_pagado into pg from public.pagos where contrato_id=p_contrato
   order by (observaciones ilike 'Abono inicial%') desc, created_at limit 1 for update;
  if pg.id is null then raise exception 'El contrato no tiene un pago inicial registrado para corregir.'; end if;
  select id,sede_id,fecha into cm from public.caja_movimientos where origen='pago' and origen_id=pg.id and anulado_at is null limit 1 for update;
  if cm.id is not null and exists(select 1 from public.caja_cierres k where k.sede_id=cm.sede_id and k.fecha=cm.fecha and k.reabierto_at is null) then
   raise exception 'La caja del % está cerrada. Reábrela antes de corregir el abono.', to_char(cm.fecha,'DD/MM/YYYY');
  end if;
  update public.pagos set valor_pagado=p_anticipo, updated_at=now() where id=pg.id;
  if cm.id is not null then update public.caja_movimientos set valor=p_anticipo where id=cm.id; end if;
  update public.contratos set anticipo=p_anticipo where id=p_contrato;
  insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo,valor_anterior,valor_nuevo)
   values(p_contrato,auth.uid(),m,'Abono inicial',coalesce(c.anticipo,0),p_anticipo);
  cambios:=cambios+1;
 end if;

 if p_deposito is not null and p_deposito is distinct from coalesce(c.valor_deposito,0) then
  if p_deposito<0 or p_deposito>=1000000000000 or p_deposito<>round(p_deposito,2) then raise exception 'Revisa el valor del depósito.'; end if;
  update public.contratos set valor_deposito=p_deposito where id=p_contrato;
  insert into public.auditoria_montos_deposito(contrato_id,monto_anterior,monto_nuevo,motivo,usuario_id) values(p_contrato,coalesce(c.valor_deposito,0),p_deposito,m,auth.uid());
  insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo,valor_anterior,valor_nuevo)
   values(p_contrato,auth.uid(),m,'Valor del depósito de garantía',coalesce(c.valor_deposito,0),p_deposito);
  cambios:=cambios+1;
 end if;

 return jsonb_build_object('ok',true,'cambios',cambios,'saldo',(select saldo from public.contratos where id=p_contrato));
end $$;

create or replace function public.corregir_valores_iniciales_contrato(p_contrato uuid, p_anticipo numeric, p_deposito numeric, p_motivo text)
returns jsonb language sql security invoker set search_path='' as $$ select private.corregir_valores_iniciales_contrato(p_contrato,p_anticipo,p_deposito,p_motivo) $$;

revoke all on function private.corregir_valores_iniciales_contrato(uuid,numeric,numeric,text) from public, anon;
revoke all on function public.corregir_valores_iniciales_contrato(uuid,numeric,numeric,text) from public, anon;
grant execute on function private.corregir_valores_iniciales_contrato(uuid,numeric,numeric,text) to authenticated;
grant execute on function public.corregir_valores_iniciales_contrato(uuid,numeric,numeric,text) to authenticated;
