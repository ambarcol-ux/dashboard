-- Finanzas › Gastos y entre sedes:
-- 1) «Saldo inicial»: what one store already owed another at the cut-off date (30/10/2026), before the ERP. It records the debt only:
--    no cash register nor account moves, no receipt needed (the note says what was agreed). One active per pair of stores.
-- 2) «Préstamos de socios»: money a partner lends to a store (no interest) and its repayments. A loan enters the store's cash or account
--    and a repayment leaves it (Cierres de caja, origen 'prestamo_socio_entrada' / 'prestamo_socio_salida'); neither is a sale nor an expense.
--    Partners come from the editable list «socios_prestamistas» (Configuración › Listas). Also a «saldo inicial» per partner and store.
-- Only administration and accounting register; each store sees what it owes (panel.gastos).
-- Reversible: drop the prestamos_socios functions and table, restore the checks of movimientos_entre_sedes and caja_movimientos,
--   entre_sedes_listar, caja_resumen and lista_renombrar from 20270325120000 / 20270331120000, and delete the list values.

-- 1) Initial balances between stores.
alter table public.movimientos_entre_sedes alter column cuenta_origen drop not null, alter column cuenta_destino drop not null, alter column comprobante_path drop not null;
alter table public.movimientos_entre_sedes drop constraint if exists movimientos_entre_sedes_tipo_check;
alter table public.movimientos_entre_sedes add constraint movimientos_entre_sedes_tipo_check check (tipo in ('traslado','prestamo','devolucion','saldo_inicial'));
alter table public.movimientos_entre_sedes add constraint movimientos_entre_sedes_soportes
 check (tipo='saldo_inicial' or (cuenta_origen is not null and cuenta_destino is not null and comprobante_path is not null));
create unique index if not exists movimientos_entre_sedes_saldo_inicial on public.movimientos_entre_sedes(least(sede_origen,sede_destino),greatest(sede_origen,sede_destino))
 where tipo='saldo_inicial' and anulado_at is null;

-- sede_origen = the store that lent (is owed), sede_destino = the store that owes.
create or replace function public.entre_sedes_saldo_inicial(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_acreedor uuid:=nullif(p->>'acreedor','')::uuid; v_deudor uuid:=nullif(p->>'deudor','')::uuid; v_valor numeric:=(p->>'valor')::numeric;
 v_fecha date:=coalesce(nullif(p->>'fecha','')::date,date '2026-10-30'); v_desc text:=btrim(coalesce(p->>'descripcion','')); v_id uuid;
begin
 if not private.es_finanzas() then raise exception 'Solo administración y contabilidad cargan saldos iniciales.' using errcode='42501'; end if;
 if v_acreedor is null or v_deudor is null or v_acreedor=v_deudor or not exists(select 1 from public.sedes where id=v_acreedor) or not exists(select 1 from public.sedes where id=v_deudor)
  then raise exception 'Elige la sede que debe y la sede a la que le debe (distintas).'; end if;
 if v_valor is null or v_valor<=0 or v_valor<>round(v_valor,2) then raise exception 'Revisa el valor.'; end if;
 if v_fecha>(now() at time zone 'America/Bogota')::date then raise exception 'La fecha de corte no puede ser futura.'; end if;
 if length(v_desc) not between 5 and 500 then raise exception 'Escribe qué se acordó (por ejemplo: «deuda histórica acordada con las administradoras»).'; end if;
 if exists(select 1 from public.movimientos_entre_sedes where tipo='saldo_inicial' and anulado_at is null and least(sede_origen,sede_destino)=least(v_acreedor,v_deudor) and greatest(sede_origen,sede_destino)=greatest(v_acreedor,v_deudor))
  then raise exception 'Estas dos sedes ya tienen saldo inicial. Anúlalo si necesitas corregirlo.'; end if;
 insert into public.movimientos_entre_sedes(fecha,tipo,sede_origen,sede_destino,valor,descripcion,registrado_por)
 values(v_fecha,'saldo_inicial',v_acreedor,v_deudor,v_valor,v_desc,auth.uid()) returning id into v_id;
 return v_id;
end $$;

-- Movements of the period plus what each store owes another (initial balances and loans minus repayments, all time).
create or replace function public.entre_sedes_listar(p_desde date,p_hasta date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.es_finanzas() then raise exception 'Solo administración y contabilidad.' using errcode='42501'; end if;
 return jsonb_build_object(
  'movimientos',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'fecha',m.fecha,'tipo',m.tipo,'origen',so.nombre,'destino',sd.nombre,'cuenta_origen',ko.nombre,'cuenta_destino',kd.nombre,
    'valor',m.valor,'descripcion',m.descripcion,'comprobante_path',m.comprobante_path,'anulado',m.anulado_at is not null,'motivo_anulacion',m.motivo_anulacion) order by m.fecha desc,m.created_at desc)
   from public.movimientos_entre_sedes m join public.sedes so on so.id=m.sede_origen join public.sedes sd on sd.id=m.sede_destino
   left join public.cuentas_dinero ko on ko.id=m.cuenta_origen left join public.cuentas_dinero kd on kd.id=m.cuenta_destino
   where m.fecha between p_desde and p_hasta or m.tipo='saldo_inicial'),'[]'::jsonb),
  'deudas',coalesce((select jsonb_agg(jsonb_build_object('deudor',sd.nombre,'acreedor',sa.nombre,'saldo',x.saldo) order by x.saldo desc) from (
    select a,b,sum(v) saldo from (
     select sede_origen a,sede_destino b,valor v from public.movimientos_entre_sedes where anulado_at is null and tipo in ('prestamo','saldo_inicial')
     union all select sede_destino,sede_origen,-valor from public.movimientos_entre_sedes where anulado_at is null and tipo in ('prestamo','saldo_inicial')
     union all select sede_destino,sede_origen,-valor from public.movimientos_entre_sedes where anulado_at is null and tipo='devolucion'
     union all select sede_origen,sede_destino,valor from public.movimientos_entre_sedes where anulado_at is null and tipo='devolucion') t
    group by a,b having sum(v)>0) x join public.sedes sa on sa.id=x.a join public.sedes sd on sd.id=x.b),'[]'::jsonb));
