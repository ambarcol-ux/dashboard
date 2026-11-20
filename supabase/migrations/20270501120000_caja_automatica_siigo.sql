-- Caja automática y cuadre con Siigo.
-- Every money movement of a contract reaches that day's cash register by itself, with its account, so the cash register, the contract
-- and Siigo tell the same story:
--  · contract payment (pagos) → «Pago de contrato» (annulled with the payment while the day is open);
--  · deposit received when signing (medio Efectivo/Transferencia/Tarjeta), at delivery (Entregas, «En la entrega») or from Depósitos
--    → «Depósito en garantía»; deposit returned → «Devolución de depósito». Deposits are not sales: they stay out of the day's income,
--    but cash ones count in the cash expected in the drawer. Transfers go to the deposits account (0560) where Siigo has it mapped.
--  · deposits received at signing or delivery also queue the Siigo advance (anticipo) when none exists, so returns cross it.
-- A movement only lands in an open day from the store's cash start; closed days are left as they are (Abonos pendientes lists them).
-- Dates use Colombia time (an evening payment no longer lands on the next day).
-- public.siigo_conciliacion: ERP ↔ caja ↔ Siigo, one row per money event, for Cierres de caja › «Cuadre con Siigo».
-- Reversible: drop the triggers caja_auto_pago, caja_auto_deposito, caja_auto_deposito_contrato, caja_auto_deposito_entrega and the
-- functions created here; restore private.cerrar_caja, private.caja_cuenta_movimiento, private.registrar_movimiento_caja,
-- private.caja_dia and private.caja_abonos_pendientes from 20261025120000/20270102120000/20270323120000.

