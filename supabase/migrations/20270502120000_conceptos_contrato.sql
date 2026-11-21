-- Conceptos del contrato: what a contract includes besides its dresses (Pre XV package, laundry, bows, accessories, make-up, retablo,
-- delivery, other), each one tied to the Siigo product of every store, so the invoice shows one line per concept as Siigo already has them.
-- New concepts are created in Configuración › Facturación por sede; a store without a Siigo product for a concept gets one created by the
-- worker (code ERP###) the first time it is invoiced. The contract total keeps working as before: the concepts are its «servicios adicionales».
-- History: private.config_historial(). Reversible: drop table public.contrato_conceptos, public.conceptos_contrato.

create table if not exists public.conceptos_contrato(
 id uuid primary key default gen_random_uuid(),
 codigo bigint generated always as identity,
 nombre text not null unique check (length(btrim(nombre)) between 2 and 80),
 tipo text not null default 'servicio' check (tipo in ('prexv','servicio','accesorio','lavanderia','vestido_cambio','otro')),
 precio_sugerido numeric(14,2) check (precio_sugerido is null or precio_sugerido>=0),
 siigo_productos jsonb not null default '{}'::jsonb, -- {sede_id: código del producto en Siigo}
 activo boolean not null default true,
 orden int not null default 100,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.conceptos_contrato enable row level security;
create policy conceptos_contrato_ver on public.conceptos_contrato for select to authenticated using (true);
create policy conceptos_contrato_crear on public.conceptos_contrato for insert to authenticated with check (public.es_admin() or private.es_finanzas());
create policy conceptos_contrato_editar on public.conceptos_contrato for update to authenticated using (public.es_admin() or private.es_finanzas()) with check (public.es_admin() or private.es_finanzas());
create trigger conceptos_contrato_historial after insert or update or delete on public.conceptos_contrato for each row execute function private.config_historial();

create table if not exists public.contrato_conceptos(
 id uuid primary key default gen_random_uuid(),
 contrato_id uuid not null references public.contratos(id) on delete cascade,
 concepto_id uuid not null references public.conceptos_contrato(id),
 descripcion text check (descripcion is null or length(descripcion)<=200),
 cantidad numeric(10,2) not null default 1 check (cantidad>0),
 valor_unitario numeric(14,2) not null check (valor_unitario>=0),
 created_at timestamptz not null default now(),
 creado_por uuid default auth.uid()
);
create index if not exists contrato_conceptos_contrato on public.contrato_conceptos(contrato_id);
alter table public.contrato_conceptos enable row level security;
-- Same reach as the contract itself (its own RLS decides who sees and edits it).
create policy contrato_conceptos_ver on public.contrato_conceptos for select to authenticated using (exists(select 1 from public.contratos c where c.id=contrato_id));
create policy contrato_conceptos_crear on public.contrato_conceptos for insert to authenticated with check (exists(select 1 from public.contratos c where c.id=contrato_id));
create policy contrato_conceptos_borrar on public.contrato_conceptos for delete to authenticated using (exists(select 1 from public.contratos c where c.id=contrato_id));
create trigger contrato_conceptos_historial after insert or update or delete on public.contrato_conceptos for each row execute function private.config_historial();

-- Initial concepts, taken from the service products the stores already use in Siigo, each matched to the product of every store.
with semilla(orden,nombre,tipo,patron) as (values
 (10,'Paquete Pre XV','prexv','(paquete prexv|prexv paquete)'),
 (20,'Lavandería','lavanderia','lavander'),
 (30,'Moños para vestido','accesorio','mo.o vestido'),
 (40,'Vestido de cambio (sin código)','vestido_cambio','servicio alquiler (vestido|traje)'),
 (50,'Alquiler de accesorio','accesorio','^alquiler de accesorio'),
 (60,'Tocado','accesorio','^tocado$'),
 (70,'Mantilla','accesorio','mantilla alquiler'),
 (80,'Alquiler de zapatos','accesorio','alquiler( de)? zapatos'),
 (90,'Maquillaje y peinado quinceañera','servicio','maquillaje y peinado quincea'),
 (100,'Maquillaje y peinado social','servicio','maquillaje y peinado social'),
 (110,'Sesión de fotos','prexv','sesion 20 fotos'),
 (120,'Caballo para sesión de fotos','prexv','caballo alquiler'),
 (130,'Retablo','servicio','^retablo'),
 (140,'Envío a domicilio','servicio','envios domicilios'),
 (900,'Otro','otro',null))
insert into public.conceptos_contrato(orden,nombre,tipo,siigo_productos)
select s.orden,s.nombre,s.tipo,coalesce((
 select jsonb_object_agg(x.sede_id,x.code) from (
  select distinct on (c.sede_id) c.sede_id::text sede_id, e->>'code' code
  from public.siigo_catalogos c, jsonb_array_elements(c.datos) e
  where c.tipo='productos' and s.patron is not null and lower(e->>'name') ~ s.patron
  order by c.sede_id, length(e->>'name')) x),'{}'::jsonb)
from semilla s
on conflict (nombre) do nothing;
