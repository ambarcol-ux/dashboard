create index if not exists auditoria_montos_deposito_contrato_idx on public.auditoria_montos_deposito(contrato_id,created_at);
create index if not exists auditoria_montos_deposito_usuario_idx on public.auditoria_montos_deposito(usuario_id);
create index if not exists vestidos_fuera_vestido_idx on public.vestidos_fuera_tienda(vestido_id);
create index if not exists vestidos_fuera_entrega_idx on public.vestidos_fuera_tienda(entrega_id);
