-- Cierres de caja › egreso › «Registrar en Siigo»: purchases and expenses paid from the store, sent to Siigo as «Compra o gasto» (FC,
-- supplier with electronic invoice) or «Documento soporte» (DS), with lines of PRODUCT (Siigo product code, raises stock) or GASTO
-- (any ledger account of the company), taxes and the company's purchase payment method, as in Siigo.
-- Siigo does not expose the chart of accounts: public.siigo_cuentas is loaded from each company's export (Contabilidad › Catálogo de
-- cuentas). Siigo lists (purchase payment methods, taxes, products) are cached in public.siigo_catalogos by the worker (lib/siigo.ts).
-- History: private.config_historial(). Reversible: drop table public.siigo_cuentas, public.siigo_catalogos; drop the functions created here.

alter table public.siigo_documentos drop constraint if exists siigo_documentos_tipo_check;
alter table public.siigo_documentos add constraint siigo_documentos_tipo_check check (tipo in ('factura','recibo_caja','anticipo','devolucion_anticipo','gasto','soporte_gasto','soporte_producto','nota_credito','comprobante','compra'));

create table if not exists public.siigo_cuentas(
 id bigint generated always as identity primary key,
 sede_id uuid not null references public.sedes(id),
 codigo text not null,
 nombre text not null,
 categoria text,
 clase text,
 activo boolean not null default true,
 updated_at timestamptz not null default now(),
 unique (sede_id, codigo)
);
alter table public.siigo_cuentas enable row level security;
create policy siigo_cuentas_ver on public.siigo_cuentas for select to authenticated using (public.es_admin() or private.es_finanzas() or private.caja_operar(sede_id));
create trigger siigo_cuentas_historial after insert or update or delete on public.siigo_cuentas for each row execute function private.config_historial();

create table if not exists public.siigo_catalogos(
 id bigint generated always as identity primary key,
 sede_id uuid not null references public.sedes(id),
 tipo text not null check (tipo in ('formas_pago_fc','formas_pago_ds','impuestos','productos')),
 datos jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(),
 unique (sede_id, tipo)
);
alter table public.siigo_catalogos enable row level security;
create policy siigo_catalogos_ver on public.siigo_catalogos for select to authenticated using (public.es_admin() or private.es_finanzas() or private.caja_operar(sede_id));

