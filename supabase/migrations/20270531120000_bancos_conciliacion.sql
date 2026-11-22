-- Bancos y conciliación (Finanzas › Bancos y conciliación):
--  · Consignación a banco = traslado de caja a banco: the cash-register expense records the bank account where the cash went in
--    (caja_movimientos.cuenta_destino_id, required for «Consignación a banco»).
--  · Bank statement (extracto) per account: lines uploaded from the bank's CSV; each line is matched automatically with the ERP movement
--    of that account (same value, date ±4 days): cash-register movements with that account, consignaciones into it, deposit
--    movements not in the register and expenses paid from it. What is in the bank and not in the ERP (or the other way) stays pending.
--  · Deposits in custody (what should be in the deposits account) and alert for finished contracts whose deposit was not returned.
-- Only administración/contabilidad. Reversible: drop the functions, tables extracto_lineas/extractos_bancarios and the column
-- cuenta_destino_id; re-apply registrar_movimiento_caja and novedades_contables from their migrations.

alter table public.caja_movimientos add column if not exists cuenta_destino_id uuid references public.cuentas_dinero(id);

create table if not exists public.extractos_bancarios(
 id uuid primary key default gen_random_uuid(),
 cuenta_id uuid not null references public.cuentas_dinero(id),
 archivo text, desde date, hasta date, saldo_final numeric, lineas int not null default 0,
 cargado_por uuid references public.profiles(id), created_at timestamptz not null default now());
create table if not exists public.extracto_lineas(
 id uuid primary key default gen_random_uuid(),
 extracto_id uuid not null references public.extractos_bancarios(id),
 cuenta_id uuid not null references public.cuentas_dinero(id),
 huella text not null,
 fecha date not null, descripcion text, referencia text, valor numeric not null, saldo numeric,
 estado text not null default 'pendiente' check (estado in ('pendiente','conciliada','ignorada')),
 erp_tipo text, erp_id uuid, nota text, conciliado_por uuid references public.profiles(id), conciliado_at timestamptz,
 unique (cuenta_id,huella));
create index if not exists extracto_lineas_cuenta_fecha on public.extracto_lineas(cuenta_id,fecha);
alter table public.extractos_bancarios enable row level security;
alter table public.extracto_lineas enable row level security;
create policy extractos_bancarios_ver on public.extractos_bancarios for select to authenticated using (private.es_finanzas());
create policy extracto_lineas_ver on public.extracto_lineas for select to authenticated using (private.es_finanzas());
grant select on public.extractos_bancarios, public.extracto_lineas to authenticated;
create trigger extracto_lineas_historial after update on public.extracto_lineas for each row execute function private.config_historial();

-- ERP movements of one account (signed: + enters the account, − leaves it).
create or replace function private.cuenta_movimientos_erp(p_cuenta uuid, p_desde date, p_hasta date)
returns table(erp_tipo text, erp_id uuid, fecha date, valor numeric, detalle text)
language sql stable security definer set search_path='' as $$
 select 'caja', m.id, m.fecha, case when m.tipo='ingreso' then m.valor else -m.valor end,
  concat_ws(' · ',m.categoria,s.nombre,nullif(m.descripcion,''))
 from public.caja_movimientos m join public.sedes s on s.id=m.sede_id
 where m.cuenta_id=p_cuenta and m.anulado_at is null and m.fecha between p_desde and p_hasta
 union all
 select 'consignacion', m.id, m.fecha, m.valor, concat_ws(' · ','Consignación desde la caja de '||s.nombre,nullif(m.descripcion,''))
 from public.caja_movimientos m join public.sedes s on s.id=m.sede_id
 where m.cuenta_destino_id=p_cuenta and m.anulado_at is null and m.fecha between p_desde and p_hasta
 union all
 select 'deposito', d.id, d.fecha, case when d.tipo='ingreso' then d.monto else -d.monto end,
  concat_ws(' · ',case when d.tipo='ingreso' then 'Depósito recibido' else 'Devolución de depósito' end,k.numero_contrato)
 from public.movimientos_depositos d join public.contratos k on k.id=d.contrato_id
 where d.cuenta_id=p_cuenta and d.fecha between p_desde and p_hasta
  and not exists(select 1 from public.caja_movimientos z where z.origen in ('deposito','devolucion') and z.origen_id=d.id and z.anulado_at is null)
 union all
 select 'gasto', g.id, g.fecha, -g.valor, concat_ws(' · ',g.categoria,coalesce(s.nombre,'Administración'),nullif(g.beneficiario,''))
 from public.gastos g left join public.sedes s on s.id=g.sede_id
 where g.cuenta_id=p_cuenta and g.anulado_at is null and g.caja_movimiento_id is null and g.fecha between p_desde and p_hasta;
