-- Módulo de depósitos (pedido de contabilidad). Facturación intacta.
--  · contratos.valor_deposito = depósito PACTADO. Lo PAGADO = deposito_pagado_previo (depósitos ya recibidos antes de este cambio,
--    con sus recibos actuales de Siigo) + cada «Pago de depósito» (movimientos_depositos ingreso con es_pago).
--  · Ya no se genera recibo de anticipo ni caja al firmar el contrato ni en la entrega: solo con «Pago de depósito», uno por cada pago
--    parcial, con la cuenta o caja de la sede donde entró (cualquiera). Un pago que supere lo pactado se bloquea.
--  · La entrega del vestido exige el depósito pagado completo.
--  · Devolución: se limita a lo pagado; puede salir de la cuenta elegida; la retención por daños o faltantes va a Siigo como
--    comprobante contable (anticipo 2805 contra «Ingreso por daños», cuenta configurable, por defecto 41700502).
--  · Estados: Pendiente de pago · Pago parcial – pendiente · Pagado – pendiente de devolución · Devuelto.
-- Reversible: los cambios de funciones se revierten con sus definiciones anteriores; las columnas nuevas son aditivas.

alter table public.contratos add column if not exists deposito_pagado_previo numeric not null default 0;
alter table public.movimientos_depositos add column if not exists es_pago boolean not null default false;
alter table public.movimientos_depositos add column if not exists cuenta_id uuid references public.cuentas_dinero(id);

-- Depósitos ya pagados (evidencia en caja, entrega, contrato, movimientos, soportes, devoluciones o Siigo): quedan pagados completos.
update public.contratos c set deposito_pagado_previo=c.valor_deposito
where coalesce(c.valor_deposito,0)>0 and c.deposito_pagado_previo=0 and (
 coalesce(c.medio_deposito,'') in ('Efectivo','Transferencia','Tarjeta','Otro')
 or exists(select 1 from public.caja_movimientos m where m.contrato_id=c.id and m.origen='deposito' and m.anulado_at is null)
 or exists(select 1 from public.entregas_bitacora e where e.contrato_id=c.id and e.anulada_at is null and e.metodo_deposito is not null)
 or exists(select 1 from public.movimientos_depositos m where m.contrato_id=c.id)
 or exists(select 1 from public.soportes_depositos_anteriores s where s.contrato_id=c.id)
 or exists(select 1 from public.devoluciones_depositos d where d.contrato_id=c.id)
 or exists(select 1 from public.siigo_documentos d where d.contrato_id=c.id and d.tipo='anticipo' and d.estado<>'anulado'));

create or replace function private.deposito_pagado(p_contrato uuid) returns numeric
language sql stable security definer set search_path='' as $$
 select coalesce((select deposito_pagado_previo from public.contratos where id=p_contrato),0)
  +coalesce((select sum(monto) from public.movimientos_depositos where contrato_id=p_contrato and tipo='ingreso' and es_pago),0);
$$;

