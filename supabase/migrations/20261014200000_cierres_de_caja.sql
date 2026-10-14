-- Cierres de caja: a separate module where each site records its daily income and expenses and closes
-- the day by counting the cash. Admin and Contabilidad see every site; other users only their own site.
-- All writes go through the functions below (no direct table access), movements are never removed
-- (only annulled with a reason) and a closed day is locked.

create table public.caja_movimientos (
 id uuid primary key default gen_random_uuid(),
 sede_id uuid not null references public.sedes(id),
 fecha date not null,
 tipo text not null check (tipo in ('ingreso','egreso')),
 categoria text not null check (length(categoria) between 2 and 60),
 medio text not null check (medio in ('Efectivo','Transferencia','Tarjeta','Otro')),
 valor numeric(14,2) not null check (valor>0 and valor<1000000000000),
 descripcion text not null default '' check (length(descripcion)<=500),
 contrato_id uuid references public.contratos(id),
 origen text check (origen in ('pago','deposito','devolucion')),
 origen_id uuid,
 comprobante_path text,
 usuario_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 anulado_at timestamptz,
 anulado_por uuid references public.profiles(id),
 motivo_anulacion text
);
create index caja_movimientos_sede_fecha on public.caja_movimientos(sede_id,fecha);
-- An ERP payment or deposit can enter a cash register only once.
create unique index caja_movimientos_origen on public.caja_movimientos(origen,origen_id) where origen is not null and anulado_at is null;

create table public.caja_cierres (
 id uuid primary key default gen_random_uuid(),
 sede_id uuid not null references public.sedes(id),
 fecha date not null,
 saldo_inicial numeric(14,2) not null,
 ingresos_efectivo numeric(14,2) not null,
 egresos_efectivo numeric(14,2) not null,
 esperado numeric(14,2) not null,
 contado numeric(14,2) not null check (contado>=0),
 diferencia numeric(14,2) not null,
 totales jsonb not null,
 observaciones text not null default '' check (length(observaciones)<=1000),
 cerrado_por uuid not null references public.profiles(id),
 cerrado_at timestamptz not null default now(),
 reabierto_at timestamptz,
 reabierto_por uuid references public.profiles(id),
 motivo_reapertura text
);
create unique index caja_cierres_sede_fecha on public.caja_cierres(sede_id,fecha) where reabierto_at is null;

alter table public.caja_movimientos enable row level security;
alter table public.caja_cierres enable row level security;
revoke all on public.caja_movimientos,public.caja_cierres from public,anon,authenticated;

-- Who may see / operate a site's cash.
create function private.caja_perfil() returns public.profiles language sql stable security definer set search_path='' as $$
 select * from public.profiles where id=auth.uid() and coalesce(activo,true);
$$;
create function private.caja_ver(p_sede uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true)
  and ((select private.sede_operativa_limitada()) is null or (select private.sede_operativa_limitada())=p_sede)
  and (lower(btrim(p.rol)) in ('admin','contabilidad') or p.sede_id=p_sede or (select private.sede_operativa_limitada())=p_sede));
$$;
create function private.caja_operar(p_sede uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.caja_ver(p_sede) and not exists(select 1 from public.profiles p where p.id=auth.uid() and lower(btrim(p.rol))='contabilidad');
$$;
create function private.caja_dia_cerrado(p_sede uuid,p_fecha date) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.caja_cierres where sede_id=p_sede and fecha=p_fecha and reabierto_at is null);
$$;
create function private.caja_hoy() returns date language sql stable set search_path='' as $$ select (now() at time zone 'America/Bogota')::date; $$;

-- Opening balance: the cash counted at the site's last closing before that day.
create function private.caja_saldo_inicial(p_sede uuid,p_fecha date) returns numeric language sql stable security definer set search_path='' as $$
 select coalesce((select contado from public.caja_cierres where sede_id=p_sede and fecha<p_fecha and reabierto_at is null order by fecha desc limit 1),0);
$$;

