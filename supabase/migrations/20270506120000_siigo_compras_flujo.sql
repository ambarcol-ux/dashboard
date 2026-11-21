-- Compras y gastos a Siigo, opción C (pedido de la contadora):
--  · the ledger account is chosen (search, «Ver todas» by group, or a code not in the catalog that Siigo validates) and saved with the
--    expense; the ERP suggests the account last used for that kind of expense in the store;
--  · a cash-register expense is sent to Siigo when that day's cash register is closed (lib/siigo.ts); until then it can be corrected;
--    contabilidad can hold it («retener») and release it;
--  · after sending the state is visible (sent with its number, queued, or the error), and an expense with error or not sent yet can be
--    corrected and sent again, or removed;
--  · Proveedores › Pagos uses the same form (origen pago_proveedor).
-- Reversible: restore public.siigo_registrar_compra, public.siigo_compra_listas and public.siigo_compras_estado from
-- 20270428120000_siigo_compras_caja.sql; drop the functions created here.

-- Validates a purchase and returns it ready for the queue. Accounts must exist in the store's catalog, or be a plain ledger code
-- (6 to 10 digits) that Siigo will validate when it is sent («nueva»).
create or replace function private.siigo_compra_validar(p_sede uuid, p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare nit text:=regexp_replace(coalesce(p->'proveedor'->>'documento',''),'\D','','g'); it jsonb; items jsonb:='[]'::jsonb; cod text;
begin
 if not private.siigo_activo(p_sede) then raise exception 'La sede no tiene Siigo activo.'; end if;
 if coalesce(p->>'comprobante','') not in ('FC','DS') then raise exception 'Elige el comprobante: compra o gasto, o documento soporte.'; end if;
 if length(nit)<5 then raise exception 'Escribe el NIT o cédula del proveedor.'; end if;
 if p->>'comprobante'='FC' and length(btrim(coalesce(p->>'factura_numero','')))=0 then raise exception 'Escribe el número de la factura electrónica del proveedor.'; end if;
 if coalesce((p->>'forma_pago')::bigint,0)<=0 then raise exception 'Elige la forma de pago.'; end if;
 if jsonb_typeof(p->'items')<>'array' or jsonb_array_length(p->'items')=0 then raise exception 'Agrega al menos un renglón.'; end if;
 for it in select * from jsonb_array_elements(p->'items') loop
  cod:=btrim(coalesce(it->>'codigo',''));
  if coalesce(it->>'tipo','') not in ('Product','Account') or length(cod)=0 or coalesce((it->>'valor')::numeric,0)<=0 or coalesce((it->>'cantidad')::numeric,0)<=0 then
   raise exception 'Revisa los renglones: cada uno necesita producto o cuenta, cantidad y valor.'; end if;
  if it->>'tipo'='Account' then
   if exists(select 1 from public.siigo_cuentas where sede_id=p_sede and codigo=cod) then it:=it-'nueva';
   elsif cod ~ '^\d{6,10}$' then it:=it||'{"nueva":true}'::jsonb;
   else raise exception 'La cuenta % no está en el catálogo de cuentas de la sede.', cod; end if;
  end if;
  items:=items||jsonb_build_array(it||jsonb_build_object('codigo',cod));
 end loop;
 return jsonb_build_object('comprobante',p->>'comprobante','proveedor',jsonb_build_object('documento',nit,'nombre',btrim(coalesce(p->'proveedor'->>'nombre',''))),
  'factura_numero',nullif(btrim(coalesce(p->>'factura_numero','')),''),'forma_pago',(p->>'forma_pago')::bigint,'items',items);
end $$;

-- Cash-register expense: saved (or corrected while not sent); it goes to Siigo when the day's cash register is closed.
create or replace function public.siigo_registrar_compra(p_movimiento uuid, p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare m public.caja_movimientos; v jsonb; d public.siigo_documentos; nid uuid;
begin
 select * into m from public.caja_movimientos where id=p_movimiento;
 if m.id is null or not (public.es_admin() or private.es_finanzas() or private.caja_operar(m.sede_id)) then raise exception 'Movimiento no disponible.' using errcode='42501'; end if;
 if m.anulado_at is not null or m.tipo<>'egreso' then raise exception 'Solo los egresos vigentes se registran como compra o gasto.'; end if;
 v:=private.siigo_compra_validar(m.sede_id,p);
 if m.origen='gasto' and exists(select 1 from public.siigo_documentos where origen='gasto' and origen_id=m.origen_id and estado<>'anulado') then raise exception 'Este egreso ya se registró para Siigo.'; end if;
 select * into d from public.siigo_documentos where origen='caja' and origen_id=m.id and tipo='compra' order by (estado<>'anulado') desc, created_at desc limit 1;
 v:=v||jsonb_build_object('fecha',m.fecha,'caja_fecha',m.fecha,'movimiento_id',m.id,'valor',m.valor,'total',coalesce((p->>'total')::numeric,m.valor),'descripcion',m.descripcion,'categoria',m.categoria,
  'retenido',coalesce((d.datos->>'retenido')::boolean,false));
 if d.id is not null then
  if d.estado='enviado' then raise exception 'Este egreso ya está en Siigo (%): corrígelo allá.', coalesce(d.siigo_numero,'enviado'); end if;
  update public.siigo_documentos set datos=v,estado='pendiente',error=null,intentos=0,updated_at=now() where id=d.id;
  return d.id;
 end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por) values(m.sede_id,'compra','caja',m.id,v,auth.uid()) returning id into nid;
 return nid;
end $$;

-- Supplier payment (Proveedores › Pagos): same form, store chosen by administración; sent right away (no cash register).
create or replace function public.siigo_registrar_compra_proveedor(p_pago uuid, p_sede uuid, p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare g public.pagos_proveedor; v jsonb; d public.siigo_documentos; nid uuid;
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad.' using errcode='42501'; end if;
 select * into g from public.pagos_proveedor where id=p_pago;
 if g.id is null or g.anulado_at is not null then raise exception 'Pago no disponible.'; end if;
 v:=private.siigo_compra_validar(p_sede,p)||jsonb_build_object('fecha',g.fecha_pago,'valor',g.valor_total,'total',coalesce((p->>'total')::numeric,g.valor_total),
  'descripcion',left('Pago a proveedor '||coalesce(p->'proveedor'->>'nombre',''),300),'categoria','proveedores');
 update public.siigo_documentos set estado='anulado',error='Reemplazado por el registro con cuenta contable.',updated_at=now() where origen='pago_proveedor' and origen_id=g.id and tipo<>'compra' and estado in ('pendiente','error');
 if exists(select 1 from public.siigo_documentos where origen='pago_proveedor' and origen_id=g.id and estado='enviado') then raise exception 'Este pago ya está en Siigo.'; end if;
 select * into d from public.siigo_documentos where origen='pago_proveedor' and origen_id=g.id and tipo='compra' order by (estado<>'anulado') desc, created_at desc limit 1;
 if d.id is not null then
  if d.estado='enviado' then raise exception 'Este pago ya está en Siigo (%).', coalesce(d.siigo_numero,'enviado'); end if;
  update public.siigo_documentos set sede_id=p_sede,datos=v||jsonb_build_object('retenido',coalesce((d.datos->>'retenido')::boolean,false)),estado='pendiente',error=null,intentos=0,updated_at=now() where id=d.id;
  return d.id;
 end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,datos,creado_por) values(p_sede,'compra','pago_proveedor',g.id,v,auth.uid()) returning id into nid;
 return nid;
end $$;

-- Hold / release (contabilidad) and remove (not sent yet).
create or replace function public.siigo_compra_retener(p_doc uuid, p_retener boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad.' using errcode='42501'; end if;
 update public.siigo_documentos set datos=datos||jsonb_build_object('retenido',p_retener),updated_at=now(),error=case when p_retener then 'Retenido por contabilidad.' else null end
 where id=p_doc and tipo='compra' and estado in ('pendiente','error');
 if not found then raise exception 'Ese gasto ya se envió a Siigo o no existe.'; end if;
end $$;
create or replace function public.siigo_compra_quitar(p_doc uuid) returns void
language plpgsql security definer set search_path='' as $$
declare d public.siigo_documentos;
begin
 select * into d from public.siigo_documentos where id=p_doc and tipo='compra';
 if d.id is null or not (public.es_admin() or private.es_finanzas() or private.caja_operar(d.sede_id)) then raise exception 'No disponible.' using errcode='42501'; end if;
 if d.estado='enviado' then raise exception 'Ya está en Siigo: anúlalo allá.'; end if;
 update public.siigo_documentos set estado='anulado',error='Quitado antes de enviarse.',updated_at=now() where id=d.id;
end $$;

-- State of the expenses of a day or of supplier payments (id, state, number, error, saved data to correct, held).
create or replace function public.siigo_compras_estado(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(d.origen_id,jsonb_build_object('id',d.id,'estado',d.estado,'numero',d.siigo_numero,'error',d.error,'datos',d.datos,
  'retenido',coalesce((d.datos->>'retenido')::boolean,false))),'{}'::jsonb)
 from (select distinct on (origen_id) * from public.siigo_documentos where origen in ('caja','pago_proveedor') and tipo='compra' and estado<>'anulado' and origen_id=any(p_ids) order by origen_id,created_at desc) d
 where public.es_admin() or private.es_finanzas() or private.caja_operar(d.sede_id);
$$;

-- Lists for the form, plus the account last used for each kind of expense in the store.
create or replace function public.siigo_compra_listas(p_sede uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when not (public.es_admin() or private.es_finanzas() or private.caja_operar(p_sede)) or not private.siigo_activo(p_sede) then null else jsonb_build_object(
  'formas_fc',coalesce((select datos from public.siigo_catalogos where sede_id=p_sede and tipo='formas_pago_fc'),'[]'::jsonb),
  'formas_ds',coalesce((select datos from public.siigo_catalogos where sede_id=p_sede and tipo='formas_pago_ds'),'[]'::jsonb),
  'impuestos',coalesce((select datos from public.siigo_catalogos where sede_id=p_sede and tipo='impuestos'),'[]'::jsonb),
  'cuentas',(select count(*) from public.siigo_cuentas where sede_id=p_sede and activo),
  'grupos',coalesce((select jsonb_agg(jsonb_build_object('categoria',categoria,'n',n) order by (categoria ilike 'gasto%') desc,categoria) from (
    select categoria,count(*) n from public.siigo_cuentas where sede_id=p_sede and activo and categoria is not null group by categoria) g),'[]'::jsonb),
  'sugeridas',coalesce((select jsonb_object_agg(cat,jsonb_build_object('codigo',cod,'nombre',nom)) from (
    select distinct on (lower(d.datos->>'categoria')) lower(d.datos->>'categoria') cat,it->>'codigo' cod,coalesce(k.nombre,it->>'descripcion') nom
    from public.siigo_documentos d cross join lateral jsonb_array_elements(d.datos->'items') it left join public.siigo_cuentas k on k.sede_id=p_sede and k.codigo=it->>'codigo'
    where d.sede_id=p_sede and d.tipo='compra' and d.estado<>'anulado' and it->>'tipo'='Account' and d.datos->>'categoria' is not null
    order by lower(d.datos->>'categoria'),d.created_at desc) s),'{}'::jsonb)) end;
$$;

-- «Ver todas»: the accounts of one group of the store's catalog (movement accounts, active), filtered.
create or replace function public.siigo_cuentas_explorar(p_sede uuid, p_categoria text, p_q text) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when not (public.es_admin() or private.es_finanzas() or private.caja_operar(p_sede)) then '[]'::jsonb else coalesce((
  select jsonb_agg(jsonb_build_object('codigo',codigo,'nombre',nombre,'categoria',categoria) order by codigo) from (
   select * from public.siigo_cuentas where sede_id=p_sede and activo and categoria is not null and (p_categoria is null or categoria=p_categoria)
    and (coalesce(btrim(p_q),'')='' or codigo like btrim(p_q)||'%' or lower(nombre) like '%'||lower(btrim(p_q))||'%') order by codigo limit 400) x),'[]'::jsonb) end;
$$;

-- An account typed by code that Siigo accepted is added to the store's catalog (called by the worker after sending).
create or replace function public.siigo_cuentas_agregar_servidor(p_sede uuid, p_cuentas jsonb) returns void
language sql security definer set search_path='' as $$
 insert into public.siigo_cuentas(sede_id,codigo,nombre,categoria,activo)
 select p_sede,x->>'codigo',left(coalesce(nullif(x->>'nombre',''),'Cuenta '||(x->>'codigo')),200),'Gastos',true from jsonb_array_elements(p_cuentas) x
 where coalesce(auth.role(),'')='service_role' and (x->>'codigo') ~ '^\d{6,10}$'
 on conflict (sede_id,codigo) do nothing;
$$;

revoke all on function private.siigo_compra_validar(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.siigo_registrar_compra_proveedor(uuid,uuid,jsonb), public.siigo_compra_retener(uuid,boolean), public.siigo_compra_quitar(uuid),
 public.siigo_cuentas_explorar(uuid,text,text) from public, anon;
grant execute on function public.siigo_registrar_compra_proveedor(uuid,uuid,jsonb), public.siigo_compra_retener(uuid,boolean), public.siigo_compra_quitar(uuid),
 public.siigo_cuentas_explorar(uuid,text,text) to authenticated;
revoke all on function public.siigo_cuentas_agregar_servidor(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.siigo_cuentas_agregar_servidor(uuid,jsonb) to service_role;