create or replace function public.deposito_estado(p_contrato uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when coalesce(c.valor_deposito,0)<=0 and private.deposito_pagado(c.id)<=0 then 'Sin depósito'
  when private.deposito_pagado(c.id)<=0 then 'Pendiente de pago'
  when private.deposito_pagado(c.id)<coalesce(c.valor_deposito,0) then 'Pago parcial – pendiente'
  when private.deposito_pagado(c.id)-coalesce((select sum(d.monto_devuelto+coalesce(d.monto_descuento,0)) from public.devoluciones_depositos d where d.contrato_id=c.id and coalesce(lower(d.estado),'completado') not in ('cancelado','anulado','rechazado')),0)>0 then 'Pagado – pendiente de devolución'
  else 'Devuelto' end
 from public.contratos c where c.id=p_contrato and private.acceso_deposito(c.id);
$$;
grant execute on function public.deposito_estado(uuid) to authenticated;

-- No receipt or cash movement at signing or delivery any more: only «Pago de depósito».
create or replace function private.caja_auto_deposito_contrato() returns trigger
language plpgsql security definer set search_path='' as $$ begin return new; end $$;
create or replace function private.caja_auto_deposito_entrega() returns trigger
language plpgsql security definer set search_path='' as $$ begin return new; end $$;

-- Cash-register movement of a deposit payment or return uses the account chosen by the advisor.
create or replace function private.caja_auto_deposito() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.contratos; ing boolean:=new.tipo='ingreso';
begin
 if new.tipo not in ('ingreso','devolucion') or coalesce(new.monto,0)<=0 then return new; end if;
 select * into c from public.contratos where id=new.contrato_id;
 if c.id is null then return new; end if;
 perform private.caja_auto(c.sede_id,new.fecha,case when ing then 'ingreso' else 'egreso' end,case when ing then 'Depósito en garantía' else 'Devolución de depósito' end,
  new.metodo,new.monto,case when ing then 'Depósito ' else 'Devolución de depósito ' end||c.numero_contrato,c.id,case when ing then 'deposito' else 'devolucion' end,new.id,
  coalesce(new.cuenta_id,private.caja_cuenta_deposito(c.sede_id)));
 return new;
end $$;

-- Siigo: each payment its own advance receipt; a return carries the retained amount (damages) for the accounting voucher.
create or replace function private.siigo_deposito_documento() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.contratos; ant uuid;
begin
 if new.tipo not in ('ingreso','devolucion') or coalesce(new.monto,0)+coalesce(new.descuento,0)<=0 then return new; end if;
 select * into c from public.contratos where id=new.contrato_id;
 if c.id is null or c.sede_id is null or not private.siigo_activo(c.sede_id) then return new; end if;
 if new.tipo='ingreso' then
  if coalesce(new.monto,0)<=0 or coalesce(new.fecha_pago_deposito,new.fecha)<date '2026-11-20' then return new; end if;
  insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,datos,creado_por)
  values(c.sede_id,'anticipo','movimiento_deposito',new.id,c.id,jsonb_build_object('valor',new.monto,'medio',new.metodo,'fecha',coalesce(new.fecha_pago_deposito,new.fecha),'numero_contrato',c.numero_contrato),auth.uid())
  on conflict do nothing;
  return new;
 end if;
 select id into ant from public.siigo_documentos where tipo='anticipo' and contrato_id=c.id and estado<>'anulado' order by created_at limit 1;
 insert into public.siigo_documentos(sede_id,tipo,origen,origen_id,contrato_id,factura_id,datos,creado_por)
 values(c.sede_id,'devolucion_anticipo','movimiento_deposito',new.id,c.id,ant,jsonb_build_object('valor',coalesce(new.monto,0),'medio',new.metodo,'fecha',new.fecha,'numero_contrato',c.numero_contrato,
  'descuento',coalesce(new.descuento,0),'motivo_descuento',new.motivo),auth.uid())
 on conflict do nothing;
 return new;
end $$;

-- Entrega: the deposit must be fully paid first (no receipt is created here any more).
do $do$
declare d text:=pg_get_functiondef('private.bloquear_entrega_sin_deposito'::regproc);
begin
 d:=replace(d,$x$ if coalesce(c.valor_deposito,0)<=0 then raise exception 'Primero registra el depósito recibido.'; end if;$x$,
  $x$ if coalesce(c.valor_deposito,0)<=0 then raise exception 'Primero registra el depósito recibido.'; end if;
 if private.deposito_pagado(c.id)<coalesce(c.valor_deposito,0) then raise exception 'Falta registrar el pago del depósito ($% pendiente). Usa «Pago de depósito» en Depósitos antes de entregar.',to_char(coalesce(c.valor_deposito,0)-private.deposito_pagado(c.id),'FM999G999G999'); end if;$x$);
 if position('deposito_pagado' in d)=0 then raise exception 'bloquear_entrega_sin_deposito: texto no encontrado'; end if;
 execute d;
end $do$;

