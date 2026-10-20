-- Cierres de caja: cuentas donde queda el dinero (caja menor por sede, bancos, billeteras),
-- edición de movimientos por el administrador con historial y el reporte "¿Dónde está la plata?".

create table if not exists public.cuentas_dinero(
 id uuid primary key default gen_random_uuid(),
 nombre text not null check(length(btrim(nombre)) between 2 and 80),
 tipo text not null check(tipo in ('efectivo','banco','billetera')),
 banco text check(banco is null or length(banco)<=60),
 numero text check(numero is null or length(numero)<=40),
 titular text check(titular is null or length(titular)<=120),
 sede_id uuid references public.sedes(id),
 activo boolean not null default true,
 orden int not null default 0,
 creado_por uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(tipo<>'efectivo' or sede_id is not null)
);
-- Una sola caja menor activa por sede.
create unique index if not exists cuentas_dinero_caja_menor on public.cuentas_dinero(sede_id) where tipo='efectivo' and activo;
alter table public.cuentas_dinero enable row level security;
revoke all on public.cuentas_dinero from anon, authenticated;

insert into public.cuentas_dinero(nombre,tipo,sede_id)
select 'Caja menor '||s.nombre,'efectivo',s.id from public.sedes s
where s.activo is true and not exists(select 1 from public.cuentas_dinero c where c.sede_id=s.id and c.tipo='efectivo' and c.activo);

alter table public.caja_movimientos add column if not exists cuenta_id uuid references public.cuentas_dinero(id);
create index if not exists caja_movimientos_cuenta on public.caja_movimientos(cuenta_id);

create table if not exists public.caja_movimientos_historial(
 id uuid primary key default gen_random_uuid(),
 movimiento_id uuid not null references public.caja_movimientos(id),
 anterior jsonb not null,
 nuevo jsonb not null,
 motivo text not null,
 usuario_id uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create index if not exists caja_movimientos_historial_mov on public.caja_movimientos_historial(movimiento_id);
alter table public.caja_movimientos_historial enable row level security;
revoke all on public.caja_movimientos_historial from anon, authenticated;

-- El efectivo siempre queda en la caja menor de la sede; los demás medios, en un banco o billetera.
create or replace function private.caja_cuenta_movimiento()
returns trigger language plpgsql security definer set search_path='' as $$
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
  if tg_op='INSERT' and not k.activo then raise exception 'La cuenta % está inactiva.', k.nombre; end if;
 end if;
 return new;
end $$;
create or replace trigger caja_cuenta_movimiento before insert or update of medio, cuenta_id, sede_id on public.caja_movimientos
 for each row execute function private.caja_cuenta_movimiento();

update public.caja_movimientos m set cuenta_id=c.id from public.cuentas_dinero c
 where m.medio='Efectivo' and m.cuenta_id is null and c.sede_id=m.sede_id and c.tipo='efectivo' and c.activo;

-- Las sedes nuevas reciben su caja menor automáticamente.
create or replace function private.sede_caja_menor()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.activo is true and not exists(select 1 from public.cuentas_dinero where sede_id=new.id and tipo='efectivo' and activo) then
  insert into public.cuentas_dinero(nombre,tipo,sede_id) values('Caja menor '||new.nombre,'efectivo',new.id);
 end if;
 return new;
end $$;
create or replace trigger sede_caja_menor after insert or update of activo on public.sedes for each row execute function private.sede_caja_menor();

create or replace function private.cuenta_json(c public.cuentas_dinero)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'nombre',c.nombre,'tipo',c.tipo,'banco',c.banco,'numero',c.numero,'titular',c.titular,
  'sede_id',c.sede_id,'sede',(select nombre from public.sedes where id=c.sede_id),'activo',c.activo,'orden',c.orden);
$$;

-- Cuentas visibles: administración y contabilidad ven todas; las sedes, las activas que pueden usar.
create or replace function private.cuentas_dinero_lista()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u public.profiles; todo boolean;
begin
 u:=private.caja_perfil();
 if u.id is null then raise exception 'Sesión no válida.' using errcode='42501'; end if;
 todo:=lower(btrim(u.rol)) in ('admin','contabilidad');
 return coalesce((select jsonb_agg(private.cuenta_json(c) order by c.tipo<>'efectivo',c.orden,c.nombre) from public.cuentas_dinero c
  where todo or (c.activo and (c.sede_id is null or private.caja_ver(c.sede_id)))),'[]'::jsonb);
