-- Caja: fecha de inicio por sede (desde la semana pasada, en 0), base de caja sin origen,
-- y depósitos en garantía por aparte (no entran a la caja; tienen su propio resumen).

create table if not exists public.caja_config(
 sede_id uuid primary key references public.sedes(id),
 fecha_inicio date not null,
 saldo_inicio numeric not null default 0 check(saldo_inicio>=0 and saldo_inicio=round(saldo_inicio,2) and saldo_inicio<1000000000000),
 actualizado_por uuid references public.profiles(id),
 updated_at timestamptz not null default now()
);
alter table public.caja_config enable row level security;
revoke all on public.caja_config from anon, authenticated;
create table if not exists public.caja_config_historial(
 id uuid primary key default gen_random_uuid(),
 sede_id uuid not null references public.sedes(id),
 anterior jsonb, nuevo jsonb not null, motivo text not null,
 usuario_id uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.caja_config_historial enable row level security;
revoke all on public.caja_config_historial from anon, authenticated;
insert into public.caja_config(sede_id,fecha_inicio,saldo_inicio)
select id,date '2026-10-12',0 from public.sedes where activo is true on conflict (sede_id) do nothing;

create or replace function private.caja_inicio(p_sede uuid)
returns date language sql stable security definer set search_path='' as $$ select fecha_inicio from public.caja_config where sede_id=p_sede; $$;

-- Saldo inicial: lo contado en el último cierre desde el inicio de la caja; antes de ese cierre, el saldo de inicio (0).
create or replace function private.caja_saldo_inicial(p_sede uuid, p_fecha date)
returns numeric language sql stable security definer set search_path='' as $$
 select coalesce(
  (select k.contado from public.caja_cierres k where k.sede_id=p_sede and k.fecha<p_fecha and k.reabierto_at is null
    and k.fecha>=coalesce((select fecha_inicio from public.caja_config where sede_id=p_sede),'-infinity'::date) order by k.fecha desc limit 1),
  (select saldo_inicio from public.caja_config where sede_id=p_sede),0);
$$;

create or replace function private.cerrar_caja(p_sede uuid, p_fecha date, p_contado numeric, p_observaciones text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
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
  jsonb_build_object('ingresos',coalesce(sum(valor) filter (where tipo='ingreso' and categoria<>'Base de caja'),0),'egresos',coalesce(sum(valor) filter (where tipo='egreso'),0),
   'base',coalesce(sum(valor) filter (where categoria='Base de caja'),0),'movimientos',count(*))
  into ie,ee,tot from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null and origen is distinct from 'deposito' and origen is distinct from 'devolucion';
 esperado:=inicial+ie-ee;
 if p_contado<>esperado and length(obs)<5 then raise exception 'Hay diferencia entre lo contado y lo esperado: explica el motivo en observaciones.'; end if;
 insert into public.caja_cierres(sede_id,fecha,saldo_inicial,ingresos_efectivo,egresos_efectivo,esperado,contado,diferencia,totales,observaciones,cerrado_por)
 values(p_sede,p_fecha,inicial,ie,ee,esperado,p_contado,p_contado-esperado,tot,obs,u.id) returning id into new_id;
 return new_id;
end $function$;

create or replace function private.caja_resumen(p_desde date, p_hasta date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
begin
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>92 then raise exception 'Selecciona un periodo de hasta 3 meses.'; end if;
 return coalesce((select jsonb_agg(r order by r->>'sede') from (
  select jsonb_build_object('sede_id',s.id,'sede',s.nombre,'inicio',x.ini,
   'ingresos',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between x.d and p_hasta and m.tipo='ingreso' and m.categoria<>'Base de caja' and m.origen is distinct from 'deposito' and m.anulado_at is null),0),
   'egresos',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between x.d and p_hasta and m.tipo='egreso' and m.origen is distinct from 'devolucion' and m.anulado_at is null),0),
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

-- Depósitos en garantía por aparte: lo recibido, devuelto y retenido por sede y medio, desde su propio registro.
create or replace function private.depositos_resumen(p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare filas jsonb;
begin
 if (private.caja_perfil()).id is null then raise exception 'Sesión no válida.' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>92 then raise exception 'Selecciona un periodo de hasta 3 meses.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('sede_id',q.sede_id,'sede',q.sede,'metodo',q.metodo,'recibidos',q.recibidos,'n_recibidos',q.nr,'devueltos',q.devueltos,'n_devueltos',q.nd,'retenidos',q.retenidos,'neto',q.recibidos-q.devueltos)
   order by q.sede,q.metodo),'[]'::jsonb) into filas
 from (select c.sede_id, coalesce(s.nombre,c.sede,'Sin sede') sede, coalesce(nullif(d.metodo,''),'Sin medio') metodo,
   coalesce(sum(d.monto) filter (where d.tipo='ingreso'),0) recibidos, count(*) filter (where d.tipo='ingreso') nr,
   coalesce(sum(d.monto) filter (where d.tipo='devolucion'),0) devueltos, count(*) filter (where d.tipo='devolucion') nd,
   coalesce(sum(d.descuento) filter (where d.tipo='devolucion'),0) retenidos
  from public.movimientos_depositos d join public.contratos c on c.id=d.contrato_id left join public.sedes s on s.id=c.sede_id
  where (d.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta and c.sede_id is not null and private.caja_ver(c.sede_id)
  group by 1,2,3) q;
 return jsonb_build_object('filas',filas,
  'recibidos',coalesce((select sum((f->>'recibidos')::numeric) from jsonb_array_elements(filas) f),0),
  'devueltos',coalesce((select sum((f->>'devueltos')::numeric) from jsonb_array_elements(filas) f),0),
  'retenidos',coalesce((select sum((f->>'retenidos')::numeric) from jsonb_array_elements(filas) f),0));
end $$;

create or replace function private.caja_inicios()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if (private.caja_perfil()).id is null then raise exception 'Sesión no válida.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('sede_id',s.id,'sede',s.nombre,'fecha_inicio',k.fecha_inicio,'saldo_inicio',coalesce(k.saldo_inicio,0),
   'actualizado_por',(select coalesce(nombre,email) from public.profiles where id=k.actualizado_por),'updated_at',k.updated_at) order by s.nombre)
  from public.sedes s left join public.caja_config k on k.sede_id=s.id where s.activo is true and private.caja_ver(s.id)),'[]'::jsonb);
