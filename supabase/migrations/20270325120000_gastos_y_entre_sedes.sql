-- Finanzas › Gastos y movimientos entre sedes.
-- 1) gastos: expenses of a store or of the general administration (sede_id null), and profit withdrawals (clase 'retiro_utilidades').
--    When the money leaves a store's cash or account, the expense is also an «egreso» in that store's Cierres de caja (origen 'gasto').
-- 2) movimientos_entre_sedes: transfers, loans and loan repayments between stores: an «egreso» in the origin cash/account and an
--    «ingreso» in the destination one (origen 'entre_sedes_salida' / 'entre_sedes_entrada'); they are not sales nor expenses.
-- Reversible: drop the functions, the two tables and the permission, restore caja_movimientos_origen_check and caja_resumen.

alter table public.caja_movimientos drop constraint if exists caja_movimientos_origen_check;
alter table public.caja_movimientos add constraint caja_movimientos_origen_check
 check (origen in ('pago','deposito','devolucion','pago_fijo','plan_ahorro','gasto','entre_sedes_salida','entre_sedes_entrada'));

create table if not exists public.gastos(
 id uuid primary key default gen_random_uuid(),
 sede_id uuid references public.sedes(id),
 clase text not null default 'gasto' check (clase in ('gasto','retiro_utilidades')),
 categoria text not null check (length(categoria) between 2 and 60),
 fecha date not null,
 valor numeric(14,2) not null check (valor>0 and valor<1000000000000),
 medio text not null check (medio in ('Efectivo','Transferencia','Tarjeta','Otro')),
 cuenta_id uuid references public.cuentas_dinero(id),
 beneficiario text check (length(beneficiario)<=120),
 descripcion text not null check (length(descripcion) between 3 and 500),
 comprobante_path text not null,
 caja_movimiento_id uuid references public.caja_movimientos(id),
 registrado_por uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 anulado_at timestamptz, anulado_por uuid references public.profiles(id), motivo_anulacion text
);
create index if not exists gastos_fecha on public.gastos(fecha);
create index if not exists gastos_sede on public.gastos(sede_id);

create table if not exists public.movimientos_entre_sedes(
 id uuid primary key default gen_random_uuid(),
 fecha date not null,
 tipo text not null check (tipo in ('traslado','prestamo','devolucion')),
 sede_origen uuid not null references public.sedes(id),
 cuenta_origen uuid not null references public.cuentas_dinero(id),
 sede_destino uuid not null references public.sedes(id),
 cuenta_destino uuid not null references public.cuentas_dinero(id),
 valor numeric(14,2) not null check (valor>0 and valor<1000000000000),
 descripcion text check (length(descripcion)<=500),
 comprobante_path text not null,
 mov_salida_id uuid references public.caja_movimientos(id),
 mov_entrada_id uuid references public.caja_movimientos(id),
 registrado_por uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 anulado_at timestamptz, anulado_por uuid references public.profiles(id), motivo_anulacion text,
 check (sede_origen<>sede_destino)
);
create index if not exists movimientos_entre_sedes_fecha on public.movimientos_entre_sedes(fecha);

create trigger gastos_historial after insert or update or delete on public.gastos for each row execute function private.config_historial();
create trigger movimientos_entre_sedes_historial after insert or update or delete on public.movimientos_entre_sedes for each row execute function private.config_historial();

insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
values ('panel.gastos','Finanzas','Ver y registrar gastos','Gastos de sus sedes con comprobante (los gastos de administración, los retiros de utilidades y los movimientos entre sedes son de administración y contabilidad)',false,43)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso) values ('contabilidad','panel.gastos'),('franquiciado','panel.gastos') on conflict do nothing;

-- Store expenses: administration, or the panel permission for one of their stores. Administration-level ones: administration and accounting.
create or replace function private.gastos_ver(p_sede uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.es_finanzas() or (p_sede is not null and private.tiene_permiso('panel.gastos') and p_sede=any(private.sedes_usuario(auth.uid()))));
$$;