-- Day view: movements, totals, closing state and ERP suggestions (payments/deposits not yet in the register).
create function private.caja_dia(p_sede uuid,p_fecha date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare inicial numeric; movs jsonb; tot jsonb; cierre jsonb; sug jsonb;
begin
 if p_sede is null or p_fecha is null or not private.caja_ver(p_sede) then raise exception 'No tienes acceso a la caja de esta sede.' using errcode='42501'; end if;
 inicial:=private.caja_saldo_inicial(p_sede,p_fecha);
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'tipo',m.tipo,'categoria',m.categoria,'medio',m.medio,'valor',m.valor,'descripcion',m.descripcion,
  'contrato_id',m.contrato_id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'origen',m.origen,'comprobante_path',m.comprobante_path,
  'usuario',coalesce(u.nombre,u.email),'created_at',m.created_at,'anulado_at',m.anulado_at,'motivo_anulacion',m.motivo_anulacion,'anulado_por',coalesce(a.nombre,a.email)) order by m.created_at),'[]'::jsonb)
 into movs from public.caja_movimientos m left join public.contratos c on c.id=m.contrato_id left join public.profiles u on u.id=m.usuario_id left join public.profiles a on a.id=m.anulado_por
 where m.sede_id=p_sede and m.fecha=p_fecha;
 select jsonb_build_object(
  'ingresos',coalesce(sum(valor) filter (where tipo='ingreso'),0),'egresos',coalesce(sum(valor) filter (where tipo='egreso'),0),
  'ingresos_efectivo',coalesce(sum(valor) filter (where tipo='ingreso' and medio='Efectivo'),0),'egresos_efectivo',coalesce(sum(valor) filter (where tipo='egreso' and medio='Efectivo'),0),
  'por_medio',coalesce((select jsonb_object_agg(medio,jsonb_build_object('ingresos',i,'egresos',e)) from (select medio,sum(valor) filter (where tipo='ingreso') i,sum(valor) filter (where tipo='egreso') e from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null group by medio) x),'{}'::jsonb))
 into tot from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null;
 select to_jsonb(k)||jsonb_build_object('cerrado_por_nombre',(select coalesce(nombre,email) from public.profiles where id=k.cerrado_por)) into cierre
  from public.caja_cierres k where k.sede_id=p_sede and k.fecha=p_fecha and k.reabierto_at is null;
 select coalesce(jsonb_agg(s order by s->>'hora'),'[]'::jsonb) into sug from (
  select jsonb_build_object('origen','pago','origen_id',p.id,'tipo','ingreso','categoria','Pago de contrato','medio',case when p.medio_pago in ('Efectivo','Transferencia','Tarjeta') then p.medio_pago else '' end,
   'valor',p.valor_pagado,'contrato_id',c.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'hora',p.fecha_pago) s
  from public.pagos p join public.contratos c on c.id=p.contrato_id
  where c.sede_id=p_sede and (p.fecha_pago at time zone 'America/Bogota')::date=p_fecha and p.valor_pagado>0
   and not exists(select 1 from public.caja_movimientos x where x.origen='pago' and x.origen_id=p.id and x.anulado_at is null)
  union all
  select jsonb_build_object('origen',case when d.tipo='ingreso' then 'deposito' else 'devolucion' end,'origen_id',d.id,'tipo',case when d.tipo='ingreso' then 'ingreso' else 'egreso' end,
   'categoria',case when d.tipo='ingreso' then 'Depósito en garantía' else 'Devolución de depósito' end,'medio',case when d.metodo in ('Efectivo','Transferencia','Tarjeta','Otro') then d.metodo else '' end,
   'valor',d.monto,'contrato_id',c.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'hora',d.created_at)
  from public.movimientos_depositos d join public.contratos c on c.id=d.contrato_id
  where c.sede_id=p_sede and (d.created_at at time zone 'America/Bogota')::date=p_fecha and d.monto>0
   and not exists(select 1 from public.caja_movimientos x where x.origen in ('deposito','devolucion') and x.origen_id=d.id and x.anulado_at is null)
 ) q;
 return jsonb_build_object('sede_id',p_sede,'fecha',p_fecha,'saldo_inicial',inicial,'movimientos',movs,'totales',tot,'cierre',cierre,'sugerencias',sug,
  'puede_operar',private.caja_operar(p_sede),'es_hoy',p_fecha=private.caja_hoy());