end $$;

-- 2) Loans from partners.
alter table public.caja_movimientos drop constraint if exists caja_movimientos_origen_check;
alter table public.caja_movimientos add constraint caja_movimientos_origen_check
 check (origen in ('pago','deposito','devolucion','pago_fijo','plan_ahorro','gasto','entre_sedes_salida','entre_sedes_entrada','prestamo_socio_entrada','prestamo_socio_salida'));

insert into public.listas_contrato(lista,valor,orden,activo) select 'socios_prestamistas',v,i,true from unnest(array['Andrés Romero','Jennifer']) with ordinality u(v,i) on conflict do nothing;

create table if not exists public.prestamos_socios(
 id uuid primary key default gen_random_uuid(),
 fecha date not null,
 tipo text not null check (tipo in ('prestamo','devolucion','saldo_inicial')),
 socio text not null check (length(socio) between 2 and 60),
 sede_id uuid not null references public.sedes(id),
 cuenta_id uuid references public.cuentas_dinero(id),
 valor numeric(14,2) not null check (valor>0 and valor<1000000000000),
 descripcion text check (length(descripcion)<=500),
 comprobante_path text,
 caja_movimiento_id uuid references public.caja_movimientos(id),
 registrado_por uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 anulado_at timestamptz, anulado_por uuid references public.profiles(id), motivo_anulacion text,
 check (tipo='saldo_inicial' or (cuenta_id is not null and comprobante_path is not null))
);
create index if not exists prestamos_socios_sede on public.prestamos_socios(sede_id);
create unique index if not exists prestamos_socios_saldo_inicial on public.prestamos_socios(socio,sede_id) where tipo='saldo_inicial' and anulado_at is null;
create trigger prestamos_socios_historial after insert or update or delete on public.prestamos_socios for each row execute function private.config_historial();
alter table public.prestamos_socios enable row level security;
create policy prestamos_socios_ver on public.prestamos_socios for select to authenticated using (private.gastos_ver(sede_id));
revoke insert,update,delete on public.prestamos_socios from anon, authenticated;