alter table public.gastos enable row level security;
alter table public.movimientos_entre_sedes enable row level security;
create policy gastos_ver on public.gastos for select to authenticated using (private.gastos_ver(sede_id));
create policy movimientos_entre_sedes_ver on public.movimientos_entre_sedes for select to authenticated using (private.es_finanzas());
revoke insert,update,delete on public.gastos, public.movimientos_entre_sedes from anon, authenticated;

-- Store whose cash register receives the expense: the store of the account it was paid from, else the store of the expense
-- (cash always leaves the store's petty cash). Null = paid from an administration account outside the stores' cash registers.
create or replace function private.gastos_sede_caja(p_sede uuid,p_cuenta uuid,p_medio text) returns uuid
language sql stable security definer set search_path='' as $$
 select case when p_medio='Efectivo' then p_sede else coalesce((select sede_id from public.cuentas_dinero where id=p_cuenta),p_sede) end;
$$;

-- Folder of the receipt (comprobantes_caja/<folder>/gastos/…): the store of the cash register, or «administracion».
create or replace function public.gastos_carpeta_comprobante(p_sede uuid,p_cuenta uuid,p_medio text,p_entre_sedes boolean default false) returns text
language plpgsql stable security definer set search_path='' as $$
declare s uuid;
begin
 if p_entre_sedes then
  if not private.es_finanzas() then raise exception 'Solo administración y contabilidad registran movimientos entre sedes.' using errcode='42501'; end if;
  select sede_id into s from public.cuentas_dinero where id=p_cuenta;
  if s is null then raise exception 'Elige la cuenta de origen de una sede.'; end if;
  return s::text;
 end if;
 if not private.gastos_ver(p_sede) then raise exception 'No puedes registrar gastos de esta sede.' using errcode='42501'; end if;
 s:=private.gastos_sede_caja(p_sede,p_cuenta,p_medio);
 return coalesce(s::text,'administracion');
end $$;

create or replace function public.gastos_sedes() returns table(id uuid,nombre text)
language sql stable security definer set search_path='' as $$
 select s.id,s.nombre::text from public.sedes s where s.activo is true and private.gastos_ver(s.id) order by s.nombre;
$$;

create or replace function public.gastos_registrar(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_sede uuid:=nullif(p->>'sede_id','')::uuid; v_clase text:=coalesce(nullif(p->>'clase',''),'gasto');
 v_cat text:=btrim(coalesce(p->>'categoria','')); v_fecha date:=(p->>'fecha')::date; v_valor numeric:=(p->>'valor')::numeric;
 v_medio text:=p->>'medio'; v_cuenta uuid:=nullif(p->>'cuenta_id','')::uuid; v_benef text:=nullif(btrim(coalesce(p->>'beneficiario','')),'');
 v_desc text:=btrim(coalesce(p->>'descripcion','')); v_path text:=nullif(btrim(coalesce(p->>'comprobante_path','')),'');
 v_caja uuid; v_id uuid; v_mov uuid; k public.cuentas_dinero;
begin
 if not private.gastos_ver(v_sede) then raise exception 'No puedes registrar gastos de esta sede.' using errcode='42501'; end if;
 if v_clase not in ('gasto','retiro_utilidades') then raise exception 'Clase de gasto no válida.'; end if;
 if v_clase='retiro_utilidades' and not private.es_finanzas() then raise exception 'Los retiros de utilidades los registra administración.' using errcode='42501'; end if;
 if v_clase='retiro_utilidades' then v_cat:='Retiro de utilidades'; end if;
 if length(v_cat) not between 2 and 60 then raise exception 'Elige la categoría.'; end if;
 if v_fecha is null or v_fecha>(now() at time zone 'America/Bogota')::date then raise exception 'Revisa la fecha.'; end if;
 if v_valor is null or v_valor<=0 or v_valor<>round(v_valor,2) then raise exception 'Revisa el valor.'; end if;
 if v_medio not in ('Efectivo','Transferencia','Tarjeta','Otro') then raise exception 'Elige el medio de pago.'; end if;
 if length(v_desc)<3 then raise exception 'Describe el gasto.'; end if;
 if v_medio='Efectivo' then
  v_cuenta:=null;
  if v_sede is null then raise exception 'Un gasto en efectivo sale de la caja menor de una sede: elige la sede.'; end if;
 elsif v_cuenta is not null then
  select * into k from public.cuentas_dinero where id=v_cuenta;
  if k.id is null or k.tipo='efectivo' then raise exception 'Elige la cuenta de donde salió el dinero.'; end if;
 elsif exists(select 1 from public.cuentas_dinero where activo and tipo<>'efectivo' and (sede_id is null or sede_id=v_sede or v_sede is null)) then
  raise exception 'Elige la cuenta de donde salió el dinero.';
 end if;
 v_caja:=private.gastos_sede_caja(v_sede,v_cuenta,v_medio);
 if v_path is null or split_part(v_path,'/',1)<>coalesce(v_caja::text,'administracion')
  or not exists(select 1 from storage.objects where bucket_id='comprobantes_caja' and name=v_path) then raise exception 'Adjunta el comprobante del gasto.'; end if;
 insert into public.gastos(sede_id,clase,categoria,fecha,valor,medio,cuenta_id,beneficiario,descripcion,comprobante_path,registrado_por)
 values(v_sede,v_clase,v_cat,v_fecha,v_valor,v_medio,v_cuenta,v_benef,v_desc,v_path,auth.uid()) returning id into v_id;
 if v_caja is not null then
  v_mov:=private.registrar_movimiento_caja(jsonb_build_object('sede_id',v_caja,'fecha',v_fecha,'tipo','egreso','categoria',v_cat,'medio',v_medio,'valor',v_valor,
   'descripcion',left(concat_ws(' · ',v_desc,v_benef,case when v_sede is null then 'Gasto de administración' when v_sede<>v_caja then 'Gasto de '||(select nombre from public.sedes where id=v_sede) end),500),
   'origen','gasto','origen_id',v_id,'comprobante_path',v_path,'cuenta_id',v_cuenta));
  update public.gastos set caja_movimiento_id=v_mov where id=v_id;
 end if;
 return v_id;
end $$;

create or replace function public.gastos_anular(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare g public.gastos; reason text:=btrim(coalesce(p_motivo,''));
begin
 select * into g from public.gastos where id=p_id for update;
 if g.id is null or not private.gastos_ver(g.sede_id) then raise exception 'Gasto no encontrado.' using errcode='42501'; end if;
 if g.anulado_at is not null then raise exception 'El gasto ya está anulado.'; end if;
 if length(reason) not between 5 and 500 then raise exception 'Escribe el motivo de la anulación (mínimo 5 caracteres).'; end if;
 if g.caja_movimiento_id is not null then perform private.anular_movimiento_caja(g.caja_movimiento_id,reason); end if;
 update public.gastos set anulado_at=now(),anulado_por=auth.uid(),motivo_anulacion=reason where id=p_id;
end $$;

create or replace function public.gastos_listar(p_desde date,p_hasta date) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'sede_id',g.sede_id,'sede',coalesce(s.nombre,'Administración'),'clase',g.clase,'categoria',g.categoria,
  'fecha',g.fecha,'valor',g.valor,'medio',g.medio,'cuenta',k.nombre,'beneficiario',g.beneficiario,'descripcion',g.descripcion,'comprobante_path',g.comprobante_path,
  'anulado',g.anulado_at is not null,'motivo_anulacion',g.motivo_anulacion,'registrado_por',pr.nombre) order by g.fecha desc,g.created_at desc),'[]'::jsonb)
 from public.gastos g left join public.sedes s on s.id=g.sede_id left join public.cuentas_dinero k on k.id=g.cuenta_id left join public.profiles pr on pr.id=g.registrado_por
 where g.fecha between p_desde and p_hasta and private.gastos_ver(g.sede_id);
