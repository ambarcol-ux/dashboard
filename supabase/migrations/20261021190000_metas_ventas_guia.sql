-- Guía Metas y Ventas (20/10/2026): días operativos, meta diaria y meta de hoy, historial de cambios de metas,
-- solo el Administrador edita, cada sede ve solo lo suyo (filtrado en el servidor) y panel historial de
-- cartera con alertas a 30, 90 y 120 días.
alter table public.metas add column if not exists dias_operativos integer check (dias_operativos between 1 and 31),
 add column if not exists automatica boolean not null default false,
 add column if not exists creado_por uuid references public.profiles(id);

create table public.historial_metas (
 id bigint generated always as identity primary key,
 meta_id uuid, tipo text, sede_id uuid references public.sedes(id), nombre_objetivo text, mes integer, anio integer,
 valor_anterior numeric, valor_nuevo numeric, dias_anterior integer, dias_nuevo integer,
 accion text not null, usuario uuid references public.profiles(id), fecha_hora timestamptz not null default now()
);
alter table public.historial_metas enable row level security;
revoke all on public.historial_metas from public,anon,authenticated;
grant select on public.historial_metas to authenticated;
create policy historial_metas_admin on public.historial_metas for select to authenticated using ((select public.es_admin()));

create function private.registrar_historial_meta() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.monto_meta is not distinct from old.monto_meta and new.dias_operativos is not distinct from old.dias_operativos then return new; end if;
 insert into public.historial_metas(meta_id,tipo,sede_id,nombre_objetivo,mes,anio,valor_anterior,valor_nuevo,dias_anterior,dias_nuevo,accion,usuario)
 values(coalesce(new.id,old.id),coalesce(new.tipo,old.tipo),case when coalesce(new.tipo,old.tipo)='sede' then coalesce(new.identificador_id,old.identificador_id) end,coalesce(new.nombre_objetivo,old.nombre_objetivo),
  coalesce(new.mes,old.mes),coalesce(new.anio,old.anio),case when tg_op<>'INSERT' then old.monto_meta end,case when tg_op<>'DELETE' then new.monto_meta end,
  case when tg_op<>'INSERT' then old.dias_operativos end,case when tg_op<>'DELETE' then new.dias_operativos end,
  case when tg_op='INSERT' and new.automatica then 'creada automáticamente' else lower(tg_op) end,auth.uid());
 return coalesce(new,old);
end $$;
create trigger metas_historial after insert or update or delete on public.metas for each row execute function private.registrar_historial_meta();

-- Solo el Administrador crea, cambia o borra metas (bloqueo en servidor).
create policy metas_solo_admin_insert on public.metas as restrictive for insert to authenticated with check ((select public.es_admin()));
create policy metas_solo_admin_update on public.metas as restrictive for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy metas_solo_admin_delete on public.metas as restrictive for delete to authenticated using ((select public.es_admin()));

-- Sede de la que puede ver datos el usuario: null = todas (Administrador y Contabilidad).
create function private.metas_sede_usuario() returns uuid language sql stable security definer set search_path='' as $$
 select case when public.es_admin() or private.es_contabilidad() then null
  else coalesce(private.sede_operativa_limitada(),(select p.sede_id from public.profiles p where p.id=auth.uid()),'00000000-0000-0000-0000-000000000000'::uuid) end;
$$;
create policy metas_por_sede on public.metas as restrictive for select to authenticated using (
 (select private.metas_sede_usuario()) is null
 or (tipo='sede' and (identificador_id=(select private.metas_sede_usuario()) or private.norm_nombre(nombre_objetivo)=(select private.norm_nombre(s.nombre) from public.sedes s where s.id=(select private.metas_sede_usuario()))))
 or (tipo='asesora' and exists(select 1 from public.asesoras a where a.sede_id=(select private.metas_sede_usuario()) and private.norm_nombre(a.nombre_completo)=private.norm_nombre(nombre_objetivo))));

-- Días operativos: lunes a sábado menos festivos de Colombia.
create function private.dias_operativos(p_desde date,p_hasta date) returns integer language sql stable security definer set search_path='' as $$
 select count(*)::int from generate_series(p_desde,p_hasta,interval '1 day') d where extract(isodow from d)<>7 and not private.festivo_colombia(d::date);
$$;

