-- Aliados (paso 1): el aliado ya no recibe comisiones. Se apaga el cálculo de comisión en el contrato del cliente,
-- se anulan los pagos pendientes y se cierra el acceso a líneas y pagos de comisión (las tablas quedan como histórico).
alter table public.contratos disable trigger contratos_aliado_antes;
alter table public.contratos disable trigger contratos_aliado_despues;
update public.pagos_aliado set estado='anulado',actualizado_at=now() where estado in ('en_espera','por_pagar');
revoke all on table public.lineas_aliado,public.pagos_aliado from anon,authenticated;
revoke execute on function public.pagar_comision_aliado(uuid,text) from authenticated;
revoke execute on function private.pagar_comision_aliado(uuid,text) from authenticated;