end $$;

create or replace function private.guardar_cuenta_dinero(p_datos jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare u public.profiles; v_id uuid:=nullif(p_datos->>'id','')::uuid; v_tipo text:=p_datos->>'tipo';
 v_nombre text:=btrim(coalesce(p_datos->>'nombre','')); v_banco text:=nullif(btrim(coalesce(p_datos->>'banco','')),'');
 v_numero text:=nullif(btrim(coalesce(p_datos->>'numero','')),''); v_titular text:=nullif(btrim(coalesce(p_datos->>'titular','')),'');
 v_sede uuid:=nullif(p_datos->>'sede_id','')::uuid; v_activo boolean:=coalesce((p_datos->>'activo')::boolean,true);
 v_orden int:=coalesce((p_datos->>'orden')::int,0); old public.cuentas_dinero;
begin
 u:=private.caja_perfil();
 if u.id is null or lower(btrim(u.rol))<>'admin' then raise exception 'Solo un administrador puede configurar las cuentas.' using errcode='42501'; end if;
 if v_tipo not in ('efectivo','banco','billetera') or length(v_nombre) not between 2 and 80 then raise exception 'Escribe el nombre y el tipo de la cuenta.'; end if;
 if v_tipo='efectivo' and v_sede is null then raise exception 'La caja menor debe pertenecer a una sede.'; end if;
 if v_tipo='banco' and v_banco is null then raise exception 'Escribe el banco de la cuenta.'; end if;
 if v_sede is not null and not exists(select 1 from public.sedes where id=v_sede) then raise exception 'Sede no encontrada.'; end if;
 if v_id is not null then
  select * into old from public.cuentas_dinero where id=v_id for update;
  if old.id is null then raise exception 'Cuenta no encontrada.'; end if;
  if old.tipo<>v_tipo and exists(select 1 from public.caja_movimientos where cuenta_id=v_id) then raise exception 'La cuenta ya tiene movimientos: no se puede cambiar su tipo.'; end if;
  if old.tipo='efectivo' and old.sede_id is distinct from v_sede and exists(select 1 from public.caja_movimientos where cuenta_id=v_id) then raise exception 'La caja menor ya tiene movimientos: no se puede cambiar de sede.'; end if;
 end if;
 begin
  if v_id is null then
   insert into public.cuentas_dinero(nombre,tipo,banco,numero,titular,sede_id,activo,orden,creado_por)
   values(v_nombre,v_tipo,v_banco,v_numero,v_titular,v_sede,v_activo,v_orden,u.id) returning id into v_id;
  else
   update public.cuentas_dinero set nombre=v_nombre,tipo=v_tipo,banco=v_banco,numero=v_numero,titular=v_titular,sede_id=v_sede,activo=v_activo,orden=v_orden,updated_at=now() where id=v_id;
  end if;
 exception when unique_violation then raise exception 'Esa sede ya tiene una caja menor activa.';
 end;
 return v_id;
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
 cta uuid:=nullif(p_datos->>'cuenta_id','')::uuid;
begin
 u:=private.caja_perfil();
 if u.id is null or s is null or not private.caja_operar(s) then raise exception 'No puedes registrar movimientos en la caja de esta sede.' using errcode='42501'; end if;
 if f is null or f>private.caja_hoy() or f<private.caja_hoy()-31 then raise exception 'La fecha debe ser de hoy o de los últimos 31 días.'; end if;
 if private.caja_dia_cerrado(s,f) then raise exception 'La caja de ese día ya está cerrada.'; end if;
 if t not in ('ingreso','egreso') or med not in ('Efectivo','Transferencia','Tarjeta','Otro') or v is null or v<=0 or v<>round(v,2) or v>=1000000000000 or length(cat) not between 2 and 60 or length(desc_)>500 then raise exception 'Revisa el tipo, el medio, la categoría y el valor.'; end if;
 if t='egreso' and length(desc_)<3 then raise exception 'Describe el egreso.'; end if;
 if path is not null and (split_part(path,'/',1)<>s::text or not exists(select 1 from storage.objects where bucket_id='comprobantes_caja' and name=path)) then raise exception 'El comprobante no es válido para esta sede.'; end if;
 if t='egreso' and path is null then raise exception 'Adjunta el comprobante del egreso.'; end if;
 if cid is not null and not exists(select 1 from public.contratos where id=cid and sede_id=s) then raise exception 'El contrato no pertenece a esta sede.'; end if;
 if med in ('Transferencia','Tarjeta') and cta is null and exists(select 1 from public.cuentas_dinero where activo and tipo<>'efectivo' and (sede_id is null or sede_id=s)) then
  raise exception 'Elige la cuenta o banco donde llegó el dinero.';
 end if;
 if ori is not null then
  if ori='pago' and not exists(select 1 from public.pagos p join public.contratos c on c.id=p.contrato_id where p.id=ori_id and c.sede_id=s) then raise exception 'Pago no encontrado en esta sede.'; end if;
  if ori in ('deposito','devolucion') and not exists(select 1 from public.movimientos_depositos d join public.contratos c on c.id=d.contrato_id where d.id=ori_id and c.sede_id=s and d.tipo=case when ori='deposito' then 'ingreso' else 'devolucion' end) then raise exception 'Movimiento de depósito no encontrado en esta sede.'; end if;
 end if;
 begin
  insert into public.caja_movimientos(sede_id,fecha,tipo,categoria,medio,valor,descripcion,contrato_id,origen,origen_id,comprobante_path,usuario_id,cuenta_id)
  values(s,f,t,cat,med,v,desc_,cid,ori,ori_id,path,u.id,case when med='Efectivo' then null else cta end) returning id into new_id;
 exception when unique_violation then raise exception 'Ese movimiento del ERP ya está en la caja.';
 end;
 return new_id;
end $function$;

-- Edición por el administrador: medio, cuenta, valor, categoría y descripción, con motivo e historial.
-- Si el movimiento viene de un pago, el pago y el saldo del contrato se ajustan; si viene de un depósito,
-- solo se sincroniza el medio (el valor del depósito se cambia en Depósitos → Modificar valor).
create or replace function private.editar_movimiento_caja(p_id uuid, p_datos jsonb, p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare u public.profiles; m public.caja_movimientos; n public.caja_movimientos; reason text:=btrim(coalesce(p_motivo,''));
 c public.contratos;
begin
 u:=private.caja_perfil();
 select * into m from public.caja_movimientos where id=p_id for update;
 if not found or u.id is null or lower(btrim(u.rol))<>'admin' or not private.caja_ver(m.sede_id) then raise exception 'Solo un administrador puede editar movimientos de caja.' using errcode='42501'; end if;
 if m.anulado_at is not null then raise exception 'El movimiento está anulado.'; end if;
 if private.caja_dia_cerrado(m.sede_id,m.fecha) then raise exception 'La caja de ese día está cerrada: reábrela para editar el movimiento.'; end if;
 if length(reason) not between 5 and 500 then raise exception 'Escribe el motivo del cambio (mínimo 5 caracteres).'; end if;
 n:=m;
 if p_datos ? 'medio' then n.medio:=p_datos->>'medio'; end if;
 if p_datos ? 'valor' then n.valor:=(p_datos->>'valor')::numeric; end if;
 if p_datos ? 'categoria' then n.categoria:=btrim(coalesce(p_datos->>'categoria','')); end if;
 if p_datos ? 'descripcion' then n.descripcion:=btrim(coalesce(p_datos->>'descripcion','')); end if;
 if p_datos ? 'cuenta_id' then n.cuenta_id:=nullif(p_datos->>'cuenta_id','')::uuid; end if;
 if n.medio='Efectivo' then n.cuenta_id:=null; elsif m.medio='Efectivo' and not (p_datos ? 'cuenta_id') then n.cuenta_id:=null; end if;
 if n.medio not in ('Efectivo','Transferencia','Tarjeta','Otro') or n.valor is null or n.valor<=0 or n.valor<>round(n.valor,2) or n.valor>=1000000000000
  or length(n.categoria) not between 2 and 60 or length(n.descripcion)>500 then raise exception 'Revisa el medio, la categoría y el valor.'; end if;
 if m.tipo='egreso' and length(n.descripcion)<3 then raise exception 'Describe el egreso.'; end if;
 if m.origen in ('pago','deposito','devolucion') and n.categoria<>m.categoria then raise exception 'La categoría de un movimiento del ERP no se cambia.'; end if;
 if n.medio in ('Transferencia','Tarjeta') and n.cuenta_id is null and exists(select 1 from public.cuentas_dinero where activo and tipo<>'efectivo' and (sede_id is null or sede_id=m.sede_id)) then
  raise exception 'Elige la cuenta o banco donde llegó el dinero.';
 end if;
 if m.origen in ('deposito','devolucion') and n.valor<>m.valor then
  raise exception 'El valor de un depósito se cambia en Depósitos → Modificar valor; aquí solo el medio y la cuenta.';
 end if;
 if m.origen='pago' then
  if n.valor<>m.valor then
   select k.* into c from public.contratos k join public.pagos p on p.contrato_id=k.id where p.id=m.origen_id for update of k;
   if c.id is null then raise exception 'No se encontró el pago de este movimiento.'; end if;
   if coalesce(c.anticipo,0)+n.valor-m.valor>coalesce(c.valor_total,0) then raise exception 'Con ese valor el contrato quedaría con saldo negativo.'; end if;
   update public.contratos set anticipo=coalesce(anticipo,0)+n.valor-m.valor where id=c.id;
  end if;
  update public.pagos set medio_pago=n.medio,valor_pagado=n.valor,updated_at=now() where id=m.origen_id;
 elsif m.origen in ('deposito','devolucion') and n.medio<>m.medio then
  update public.movimientos_depositos set metodo=n.medio where id=m.origen_id;
 end if;
 update public.caja_movimientos set medio=n.medio,valor=n.valor,categoria=n.categoria,descripcion=n.descripcion,cuenta_id=n.cuenta_id where id=p_id
  returning * into n;
 if n.medio=m.medio and n.valor=m.valor and n.categoria=m.categoria and n.descripcion=m.descripcion and n.cuenta_id is not distinct from m.cuenta_id then
  raise exception 'No hay cambios para guardar.';
 end if;
 insert into public.caja_movimientos_historial(movimiento_id,anterior,nuevo,motivo,usuario_id)
 values(p_id,jsonb_build_object('medio',m.medio,'valor',m.valor,'categoria',m.categoria,'descripcion',m.descripcion,'cuenta_id',m.cuenta_id,
   'cuenta',(select nombre from public.cuentas_dinero where id=m.cuenta_id)),
  jsonb_build_object('medio',n.medio,'valor',n.valor,'categoria',n.categoria,'descripcion',n.descripcion,'cuenta_id',n.cuenta_id,
   'cuenta',(select nombre from public.cuentas_dinero where id=n.cuenta_id)),reason,u.id);
end $$;

CREATE OR REPLACE FUNCTION private.caja_dia(p_sede uuid, p_fecha date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare inicial numeric; movs jsonb; tot jsonb; cierre jsonb; sug jsonb; faltan jsonb; pagos_dia int; desde timestamptz:=private.soportes_desde(); cuentas jsonb;
begin
 if p_sede is null or p_fecha is null or not private.caja_ver(p_sede) then raise exception 'No tienes acceso a la caja de esta sede.' using errcode='42501'; end if;
 inicial:=private.caja_saldo_inicial(p_sede,p_fecha);
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
  'ingresos',coalesce(sum(valor) filter (where tipo='ingreso'),0),'egresos',coalesce(sum(valor) filter (where tipo='egreso'),0),
  'ingresos_efectivo',coalesce(sum(valor) filter (where tipo='ingreso' and medio='Efectivo'),0),'egresos_efectivo',coalesce(sum(valor) filter (where tipo='egreso' and medio='Efectivo'),0),
  'depositos_recibidos',coalesce(sum(valor) filter (where origen='deposito'),0),'depositos_devueltos',coalesce(sum(valor) filter (where origen='devolucion'),0),
  'por_medio',coalesce((select jsonb_object_agg(medio,jsonb_build_object('ingresos',i,'egresos',e)) from (select medio,sum(valor) filter (where tipo='ingreso') i,sum(valor) filter (where tipo='egreso') e from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null group by medio) x),'{}'::jsonb),
  'por_cuenta',coalesce((select jsonb_agg(jsonb_build_object('cuenta_id',x.cuenta_id,'cuenta',coalesce(k.nombre,'Sin cuenta asignada'),'tipo',k.tipo,'ingresos',x.i,'egresos',x.e) order by k.tipo<>'efectivo',k.nombre)
   from (select cuenta_id,coalesce(sum(valor) filter (where tipo='ingreso'),0) i,coalesce(sum(valor) filter (where tipo='egreso'),0) e from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null group by cuenta_id) x
   left join public.cuentas_dinero k on k.id=x.cuenta_id),'[]'::jsonb))
 into tot from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null;
 select to_jsonb(k)||jsonb_build_object('cerrado_por_nombre',(select coalesce(nombre,email) from public.profiles where id=k.cerrado_por)) into cierre
  from public.caja_cierres k where k.sede_id=p_sede and k.fecha=p_fecha and k.reabierto_at is null;
 select coalesce(jsonb_agg(s order by s->>'hora'),'[]'::jsonb) into sug from (
  select jsonb_build_object('origen','pago','origen_id',p.id,'tipo','ingreso','categoria','Pago de contrato','medio',case when p.medio_pago in ('Efectivo','Transferencia','Tarjeta') then p.medio_pago else '' end,
   'valor',p.valor_pagado,'contrato_id',c.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'hora',p.fecha_pago,
   'soportes',private.soportes_json(p.id),'soporte_historico',p.created_at<desde) s
  from public.pagos p join public.contratos c on c.id=p.contrato_id
  where c.sede_id=p_sede and (p.fecha_pago at time zone 'UTC')::date=p_fecha and p.valor_pagado>0
   and not exists(select 1 from public.caja_movimientos x where x.origen='pago' and x.origen_id=p.id and x.anulado_at is null)
  union all
  select jsonb_build_object('origen',case when d.tipo='ingreso' then 'deposito' else 'devolucion' end,'origen_id',d.id,'tipo',case when d.tipo='ingreso' then 'ingreso' else 'egreso' end,
   'categoria',case when d.tipo='ingreso' then 'Depósito en garantía' else 'Devolución de depósito' end,'medio',case when d.metodo in ('Efectivo','Transferencia','Tarjeta','Otro') then d.metodo else '' end,
   'valor',d.monto,'contrato_id',c.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'hora',d.created_at)
  from public.movimientos_depositos d join public.contratos c on c.id=d.contrato_id
  where c.sede_id=p_sede and (d.created_at at time zone 'America/Bogota')::date=p_fecha and d.monto>0
   and not exists(select 1 from public.caja_movimientos x where x.origen in ('deposito','devolucion') and x.origen_id=d.id and x.anulado_at is null)
 ) q;
 faltan:=private.pagos_sin_soporte(p_sede,p_fecha);
 select count(*) into pagos_dia from public.pagos p join public.contratos c on c.id=p.contrato_id
  where c.sede_id=p_sede and (p.fecha_pago at time zone 'UTC')::date=p_fecha and p.valor_pagado>0 and p.created_at>=desde;
 select coalesce(jsonb_agg(private.cuenta_json(k) order by k.tipo<>'efectivo',k.orden,k.nombre),'[]'::jsonb) into cuentas
  from public.cuentas_dinero k where k.activo and (k.sede_id is null or k.sede_id=p_sede);
 return jsonb_build_object('sede_id',p_sede,'fecha',p_fecha,'saldo_inicial',inicial,'movimientos',movs,'totales',tot,'cierre',cierre,'sugerencias',sug,
  'puede_operar',private.caja_operar(p_sede),'es_hoy',p_fecha=private.caja_hoy(),'cuentas',cuentas,
  'pagos_sin_soporte',faltan,'soportes',jsonb_build_object('pagos',pagos_dia,'con_soporte',pagos_dia-jsonb_array_length(faltan)));
end $function$;

-- "¿Dónde está la plata?": por cuenta (caja menor de cada sede, bancos, billeteras) lo que entró y salió en el periodo,
-- de dónde vino (pagos, depósitos, otros) y lo que se registró en el ERP pero todavía no está en la caja.
create or replace function private.donde_esta_la_plata(p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cuentas jsonb; pendientes jsonb; depositos jsonb;
begin
 if (private.caja_perfil()).id is null then raise exception 'Sesión no válida.' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>92 then raise exception 'Selecciona un periodo de hasta 3 meses.'; end if;
 with mv as (
  select m.*, coalesce(m.cuenta_id::text,'sin:'||m.medio) clave from public.caja_movimientos m
  where m.fecha between p_desde and p_hasta and m.anulado_at is null and private.caja_ver(m.sede_id)
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
   'pagos',(select count(*) from public.pagos p join public.contratos c on c.id=p.contrato_id where c.sede_id=s.id and (p.fecha_pago at time zone 'UTC')::date between p_desde and p_hasta and p.valor_pagado>0
     and not exists(select 1 from public.caja_movimientos z where z.origen='pago' and z.origen_id=p.id and z.anulado_at is null)),
   'valor_pagos',(select coalesce(sum(p.valor_pagado),0) from public.pagos p join public.contratos c on c.id=p.contrato_id where c.sede_id=s.id and (p.fecha_pago at time zone 'UTC')::date between p_desde and p_hasta and p.valor_pagado>0
     and not exists(select 1 from public.caja_movimientos z where z.origen='pago' and z.origen_id=p.id and z.anulado_at is null)),
   'depositos',(select count(*) from public.movimientos_depositos d join public.contratos c on c.id=d.contrato_id where c.sede_id=s.id and (d.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta and d.monto>0
     and not exists(select 1 from public.caja_movimientos z where z.origen in ('deposito','devolucion') and z.origen_id=d.id and z.anulado_at is null)),
   'valor_depositos',(select coalesce(sum(case when d.tipo='ingreso' then d.monto else -d.monto end),0) from public.movimientos_depositos d join public.contratos c on c.id=d.contrato_id where c.sede_id=s.id and (d.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta and d.monto>0
     and not exists(select 1 from public.caja_movimientos z where z.origen in ('deposito','devolucion') and z.origen_id=d.id and z.anulado_at is null))) x
  from public.sedes s where s.activo is true and private.caja_ver(s.id)) q
 where (x->>'pagos')::int>0 or (x->>'depositos')::int>0;
 select jsonb_build_object('recibidos',coalesce(sum(valor) filter (where origen='deposito'),0),'devueltos',coalesce(sum(valor) filter (where origen='devolucion'),0)) into depositos
  from public.caja_movimientos m where m.fecha between p_desde and p_hasta and m.anulado_at is null and m.origen in ('deposito','devolucion') and private.caja_ver(m.sede_id);
 return jsonb_build_object('desde',p_desde,'hasta',p_hasta,'cuentas',cuentas,'sin_registrar',pendientes,'depositos',depositos);
end $$;

create or replace function public.cuentas_dinero_lista() returns jsonb language sql stable set search_path='' as $$ select private.cuentas_dinero_lista(); $$;
create or replace function public.guardar_cuenta_dinero(p_datos jsonb) returns uuid language sql set search_path='' as $$ select private.guardar_cuenta_dinero(p_datos); $$;
create or replace function public.editar_movimiento_caja(p_id uuid, p_datos jsonb, p_motivo text) returns void language sql set search_path='' as $$ select private.editar_movimiento_caja(p_id,p_datos,p_motivo); $$;
create or replace function public.donde_esta_la_plata(p_desde date, p_hasta date) returns jsonb language sql stable set search_path='' as $$ select private.donde_esta_la_plata(p_desde,p_hasta); $$;

revoke all on function private.cuentas_dinero_lista(), private.guardar_cuenta_dinero(jsonb), private.editar_movimiento_caja(uuid,jsonb,text),
 private.donde_esta_la_plata(date,date), private.cuenta_json(public.cuentas_dinero), private.caja_cuenta_movimiento(), private.sede_caja_menor() from public, anon;
revoke all on function public.cuentas_dinero_lista(), public.guardar_cuenta_dinero(jsonb), public.editar_movimiento_caja(uuid,jsonb,text), public.donde_esta_la_plata(date,date) from public, anon;
grant execute on function private.cuentas_dinero_lista(), private.guardar_cuenta_dinero(jsonb), private.editar_movimiento_caja(uuid,jsonb,text), private.donde_esta_la_plata(date,date), private.cuenta_json(public.cuentas_dinero) to authenticated;
grant execute on function public.cuentas_dinero_lista(), public.guardar_cuenta_dinero(jsonb), public.editar_movimiento_caja(uuid,jsonb,text), public.donde_esta_la_plata(date,date) to authenticated;