-- Si llega un mes sin meta, se copia la del mes anterior de esa sede (o $50.000.000 si no hay).
create or replace function private.asegurar_metas_sede(p_desde date,p_hasta date) returns integer language plpgsql security definer set search_path='' as $$
declare m date; n integer:=0; k integer;
begin
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta>p_desde+interval '24 months' then raise exception 'Rango de meses no válido.'; end if;
 perform pg_advisory_xact_lock(hashtext('metas_sede_automaticas'));
 m:=date_trunc('month',p_desde)::date;
 while m<=p_hasta loop
  insert into public.metas(tipo,identificador_id,nombre_objetivo,monto_meta,mes,anio,automatica)
  select 'sede',s.id,s.nombre,coalesce((select x.monto_meta from public.metas x where x.tipo='sede' and make_date(x.anio,x.mes,1)<m
    and (x.identificador_id=s.id or private.norm_nombre(x.nombre_objetivo)=private.norm_nombre(s.nombre)) order by x.anio desc,x.mes desc limit 1),50000000),
   extract(month from m)::int,extract(year from m)::int,true from public.sedes s
  where coalesce(s.activo,true) and not exists(select 1 from public.metas x where x.tipo='sede' and x.mes=extract(month from m)::int and x.anio=extract(year from m)::int
   and (x.identificador_id=s.id or private.norm_nombre(x.nombre_objetivo)=private.norm_nombre(s.nombre)));
  get diagnostics k=row_count; n:=n+k;
  m:=(m+interval '1 month')::date;
 end loop;
 return n;
end $$;

-- Tarjetas por sede: meta, días operativos, meta diaria base, vendido, cumplimiento y meta de hoy.
create function private.metas_panel(p_sede uuid,p_mes integer,p_anio integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare limite uuid:=private.metas_sede_usuario(); ini date:=make_date(p_anio,p_mes,1); fin date; hoy date:=(now() at time zone 'America/Bogota')::date; ref date;
begin
 if auth.uid() is null or private.prov_rol() in ('','proveedor') then raise exception 'No autorizado.' using errcode='42501'; end if;
 fin:=(ini+interval '1 month -1 day')::date;
 ref:=least(greatest(hoy,ini),fin+1);
 return coalesce((select jsonb_agg(x order by x->>'sede') from (
  select jsonb_build_object('sede_id',s.id,'sede',s.nombre,'meta_id',m.id,'meta',m.monto_meta,'automatica',coalesce(m.automatica,false),
   'dias_operativos',coalesce(m.dias_operativos,private.dias_operativos(ini,fin)),'dias_calculados',private.dias_operativos(ini,fin),
   'dias_restantes',case when ref>fin then 0 else private.dias_operativos(ref,fin) end,
   'vendido',v.total,'vendido_hasta_ayer',v.hasta_ayer,'contratos',v.n,'recaudado_mes',(select coalesce(sum(p.valor_pagado),0) from public.pagos p join public.contratos c on c.id=p.contrato_id
     where c.sede_id=s.id and (p.fecha_pago at time zone 'UTC')::date between ini and fin and lower(coalesce(c.estado,'')) not in ('cancelado','anulado','borrador','rechazado'))) x
  from public.sedes s
  left join lateral (select * from public.metas x where x.tipo='sede' and x.mes=p_mes and x.anio=p_anio and (x.identificador_id=s.id or private.norm_nombre(x.nombre_objetivo)=private.norm_nombre(s.nombre)) order by x.identificador_id nulls last limit 1) m on true
  cross join lateral (select coalesce(sum(c.valor_total),0) total,coalesce(sum(c.valor_total) filter (where (c.created_at at time zone 'America/Bogota')::date<ref),0) hasta_ayer,count(*) n
   from public.contratos c where c.sede_id=s.id and (c.created_at at time zone 'America/Bogota')::date between ini and fin and lower(coalesce(c.estado,'')) not in ('cancelado','anulado','borrador','rechazado')) v
  where coalesce(s.activo,true) and (limite is null or s.id=limite) and (p_sede is null or s.id=p_sede)) t(x)),'[]'::jsonb);
end $$;
create function public.metas_panel(p_sede uuid,p_mes integer,p_anio integer) returns jsonb language sql stable security invoker set search_path='' as $$ select private.metas_panel(p_sede,p_mes,p_anio); $$;

-- Panel historial: contratos con valor, recaudado, saldo, soporte y días desde la factura (o el contrato).
create function private.cartera_contratos(p_sede uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare limite uuid:=private.metas_sede_usuario(); hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if auth.uid() is null or private.prov_rol() in ('','proveedor') then raise exception 'No autorizado.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(r order by (r->>'saldo')::numeric>0 desc,(r->>'dias')::int desc) from (
  select jsonb_build_object('id',c.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'sede_id',c.sede_id,'sede',s.nombre,
   'fecha',(c.created_at at time zone 'America/Bogota')::date,'factura',nullif(btrim(c.numero_factura),''),
   'recibo',(select p.numero_recibo from public.pagos p where p.contrato_id=c.id and nullif(btrim(p.numero_recibo),'') is not null order by p.fecha_pago desc limit 1),
   'valor',coalesce(c.valor_total,0),'saldo',greatest(coalesce(c.saldo,0),0),'recaudado',coalesce(c.valor_total,0)-greatest(coalesce(c.saldo,0),0),
   'dias',hoy-coalesce((c.factura_registrada_at at time zone 'America/Bogota')::date,(c.created_at at time zone 'America/Bogota')::date),'estado',c.estado) r
  from public.contratos c left join public.sedes s on s.id=c.sede_id
  where lower(coalesce(c.estado,'')) not in ('cancelado','anulado','borrador','rechazado')
   and (limite is null or c.sede_id=limite) and (p_sede is null or c.sede_id=p_sede)
   and (coalesce(c.saldo,0)>0 or c.created_at>=now()-interval '120 days')) t(r)),'[]'::jsonb);