$$;

create or replace function public.entre_sedes_registrar(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_tipo text:=p->>'tipo'; v_fecha date:=(p->>'fecha')::date; v_valor numeric:=(p->>'valor')::numeric;
 v_desc text:=nullif(btrim(coalesce(p->>'descripcion','')),''); v_path text:=nullif(btrim(coalesce(p->>'comprobante_path','')),'');
 o public.cuentas_dinero; d public.cuentas_dinero; v_id uuid; ms uuid; me uuid; so text; sd text; etiqueta text;
begin
 if not private.es_finanzas() then raise exception 'Solo administración y contabilidad registran movimientos entre sedes.' using errcode='42501'; end if;
 if v_tipo not in ('traslado','prestamo','devolucion') then raise exception 'Elige si es traslado, préstamo o devolución.'; end if;
 select * into o from public.cuentas_dinero where id=nullif(p->>'cuenta_origen','')::uuid;
 select * into d from public.cuentas_dinero where id=nullif(p->>'cuenta_destino','')::uuid;
 if o.id is null or o.sede_id is null or d.id is null or d.sede_id is null then raise exception 'Elige la cuenta o caja de origen y la de destino (de una sede).'; end if;
 if o.sede_id=d.sede_id then raise exception 'La sede de origen y la de destino deben ser distintas.'; end if;
 if v_valor is null or v_valor<=0 or v_valor<>round(v_valor,2) then raise exception 'Revisa el valor.'; end if;
 if v_path is null or split_part(v_path,'/',1)<>o.sede_id::text or not exists(select 1 from storage.objects where bucket_id='comprobantes_caja' and name=v_path) then raise exception 'Adjunta el comprobante.'; end if;
 select nombre into so from public.sedes where id=o.sede_id; select nombre into sd from public.sedes where id=d.sede_id;
 etiqueta:=case v_tipo when 'traslado' then 'Traslado' when 'prestamo' then 'Préstamo' else 'Devolución de préstamo' end;
 insert into public.movimientos_entre_sedes(fecha,tipo,sede_origen,cuenta_origen,sede_destino,cuenta_destino,valor,descripcion,comprobante_path,registrado_por)
 values(v_fecha,v_tipo,o.sede_id,o.id,d.sede_id,d.id,v_valor,v_desc,v_path,auth.uid()) returning id into v_id;
 ms:=private.registrar_movimiento_caja(jsonb_build_object('sede_id',o.sede_id,'fecha',v_fecha,'tipo','egreso','categoria',left(etiqueta||' a '||sd,60),
  'medio',case when o.tipo='efectivo' then 'Efectivo' else 'Transferencia' end,'valor',v_valor,'descripcion',left(concat_ws(' · ',etiqueta||' a '||sd,v_desc),500),
  'origen','entre_sedes_salida','origen_id',v_id,'comprobante_path',v_path,'cuenta_id',case when o.tipo='efectivo' then null else o.id end));
 me:=private.registrar_movimiento_caja(jsonb_build_object('sede_id',d.sede_id,'fecha',v_fecha,'tipo','ingreso','categoria',left(etiqueta||' de '||so,60),
  'medio',case when d.tipo='efectivo' then 'Efectivo' else 'Transferencia' end,'valor',v_valor,'descripcion',left(concat_ws(' · ',etiqueta||' de '||so,v_desc),500),
  'origen','entre_sedes_entrada','origen_id',v_id,'cuenta_id',case when d.tipo='efectivo' then null else d.id end));
 update public.movimientos_entre_sedes set mov_salida_id=ms,mov_entrada_id=me where id=v_id;
 return v_id;
end $$;

create or replace function public.entre_sedes_anular(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare m public.movimientos_entre_sedes; reason text:=btrim(coalesce(p_motivo,''));
begin
 if not private.es_finanzas() then raise exception 'Solo administración y contabilidad.' using errcode='42501'; end if;
 select * into m from public.movimientos_entre_sedes where id=p_id for update;
 if m.id is null then raise exception 'Movimiento no encontrado.'; end if;
 if m.anulado_at is not null then raise exception 'El movimiento ya está anulado.'; end if;
 if length(reason) not between 5 and 500 then raise exception 'Escribe el motivo de la anulación (mínimo 5 caracteres).'; end if;
 if m.mov_salida_id is not null then perform private.anular_movimiento_caja(m.mov_salida_id,reason); end if;
 if m.mov_entrada_id is not null then perform private.anular_movimiento_caja(m.mov_entrada_id,reason); end if;
 update public.movimientos_entre_sedes set anulado_at=now(),anulado_por=auth.uid(),motivo_anulacion=reason where id=p_id;
end $$;

-- Movements of the period plus what each store owes another (loans minus repayments, all time).
create or replace function public.entre_sedes_listar(p_desde date,p_hasta date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.es_finanzas() then raise exception 'Solo administración y contabilidad.' using errcode='42501'; end if;
 return jsonb_build_object(
  'movimientos',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'fecha',m.fecha,'tipo',m.tipo,'origen',so.nombre,'destino',sd.nombre,'cuenta_origen',ko.nombre,'cuenta_destino',kd.nombre,
    'valor',m.valor,'descripcion',m.descripcion,'comprobante_path',m.comprobante_path,'anulado',m.anulado_at is not null,'motivo_anulacion',m.motivo_anulacion) order by m.fecha desc,m.created_at desc)
   from public.movimientos_entre_sedes m join public.sedes so on so.id=m.sede_origen join public.sedes sd on sd.id=m.sede_destino
   join public.cuentas_dinero ko on ko.id=m.cuenta_origen join public.cuentas_dinero kd on kd.id=m.cuenta_destino
   where m.fecha between p_desde and p_hasta),'[]'::jsonb),
  'deudas',coalesce((select jsonb_agg(jsonb_build_object('deudor',sd.nombre,'acreedor',sa.nombre,'saldo',x.saldo) order by x.saldo desc) from (
    select a,b,sum(v) saldo from (
     select sede_origen a,sede_destino b,case tipo when 'prestamo' then valor else -valor end v from public.movimientos_entre_sedes where anulado_at is null and tipo='prestamo'
     union all select sede_destino,sede_origen,-valor from public.movimientos_entre_sedes where anulado_at is null and tipo='devolucion'
     union all select sede_destino,sede_origen,-valor from public.movimientos_entre_sedes where anulado_at is null and tipo='prestamo'
     union all select sede_origen,sede_destino,valor from public.movimientos_entre_sedes where anulado_at is null and tipo='devolucion') t
    group by a,b having sum(v)>0) x join public.sedes sa on sa.id=x.a join public.sedes sd on sd.id=x.b),'[]'::jsonb));