$$;

-- Automatic matching of the pending lines of an account.
create or replace function private.extracto_conciliar(p_cuenta uuid) returns int
language plpgsql security definer set search_path='' as $$
declare l record; e record; n int:=0; usados uuid[]:='{}';
begin
 for l in select * from public.extracto_lineas where cuenta_id=p_cuenta and estado='pendiente' order by fecha, id loop
  select x.* into e from private.cuenta_movimientos_erp(p_cuenta,l.fecha-4,l.fecha+4) x
   where x.valor=l.valor and not (x.erp_id=any(usados))
    and not exists(select 1 from public.extracto_lineas y where y.cuenta_id=p_cuenta and y.erp_id=x.erp_id and y.estado='conciliada')
   order by abs(x.fecha-l.fecha), x.fecha limit 1;
  if found then
   usados:=usados||e.erp_id;
   update public.extracto_lineas set estado='conciliada',erp_tipo=e.erp_tipo,erp_id=e.erp_id,nota='Automática',conciliado_at=now() where id=l.id;
   n:=n+1;
  end if;
 end loop;
 return n;
end $$;

-- Upload: lines already parsed in the browser (fecha, descripcion, referencia, valor signed, saldo, huella = unique fingerprint).
create or replace function private.extracto_cargar(p_cuenta uuid, p_archivo text, p_lineas jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ex uuid; nuevas int; auto int;
begin
 if not private.es_finanzas() then raise exception 'Solo administración o contabilidad cargan extractos.' using errcode='42501'; end if;
 if not exists(select 1 from public.cuentas_dinero where id=p_cuenta and tipo in ('banco','billetera')) then raise exception 'Elige una cuenta de banco o billetera.'; end if;
 if jsonb_typeof(p_lineas)<>'array' or jsonb_array_length(p_lineas)=0 then raise exception 'El archivo no tiene movimientos.'; end if;
 if jsonb_array_length(p_lineas)>5000 then raise exception 'Carga máximo 5.000 movimientos por archivo.'; end if;
 insert into public.extractos_bancarios(cuenta_id,archivo,desde,hasta,saldo_final,cargado_por)
 values(p_cuenta,left(p_archivo,200),(select min((x->>'fecha')::date) from jsonb_array_elements(p_lineas) x),(select max((x->>'fecha')::date) from jsonb_array_elements(p_lineas) x),
  (select (x->>'saldo')::numeric from jsonb_array_elements(p_lineas) with ordinality t(x,i) where x->>'saldo' is not null order by (x->>'fecha')::date desc, i desc limit 1),auth.uid()) returning id into ex;
 insert into public.extracto_lineas(extracto_id,cuenta_id,huella,fecha,descripcion,referencia,valor,saldo)
 select ex,p_cuenta,left(x->>'huella',200),(x->>'fecha')::date,left(x->>'descripcion',300),left(nullif(x->>'referencia',''),100),(x->>'valor')::numeric,nullif(x->>'saldo','')::numeric
 from jsonb_array_elements(p_lineas) x where (x->>'valor')::numeric<>0
 on conflict (cuenta_id,huella) do nothing;
 get diagnostics nuevas=row_count;
 update public.extractos_bancarios set lineas=nuevas where id=ex;
 auto:=private.extracto_conciliar(p_cuenta);
 return jsonb_build_object('nuevas',nuevas,'repetidas',jsonb_array_length(p_lineas)-nuevas,'conciliadas',auto);
end $$;

-- Deposits that should be in custody (paid − returned − retained), all stores.
create or replace function private.depositos_en_custodia() returns numeric
language sql stable security definer set search_path='' as $$
 select coalesce(sum(greatest(private.deposito_pagado(k.id)-coalesce((select sum(d.monto_devuelto+coalesce(d.monto_descuento,0)) from public.devoluciones_depositos d
   where d.contrato_id=k.id and coalesce(lower(d.estado),'completado') not in ('cancelado','anulado','rechazado')),0),0)),0)
 from public.contratos k where lower(coalesce(k.estado,'')) not in ('borrador','anulado','rechazado');
$$;

-- Reconciliation view of one account and period.
create or replace function private.conciliacion_cuenta(p_cuenta uuid, p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare k public.cuentas_dinero;
begin
 if not private.es_finanzas() then raise exception 'Solo administración o contabilidad.' using errcode='42501'; end if;
 select * into k from public.cuentas_dinero where id=p_cuenta;
 if k.id is null then raise exception 'Cuenta no encontrada.'; end if;
 return jsonb_build_object(
  'cuenta',jsonb_build_object('id',k.id,'nombre',k.nombre,'banco',k.banco,'numero',k.numero,'solo_depositos',k.solo_depositos),
  'lineas',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'fecha',l.fecha,'descripcion',l.descripcion,'referencia',l.referencia,'valor',l.valor,'saldo',l.saldo,
     'estado',l.estado,'erp_tipo',l.erp_tipo,'nota',l.nota,'erp_detalle',(select e.detalle from private.cuenta_movimientos_erp(p_cuenta,l.fecha-10,l.fecha+10) e where e.erp_id=l.erp_id limit 1))
    order by l.fecha, l.id) from public.extracto_lineas l where l.cuenta_id=p_cuenta and l.fecha between p_desde and p_hasta),'[]'::jsonb),
  'erp_sin_banco',coalesce((select jsonb_agg(to_jsonb(e) order by e.fecha) from private.cuenta_movimientos_erp(p_cuenta,p_desde,p_hasta) e
    where not exists(select 1 from public.extracto_lineas l where l.cuenta_id=p_cuenta and l.erp_id=e.erp_id and l.estado='conciliada')),'[]'::jsonb),
  'extractos',coalesce((select jsonb_agg(jsonb_build_object('archivo',x.archivo,'desde',x.desde,'hasta',x.hasta,'lineas',x.lineas,'created_at',x.created_at) order by x.created_at desc)
    from public.extractos_bancarios x where x.cuenta_id=p_cuenta),'[]'::jsonb),
  'saldo_extracto',(select l.saldo from public.extracto_lineas l where l.cuenta_id=p_cuenta and l.saldo is not null and l.fecha<=p_hasta order by l.fecha desc, l.id desc limit 1),
  'custodia_depositos',case when k.solo_depositos then private.depositos_en_custodia() end);