end $$;

-- Solo el administrador cambia desde cuándo cuenta la caja de una sede y con cuánto empieza (p. ej. para reiniciarla en 0).
create or replace function private.guardar_inicio_caja(p_sede uuid, p_fecha date, p_saldo numeric, p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare u public.profiles; old public.caja_config; reason text:=btrim(coalesce(p_motivo,''));
begin
 u:=private.caja_perfil();
 if u.id is null or lower(btrim(u.rol))<>'admin' then raise exception 'Solo un administrador puede cambiar el inicio de la caja.' using errcode='42501'; end if;
 if p_sede is null or not exists(select 1 from public.sedes where id=p_sede) then raise exception 'Sede no encontrada.'; end if;
 if p_fecha is null or p_fecha>private.caja_hoy() then raise exception 'La fecha de inicio no puede ser futura.'; end if;
 if p_saldo is null or p_saldo<0 or p_saldo<>round(p_saldo,2) or p_saldo>=1000000000000 then raise exception 'Escribe un saldo de inicio válido.'; end if;
 if length(reason) not between 5 and 500 then raise exception 'Escribe el motivo (mínimo 5 caracteres).'; end if;
 if exists(select 1 from public.caja_cierres where sede_id=p_sede and fecha>=p_fecha and reabierto_at is null) then
  raise exception 'Hay cierres desde esa fecha: reábrelos primero o elige una fecha posterior al último cierre.';
 end if;
 select * into old from public.caja_config where sede_id=p_sede for update;
 insert into public.caja_config(sede_id,fecha_inicio,saldo_inicio,actualizado_por,updated_at) values(p_sede,p_fecha,p_saldo,u.id,now())
 on conflict (sede_id) do update set fecha_inicio=excluded.fecha_inicio,saldo_inicio=excluded.saldo_inicio,actualizado_por=excluded.actualizado_por,updated_at=now();
 insert into public.caja_config_historial(sede_id,anterior,nuevo,motivo,usuario_id)
 values(p_sede,case when old.sede_id is null then null else jsonb_build_object('fecha_inicio',old.fecha_inicio,'saldo_inicio',old.saldo_inicio) end,
  jsonb_build_object('fecha_inicio',p_fecha,'saldo_inicio',p_saldo),reason,u.id);
end $$;

create or replace function private.registrar_movimiento_caja(p_datos jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u public.profiles; s uuid:=(p_datos->>'sede_id')::uuid; f date:=(p_datos->>'fecha')::date; t text:=p_datos->>'tipo';
 med text:=p_datos->>'medio'; v numeric:=(p_datos->>'valor')::numeric; cat text:=btrim(coalesce(p_datos->>'categoria',''));
 desc_ text:=btrim(coalesce(p_datos->>'descripcion','')); ori text:=nullif(p_datos->>'origen',''); ori_id uuid:=nullif(p_datos->>'origen_id','')::uuid;
 cid uuid:=nullif(p_datos->>'contrato_id','')::uuid; path text:=nullif(btrim(coalesce(p_datos->>'comprobante_path','')),''); new_id uuid;
 cta uuid:=nullif(p_datos->>'cuenta_id','')::uuid; ini date;
begin
 u:=private.caja_perfil();
 if u.id is null or s is null or not private.caja_operar(s) then raise exception 'No puedes registrar movimientos en la caja de esta sede.' using errcode='42501'; end if;
 if f is null or f>private.caja_hoy() or f<private.caja_hoy()-31 then raise exception 'La fecha debe ser de hoy o de los últimos 31 días.'; end if;
 ini:=private.caja_inicio(s);
 if ini is not null and f<ini then raise exception 'La caja de esta sede empieza el %: no se registran movimientos anteriores.', to_char(ini,'DD/MM/YYYY'); end if;
 if private.caja_dia_cerrado(s,f) then raise exception 'La caja de ese día ya está cerrada.'; end if;
 if t not in ('ingreso','egreso') or med not in ('Efectivo','Transferencia','Tarjeta','Otro') or v is null or v<=0 or v<>round(v,2) or v>=1000000000000 or length(cat) not between 2 and 60 or length(desc_)>500 then raise exception 'Revisa el tipo, el medio, la categoría y el valor.'; end if;
 if cat='Base de caja' and (t<>'ingreso' or med<>'Efectivo' or ori is not null) then raise exception 'La base de caja es un ingreso en efectivo.'; end if;
 if ori in ('deposito','devolucion') then raise exception 'Los depósitos en garantía se llevan aparte en Depósitos; no entran a la caja.'; end if;
 if t='egreso' and length(desc_)<3 then raise exception 'Describe el egreso.'; end if;
 if path is not null and (split_part(path,'/',1)<>s::text or not exists(select 1 from storage.objects where bucket_id='comprobantes_caja' and name=path)) then raise exception 'El comprobante no es válido para esta sede.'; end if;
 if t='egreso' and path is null then raise exception 'Adjunta el comprobante del egreso.'; end if;
 if cid is not null and not exists(select 1 from public.contratos where id=cid and sede_id=s) then raise exception 'El contrato no pertenece a esta sede.'; end if;
 if med in ('Transferencia','Tarjeta') and cta is null and exists(select 1 from public.cuentas_dinero where activo and tipo<>'efectivo' and (sede_id is null or sede_id=s)) then
  raise exception 'Elige la cuenta o banco donde llegó el dinero.';
 end if;
 if ori is not null then
  if ori='pago' and not exists(select 1 from public.pagos p join public.contratos c on c.id=p.contrato_id where p.id=ori_id and c.sede_id=s) then raise exception 'Pago no encontrado en esta sede.'; end if;
 end if;
 begin
  insert into public.caja_movimientos(sede_id,fecha,tipo,categoria,medio,valor,descripcion,contrato_id,origen,origen_id,comprobante_path,usuario_id,cuenta_id)
  values(s,f,t,cat,med,v,desc_,cid,ori,ori_id,path,u.id,case when med='Efectivo' then null else cta end) returning id into new_id;
 exception when unique_violation then raise exception 'Ese movimiento del ERP ya está en la caja.';
 end;
 return new_id;
end $function$;

CREATE OR REPLACE FUNCTION private.caja_dia(p_sede uuid, p_fecha date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare inicial numeric; movs jsonb; tot jsonb; cierre jsonb; sug jsonb; faltan jsonb; pagos_dia int; desde timestamptz:=private.soportes_desde(); cuentas jsonb; ini date;
begin
 if p_sede is null or p_fecha is null or not private.caja_ver(p_sede) then raise exception 'No tienes acceso a la caja de esta sede.' using errcode='42501'; end if;
 inicial:=private.caja_saldo_inicial(p_sede,p_fecha); ini:=private.caja_inicio(p_sede);
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'tipo',m.tipo,'categoria',m.categoria,'medio',m.medio,'valor',m.valor,'descripcion',m.descripcion,
  'contrato_id',m.contrato_id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'origen',m.origen,'comprobante_path',m.comprobante_path,
  'usuario',coalesce(u.nombre,u.email),'created_at',m.created_at,'anulado_at',m.anulado_at,'motivo_anulacion',m.motivo_anulacion,'anulado_por',coalesce(a.nombre,a.email),
  'cuenta_id',m.cuenta_id,'cuenta',k.nombre,
  'ediciones',(select coalesce(jsonb_agg(jsonb_build_object('anterior',h.anterior,'nuevo',h.nuevo,'motivo',h.motivo,'usuario',(select coalesce(nombre,email) from public.profiles where id=h.usuario_id),'created_at',h.created_at) order by h.created_at),'[]'::jsonb)
   from public.caja_movimientos_historial h where h.movimiento_id=m.id),
  'pago_id',case when m.origen='pago' then m.origen_id end,
  'soportes',case when m.origen='pago' then private.soportes_json(m.origen_id) end,
  'soporte_historico',case when m.origen='pago' then coalesce((select p.created_at<desde from public.pagos p where p.id=m.origen_id),false) end) order by m.created_at),'[]'::jsonb)
 into movs from public.caja_movimientos m left join public.contratos c on c.id=m.contrato_id left join public.profiles u on u.id=m.usuario_id left join public.profiles a on a.id=m.anulado_por
  left join public.cuentas_dinero k on k.id=m.cuenta_id
 where m.sede_id=p_sede and m.fecha=p_fecha;
 select jsonb_build_object(
  'ingresos',coalesce(sum(valor) filter (where tipo='ingreso' and categoria<>'Base de caja'),0),'egresos',coalesce(sum(valor) filter (where tipo='egreso'),0),
  'base',coalesce(sum(valor) filter (where categoria='Base de caja'),0),
  'ingresos_efectivo',coalesce(sum(valor) filter (where tipo='ingreso' and medio='Efectivo'),0),'egresos_efectivo',coalesce(sum(valor) filter (where tipo='egreso' and medio='Efectivo'),0),
  'por_medio',coalesce((select jsonb_object_agg(medio,jsonb_build_object('ingresos',i,'egresos',e)) from (select medio,sum(valor) filter (where tipo='ingreso' and categoria<>'Base de caja') i,sum(valor) filter (where tipo='egreso') e from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null and origen is distinct from 'deposito' and origen is distinct from 'devolucion' group by medio) x),'{}'::jsonb),
  'por_cuenta',coalesce((select jsonb_agg(jsonb_build_object('cuenta_id',x.cuenta_id,'cuenta',coalesce(k.nombre,'Sin cuenta asignada'),'tipo',k.tipo,'ingresos',x.i,'egresos',x.e) order by k.tipo<>'efectivo',k.nombre)
   from (select cuenta_id,coalesce(sum(valor) filter (where tipo='ingreso'),0) i,coalesce(sum(valor) filter (where tipo='egreso'),0) e from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null and origen is distinct from 'deposito' and origen is distinct from 'devolucion' group by cuenta_id) x
   left join public.cuentas_dinero k on k.id=x.cuenta_id),'[]'::jsonb))
 into tot from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null and origen is distinct from 'deposito' and origen is distinct from 'devolucion';
 select to_jsonb(k)||jsonb_build_object('cerrado_por_nombre',(select coalesce(nombre,email) from public.profiles where id=k.cerrado_por)) into cierre
  from public.caja_cierres k where k.sede_id=p_sede and k.fecha=p_fecha and k.reabierto_at is null;
 select coalesce(jsonb_agg(s order by s->>'hora'),'[]'::jsonb) into sug from (
  select jsonb_build_object('origen','pago','origen_id',p.id,'tipo','ingreso','categoria','Pago de contrato','medio',case when p.medio_pago in ('Efectivo','Transferencia','Tarjeta') then p.medio_pago else '' end,
   'valor',p.valor_pagado,'contrato_id',c.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'hora',p.fecha_pago,
   'soportes',private.soportes_json(p.id),'soporte_historico',p.created_at<desde) s
  from public.pagos p join public.contratos c on c.id=p.contrato_id
  where c.sede_id=p_sede and (p.fecha_pago at time zone 'UTC')::date=p_fecha and p.valor_pagado>0
   and not exists(select 1 from public.caja_movimientos x where x.origen='pago' and x.origen_id=p.id and x.anulado_at is null)
   and (ini is null or p_fecha>=ini)
 ) q;
 faltan:=private.pagos_sin_soporte(p_sede,p_fecha);
 select count(*) into pagos_dia from public.pagos p join public.contratos c on c.id=p.contrato_id
  where c.sede_id=p_sede and (p.fecha_pago at time zone 'UTC')::date=p_fecha and p.valor_pagado>0 and p.created_at>=desde;
 select coalesce(jsonb_agg(private.cuenta_json(k) order by k.tipo<>'efectivo',k.orden,k.nombre),'[]'::jsonb) into cuentas
  from public.cuentas_dinero k where k.activo and (k.sede_id is null or k.sede_id=p_sede);
 return jsonb_build_object('sede_id',p_sede,'fecha',p_fecha,'saldo_inicial',inicial,'movimientos',movs,'totales',tot,'cierre',cierre,'sugerencias',sug,
  'puede_operar',private.caja_operar(p_sede) and (ini is null or p_fecha>=ini),'inicio',ini,'es_hoy',p_fecha=private.caja_hoy(),'cuentas',cuentas,
  'pagos_sin_soporte',faltan,'soportes',jsonb_build_object('pagos',pagos_dia,'con_soporte',pagos_dia-jsonb_array_length(faltan)));
