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
create policy siigo_historico_finanzas on public.siigo_historico for select to authenticated using (private.es_finanzas());
grant select on public.siigo_historico to authenticated;

-- Estado de resultados with Siigo as source (Finanzas › Gastos › Estado de resultados › Fuente: Siigo): income = invoices minus credit
-- notes; expenses = purchases by PUC group (inventory purchases shown apart, not as expense); contracts of the ERP for the average
-- ticket. Same shape as public.estado_resultados. Only administración/contabilidad.
create or replace function private.estado_resultados_siigo(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Selecciona un periodo de hasta un año.'; end if;
 if not private.es_finanzas() then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('sede_id',x.sede_id,'sede',s.nombre,'grupo',x.grupo,'concepto',x.concepto,'valor',x.valor,'costo',x.costo)
   order by s.nombre,x.grupo desc,x.valor desc)
  from (select u.sede_id,u.grupo,u.concepto,max(u.costo) costo,sum(u.valor) valor from (
   select h.sede_id,'ingreso' grupo,'Ventas facturadas' concepto,null::text costo,h.total valor from public.siigo_historico h where h.tipo='factura' and h.fecha between p_desde and p_hasta
   union all
   select h.sede_id,'ingreso','Notas crédito (devoluciones)',null,-h.total from public.siigo_historico h where h.tipo='nota_credito' and h.fecha between p_desde and p_hasta
   union all
   select h.sede_id,
    case when g.inv then 'dato' else 'gasto' end,
    case when g.inv then 'inventario' else g.nombre end,
    case when g.inv then null when g.c4 in ('5155','5255','5195','5199','5295') or g.c4 !~ '^\d{4}$' then 'variable' else 'fijo' end,
    coalesce((i->>'total')::numeric,0)
   from public.siigo_historico h cross join jsonb_array_elements(coalesce(h.datos->'items','[]')) i
   cross join lateral (select left(coalesce(i->>'code',''),4) c4) c
   cross join lateral (select c.c4 c4, (c.c4 like '14%' or (c.c4 !~ '^\d{4}$' and coalesce(i->>'description','') ilike '%vestido%')) inv,
     case when c.c4 in ('5105','5205') then 'Nómina y personal' when c.c4 like '23%' then 'Aportes de nómina (salud, pensión, ARL)'
      when c.c4 in ('5110','5210') then 'Honorarios' when c.c4 in ('5115','5215') then 'Impuestos' when c.c4 in ('5120','5220') then 'Arrendamientos'
      when c.c4 in ('5125','5225') then 'Contribuciones y afiliaciones' when c.c4 in ('5130','5230') then 'Seguros'
      when c.c4 in ('5135','5235') then 'Servicios (públicos, transporte, aseo, internet)' when c.c4 in ('5140','5240') then 'Gastos legales'
      when c.c4 in ('5145','5245') then 'Mantenimiento y reparaciones' when c.c4 in ('5150','5250') then 'Adecuaciones'
      when c.c4 in ('5155','5255') then 'Gastos de viaje' when c.c4 in ('5160','5260') then 'Depreciaciones'
      when c.c4 in ('5195','5199','5295') then 'Diversos (comisiones, cafetería, sastrería)' when c.c4 like '53%' then 'Gastos financieros'
      else 'Otros gastos' end nombre) g
   where h.tipo='compra' and h.fecha between p_desde and p_hasta
   union all
   select k.sede_id,'dato','contratos',null,1 from public.contratos k
    where coalesce(k.fecha_elaboracion,(k.created_at at time zone 'America/Bogota')::date) between p_desde and p_hasta and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','cancelada','borrador','rechazado')
   union all
   select k.sede_id,'dato','valor_contratos',null,k.valor_total from public.contratos k
    where coalesce(k.fecha_elaboracion,(k.created_at at time zone 'America/Bogota')::date) between p_desde and p_hasta and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','cancelada','borrador','rechazado')
  ) u where coalesce(u.valor,0)<>0 group by 1,2,3) x join public.sedes s on s.id=x.sede_id),'[]'::jsonb);
end $$;
revoke all on function private.estado_resultados_siigo(date,date) from public, anon;
grant execute on function private.estado_resultados_siigo(date,date) to authenticated;
create or replace function public.estado_resultados_siigo(p_desde date, p_hasta date) returns jsonb
language sql stable set search_path='' as $$ select private.estado_resultados_siigo(p_desde,p_hasta); $$;
revoke all on function public.estado_resultados_siigo(date,date) from public, anon;
grant execute on function public.estado_resultados_siigo(date,date) to authenticated;

-- Trazabilidad de ventas: each valid contract of the period with what the ERP and Siigo say. sin_rastro = value that is neither pending
-- (saldo) nor backed by a payment in the ERP or a collection in Siigo (invoice payments that are not credit + cash receipts).
create or replace function private.traza_ventas(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 if not private.es_finanzas() then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.sin_rastro desc) from (
  select k.id, s.nombre sede, k.numero_contrato numero, coalesce(k.fecha_elaboracion,(k.created_at at time zone 'America/Bogota')::date) fecha, k.cliente_nombre cliente,
   k.valor_total valor, greatest(coalesce(k.saldo,0),0) saldo, coalesce(p.pagado,0) pagado_erp, f.facturado facturado_siigo, coalesce(f.cobrado,0) cobrado_siigo,
   greatest(k.valor_total-greatest(coalesce(k.saldo,0),0)-greatest(coalesce(p.pagado,0),coalesce(f.cobrado,0)),0) sin_rastro
  from public.contratos k join public.sedes s on s.id=k.sede_id
  left join lateral (select sum(valor_pagado) pagado from public.pagos x where x.contrato_id=k.id and x.anulado_at is null) p on true
  left join lateral (select sum(h.total) filter (where h.tipo='factura')-coalesce(sum(h.total) filter (where h.tipo='nota_credito'),0) facturado,
    coalesce(sum((select sum((y->>'value')::numeric) from jsonb_array_elements(coalesce(h.datos->'payments','[]')) y
      where y->>'name' not in ('Clientes Nacionales','Crédito clientes','Clientes Extranjero','Crédito','Pago a crédito'))) filter (where h.tipo='factura'),0)
    +coalesce(sum(h.total) filter (where h.tipo='recibo'),0) cobrado
   from public.siigo_historico h where h.contrato_id=k.id) f on true
  where lower(coalesce(k.estado,'')) not in ('borrador','anulado','cancelado','cancelada','rechazado')
   and coalesce(k.fecha_elaboracion,(k.created_at at time zone 'America/Bogota')::date) between p_desde and p_hasta) t),'[]'::jsonb);
end $$;
revoke all on function private.traza_ventas(date,date) from public, anon;
grant execute on function private.traza_ventas(date,date) to authenticated;
create or replace function public.traza_ventas(p_desde date, p_hasta date) returns jsonb
language sql stable set search_path='' as $$ select private.traza_ventas(p_desde,p_hasta); $$;
revoke all on function public.traza_ventas(date,date) from public, anon;
grant execute on function public.traza_ventas(date,date) to authenticated;
