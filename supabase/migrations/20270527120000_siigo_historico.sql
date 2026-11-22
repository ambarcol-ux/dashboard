-- Trazabilidad fase 1 y 2: copy of what each store has in Siigo since April 2026 (invoices, cash receipts, purchases/expenses, journals
-- and credit notes), imported read-only from the Siigo API. Nothing in contracts, payments or the cash register is changed: this is the
-- base to compare the ERP against Siigo (sales without payment detail, expenses never recorded in the ERP). contrato_id = the ERP contract
-- the document belongs to (by invoice number or client), filled by the matching step. Only administración/contabilidad read it.
-- Reversible: drop table public.siigo_historico.
create table if not exists public.siigo_historico(
 id uuid primary key default gen_random_uuid(),
 sede_id uuid not null references public.sedes(id),
 tipo text not null check (tipo in ('factura','recibo','compra','comprobante','nota_credito')),
 siigo_id text not null,
 numero text,
 fecha date,
 tercero_doc text,
 tercero_nombre text,
 total numeric,
 datos jsonb not null,
 contrato_id uuid references public.contratos(id) on delete set null,
 importado_at timestamptz not null default now(),
 unique (sede_id,tipo,siigo_id)
);
create index if not exists siigo_historico_sede_fecha on public.siigo_historico(sede_id,tipo,fecha);
create index if not exists siigo_historico_contrato on public.siigo_historico(contrato_id);
alter table public.siigo_historico enable row level security;
revoke all on public.siigo_historico from anon, authenticated;
drop policy if exists siigo_historico_finanzas on public.siigo_historico;
create policy siigo_historico_finanzas on public.siigo_historico for select to authenticated using (private.es_finanzas());
grant select on public.siigo_historico to authenticated;