-- Deposits account (0560) for a store, only where its Siigo set-up maps it (Pereira uses its own bank).
create or replace function private.caja_cuenta_deposito(p_sede uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select k.id from public.cuentas_dinero k join private.credenciales_siigo s on s.sede_id=p_sede
 where k.solo_depositos and k.activo and (k.sede_id is null or k.sede_id=p_sede) and (s.parametros->'formas_pago') ? ('cuenta:'||k.id::text)
 order by k.sede_id nulls last limit 1;
$$;

-- One automatic movement (idempotent by origin). Returns null when it does not apply (closed day, before the start, repeated).
create or replace function private.caja_auto(p_sede uuid, p_fecha date, p_tipo text, p_categoria text, p_medio text, p_valor numeric,
 p_descripcion text, p_contrato uuid, p_origen text, p_origen_id uuid, p_cuenta uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare ini date; med text; nid uuid;
begin
 if p_sede is null or p_fecha is null or coalesce(p_valor,0)<=0 then return null; end if;
 ini:=private.caja_inicio(p_sede);
 if (ini is not null and p_fecha<ini) or p_fecha>private.caja_hoy() or private.caja_dia_cerrado(p_sede,p_fecha) then return null; end if;
 if exists(select 1 from public.caja_movimientos where origen=p_origen and origen_id=p_origen_id and anulado_at is null) then return null; end if;
 med:=case when p_medio ilike 'efectivo%' then 'Efectivo' when p_medio ilike 'transfer%' then 'Transferencia' when p_medio ilike 'tarjeta%' then 'Tarjeta' else 'Otro' end;
 insert into public.caja_movimientos(sede_id,fecha,tipo,categoria,medio,valor,descripcion,contrato_id,origen,origen_id,usuario_id,cuenta_id)
 values(p_sede,p_fecha,p_tipo,p_categoria,med,round(p_valor,2),left(coalesce(p_descripcion,''),500),p_contrato,p_origen,p_origen_id,
  coalesce(auth.uid(),(select id from public.profiles where lower(rol)='admin' order by created_at limit 1)),case when med='Efectivo' then null else p_cuenta end)
 returning id into nid;
 return nid;
exception when unique_violation then return null;
end $$;

-- Contract payments.
create or replace function private.caja_auto_pago() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.contratos;
begin
 select * into c from public.contratos where id=new.contrato_id;
 if c.id is null then return new; end if;
 if tg_op='INSERT' then
  if new.anulado_at is null and coalesce(new.observaciones,'') not like 'Ajuste:%' then
   perform private.caja_auto(c.sede_id,(coalesce(new.fecha_pago,now()) at time zone 'America/Bogota')::date,'ingreso','Pago de contrato',new.medio_pago,new.valor_pagado,
    'Abono '||c.numero_contrato||coalesce(' · recibo '||nullif(btrim(new.numero_recibo),''),''),c.id,'pago',new.id);
  end if;
 elsif new.anulado_at is not null and old.anulado_at is null then
  update public.caja_movimientos m set anulado_at=now(),anulado_por=auth.uid(),motivo_anulacion=left('Abono anulado en el contrato: '||coalesce(new.motivo_anulacion,''),500)
  where m.origen='pago' and m.origen_id=new.id and m.anulado_at is null and not private.caja_dia_cerrado(m.sede_id,m.fecha);
 end if;
 return new;
end $$;
drop trigger if exists caja_auto_pago on public.pagos;
create trigger caja_auto_pago after insert or update of anulado_at on public.pagos for each row execute function private.caja_auto_pago();

-- Deposits and returns registered in Depósitos.
create or replace function private.caja_auto_deposito() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.contratos; ing boolean:=new.tipo='ingreso';
begin
 if new.tipo not in ('ingreso','devolucion') then return new; end if;
 select * into c from public.contratos where id=new.contrato_id;
 if c.id is null then return new; end if;
 perform private.caja_auto(c.sede_id,new.fecha,case when ing then 'ingreso' else 'egreso' end,case when ing then 'Depósito en garantía' else 'Devolución de depósito' end,
  new.metodo,new.monto,case when ing then 'Depósito ' else 'Devolución de depósito ' end||c.numero_contrato,c.id,case when ing then 'deposito' else 'devolucion' end,new.id,
  private.caja_cuenta_deposito(c.sede_id));
 return new;
end $$;
drop trigger if exists caja_auto_deposito on public.movimientos_depositos;
create trigger caja_auto_deposito after insert on public.movimientos_depositos for each row execute function private.caja_auto_deposito();

-- Siigo advance for a deposit received at signing or delivery (the Depósitos ones queue it in private.siigo_deposito_documento).
create or replace function private.siigo_anticipo_deposito(c public.contratos, p_fecha date, p_valor numeric, p_medio text, p_origen text, p_origen_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if c.sede_id is null or not private.siigo_activo(c.sede_id) or p_fecha<date '2026-11-20' or coalesce(p_valor,0)<=0 then return; end if;
 if exists(select 1 from public.siigo_documentos where contrato_id=c.id and tipo='anticipo' and estado<>'anulado') then return; end if;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,creado_por)
 values(c.sede_id,'anticipo',p_origen,p_origen_id,c.id,jsonb_build_object('valor',p_valor,'medio',p_medio,'fecha',p_fecha,'numero_contrato',c.numero_contrato),auth.uid())
 on conflict do nothing;
end $$;

-- Deposit paid when the contract is signed (created signed, or leaving draft).
create or replace function private.caja_auto_deposito_contrato() returns trigger
language plpgsql security definer set search_path='' as $$
declare f date:=private.caja_hoy();
begin
 if coalesce(new.valor_deposito,0)<=0 or coalesce(new.medio_deposito,'') not in ('Efectivo','Transferencia','Tarjeta') or new.sede_id is null then return new; end if;
 if lower(coalesce(new.estado,'')) in ('borrador','cancelado','cancelada','anulado','anulada','rechazado') then return new; end if;
 if tg_op='UPDATE' and lower(coalesce(old.estado,''))<>'borrador' then return new; end if;
 if exists(select 1 from public.caja_movimientos where contrato_id=new.id and origen='deposito' and anulado_at is null) then return new; end if;
 perform private.caja_auto(new.sede_id,f,'ingreso','Depósito en garantía',new.medio_deposito,new.valor_deposito,'Depósito '||new.numero_contrato||' (al firmar)',new.id,'deposito',new.id,
  private.caja_cuenta_deposito(new.sede_id));
 perform private.siigo_anticipo_deposito(new,f,new.valor_deposito,new.medio_deposito,'contrato',new.id);
 return new;
end $$;
drop trigger if exists caja_auto_deposito_contrato on public.contratos;
create trigger caja_auto_deposito_contrato after insert or update of estado on public.contratos for each row execute function private.caja_auto_deposito_contrato();

-- Deposit collected at delivery (Entregas asks its method and receipt), when it was not paid at signing nor registered in Depósitos.
create or replace function private.caja_auto_deposito_entrega() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.contratos; f date:=private.caja_hoy();
begin
 if lower(coalesce(new.tipo_entrega,''))='reversion' or new.metodo_deposito is null then return new; end if;
 select * into c from public.contratos where id=new.contrato_id;
 if c.id is null or coalesce(c.valor_deposito,0)<=0 or coalesce(c.medio_deposito,'') in ('Efectivo','Transferencia','Tarjeta') then return new; end if;
 if exists(select 1 from public.caja_movimientos where contrato_id=c.id and origen='deposito' and anulado_at is null)
  or exists(select 1 from public.movimientos_depositos where contrato_id=c.id and tipo='ingreso') then return new; end if;
 perform private.caja_auto(c.sede_id,f,'ingreso','Depósito en garantía',new.metodo_deposito,c.valor_deposito,'Depósito '||c.numero_contrato||' (en la entrega)',c.id,'deposito',new.id,
  private.caja_cuenta_deposito(c.sede_id));
 perform private.siigo_anticipo_deposito(c,f,c.valor_deposito,new.metodo_deposito,'entrega',new.id);
 return new;
end $$;
drop trigger if exists caja_auto_deposito_entrega on public.entregas_bitacora;
create trigger caja_auto_deposito_entrega after insert on public.entregas_bitacora for each row execute function private.caja_auto_deposito_entrega();

-- Deposit movements may use the deposits account; the rest of the rules stay.
create or replace function private.caja_cuenta_movimiento() returns trigger
language plpgsql security definer set search_path='' as $$
declare k public.cuentas_dinero;
begin
 if new.medio='Efectivo' then
  if new.cuenta_id is null or not exists(select 1 from public.cuentas_dinero where id=new.cuenta_id and tipo='efectivo' and sede_id=new.sede_id) then
   select id into new.cuenta_id from public.cuentas_dinero where sede_id=new.sede_id and tipo='efectivo' and activo order by created_at limit 1;
  end if;
 elsif new.cuenta_id is not null then
  select * into k from public.cuentas_dinero where id=new.cuenta_id;
  if k.id is null or k.tipo='efectivo' or (k.sede_id is not null and k.sede_id<>new.sede_id) then
   raise exception 'La cuenta elegida no corresponde a un pago por %.', lower(new.medio);
  end if;
  if k.solo_depositos and coalesce(new.origen,'') not in ('deposito','devolucion') and (tg_op='INSERT' or new.cuenta_id is distinct from old.cuenta_id) then raise exception 'La cuenta % es solo para depósitos en garantía.', k.nombre; end if;
  if tg_op='INSERT' and not k.activo then raise exception 'La cuenta % está inactiva.', k.nombre; end if;
 elsif new.medio='Transferencia' and (select count(*) from public.cuentas_dinero where sede_id=new.sede_id and tipo='banco' and activo and not solo_depositos)=1 then
  select id into new.cuenta_id from public.cuentas_dinero where sede_id=new.sede_id and tipo='banco' and activo and not solo_depositos;
 end if;
 return new;
end $$;

-- Manual entries: contract payments arrive by themselves; «Otro ingreso» needs to say what it is.
do $$
declare d text:=pg_get_functiondef('private.registrar_movimiento_caja'::regproc);
begin
 if position('entran solos a la caja' in d)=0 then
  d:=replace(d,' if t=''egreso'' and length(desc_)<3 then raise exception ''Describe el egreso.''; end if;',
   ' if t=''egreso'' and length(desc_)<3 then raise exception ''Describe el egreso.''; end if;
 if ori is null and cat=''Pago de contrato'' then raise exception ''Los abonos de los contratos entran solos a la caja: no se escriben a mano.''; end if;
 if ori is null and cat=''Otro ingreso'' and length(desc_)<5 then raise exception ''Describe de dónde viene el ingreso.''; end if;');
  execute d;
 end if;
end $$;

-- Cash expected counts the deposits received and returned in cash (they are not income of the day).
create or replace function private.cerrar_caja(p_sede uuid, p_fecha date, p_contado numeric, p_observaciones text) returns uuid
language plpgsql security definer set search_path='' as $$
declare u public.profiles; inicial numeric; ie numeric; ee numeric; esperado numeric; tot jsonb; new_id uuid; obs text:=btrim(coalesce(p_observaciones,'')); faltan int; ini date;
begin
 u:=private.caja_perfil();
 if u.id is null or p_sede is null or not private.caja_operar(p_sede) then raise exception 'No puedes cerrar la caja de esta sede.' using errcode='42501'; end if;
 if p_fecha is null or p_fecha>private.caja_hoy() then raise exception 'No se puede cerrar un día futuro.'; end if;
 ini:=private.caja_inicio(p_sede);
 if ini is not null and p_fecha<ini then raise exception 'La caja de esta sede empieza el %.', to_char(ini,'DD/MM/YYYY'); end if;
 if p_contado is null or p_contado<0 or p_contado<>round(p_contado,2) then raise exception 'Escribe el efectivo contado.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('caja:'||p_sede::text||':'||p_fecha::text,0));
 if private.caja_dia_cerrado(p_sede,p_fecha) then raise exception 'La caja de ese día ya está cerrada.'; end if;
 faltan:=jsonb_array_length(private.pagos_sin_soporte(p_sede,p_fecha));
 if faltan>0 then raise exception 'Hay % ingreso(s) del día sin soporte. Adjunta el soporte para poder confirmar el cierre.',faltan; end if;
 inicial:=private.caja_saldo_inicial(p_sede,p_fecha);
 select coalesce(sum(valor) filter (where tipo='ingreso' and medio='Efectivo'),0),coalesce(sum(valor) filter (where tipo='egreso' and medio='Efectivo'),0),
  jsonb_build_object('ingresos',coalesce(sum(valor) filter (where tipo='ingreso' and categoria<>'Base de caja' and coalesce(origen,'') not in ('deposito','devolucion')),0),
   'egresos',coalesce(sum(valor) filter (where tipo='egreso' and coalesce(origen,'') not in ('deposito','devolucion')),0),
   'base',coalesce(sum(valor) filter (where categoria='Base de caja'),0),
   'depositos',coalesce(sum(valor) filter (where origen='deposito'),0),'devoluciones',coalesce(sum(valor) filter (where origen='devolucion'),0),
   'movimientos',count(*) filter (where coalesce(origen,'') not in ('deposito','devolucion')))
  into ie,ee,tot from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null;
 esperado:=inicial+ie-ee;
 if p_contado<>esperado and length(obs)<5 then raise exception 'Hay diferencia entre lo contado y lo esperado: explica el motivo en observaciones.'; end if;
 insert into public.caja_cierres(sede_id,fecha,saldo_inicial,ingresos_efectivo,egresos_efectivo,esperado,contado,diferencia,totales,observaciones,cerrado_por)
 values(p_sede,p_fecha,inicial,ie,ee,esperado,p_contado,p_contado-esperado,tot,obs,u.id) returning id into new_id;
 return new_id;
end $$;

-- Caja del día: cash deposits net (for the expected cash) and Colombia dates; pending payments with Colombia dates.
do $$
declare d text:=pg_get_functiondef('private.caja_dia'::regproc);
begin
 if position('depositos_efectivo' in d)=0 then
  d:=replace(d,'''por_medio'',coalesce((select jsonb_object_agg(medio',
   '''depositos_efectivo'',(select coalesce(sum(case when x.tipo=''ingreso'' then x.valor else -x.valor end),0) from public.caja_movimientos x where x.sede_id=p_sede and x.fecha=p_fecha and x.anulado_at is null and x.medio=''Efectivo'' and x.origen in (''deposito'',''devolucion'')),
  ''por_medio'',coalesce((select jsonb_object_agg(medio');
 end if;
 d:=replace(d,'at time zone ''UTC'')::date','at time zone ''America/Bogota'')::date');
 execute d;
 d:=replace(pg_get_functiondef('private.caja_abonos_pendientes'::regproc),'at time zone ''UTC'')::date','at time zone ''America/Bogota'')::date');
 execute d;
end $$;

-- ERP ↔ caja ↔ Siigo, one row per money event of a store in a range.
create or replace function public.siigo_conciliacion(p_sede uuid, p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; activo boolean;
begin
 if p_sede is null or p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>92 then raise exception 'Elige una sede y un rango de hasta 3 meses.'; end if;
 if not (public.es_admin() or private.es_finanzas() or private.caja_ver(p_sede)) then raise exception 'No tienes acceso a esta sede.' using errcode='42501'; end if;
 activo:=private.siigo_activo(p_sede);
 with ev as (
  -- Contract payments.
  select 'Abono' concepto,(p.fecha_pago at time zone 'America/Bogota')::date fecha,c.numero_contrato contrato,p.valor_pagado valor,p.medio_pago medio,
   coalesce(p.observaciones,'') like 'Ajuste:%' ajuste,m.fecha caja_fecha,
   s.siigo_numero,s.estado siigo_estado,s.error siigo_error,
   (select f.siigo_numero from public.siigo_documentos f where f.contrato_id=c.id and f.tipo='factura' and f.estado='enviado' and f.datos->>'vinculada'='true'
     and (p.fecha_pago at time zone 'America/Bogota')::date<(f.created_at at time zone 'America/Bogota')::date order by f.created_at limit 1) incluido_en,
   null::numeric siigo_valor
  from public.pagos p join public.contratos c on c.id=p.contrato_id
  left join public.caja_movimientos m on m.origen='pago' and m.origen_id=p.id and m.anulado_at is null
  left join lateral (select * from public.siigo_documentos d where d.tipo='recibo_caja' and d.origen='pago' and d.origen_id=p.id and d.estado<>'anulado' order by d.created_at desc limit 1) s on true
  where c.sede_id=p_sede and p.anulado_at is null and p.valor_pagado>0 and (p.fecha_pago at time zone 'America/Bogota')::date between p_desde and p_hasta
  union all
  -- Deposits received (Depósitos, signing or delivery) and returned.
  select case when x.tipo='ingreso' then 'Depósito' else 'Devolución de depósito' end,x.fecha,c.numero_contrato,x.valor,x.medio,false,x.caja_fecha,
   s.siigo_numero,s.estado,s.error,null,null
  from (
   select d.id,d.contrato_id,d.tipo,d.fecha,d.monto valor,d.metodo medio,(select m.fecha from public.caja_movimientos m where m.origen_id=d.id and m.anulado_at is null limit 1) caja_fecha
   from public.movimientos_depositos d where d.tipo in ('ingreso','devolucion') and d.fecha between p_desde and p_hasta
   union all
   select m.origen_id,m.contrato_id,'ingreso',m.fecha,m.valor,m.medio,m.fecha from public.caja_movimientos m
   where m.sede_id=p_sede and m.origen='deposito' and m.anulado_at is null and m.fecha between p_desde and p_hasta
    and not exists(select 1 from public.movimientos_depositos d where d.id=m.origen_id)
  ) x join public.contratos c on c.id=x.contrato_id and c.sede_id=p_sede
  left join lateral (select * from public.siigo_documentos d where d.origen_id=x.id and d.tipo=case when x.tipo='ingreso' then 'anticipo' else 'devolucion_anticipo' end and d.estado<>'anulado' order by d.created_at desc limit 1) s on true
  union all
  -- Invoices: contract value in the ERP against Siigo (invoices minus credit notes).
  select 'Factura',(min(f.created_at) at time zone 'America/Bogota')::date,c.numero_contrato,
   greatest(0,coalesce(c.valor_total,0)-coalesce(c.descuento_plan_ahorro,0))+coalesce(c.total_arreglos,0),null,false,null,
   string_agg(f.siigo_numero,', ' order by f.created_at),case when bool_or(f.estado='error') then 'error' when bool_and(f.estado='enviado') then 'enviado' else 'pendiente' end,
   max(f.error),null,
   sum(coalesce((f.respuesta->>'total')::numeric,(f.datos->>'valor')::numeric,0))
    -coalesce((select sum((n.datos->>'valor')::numeric) from public.siigo_documentos n where n.contrato_id=c.id and n.tipo='nota_credito' and n.estado<>'anulado'),0)
  from public.siigo_documentos f join public.contratos c on c.id=f.contrato_id
  where f.sede_id=p_sede and f.tipo='factura' and f.estado<>'anulado' and (f.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
  group by c.id
  union all
  -- Purchases and expenses paid from the store.
  select 'Compra o gasto de caja',m.fecha,null,m.valor,m.medio,false,m.fecha,s.siigo_numero,s.estado,s.error,null,null
  from public.caja_movimientos m left join lateral (select * from public.siigo_documentos d where d.origen='caja' and d.origen_id=m.id and d.tipo='compra' and d.estado<>'anulado' limit 1) s on true
  where m.sede_id=p_sede and m.tipo='egreso' and m.anulado_at is null and m.origen is null and m.categoria not in ('Consignación a banco','Nómina / anticipos') and m.fecha between p_desde and p_hasta
 )
 select coalesce(jsonb_agg(jsonb_build_object('concepto',concepto,'fecha',fecha,'contrato',contrato,'valor',valor,'medio',medio,'caja',caja_fecha,
  'siigo',coalesce(siigo_numero,case when incluido_en is not null then 'Incluido en '||incluido_en end),'siigo_estado',case when incluido_en is not null and siigo_estado is null then 'enviado' else siigo_estado end,
  'siigo_error',siigo_error,'siigo_valor',siigo_valor,
  'aplica_siigo',activo and fecha>=date '2026-11-20' and not ajuste,
  'nota',case
   when concepto='Factura' and siigo_estado='enviado' and abs(coalesce(siigo_valor,0)-valor)>1000 then 'Valor distinto: ERP '||to_char(valor,'FM999G999G999')||' · Siigo '||to_char(siigo_valor,'FM999G999G999')
   when concepto='Factura' then null
   when ajuste then 'Ajuste para cuadrar con Siigo (no es dinero del día)'
   when concepto<>'Compra o gasto de caja' and caja_fecha is null then 'No está en la caja'
   when activo and fecha>=date '2026-11-20' and coalesce(siigo_estado,'')<>'enviado' and concepto<>'Compra o gasto de caja' then coalesce('Siigo: '||siigo_error,'Falta en Siigo')
   when activo and fecha>=date '2026-11-20' and concepto='Compra o gasto de caja' and coalesce(siigo_estado,'')<>'enviado' then 'Sin registrar en Siigo'
  end) order by fecha,concepto,contrato),'[]'::jsonb) into r from ev;
 return r;
end $$;
revoke all on function public.siigo_conciliacion(uuid,date,date) from public, anon;
grant execute on function public.siigo_conciliacion(uuid,date,date) to authenticated;
revoke all on function private.caja_auto(uuid,date,text,text,text,numeric,text,uuid,text,uuid,uuid), private.caja_cuenta_deposito(uuid),
 private.siigo_anticipo_deposito(public.contratos,date,numeric,text,text,uuid) from public, anon, authenticated;