end $$;

-- Manual: ignore / reopen a line, or link it to an ERP movement of the same account.
create or replace function private.extracto_linea_marcar(p_linea uuid, p_estado text, p_nota text, p_erp_tipo text default null, p_erp_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare l public.extracto_lineas;
begin
 if not private.es_finanzas() then raise exception 'Solo administración o contabilidad.' using errcode='42501'; end if;
 select * into l from public.extracto_lineas where id=p_linea for update;
 if l.id is null then raise exception 'Movimiento no encontrado.'; end if;
 if p_estado not in ('pendiente','conciliada','ignorada') then raise exception 'Estado no válido.'; end if;
 if p_estado='ignorada' and length(btrim(coalesce(p_nota,'')))<5 then raise exception 'Escribe por qué se ignora (mínimo 5 caracteres).'; end if;
 if p_estado='conciliada' and (p_erp_id is null or not exists(select 1 from private.cuenta_movimientos_erp(l.cuenta_id,l.fecha-60,l.fecha+60) e where e.erp_id=p_erp_id and e.erp_tipo=p_erp_tipo)) then
  raise exception 'Elige un movimiento del ERP de esta misma cuenta.'; end if;
 update public.extracto_lineas set estado=p_estado,erp_tipo=case when p_estado='conciliada' then p_erp_tipo end,erp_id=case when p_estado='conciliada' then p_erp_id end,
  nota=nullif(btrim(coalesce(p_nota,'')),''),conciliado_por=auth.uid(),conciliado_at=now() where id=l.id;
end $$;

revoke all on function private.cuenta_movimientos_erp(uuid,date,date), private.extracto_conciliar(uuid), private.extracto_cargar(uuid,text,jsonb),
 private.depositos_en_custodia(), private.conciliacion_cuenta(uuid,date,date), private.extracto_linea_marcar(uuid,text,text,text,uuid) from public, anon;
grant execute on function private.extracto_cargar(uuid,text,jsonb), private.conciliacion_cuenta(uuid,date,date), private.extracto_linea_marcar(uuid,text,text,text,uuid) to authenticated;
create or replace function public.extracto_cargar(p_cuenta uuid, p_archivo text, p_lineas jsonb) returns jsonb
 language sql set search_path='' as $$ select private.extracto_cargar(p_cuenta,p_archivo,p_lineas); $$;
create or replace function public.conciliacion_cuenta(p_cuenta uuid, p_desde date, p_hasta date) returns jsonb
 language sql stable set search_path='' as $$ select private.conciliacion_cuenta(p_cuenta,p_desde,p_hasta); $$;
create or replace function public.extracto_linea_marcar(p_linea uuid, p_estado text, p_nota text, p_erp_tipo text default null, p_erp_id uuid default null) returns void
 language sql set search_path='' as $$ select private.extracto_linea_marcar(p_linea,p_estado,p_nota,p_erp_tipo,p_erp_id); $$;
revoke all on function public.extracto_cargar(uuid,text,jsonb), public.conciliacion_cuenta(uuid,date,date), public.extracto_linea_marcar(uuid,text,text,text,uuid) from public, anon;
grant execute on function public.extracto_cargar(uuid,text,jsonb), public.conciliacion_cuenta(uuid,date,date), public.extracto_linea_marcar(uuid,text,text,text,uuid) to authenticated;

do $mig$
declare d text; a text;
begin
 -- Consignación a banco: requires and saves the destination bank account.
 d:=pg_get_functiondef('private.registrar_movimiento_caja(jsonb)'::regprocedure);
 a:='cta uuid:=nullif(p_datos->>''cuenta_id'','''')::uuid; ini date;';
 if position(a in d)=0 then raise exception 'registrar_movimiento_caja: punto 1'; end if;
 d:=replace(d,a,a||' dest uuid:=nullif(p_datos->>''cuenta_destino_id'','''')::uuid;');
 a:=E' begin\n  insert into public.caja_movimientos(';
 if position(a in d)=0 then raise exception 'registrar_movimiento_caja: punto 2'; end if;
 d:=replace(d,a,E' if cat=''Consignación a banco'' and (dest is null or not exists(select 1 from public.cuentas_dinero k where k.id=dest and k.activo and k.tipo in (''banco'',''billetera'') and (k.sede_id is null or k.sede_id=s))) then\n  raise exception ''Elige la cuenta del banco donde se consignó.'';\n end if;\n'||a);
 a:='comprobante_path,usuario_id,cuenta_id)';
 if position(a in d)=0 then raise exception 'registrar_movimiento_caja: punto 3'; end if;
 d:=replace(d,a,'comprobante_path,usuario_id,cuenta_id,cuenta_destino_id)');
 a:='case when med=''Efectivo'' then null else cta end) returning id into new_id;';
 if position(a in d)=0 then raise exception 'registrar_movimiento_caja: punto 4'; end if;
 d:=replace(d,a,'case when med=''Efectivo'' then null else cta end,case when cat=''Consignación a banco'' then dest end) returning id into new_id;');
 execute d;

 -- Novedades contables: finished contracts with deposit not returned, and bank movements not in the ERP (after 3 days).
 d:=pg_get_functiondef('public.novedades_contables(uuid)'::regprocedure);
 a:='and not exists(select 1 from public.siigo_historico h where h.contrato_id=k.id and h.tipo=''nota_credito'' and h.fecha>=d.created_at::date);';
 if position(a in d)=0 then raise exception 'novedades_contables: punto'; end if;
 d:=replace(d,a,left(a,length(a)-1)||$n$
 union all
 select 'depfin:'||k.id, 'Depósito sin devolver (contrato finalizado)', s.nombre::text, s.id, k.numero_contrato::text,
  format('%s · en custodia $%s: devuélvelo o registra la retención',coalesce(k.cliente_nombre,''),to_char(x.saldo,'FM999G999G999')),
  '/dashboard/devoluciones-depositos', 'Sede', false, coalesce(k.finalizado_at::date,k.created_at::date)
 from public.contratos k join public.sedes s on s.id=k.sede_id
 cross join lateral (select private.deposito_pagado(k.id)-coalesce((select sum(d2.monto_devuelto+coalesce(d2.monto_descuento,0)) from public.devoluciones_depositos d2
   where d2.contrato_id=k.id and coalesce(lower(d2.estado),'completado') not in ('cancelado','anulado','rechazado')),0) saldo) x
 where k.sede_id=any(sedes) and lower(coalesce(k.estado,''))='finalizado' and x.saldo>0
  and not exists(select 1 from public.solicitudes_depositos q where q.contrato_id=k.id and q.estado in ('pendiente','en_proceso','pagado'))
 union all
 select 'banco:'||l.id, 'Movimiento del banco sin registrar en el ERP', coalesce(s.nombre,'Todas las sedes')::text, s.id, c.nombre::text,
  format('%s · $%s · %s',to_char(l.fecha,'DD/MM/YYYY'),to_char(l.valor,'FM999G999G999'),left(coalesce(l.descripcion,''),120)),
  '/dashboard/bancos', 'Contabilidad', false, l.fecha
 from public.extracto_lineas l join public.cuentas_dinero c on c.id=l.cuenta_id left join public.sedes s on s.id=c.sede_id
 where todo and l.estado='pendiente' and l.fecha<hoy-3;$n$);
 execute d;
end $mig$;

-- Panel «Bancos y conciliación»: administración (always) and contabilidad.
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden) values
 ('panel.bancos','Finanzas','Ver Bancos y conciliación','Extractos bancarios y conciliación con el ERP',false,47)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso) values ('contabilidad','panel.bancos') on conflict do nothing;