end $$;

create function private.registrar_movimiento_caja(p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare u public.profiles; s uuid:=(p_datos->>'sede_id')::uuid; f date:=(p_datos->>'fecha')::date; t text:=p_datos->>'tipo';
 med text:=p_datos->>'medio'; v numeric:=(p_datos->>'valor')::numeric; cat text:=btrim(coalesce(p_datos->>'categoria',''));
 desc_ text:=btrim(coalesce(p_datos->>'descripcion','')); ori text:=nullif(p_datos->>'origen',''); ori_id uuid:=nullif(p_datos->>'origen_id','')::uuid;
 cid uuid:=nullif(p_datos->>'contrato_id','')::uuid; path text:=nullif(btrim(coalesce(p_datos->>'comprobante_path','')),''); new_id uuid;
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
 if ori is not null then
  if ori='pago' and not exists(select 1 from public.pagos p join public.contratos c on c.id=p.contrato_id where p.id=ori_id and c.sede_id=s) then raise exception 'Pago no encontrado en esta sede.'; end if;
  if ori in ('deposito','devolucion') and not exists(select 1 from public.movimientos_depositos d join public.contratos c on c.id=d.contrato_id where d.id=ori_id and c.sede_id=s and d.tipo=case when ori='deposito' then 'ingreso' else 'devolucion' end) then raise exception 'Movimiento de depósito no encontrado en esta sede.'; end if;
 end if;
 begin
  insert into public.caja_movimientos(sede_id,fecha,tipo,categoria,medio,valor,descripcion,contrato_id,origen,origen_id,comprobante_path,usuario_id)
  values(s,f,t,cat,med,v,desc_,cid,ori,ori_id,path,u.id) returning id into new_id;
 exception when unique_violation then raise exception 'Ese movimiento del ERP ya está en la caja.';
 end;
 return new_id;
end $$;

create function private.anular_movimiento_caja(p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare u public.profiles; m public.caja_movimientos; reason text:=btrim(coalesce(p_motivo,''));
begin
 u:=private.caja_perfil();
 select * into m from public.caja_movimientos where id=p_id for update;
 if not found or u.id is null or not private.caja_operar(m.sede_id) then raise exception 'Movimiento no disponible.' using errcode='42501'; end if;
 if m.anulado_at is not null then raise exception 'El movimiento ya está anulado.'; end if;
 if private.caja_dia_cerrado(m.sede_id,m.fecha) then raise exception 'La caja de ese día ya está cerrada; un administrador debe reabrirla.'; end if;
 if length(reason) not between 5 and 500 then raise exception 'Escribe el motivo de la anulación (mínimo 5 caracteres).'; end if;
 update public.caja_movimientos set anulado_at=now(),anulado_por=u.id,motivo_anulacion=reason where id=p_id;
end $$;

create function private.cerrar_caja(p_sede uuid,p_fecha date,p_contado numeric,p_observaciones text) returns uuid language plpgsql security definer set search_path='' as $$
declare u public.profiles; inicial numeric; ie numeric; ee numeric; esperado numeric; tot jsonb; new_id uuid; obs text:=btrim(coalesce(p_observaciones,''));
begin
 u:=private.caja_perfil();
 if u.id is null or p_sede is null or not private.caja_operar(p_sede) then raise exception 'No puedes cerrar la caja de esta sede.' using errcode='42501'; end if;
 if p_fecha is null or p_fecha>private.caja_hoy() then raise exception 'No se puede cerrar un día futuro.'; end if;
 if p_contado is null or p_contado<0 or p_contado<>round(p_contado,2) then raise exception 'Escribe el efectivo contado.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('caja:'||p_sede::text||':'||p_fecha::text,0));
 if private.caja_dia_cerrado(p_sede,p_fecha) then raise exception 'La caja de ese día ya está cerrada.'; end if;
 inicial:=private.caja_saldo_inicial(p_sede,p_fecha);
 select coalesce(sum(valor) filter (where tipo='ingreso' and medio='Efectivo'),0),coalesce(sum(valor) filter (where tipo='egreso' and medio='Efectivo'),0),
  jsonb_build_object('ingresos',coalesce(sum(valor) filter (where tipo='ingreso'),0),'egresos',coalesce(sum(valor) filter (where tipo='egreso'),0),'movimientos',count(*))
  into ie,ee,tot from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null;
 esperado:=inicial+ie-ee;
 if p_contado<>esperado and length(obs)<5 then raise exception 'Hay diferencia entre lo contado y lo esperado: explica el motivo en observaciones.'; end if;
 insert into public.caja_cierres(sede_id,fecha,saldo_inicial,ingresos_efectivo,egresos_efectivo,esperado,contado,diferencia,totales,observaciones,cerrado_por)
 values(p_sede,p_fecha,inicial,ie,ee,esperado,p_contado,p_contado-esperado,tot,obs,u.id) returning id into new_id;
 return new_id;
end $$;

create function private.reabrir_caja(p_sede uuid,p_fecha date,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare u public.profiles; reason text:=btrim(coalesce(p_motivo,''));
begin
 u:=private.caja_perfil();
 if u.id is null or lower(btrim(u.rol))<>'admin' or not private.caja_ver(p_sede) then raise exception 'Solo un administrador puede reabrir una caja.' using errcode='42501'; end if;
 if length(reason) not between 5 and 500 then raise exception 'Escribe el motivo de la reapertura.'; end if;
 if exists(select 1 from public.caja_cierres where sede_id=p_sede and fecha>p_fecha and reabierto_at is null) then raise exception 'Hay cierres posteriores en esta sede: reabre primero el más reciente.'; end if;
 update public.caja_cierres set reabierto_at=now(),reabierto_por=u.id,motivo_reapertura=reason where sede_id=p_sede and fecha=p_fecha and reabierto_at is null;
 if not found then raise exception 'Ese día no tiene un cierre activo.'; end if;
end $$;

-- All sites at a glance for a date range (only the sites the user may see).
create function private.caja_resumen(p_desde date,p_hasta date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>92 then raise exception 'Selecciona un periodo de hasta 3 meses.'; end if;
 return coalesce((select jsonb_agg(r order by r->>'sede') from (
  select jsonb_build_object('sede_id',s.id,'sede',s.nombre,
   'ingresos',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between p_desde and p_hasta and m.tipo='ingreso' and m.anulado_at is null),0),
   'egresos',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between p_desde and p_hasta and m.tipo='egreso' and m.anulado_at is null),0),
   'ingresos_efectivo',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between p_desde and p_hasta and m.tipo='ingreso' and m.medio='Efectivo' and m.anulado_at is null),0),
   'egresos_efectivo',coalesce((select sum(valor) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between p_desde and p_hasta and m.tipo='egreso' and m.medio='Efectivo' and m.anulado_at is null),0),
   'dias_cerrados',(select count(*) from public.caja_cierres k where k.sede_id=s.id and k.fecha between p_desde and p_hasta and k.reabierto_at is null),
   'diferencia',coalesce((select sum(diferencia) from public.caja_cierres k where k.sede_id=s.id and k.fecha between p_desde and p_hasta and k.reabierto_at is null),0),
   'dias_con_movimientos_sin_cierre',(select count(distinct m.fecha) from public.caja_movimientos m where m.sede_id=s.id and m.fecha between p_desde and p_hasta and m.anulado_at is null and m.fecha<private.caja_hoy() and not private.caja_dia_cerrado(s.id,m.fecha)),
   'saldo_actual',private.caja_saldo_inicial(s.id,p_hasta+1)) r
  from public.sedes s where s.activo is true and private.caja_ver(s.id)) x),'[]'::jsonb);
