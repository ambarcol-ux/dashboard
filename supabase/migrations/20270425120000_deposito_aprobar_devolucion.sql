-- Depósitos: the store approves the return («Aprobar devolución») only when the dress is back (contract in mantenimiento or
-- finalizado, set by «Recibir vestido»; also for cancelled contracts). Contabilidad only sees the contracts whose return was approved.
-- Reversible: restore public.gestionar_deposito as «select private.gestionar_deposito(p_accion,p_datos)» and
--   private.contratos_depositos_contabilidad without the solicitudes_depositos filter.
create or replace function public.gestionar_deposito(p_accion text, p_datos jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare est text;
begin
 if p_accion='solicitar' then
  select lower(coalesce(estado,'')) into est from public.contratos where id=(p_datos->>'contrato_id')::uuid;
  if est is not null and est not in ('mantenimiento','finalizado','cancelado','cancelada','anulado','anulada') then
   raise exception 'Primero recibe el vestido en el contrato (botón «Recibir vestido»); luego aprueba la devolución del depósito.';
  end if;
 end if;
 return private.gestionar_deposito(p_accion,p_datos);
end $$;

create or replace function private.contratos_depositos_contabilidad()
returns table(id uuid, numero_contrato text, numero_factura text, cliente_nombre text, cliente_documento text, valor_deposito numeric, sede text, sede_id uuid, estado text, cliente_whatsapp text, whatsapp text, created_at timestamp with time zone, banco_deposito text, tipo_cuenta_deposito text, numero_cuenta_deposito text, titular_cuenta_deposito text)
language sql stable security definer set search_path='' as $$
select c.id,c.numero_contrato,c.numero_factura,c.cliente_nombre,c.cliente_documento,c.valor_deposito,c.sede,c.sede_id,c.estado,c.cliente_whatsapp,c.whatsapp,c.created_at,c.banco_deposito,c.tipo_cuenta_deposito,c.numero_cuenta_deposito,c.titular_cuenta_deposito from public.contratos c
where exists(select 1 from public.profiles p where p.id=auth.uid() and lower(btrim(p.rol))='contabilidad' and coalesce(p.activo,true))
 and exists(select 1 from public.solicitudes_depositos s where s.contrato_id=c.id) order by c.id;
$$;
