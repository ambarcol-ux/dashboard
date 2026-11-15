-- Finanzas › Pagos fijos de sede: rent, utilities and other recurring payments per store, editable from the screen.
-- The ERP creates each period's installment; paying it records the expense in Cierres de caja (with its receipt).
-- Pop-up alerts (in the ERP only) for administration, accounting and the franchisee (only their stores); for now only
-- administration turns an alert off. Later, with Siigo connected, the alert will turn off when the expense is recorded.
-- Reversión:
--   select cron.unschedule('pagos-fijos-generar');
--   delete from public.roles_permisos where permiso='panel.pagos_fijos'; delete from public.permisos where codigo='panel.pagos_fijos';
--   drop function public.pagos_fijos_concepto_guardar(jsonb), public.pagos_fijos_concepto_activo(uuid,boolean), public.pagos_fijos_cuota_ajustar(uuid,date,numeric,text),
--    public.pagos_fijos_pagar(uuid,jsonb), public.pagos_fijos_alerta_apagar(uuid), public.pagos_fijos_listar(date,date,uuid), public.pagos_fijos_alertas(), public.pagos_fijos_sede_cuota(uuid),
--    public.pagos_fijos_sedes(), private.pagos_fijos_generar(uuid), private.pagos_fijos_ver(uuid);
--   drop table public.pagos_fijos_cuotas, public.pagos_fijos_conceptos;
--   alter table public.caja_movimientos drop constraint caja_movimientos_origen_check, add constraint caja_movimientos_origen_check check (origen in ('pago','deposito','devolucion'));

create table if not exists public.pagos_fijos_conceptos(
 id uuid primary key default gen_random_uuid(),
 sede_id uuid not null references public.sedes(id),
 nombre text not null check (length(btrim(nombre)) between 2 and 80),
 categoria text not null check (length(btrim(categoria)) between 2 and 60),
 proveedor text check (proveedor is null or length(proveedor)<=120),
 referencia text check (referencia is null or length(referencia)<=120),
 frecuencia text not null default 'mensual' check (frecuencia in ('mensual','bimestral','trimestral','semestral','anual','unica')),
 primer_vencimiento date not null,
 valor numeric not null check (valor>0 and valor<1000000000000),
 valor_fijo boolean not null default true,
 medio text not null default 'Transferencia' check (medio in ('Efectivo','Transferencia','Tarjeta','Otro')),
 cuenta_id uuid references public.cuentas_dinero(id),
 dias_aviso int not null default 5 check (dias_aviso between 0 and 60),
 notas text check (notas is null or length(notas)<=500),
 activo boolean not null default true,
 creado_por uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.pagos_fijos_cuotas(
 id uuid primary key default gen_random_uuid(),
 concepto_id uuid not null references public.pagos_fijos_conceptos(id),
 sede_id uuid not null references public.sedes(id),
 periodo date not null,
 vence date not null,
 valor numeric not null check (valor>0 and valor<1000000000000),
 ajustada boolean not null default false,
 estado text not null default 'pendiente' check (estado in ('pendiente','pagada','anulada')),
 pagada_fecha date,
 valor_pagado numeric,
 caja_movimiento_id uuid references public.caja_movimientos(id),
 pagado_por uuid references public.profiles(id) on delete set null,
 nota text check (nota is null or length(nota)<=300),
 alerta_apagada_at timestamptz,
 alerta_apagada_por uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists pagos_fijos_cuotas_periodo on public.pagos_fijos_cuotas(concepto_id,periodo) where estado<>'anulada';
create index if not exists pagos_fijos_cuotas_vence on public.pagos_fijos_cuotas(vence) where estado<>'anulada';
create trigger pagos_fijos_conceptos_historial after insert or update or delete on public.pagos_fijos_conceptos for each row execute function private.config_historial();
create trigger pagos_fijos_cuotas_historial after insert or update or delete on public.pagos_fijos_cuotas for each row execute function private.config_historial();

-- Payments recorded in Cierres de caja carry origin «pago_fijo» (one expense per installment).
alter table public.caja_movimientos drop constraint caja_movimientos_origen_check,
 add constraint caja_movimientos_origen_check check (origen in ('pago','deposito','devolucion','pago_fijo'));

insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden)
values ('panel.pagos_fijos','Finanzas','Ver y gestionar pagos fijos de sede','Arriendos, servicios públicos y otros pagos fijos de sus sedes, con alertas de vencimiento',false,42)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso) values ('contabilidad','panel.pagos_fijos'),('franquiciado','panel.pagos_fijos') on conflict do nothing;