end $$;

revoke all on function public.gastos_carpeta_comprobante(uuid,uuid,text,boolean), public.gastos_sedes(), public.gastos_registrar(jsonb), public.gastos_anular(uuid,text),
 public.gastos_listar(date,date), public.entre_sedes_registrar(jsonb), public.entre_sedes_anular(uuid,text), public.entre_sedes_listar(date,date) from public, anon;
grant execute on function public.gastos_carpeta_comprobante(uuid,uuid,text,boolean), public.gastos_sedes(), public.gastos_registrar(jsonb), public.gastos_anular(uuid,text),
 public.gastos_listar(date,date), public.entre_sedes_registrar(jsonb), public.entre_sedes_anular(uuid,text), public.entre_sedes_listar(date,date) to authenticated;

-- Cash summary: movements between stores are not income nor expenses (they still count in the cash and account balances).
create or replace function private.caja_resumen(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path to '' as $function$
begin
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>92 then raise exception 'Selecciona un periodo de hasta 3 meses.'; end if;
 return coalesce((select jsonb_agg(r order by r->>'sede') from (
  select jsonb_build_object('sede_id',s.id,'sede',s.nombre,'inicio',x.ini,
   'ingresos',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between x.d and p_hasta and m.tipo='ingreso' and m.categoria<>'Base de caja' and m.origen is distinct from 'deposito' and m.origen is distinct from 'entre_sedes_entrada' and m.anulado_at is null),0),
   'egresos',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between x.d and p_hasta and m.tipo='egreso' and m.origen is distinct from 'devolucion' and m.origen is distinct from 'entre_sedes_salida' and m.anulado_at is null),0),
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