create or replace function public.prestamos_socios_registrar(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_tipo text:=p->>'tipo'; v_socio text:=btrim(coalesce(p->>'socio','')); v_valor numeric:=(p->>'valor')::numeric;
 v_desc text:=nullif(btrim(coalesce(p->>'descripcion','')),''); v_path text:=nullif(btrim(coalesce(p->>'comprobante_path','')),'');
 v_sede uuid:=nullif(p->>'sede_id','')::uuid; v_fecha date; k public.cuentas_dinero; v_id uuid; v_mov uuid; etiqueta text;
begin
 if not private.es_finanzas() then raise exception 'Solo administración y contabilidad registran préstamos de socios.' using errcode='42501'; end if;
 if v_tipo not in ('prestamo','devolucion','saldo_inicial') then raise exception 'Elige si es préstamo, devolución o saldo inicial.'; end if;
 if not private.lista_activa('socios_prestamistas',v_socio) then raise exception 'Elige el socio.'; end if;
 if v_valor is null or v_valor<=0 or v_valor<>round(v_valor,2) then raise exception 'Revisa el valor.'; end if;
 if v_tipo='saldo_inicial' then
  v_fecha:=coalesce(nullif(p->>'fecha','')::date,date '2026-10-30');
  if v_sede is null or not exists(select 1 from public.sedes where id=v_sede) then raise exception 'Elige la sede que debe.'; end if;
  if v_fecha>(now() at time zone 'America/Bogota')::date then raise exception 'La fecha de corte no puede ser futura.'; end if;
  if length(coalesce(v_desc,'')) <5 then raise exception 'Escribe qué se acordó (por ejemplo: «deuda histórica acordada con la sede»).'; end if;
  if exists(select 1 from public.prestamos_socios where tipo='saldo_inicial' and anulado_at is null and socio=v_socio and sede_id=v_sede) then raise exception 'Este socio ya tiene saldo inicial con esta sede. Anúlalo si necesitas corregirlo.'; end if;
  insert into public.prestamos_socios(fecha,tipo,socio,sede_id,valor,descripcion,registrado_por) values(v_fecha,'saldo_inicial',v_socio,v_sede,v_valor,v_desc,auth.uid()) returning id into v_id;
  return v_id;
 end if;
 v_fecha:=(p->>'fecha')::date;
 select * into k from public.cuentas_dinero where id=nullif(p->>'cuenta_id','')::uuid and activo;
 if k.id is null or k.sede_id is null then raise exception 'Elige la caja o cuenta de la sede.'; end if;
 v_sede:=k.sede_id;
 if v_path is null or split_part(v_path,'/',1)<>v_sede::text or not exists(select 1 from storage.objects where bucket_id='comprobantes_caja' and name=v_path) then raise exception 'Adjunta el comprobante.'; end if;
 etiqueta:=case v_tipo when 'prestamo' then 'Préstamo de '||v_socio else 'Devolución a '||v_socio end;
 insert into public.prestamos_socios(fecha,tipo,socio,sede_id,cuenta_id,valor,descripcion,comprobante_path,registrado_por)
 values(v_fecha,v_tipo,v_socio,v_sede,k.id,v_valor,v_desc,v_path,auth.uid()) returning id into v_id;
 v_mov:=private.registrar_movimiento_caja(jsonb_build_object('sede_id',v_sede,'fecha',v_fecha,'tipo',case v_tipo when 'prestamo' then 'ingreso' else 'egreso' end,
  'categoria',left(etiqueta,60),'medio',case when k.tipo='efectivo' then 'Efectivo' else 'Transferencia' end,'valor',v_valor,
  'descripcion',left(concat_ws(' · ',etiqueta,v_desc),500),'origen',case v_tipo when 'prestamo' then 'prestamo_socio_entrada' else 'prestamo_socio_salida' end,
  'origen_id',v_id,'comprobante_path',v_path,'cuenta_id',case when k.tipo='efectivo' then null else k.id end));
 update public.prestamos_socios set caja_movimiento_id=v_mov where id=v_id;
 return v_id;
end $$;

create or replace function public.prestamos_socios_anular(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare m public.prestamos_socios; reason text:=btrim(coalesce(p_motivo,''));
begin
 if not private.es_finanzas() then raise exception 'Solo administración y contabilidad.' using errcode='42501'; end if;
 select * into m from public.prestamos_socios where id=p_id for update;
 if m.id is null then raise exception 'Registro no encontrado.'; end if;
 if m.anulado_at is not null then raise exception 'El registro ya está anulado.'; end if;
 if length(reason) not between 5 and 500 then raise exception 'Escribe el motivo de la anulación (mínimo 5 caracteres).'; end if;
 if m.caja_movimiento_id is not null then perform private.anular_movimiento_caja(m.caja_movimiento_id,reason); end if;
 update public.prestamos_socios set anulado_at=now(),anulado_por=auth.uid(),motivo_anulacion=reason where id=p_id;
end $$;

-- All loans, repayments and initial balances the user can see, and what each store owes each partner.
create or replace function public.prestamos_socios_listar() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'movimientos',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'fecha',m.fecha,'tipo',m.tipo,'socio',m.socio,'sede',s.nombre,'cuenta',k.nombre,'valor',m.valor,
    'descripcion',m.descripcion,'comprobante_path',m.comprobante_path,'anulado',m.anulado_at is not null,'motivo_anulacion',m.motivo_anulacion) order by m.fecha desc,m.created_at desc)
   from public.prestamos_socios m join public.sedes s on s.id=m.sede_id left join public.cuentas_dinero k on k.id=m.cuenta_id where private.gastos_ver(m.sede_id)),'[]'::jsonb),
  'saldos',coalesce((select jsonb_agg(jsonb_build_object('socio',x.socio,'sede',s.nombre,'saldo',x.saldo) order by x.saldo desc) from (
    select socio,sede_id,sum(case when tipo='devolucion' then -valor else valor end) saldo from public.prestamos_socios
    where anulado_at is null and private.gastos_ver(sede_id) group by socio,sede_id having sum(case when tipo='devolucion' then -valor else valor end)<>0) x join public.sedes s on s.id=x.sede_id),'[]'::jsonb),
  'puede_registrar',private.es_finanzas());