-- Who sees a store's fixed payments: administration, or the panel permission for one of their stores
-- (accounting sees every store; the franchisee only the stores assigned to them).
create or replace function private.pagos_fijos_ver(p_sede uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.es_admin() or (private.tiene_permiso('panel.pagos_fijos') and p_sede=any(private.sedes_usuario(auth.uid()))));
$$;

alter table public.pagos_fijos_conceptos enable row level security;
alter table public.pagos_fijos_cuotas enable row level security;
create policy pagos_fijos_conceptos_ver on public.pagos_fijos_conceptos for select to authenticated using (private.pagos_fijos_ver(sede_id));
create policy pagos_fijos_cuotas_ver on public.pagos_fijos_cuotas for select to authenticated using (private.pagos_fijos_ver(sede_id));
revoke insert,update,delete on public.pagos_fijos_conceptos, public.pagos_fijos_cuotas from anon, authenticated;

-- Creates the installments of the active concepts up to 2 months ahead (from last month on, never older ones).
create or replace function private.pagos_fijos_generar(p_concepto uuid default null) returns int
language plpgsql security definer set search_path='' as $$
declare c public.pagos_fijos_conceptos; paso int; p date; hasta date; desde date; n int:=0; m int; dia int; hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 hasta:=hoy+62; desde:=(date_trunc('month',hoy)-interval '1 month')::date;
 for c in select * from public.pagos_fijos_conceptos where activo and (p_concepto is null or id=p_concepto) loop
  dia:=extract(day from c.primer_vencimiento)::int;
  if c.frecuencia='unica' then
   insert into public.pagos_fijos_cuotas(concepto_id,sede_id,periodo,vence,valor)
   values(c.id,c.sede_id,date_trunc('month',c.primer_vencimiento)::date,c.primer_vencimiento,c.valor) on conflict do nothing;
   get diagnostics m=row_count; n:=n+m; continue;
  end if;
  paso:=case c.frecuencia when 'mensual' then 1 when 'bimestral' then 2 when 'trimestral' then 3 when 'semestral' then 6 else 12 end;
  p:=date_trunc('month',c.primer_vencimiento)::date;
  while p<desde loop p:=(p+make_interval(months=>paso))::date; end loop;
  while p<=hasta loop
   insert into public.pagos_fijos_cuotas(concepto_id,sede_id,periodo,vence,valor)
   values(c.id,c.sede_id,p,p+least(dia,extract(day from (p+interval '1 month'-interval '1 day'))::int)-1,c.valor) on conflict do nothing;
   get diagnostics m=row_count; n:=n+m;
   p:=(p+make_interval(months=>paso))::date;
  end loop;
 end loop;
 return n;
end $$;
revoke all on function private.pagos_fijos_generar(uuid) from public, anon, authenticated;