end $function$;

create or replace function private.donde_esta_la_plata(p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cuentas jsonb; pendientes jsonb; depositos jsonb;
begin
 if (private.caja_perfil()).id is null then raise exception 'Sesión no válida.' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>92 then raise exception 'Selecciona un periodo de hasta 3 meses.'; end if;
 with mv as (
  select m.*, coalesce(m.cuenta_id::text,'sin:'||m.medio) clave from public.caja_movimientos m
  where m.fecha between p_desde and p_hasta and m.anulado_at is null and private.caja_ver(m.sede_id)
   and m.origen is distinct from 'deposito' and m.origen is distinct from 'devolucion'
   and m.fecha>=coalesce(private.caja_inicio(m.sede_id),m.fecha)
 ), ps as (
  select clave, jsonb_object_agg(sn,v) por_sede from (
   select x.clave, s.nombre sn, sum(case when x.tipo='ingreso' then x.valor else -x.valor end) v
   from mv x join public.sedes s on s.id=x.sede_id group by x.clave, s.nombre) y group by clave
 ), g as (
  select mv.clave, min(mv.cuenta_id::text)::uuid cuenta_id, case when min(mv.cuenta_id::text) is null then min(mv.medio) end medio_sin_cuenta,
   coalesce(sum(valor) filter (where tipo='ingreso'),0) ingresos, coalesce(sum(valor) filter (where tipo='egreso'),0) egresos,
   coalesce(sum(valor) filter (where tipo='ingreso' and origen='pago'),0) pagos,
   coalesce(sum(valor) filter (where origen='deposito'),0) depositos, coalesce(sum(valor) filter (where origen='devolucion'),0) devoluciones,
   coalesce(sum(valor) filter (where tipo='ingreso' and origen is null),0) otros_ingresos, coalesce(sum(valor) filter (where tipo='egreso' and origen is null),0) otros_egresos,
   count(*) movimientos
  from mv group by mv.clave
 )
 select coalesce(jsonb_agg(jsonb_build_object('cuenta_id',g.cuenta_id,'nombre',coalesce(k.nombre,'Sin cuenta asignada · '||g.medio_sin_cuenta),'tipo',coalesce(k.tipo,'sin_cuenta'),
   'banco',k.banco,'numero',k.numero,'sede',(select nombre from public.sedes where id=k.sede_id),'activo',k.activo,
   'ingresos',g.ingresos,'egresos',g.egresos,'neto',g.ingresos-g.egresos,'pagos',g.pagos,'depositos',g.depositos,'devoluciones',g.devoluciones,
   'otros_ingresos',g.otros_ingresos,'otros_egresos',g.otros_egresos,'movimientos',g.movimientos,'por_sede',coalesce(ps.por_sede,'{}'::jsonb),
   'efectivo_en_caja',case when k.tipo='efectivo' then private.caja_saldo_inicial(k.sede_id,p_hasta+1) end)
  order by case coalesce(k.tipo,'sin_cuenta') when 'efectivo' then 0 when 'banco' then 1 when 'billetera' then 2 else 3 end, coalesce(k.nombre,g.medio_sin_cuenta)),'[]'::jsonb)
 into cuentas from g left join public.cuentas_dinero k on k.id=g.cuenta_id left join ps on ps.clave=g.clave;
 select coalesce(jsonb_agg(x order by x->>'sede'),'[]'::jsonb) into pendientes from (
  select jsonb_build_object('sede_id',s.id,'sede',s.nombre,
   'pagos',(select count(*) from public.pagos p join public.contratos c on c.id=p.contrato_id where c.sede_id=s.id and (p.fecha_pago at time zone 'UTC')::date between greatest(p_desde,coalesce(private.caja_inicio(s.id),p_desde)) and p_hasta and p.valor_pagado>0
     and not exists(select 1 from public.caja_movimientos z where z.origen='pago' and z.origen_id=p.id and z.anulado_at is null)),
   'valor_pagos',(select coalesce(sum(p.valor_pagado),0) from public.pagos p join public.contratos c on c.id=p.contrato_id where c.sede_id=s.id and (p.fecha_pago at time zone 'UTC')::date between greatest(p_desde,coalesce(private.caja_inicio(s.id),p_desde)) and p_hasta and p.valor_pagado>0
     and not exists(select 1 from public.caja_movimientos z where z.origen='pago' and z.origen_id=p.id and z.anulado_at is null))) x
  from public.sedes s where s.activo is true and private.caja_ver(s.id)) q
 where (x->>'pagos')::int>0;
 depositos:=private.depositos_resumen(p_desde,p_hasta);
 return jsonb_build_object('desde',p_desde,'hasta',p_hasta,'cuentas',cuentas,'sin_registrar',pendientes,'depositos',depositos);
end $$;

create or replace function public.depositos_resumen(p_desde date, p_hasta date) returns jsonb language sql stable set search_path='' as $$ select private.depositos_resumen(p_desde,p_hasta); $$;
create or replace function public.caja_inicios() returns jsonb language sql stable set search_path='' as $$ select private.caja_inicios(); $$;
create or replace function public.guardar_inicio_caja(p_sede uuid, p_fecha date, p_saldo numeric, p_motivo text) returns void language sql set search_path='' as $$ select private.guardar_inicio_caja(p_sede,p_fecha,p_saldo,p_motivo); $$;
revoke all on function private.caja_inicio(uuid), private.depositos_resumen(date,date), private.caja_inicios(), private.guardar_inicio_caja(uuid,date,numeric,text) from public, anon;
revoke all on function public.depositos_resumen(date,date), public.caja_inicios(), public.guardar_inicio_caja(uuid,date,numeric,text) from public, anon;
grant execute on function private.caja_inicio(uuid), private.depositos_resumen(date,date), private.caja_inicios(), private.guardar_inicio_caja(uuid,date,numeric,text) to authenticated;
grant execute on function public.depositos_resumen(date,date), public.caja_inicios(), public.guardar_inicio_caja(uuid,date,numeric,text) to authenticated;
