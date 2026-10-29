-- Contrato: tipo de documento (clienta y titular), documento del titular y listas editables de banco / tipo de cuenta.
-- Revert: drop table public.listas_contrato; alter table public.contratos drop column tipo_documento_cliente, drop column tipo_documento_titular, drop column documento_titular;
alter table public.contratos add column if not exists tipo_documento_cliente text, add column if not exists tipo_documento_titular text, add column if not exists documento_titular text;
create table if not exists public.listas_contrato(lista text not null check (lista in ('banco','tipo_cuenta')),valor text not null,orden int not null default 100,activo boolean not null default true,primary key(lista,valor));
alter table public.listas_contrato enable row level security;
revoke all on public.listas_contrato from anon;
create policy listas_contrato_leer on public.listas_contrato for select to authenticated using (true);
create policy listas_contrato_admin on public.listas_contrato for all to authenticated using (public.es_admin()) with check (public.es_admin());
insert into public.listas_contrato(lista,valor,orden) select 'banco',b,i from unnest(array['Bancolombia','Banco de Bogotá','Davivienda','BBVA Colombia','Banco de Occidente','Banco Popular','Banco AV Villas','Banco Caja Social','Scotiabank Colpatria','Banco Agrario','Itaú','Banco Falabella','Banco Pichincha','Banco GNB Sudameris','Bancoomeva','Banco Finandina','Banco Serfinanza','Banco Mundo Mujer','Bancamía','Banco W','Lulo Bank','Nu Colombia','Nequi','Daviplata','RappiPay','Movii','Otro']) with ordinality as t(b,i) on conflict do nothing;
insert into public.listas_contrato(lista,valor,orden) select 'tipo_cuenta',b,i from unnest(array['Ahorros','Corriente','Depósito electrónico']) with ordinality as t(b,i) on conflict do nothing;