-- Creates or edits a concept. Pending installments not adjusted by hand are recalculated with the new data.
create or replace function public.pagos_fijos_concepto_guardar(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=nullif(p->>'id','')::uuid; s uuid:=(p->>'sede_id')::uuid; hoy date:=(now() at time zone 'America/Bogota')::date; cta uuid:=nullif(p->>'cuenta_id','')::uuid;
begin
 if s is null or not private.pagos_fijos_ver(s) then raise exception 'No tienes acceso a los pagos fijos de esta sede.' using errcode='42501'; end if;
 if v_id is not null and not exists(select 1 from public.pagos_fijos_conceptos where id=v_id and private.pagos_fijos_ver(sede_id)) then raise exception 'Concepto no encontrado.'; end if;
 if nullif(p->>'primer_vencimiento','') is null then raise exception 'Indica la fecha del primer vencimiento.'; end if;
 if cta is not null and not exists(select 1 from public.cuentas_dinero where id=cta and (sede_id is null or sede_id=s)) then raise exception 'La cuenta no es de esta sede.'; end if;
 if v_id is null then
  insert into public.pagos_fijos_conceptos(sede_id,nombre,categoria,proveedor,referencia,frecuencia,primer_vencimiento,valor,valor_fijo,medio,cuenta_id,dias_aviso,notas,creado_por)
  values(s,btrim(p->>'nombre'),btrim(p->>'categoria'),nullif(btrim(p->>'proveedor'),''),nullif(btrim(p->>'referencia'),''),coalesce(p->>'frecuencia','mensual'),(p->>'primer_vencimiento')::date,
   (p->>'valor')::numeric,coalesce((p->>'valor_fijo')::boolean,true),coalesce(p->>'medio','Transferencia'),cta,coalesce((p->>'dias_aviso')::int,5),nullif(btrim(p->>'notas'),''),auth.uid())
  returning id into v_id;
 else
  update public.pagos_fijos_conceptos set sede_id=s,nombre=btrim(p->>'nombre'),categoria=btrim(p->>'categoria'),proveedor=nullif(btrim(p->>'proveedor'),''),referencia=nullif(btrim(p->>'referencia'),''),
   frecuencia=coalesce(p->>'frecuencia','mensual'),primer_vencimiento=(p->>'primer_vencimiento')::date,valor=(p->>'valor')::numeric,valor_fijo=coalesce((p->>'valor_fijo')::boolean,true),
   medio=coalesce(p->>'medio','Transferencia'),cuenta_id=cta,dias_aviso=coalesce((p->>'dias_aviso')::int,5),notas=nullif(btrim(p->>'notas'),''),updated_at=now()
  where id=v_id;
  update public.pagos_fijos_cuotas set estado='anulada',nota=coalesce(nota,'Recalculada al editar el concepto'),updated_at=now()
  where concepto_id=v_id and estado='pendiente' and not ajustada and vence>=hoy;
 end if;
 perform private.pagos_fijos_generar(v_id);
 return v_id;
end $$;

-- Pauses (and cancels its pending future installments) or reactivates a concept. Nothing is deleted.
create or replace function public.pagos_fijos_concepto_activo(p_id uuid,p_activo boolean) returns void
language plpgsql security definer set search_path='' as $$
declare hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 if not exists(select 1 from public.pagos_fijos_conceptos where id=p_id and private.pagos_fijos_ver(sede_id)) then raise exception 'Concepto no encontrado.' using errcode='42501'; end if;
 update public.pagos_fijos_conceptos set activo=p_activo,updated_at=now() where id=p_id;
 if p_activo then perform private.pagos_fijos_generar(p_id);
 else update public.pagos_fijos_cuotas set estado='anulada',nota=coalesce(nota,'Concepto pausado'),updated_at=now() where concepto_id=p_id and estado='pendiente' and vence>=hoy;
 end if;
end $$;

-- Moves the date or changes the amount of one installment (the concept stays as it is).
create or replace function public.pagos_fijos_cuota_ajustar(p_id uuid,p_vence date,p_valor numeric,p_nota text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.pagos_fijos_cuotas where id=p_id and estado='pendiente' and private.pagos_fijos_ver(sede_id)) then raise exception 'Solo se ajustan cuotas pendientes de tus sedes.' using errcode='42501'; end if;
 if p_vence is null or p_valor is null or p_valor<=0 then raise exception 'Revisa la fecha y el valor.'; end if;
 update public.pagos_fijos_cuotas set vence=p_vence,valor=p_valor,ajustada=true,nota=nullif(left(btrim(coalesce(p_nota,'')),300),''),updated_at=now() where id=p_id;
end $$;

-- Store of an installment (the server uses it before creating the receipt upload link).
create or replace function public.pagos_fijos_sede_cuota(p_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select sede_id from public.pagos_fijos_cuotas where id=p_id and private.pagos_fijos_ver(sede_id);
$$;

-- Pays an installment: records the expense in Cierres de caja (same rules as any expense: receipt, date, open day) and marks it paid.
create or replace function public.pagos_fijos_pagar(p_id uuid,p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare q public.pagos_fijos_cuotas; c public.pagos_fijos_conceptos; mov uuid;
begin
 select * into q from public.pagos_fijos_cuotas where id=p_id for update;
 if q.id is null or not private.pagos_fijos_ver(q.sede_id) then raise exception 'Cuota no encontrada.' using errcode='42501'; end if;
 if q.estado<>'pendiente' then raise exception 'Esta cuota ya está pagada o anulada.'; end if;
 select * into c from public.pagos_fijos_conceptos where id=q.concepto_id;
 mov:=private.registrar_movimiento_caja(jsonb_build_object('sede_id',q.sede_id,'fecha',p->>'fecha','tipo','egreso','categoria',c.categoria,'medio',p->>'medio',
  'valor',p->>'valor','descripcion',left(c.nombre||coalesce(' · '||c.proveedor,'')||coalesce(' · ref. '||c.referencia,'')||' · vence '||to_char(q.vence,'DD/MM/YYYY'),500),
  'origen','pago_fijo','origen_id',q.id,'comprobante_path',p->>'comprobante_path','cuenta_id',p->>'cuenta_id'));
 update public.pagos_fijos_cuotas set estado='pagada',pagada_fecha=(p->>'fecha')::date,valor_pagado=(p->>'valor')::numeric,caja_movimiento_id=mov,pagado_por=auth.uid(),updated_at=now() where id=p_id;
 return mov;
end $$;

-- For now only administration turns an alert off.
create or replace function public.pagos_fijos_alerta_apagar(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración apaga las alertas de pagos.' using errcode='42501'; end if;
 update public.pagos_fijos_cuotas set alerta_apagada_at=now(),alerta_apagada_por=auth.uid(),updated_at=now() where id=p_id;
end $$;

-- Calendar and lists: installments between two dates, with concept and store.
create or replace function public.pagos_fijos_listar(p_desde date,p_hasta date,p_sede uuid default null)
returns table(id uuid,concepto_id uuid,concepto text,categoria text,proveedor text,referencia text,sede_id uuid,sede text,vence date,valor numeric,estado text,ajustada boolean,
 pagada_fecha date,valor_pagado numeric,nota text,alerta_apagada boolean,medio text,cuenta_id uuid,dias_aviso int)
language sql stable security definer set search_path='' as $$
 select q.id,c.id,c.nombre,c.categoria,c.proveedor,c.referencia,q.sede_id,s.nombre::text,q.vence,q.valor,q.estado,q.ajustada,q.pagada_fecha,q.valor_pagado,q.nota,q.alerta_apagada_at is not null,c.medio,c.cuenta_id,c.dias_aviso
 from public.pagos_fijos_cuotas q join public.pagos_fijos_conceptos c on c.id=q.concepto_id join public.sedes s on s.id=q.sede_id
 where q.estado<>'anulada' and q.vence between p_desde and p_hasta and (p_sede is null or q.sede_id=p_sede) and private.pagos_fijos_ver(q.sede_id)
 order by q.vence,s.nombre,c.nombre;
$$;

-- Pop-up: installments due within their notice days or overdue, and paid ones not yet turned off, whose alert is still on.
create or replace function public.pagos_fijos_alertas()
returns table(id uuid,concepto text,sede text,vence date,valor numeric,estado text,dias int)
language sql stable security definer set search_path='' as $$
 select q.id,c.nombre,s.nombre::text,q.vence,coalesce(q.valor_pagado,q.valor),q.estado,(q.vence-(now() at time zone 'America/Bogota')::date)::int
 from public.pagos_fijos_cuotas q join public.pagos_fijos_conceptos c on c.id=q.concepto_id join public.sedes s on s.id=q.sede_id
 where q.alerta_apagada_at is null and private.pagos_fijos_ver(q.sede_id)
  and ((q.estado='pendiente' and q.vence<=(now() at time zone 'America/Bogota')::date+c.dias_aviso) or q.estado='pagada')
 order by (q.estado='pendiente') desc,q.vence;
$$;

revoke all on function public.pagos_fijos_concepto_guardar(jsonb), public.pagos_fijos_concepto_activo(uuid,boolean), public.pagos_fijos_cuota_ajustar(uuid,date,numeric,text),
 public.pagos_fijos_pagar(uuid,jsonb), public.pagos_fijos_alerta_apagar(uuid), public.pagos_fijos_listar(date,date,uuid), public.pagos_fijos_alertas(), public.pagos_fijos_sede_cuota(uuid) from public, anon;
grant execute on function public.pagos_fijos_concepto_guardar(jsonb), public.pagos_fijos_concepto_activo(uuid,boolean), public.pagos_fijos_cuota_ajustar(uuid,date,numeric,text),
 public.pagos_fijos_pagar(uuid,jsonb), public.pagos_fijos_alerta_apagar(uuid), public.pagos_fijos_listar(date,date,uuid), public.pagos_fijos_alertas(), public.pagos_fijos_sede_cuota(uuid) to authenticated;
revoke all on function private.pagos_fijos_ver(uuid) from public, anon;
grant execute on function private.pagos_fijos_ver(uuid) to authenticated;

-- Daily 5:15 a. m. Bogotá: creates the coming installments.
select cron.schedule('pagos-fijos-generar','15 10 * * *',$c$ select private.pagos_fijos_generar(); $c$);

-- Stores the person can manage (accounting cannot read the sedes table directly).
create or replace function public.pagos_fijos_sedes() returns table(id uuid,nombre text)
language sql stable security definer set search_path='' as $$
 select s.id,s.nombre::text from public.sedes s where private.pagos_fijos_ver(s.id) order by s.nombre;
$$;
revoke all on function public.pagos_fijos_sedes() from public, anon;
grant execute on function public.pagos_fijos_sedes() to authenticated;