-- Lists for the purchase form of a store: payment methods (FC/DS), taxes and document types.
create or replace function public.siigo_compra_listas(p_sede uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when not (public.es_admin() or private.es_finanzas() or private.caja_operar(p_sede)) or not private.siigo_activo(p_sede) then null else jsonb_build_object(
  'formas_fc',coalesce((select datos from public.siigo_catalogos where sede_id=p_sede and tipo='formas_pago_fc'),'[]'::jsonb),
  'formas_ds',coalesce((select datos from public.siigo_catalogos where sede_id=p_sede and tipo='formas_pago_ds'),'[]'::jsonb),
  'impuestos',coalesce((select datos from public.siigo_catalogos where sede_id=p_sede and tipo='impuestos'),'[]'::jsonb),
  'cuentas',(select count(*) from public.siigo_cuentas where sede_id=p_sede and activo)) end;
$$;

-- Search of ledger accounts (movement accounts, i.e. with category) and Siigo products of the store's company.
create or replace function public.siigo_buscar(p_sede uuid, p_tipo text, p_q text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=lower(btrim(coalesce(p_q,''))); r jsonb;
begin
 if not (public.es_admin() or private.es_finanzas() or private.caja_operar(p_sede)) then return '[]'::jsonb; end if;
 if length(q)<2 then return '[]'::jsonb; end if;
 if p_tipo='cuenta' then
  select coalesce(jsonb_agg(jsonb_build_object('codigo',codigo,'nombre',nombre,'categoria',categoria) order by (categoria ilike 'gasto%') desc,codigo),'[]'::jsonb) into r from (
   select * from public.siigo_cuentas where sede_id=p_sede and activo and categoria is not null and (codigo like q||'%' or lower(nombre) like '%'||q||'%') order by (categoria ilike 'gasto%') desc,codigo limit 40) x;
 else
  select coalesce(jsonb_agg(e order by e->>'code'),'[]'::jsonb) into r from (
   select e from public.siigo_catalogos c, jsonb_array_elements(c.datos) e where c.sede_id=p_sede and c.tipo='productos'
    and (lower(e->>'code') like q||'%' or lower(e->>'name') like '%'||q||'%') limit 40) x;
 end if;
 return r;
end $$;

-- Queues the purchase of a cash outflow (caja_movimientos egreso) for Siigo. p: {comprobante:'FC'|'DS', proveedor:{documento,nombre},
-- factura_numero, forma_pago (Siigo id), items:[{tipo:'Product'|'Account', codigo, descripcion, cantidad, valor, impuestos:[ids]}], total}
create or replace function public.siigo_registrar_compra(p_movimiento uuid, p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare m public.caja_movimientos; nit text:=regexp_replace(coalesce(p->'proveedor'->>'documento',''),'\D','','g'); d uuid; it jsonb;
begin
 select * into m from public.caja_movimientos where id=p_movimiento;
 if m.id is null or not (public.es_admin() or private.es_finanzas() or private.caja_operar(m.sede_id)) then raise exception 'Movimiento no disponible.' using errcode='42501'; end if;
 if m.anulado_at is not null or m.tipo<>'egreso' then raise exception 'Solo los egresos vigentes se registran como compra o gasto.'; end if;
 if not private.siigo_activo(m.sede_id) then raise exception 'La sede no tiene Siigo activo.'; end if;
 if coalesce(p->>'comprobante','') not in ('FC','DS') then raise exception 'Elige el comprobante: compra o gasto, o documento soporte.'; end if;
 if length(nit)<5 then raise exception 'Escribe el NIT o cédula del proveedor.'; end if;
 if p->>'comprobante'='FC' and length(btrim(coalesce(p->>'factura_numero','')))=0 then raise exception 'Escribe el número de la factura electrónica del proveedor.'; end if;
 if coalesce((p->>'forma_pago')::bigint,0)<=0 then raise exception 'Elige la forma de pago.'; end if;
 if jsonb_typeof(p->'items')<>'array' or jsonb_array_length(p->'items')=0 then raise exception 'Agrega al menos un renglón.'; end if;
 for it in select * from jsonb_array_elements(p->'items') loop
  if coalesce(it->>'tipo','') not in ('Product','Account') or length(btrim(coalesce(it->>'codigo','')))=0 or coalesce((it->>'valor')::numeric,0)<=0 or coalesce((it->>'cantidad')::numeric,0)<=0 then
   raise exception 'Revisa los renglones: cada uno necesita producto o cuenta, cantidad y valor.'; end if;
  if it->>'tipo'='Account' and not exists(select 1 from public.siigo_cuentas where sede_id=m.sede_id and codigo=it->>'codigo') then raise exception 'La cuenta % no está en el catálogo de cuentas de la sede.', it->>'codigo'; end if;
 end loop;
 if exists(select 1 from public.siigo_documentos where origen='caja' and origen_id=m.id and tipo='compra' and estado<>'anulado')
  or (m.origen='gasto' and exists(select 1 from public.siigo_documentos where origen='gasto' and origen_id=m.origen_id and estado<>'anulado')) then
  raise exception 'Este egreso ya se registró para Siigo.'; end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por)
 values(m.sede_id,'compra','caja',m.id,jsonb_build_object('comprobante',p->>'comprobante','fecha',m.fecha,'valor',m.valor,'total',coalesce((p->>'total')::numeric,m.valor),
  'proveedor',jsonb_build_object('documento',nit,'nombre',btrim(coalesce(p->'proveedor'->>'nombre',''))),'factura_numero',nullif(btrim(coalesce(p->>'factura_numero','')),''),
  'forma_pago',(p->>'forma_pago')::bigint,'items',p->'items','descripcion',m.descripcion,'categoria',m.categoria),auth.uid())
 returning id into d;
 return d;
end $$;

-- Siigo state of the cash outflows of a day (the button shows «Siigo: enviado FC-…»).
create or replace function public.siigo_compras_estado(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(d.origen_id,jsonb_build_object('estado',d.estado,'numero',d.siigo_numero,'error',d.error)),'{}'::jsonb)
 from public.siigo_documentos d where d.origen='caja' and d.tipo='compra' and d.estado<>'anulado' and d.origen_id=any(p_ids)
  and (public.es_admin() or private.es_finanzas() or private.caja_operar(d.sede_id));
$$;

revoke all on function public.siigo_compra_listas(uuid), public.siigo_buscar(uuid,text,text), public.siigo_registrar_compra(uuid,jsonb), public.siigo_compras_estado(uuid[]) from public, anon;
grant execute on function public.siigo_compra_listas(uuid), public.siigo_buscar(uuid,text,text), public.siigo_registrar_compra(uuid,jsonb), public.siigo_compras_estado(uuid[]) to authenticated;

-- Configuración › Facturación por sede › «Cargar catálogo de cuentas»: rows read from Siigo's export (lib/siigo-cuentas-excel.ts).
create or replace function public.siigo_cuentas_cargar(p_sede uuid, p_cuentas jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad.' using errcode='42501'; end if;
 if jsonb_typeof(p_cuentas)<>'array' or jsonb_array_length(p_cuentas)<50 then raise exception 'El archivo no parece un catálogo de cuentas completo.'; end if;
 insert into public.siigo_cuentas(sede_id,codigo,nombre,categoria,clase,activo)
 select p_sede,btrim(x->>'codigo'),btrim(x->>'nombre'),nullif(btrim(coalesce(x->>'categoria','')),''),nullif(btrim(coalesce(x->>'clase','')),''),coalesce((x->>'activo')::boolean,true)
 from jsonb_array_elements(p_cuentas) x where btrim(coalesce(x->>'codigo',''))~'^\d+$' and btrim(coalesce(x->>'nombre',''))<>''
 on conflict (sede_id,codigo) do update set nombre=excluded.nombre,categoria=excluded.categoria,clase=excluded.clase,activo=excluded.activo,updated_at=now()
  where (siigo_cuentas.nombre,siigo_cuentas.categoria,siigo_cuentas.clase,siigo_cuentas.activo) is distinct from (excluded.nombre,excluded.categoria,excluded.clase,excluded.activo);
 get diagnostics n=row_count;
 return (select count(*) from public.siigo_cuentas where sede_id=p_sede);
end $$;
revoke all on function public.siigo_cuentas_cargar(uuid,jsonb) from public, anon;
grant execute on function public.siigo_cuentas_cargar(uuid,jsonb) to authenticated;