$$;

revoke all on function public.entre_sedes_saldo_inicial(jsonb), public.prestamos_socios_registrar(jsonb), public.prestamos_socios_anular(uuid,text), public.prestamos_socios_listar() from public, anon;
grant execute on function public.entre_sedes_saldo_inicial(jsonb), public.prestamos_socios_registrar(jsonb), public.prestamos_socios_anular(uuid,text), public.prestamos_socios_listar() to authenticated;

-- Cash summary: partner loans and their repayments are not income nor expenses (they still count in the cash and account balances).
create or replace function private.caja_resumen(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path to '' as $function$
begin
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>92 then raise exception 'Selecciona un periodo de hasta 3 meses.'; end if;
 return coalesce((select jsonb_agg(r order by r->>'sede') from (
  select jsonb_build_object('sede_id',s.id,'sede',s.nombre,'inicio',x.ini,
   'ingresos',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between x.d and p_hasta and m.tipo='ingreso' and m.categoria<>'Base de caja' and m.origen is distinct from 'deposito' and m.origen is distinct from 'entre_sedes_entrada' and m.origen is distinct from 'prestamo_socio_entrada' and m.anulado_at is null),0),
   'egresos',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between x.d and p_hasta and m.tipo='egreso' and m.origen is distinct from 'devolucion' and m.origen is distinct from 'entre_sedes_salida' and m.origen is distinct from 'prestamo_socio_salida' and m.anulado_at is null),0),
   'base',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between x.d and p_hasta and m.categoria='Base de caja' and m.anulado_at is null),0),
   'ingresos_efectivo',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between x.d and p_hasta and m.tipo='ingreso' and m.medio='Efectivo' and m.origen is distinct from 'deposito' and m.anulado_at is null),0),
   'egresos_efectivo',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between x.d and p_hasta and m.tipo='egreso' and m.medio='Efectivo' and m.origen is distinct from 'devolucion' and m.anulado_at is null),0),
   'dias_cerrados',(select count(*) from public.caja_cierres k where k.sede_id=s.id and k.fecha between x.d and p_hasta and k.reabierto_at is null),
   'diferencia',coalesce((select sum(diferencia) from public.caja_cierres k where k.sede_id=s.id and k.fecha between x.d and p_hasta and k.reabierto_at is null),0),
   'dias_con_movimientos_sin_cierre',(select count(distinct m.fecha) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between x.d and p_hasta and m.anulado_at is null and m.fecha<private.caja_hoy() and not private.caja_dia_cerrado(s.id,m.fecha)),
   'saldo_actual',private.caja_saldo_inicial(s.id,p_hasta+1)) r
  from public.sedes s cross join lateral (select private.caja_inicio(s.id) ini, greatest(p_desde,coalesce(private.caja_inicio(s.id),p_desde)) d) x
  where s.activo is true and private.caja_ver(s.id)) y),'[]'::jsonb);