end $$;
create function public.cartera_contratos(p_sede uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.cartera_contratos(p_sede); $$;

-- Guardar metas del mes (solo Administrador) y copiarlas al mes siguiente.
create function private.guardar_metas_sede(p_mes integer,p_anio integer,p_items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare it jsonb; s public.sedes; monto numeric; dias integer; n integer:=0; existente uuid;
begin
 if not public.es_admin() then raise exception 'Solo el Administrador puede cambiar metas.' using errcode='42501'; end if;
 if p_mes not between 1 and 12 or p_anio not between 2024 and 2100 or jsonb_typeof(p_items)<>'array' then raise exception 'Datos no válidos.'; end if;
 for it in select * from jsonb_array_elements(p_items) loop
  select * into s from public.sedes where id=(it->>'sede_id')::uuid;
  if s.id is null then raise exception 'Sede no encontrada.'; end if;
  monto:=nullif(it->>'meta','')::numeric; dias:=nullif(it->>'dias_operativos','')::integer;
  if monto is null or monto<=0 or monto>=1e12 then raise exception 'Revisa la meta de %.',s.nombre; end if;
  if dias is not null and dias not between 1 and 31 then raise exception 'Revisa los días operativos de %.',s.nombre; end if;
  select x.id into existente from public.metas x where x.tipo='sede' and x.mes=p_mes and x.anio=p_anio and (x.identificador_id=s.id or private.norm_nombre(x.nombre_objetivo)=private.norm_nombre(s.nombre)) order by x.identificador_id nulls last limit 1;
  if existente is null then
   insert into public.metas(tipo,identificador_id,nombre_objetivo,monto_meta,mes,anio,dias_operativos,creado_por) values('sede',s.id,s.nombre,monto,p_mes,p_anio,dias,auth.uid());
  else
   update public.metas set monto_meta=monto,dias_operativos=dias,identificador_id=s.id,automatica=false where id=existente;
  end if;
  n:=n+1;
 end loop;
 return n;
end $$;
create function public.guardar_metas_sede(p_mes integer,p_anio integer,p_items jsonb) returns integer language sql security invoker set search_path='' as $$ select private.guardar_metas_sede(p_mes,p_anio,p_items); $$;

revoke all on function private.metas_sede_usuario(),private.dias_operativos(date,date),private.metas_panel(uuid,integer,integer),private.cartera_contratos(uuid),private.guardar_metas_sede(integer,integer,jsonb),
 public.metas_panel(uuid,integer,integer),public.cartera_contratos(uuid),public.guardar_metas_sede(integer,integer,jsonb) from public,anon;
grant execute on function private.metas_sede_usuario(),private.dias_operativos(date,date),private.metas_panel(uuid,integer,integer),private.cartera_contratos(uuid),private.guardar_metas_sede(integer,integer,jsonb),
 public.metas_panel(uuid,integer,integer),public.cartera_contratos(uuid),public.guardar_metas_sede(integer,integer,jsonb) to authenticated;