end $$;

-- Public wrappers (signed-in users only).
create function public.caja_dia(p_sede uuid,p_fecha date) returns jsonb language sql stable security invoker set search_path='' as $$ select private.caja_dia(p_sede,p_fecha); $$;
create function public.caja_resumen(p_desde date,p_hasta date) returns jsonb language sql stable security invoker set search_path='' as $$ select private.caja_resumen(p_desde,p_hasta); $$;
create function public.registrar_movimiento_caja(p_datos jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.registrar_movimiento_caja(p_datos); $$;
create function public.anular_movimiento_caja(p_id uuid,p_motivo text) returns void language sql security invoker set search_path='' as $$ select private.anular_movimiento_caja(p_id,p_motivo); $$;
create function public.cerrar_caja(p_sede uuid,p_fecha date,p_contado numeric,p_observaciones text) returns uuid language sql security invoker set search_path='' as $$ select private.cerrar_caja(p_sede,p_fecha,p_contado,p_observaciones); $$;
create function public.reabrir_caja(p_sede uuid,p_fecha date,p_motivo text) returns void language sql security invoker set search_path='' as $$ select private.reabrir_caja(p_sede,p_fecha,p_motivo); $$;

revoke all on function private.caja_perfil(),private.caja_ver(uuid),private.caja_operar(uuid),private.caja_dia_cerrado(uuid,date),private.caja_hoy(),private.caja_saldo_inicial(uuid,date),
 private.caja_dia(uuid,date),private.registrar_movimiento_caja(jsonb),private.anular_movimiento_caja(uuid,text),private.cerrar_caja(uuid,date,numeric,text),private.reabrir_caja(uuid,date,text),private.caja_resumen(date,date),
 public.caja_dia(uuid,date),public.caja_resumen(date,date),public.registrar_movimiento_caja(jsonb),public.anular_movimiento_caja(uuid,text),public.cerrar_caja(uuid,date,numeric,text),public.reabrir_caja(uuid,date,text) from public,anon;
grant execute on function private.caja_perfil(),private.caja_ver(uuid),private.caja_operar(uuid),private.caja_dia_cerrado(uuid,date),private.caja_hoy(),private.caja_saldo_inicial(uuid,date),
 private.caja_dia(uuid,date),private.registrar_movimiento_caja(jsonb),private.anular_movimiento_caja(uuid,text),private.cerrar_caja(uuid,date,numeric,text),private.reabrir_caja(uuid,date,text),private.caja_resumen(date,date),
 public.caja_dia(uuid,date),public.caja_resumen(date,date),public.registrar_movimiento_caja(jsonb),public.anular_movimiento_caja(uuid,text),public.cerrar_caja(uuid,date,numeric,text),public.reabrir_caja(uuid,date,text) to authenticated;

-- Private receipts bucket: <sede_id>/<fecha>/<id>.<ext>, readable and writable by whoever may see that site's cash.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('comprobantes_caja','comprobantes_caja',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
create function private.caja_sede_de_ruta(p_name text) returns uuid language sql immutable set search_path='' as $$
 select case when split_part(p_name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(p_name,'/',1)::uuid end;
$$;
grant execute on function private.caja_sede_de_ruta(text) to authenticated;
create policy caja_comprobante_leer on storage.objects for select to authenticated
 using (bucket_id='comprobantes_caja' and private.caja_ver(private.caja_sede_de_ruta(name)));
create policy caja_comprobante_subir on storage.objects for insert to authenticated
 with check (bucket_id='comprobantes_caja' and private.caja_operar(private.caja_sede_de_ruta(name)));
-- Contabilidad may now also read (never write) cash receipts.
alter policy contabilidad_solo_comprobantes on storage.objects
 using (((select private.current_profile_role()) is distinct from 'contabilidad') or bucket_id in ('comprobantes_depositos','comprobantes_caja'))
 with check (((select private.current_profile_role()) is distinct from 'contabilidad') or bucket_id='comprobantes_depositos');
alter policy contabilidad_comprobantes_pendientes on storage.objects
 using ((not private.es_contabilidad()) or (bucket_id='comprobantes_depositos' and private.comprobante_contabilidad(name,true)) or bucket_id='comprobantes_caja');