end $function$;

-- Renaming a partner in Configuración › Listas also renames it in their loans.
create or replace function public.lista_renombrar(p_lista text,p_viejo text,p_nuevo text) returns text
language plpgsql security definer set search_path='' as $$
declare v text:=btrim(coalesce(p_viejo,'')); n text:=btrim(regexp_replace(coalesce(p_nuevo,''),'\s+',' ','g'));
begin
 if not private.es_finanzas() then raise exception 'Solo administración y contabilidad editan las listas.' using errcode='42501'; end if;
 if length(n) not between 2 and 60 then raise exception 'Escribe el nuevo nombre (2 a 60 caracteres).'; end if;
 if lower(n) in ('base de caja','retiro de utilidades') then raise exception 'Ese nombre está reservado por el ERP.'; end if;
 if not exists(select 1 from public.listas_contrato where lista=p_lista and valor=v) then raise exception 'Opción no encontrada en la lista.'; end if;
 if n=v then return n; end if;
 if exists(select 1 from public.listas_contrato where lista=p_lista and lower(valor)=lower(n) and valor<>v) then raise exception 'Ya existe una opción con ese nombre.'; end if;
 update public.listas_contrato set valor=n where lista=p_lista and valor=v;
 -- The records that already use the value take the new name.
 case p_lista
  when 'banco' then
   update public.contratos set banco_deposito=n where banco_deposito=v;
   update public.cuentas_dinero set banco=n where banco=v;
   update public.proveedores set banco=n where banco=v;
   update public.aliados set banco=n where banco=v;
   update public.aliados_cambios_cuenta set banco=n where banco=v;
   update public.solicitudes_depositos set banco=n where banco=v;
   update public.referidores set banco_nombre=n where banco_nombre=v;
  when 'tipo_cuenta' then update public.contratos set tipo_cuenta_deposito=n where tipo_cuenta_deposito=v;
  when 'tipos_documento' then
   update public.contratos set tipo_documento_cliente=n where tipo_documento_cliente=v;
   update public.contratos set tipo_documento_titular=n where tipo_documento_titular=v;
  when 'prov_tipos_servicio' then
   update public.proveedores set tipo_servicio=n where tipo_servicio=v;
   update public.proveedor_tarifas set servicio=n where servicio=v;
   update public.paquete_componentes set servicio=n where servicio=v;
   update public.contrato_servicios set servicio=n where servicio=v;
  when 'prov_tipos_documento' then update public.documentos_proveedor set tipo=n where tipo=v;
  when 'prov_medios_pago' then update public.pagos_proveedor set medio_pago=n where medio_pago=v;
  when 'gastos_categorias' then
   update public.gastos set categoria=n where categoria=v and clase='gasto';
   update public.caja_movimientos set categoria=n where categoria=v and origen='gasto';
  when 'caja_categorias_ingreso' then update public.caja_movimientos set categoria=n where categoria=v and tipo='ingreso' and origen is null;
  when 'caja_categorias_egreso' then update public.caja_movimientos set categoria=n where categoria=v and tipo='egreso' and origen is null;
  when 'pv_canales' then update public.primeras_citas_seguimientos set canal=n where canal=v;
  when 'pv_resultados_seguimiento' then update public.primeras_citas_seguimientos set resultado=n where resultado=v;
  when 'pv_como_se_entero' then update public.primeras_citas set como_se_entero=n where como_se_entero=v;
  when 'pv_tipos_evento_vitrina' then update public.primeras_citas set tipo_vestido=n where origen='vitrina' and tipo_vestido=v;
  when 'socios_prestamistas' then update public.prestamos_socios set socio=n where socio=v;
  else null; -- lists stored inside longer texts (reasons with notes, accessories): the old records keep the old text.
 end case;
 return n;
end $$;