-- A deposit payment does not change the agreed value and cannot exceed it.
do $do$
declare d text:=pg_get_functiondef('public.aplicar_movimiento_deposito'::regproc);
begin
 d:=replace(d,$x$  update public.contratos set valor_deposito=coalesce(valor_deposito,0)+new.monto where id=c.id;$x$,
  $x$  if new.es_pago then
   if private.deposito_pagado(c.id)+new.monto>coalesce(c.valor_deposito,0) then
    raise exception 'El pago supera el depósito pactado: falta pagar $%.',to_char(greatest(0,coalesce(c.valor_deposito,0)-private.deposito_pagado(c.id)),'FM999G999G999'); end if;
  else update public.contratos set valor_deposito=coalesce(valor_deposito,0)+new.monto where id=c.id; end if;$x$);
 if position('es_pago' in d)=0 then raise exception 'aplicar_movimiento_deposito: texto no encontrado'; end if;
 execute d;
end $do$;

-- Returns are limited to what was paid.
do $do$
declare d text:=pg_get_functiondef('public.validar_devolucion_deposito'::regproc);
begin
 d:=replace(d,'>coalesce(c.valor_deposito,0)-usado then','>private.deposito_pagado(c.id)-usado then');
 if position('deposito_pagado' in d)=0 then raise exception 'validar_devolucion_deposito: texto no encontrado'; end if;
 execute d;
end $do$;

-- gestionar_deposito: «ingreso» is now a deposit payment (es_pago, chosen account); the return balance and its receipts check use
-- what was paid; the return keeps the account it was paid from.
do $do$
declare d text:=pg_get_functiondef('private.gestionar_deposito_original'::regproc); n int:=0;
begin
 if position($x$saldo:=coalesce(c.valor_deposito,0)-usado;$x$ in d)>0 then n:=n+1; end if;
 d:=replace(d,$x$saldo:=coalesce(c.valor_deposito,0)-usado;$x$,$x$saldo:=private.deposito_pagado(c.id)-usado;$x$);
 if position($x$values(oid,cid,'ingreso',n,fecha,metodo,p_datos->>'observaciones',path,u.id);$x$ in d)>0 then n:=n+1; end if;
 d:=replace(d,$x$insert into public.movimientos_depositos(id,contrato_id,tipo,monto,fecha,metodo,observaciones,comprobante_path,usuario_id) values(oid,cid,'ingreso',n,fecha,metodo,p_datos->>'observaciones',path,u.id);$x$,
  $x$if fecha>(now() at time zone 'America/Bogota')::date or fecha<(now() at time zone 'America/Bogota')::date-15 then raise exception 'La fecha del pago debe ser de hoy o de los últimos 15 días.'; end if;
  insert into public.movimientos_depositos(id,contrato_id,tipo,monto,fecha,metodo,observaciones,comprobante_path,usuario_id,es_pago,cuenta_id,fecha_pago_deposito) values(oid,cid,'ingreso',n,fecha,metodo,p_datos->>'observaciones',path,u.id,true,nullif(p_datos->>'cuenta_id','')::uuid,fecha);$x$);
 if position($x$if respaldado<coalesce(c.valor_deposito,0) then$x$ in d)>0 then n:=n+1; end if;
 d:=replace(d,$x$if respaldado<coalesce(c.valor_deposito,0) then$x$,$x$if respaldado<private.deposito_pagado(c.id) then$x$);
 if position($x$values(oid,cid,'devolucion',s.monto,s.descuento,fecha,s.metodo,s.motivo,s.observaciones,path,u.id);$x$ in d)>0 then n:=n+1; end if;
 d:=replace(d,$x$insert into public.movimientos_depositos(id,contrato_id,tipo,monto,descuento,fecha,metodo,motivo,observaciones,comprobante_path,usuario_id) values(oid,cid,'devolucion',s.monto,s.descuento,fecha,s.metodo,s.motivo,s.observaciones,path,u.id);$x$,
  $x$insert into public.movimientos_depositos(id,contrato_id,tipo,monto,descuento,fecha,metodo,motivo,observaciones,comprobante_path,usuario_id,cuenta_id) values(oid,cid,'devolucion',s.monto,s.descuento,fecha,s.metodo,s.motivo,s.observaciones,path,u.id,nullif(p_datos->>'cuenta_id','')::uuid);$x$);
 if n<4 then raise exception 'gestionar_deposito_original: solo % de 4 textos encontrados', n; end if;
 execute d;
end $do$;
