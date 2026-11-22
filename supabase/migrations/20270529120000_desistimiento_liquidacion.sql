-- Desistimiento con liquidación (cláusula «Condiciones de Reembolso y Desistimiento»): when a client withdraws, the ERP settles it:
-- paid − (value per appointment used × appointments, up to 3: first visit, measurements, final fitting) − alterations already made
-- = what is returned. The return is a cash-register expense «Devolución por desistimiento» (with receipt; not an expense in the Estado
-- de resultados: it reduces income, so what remains is the retention). Alerts (Novedades contables): cancelled contracts with payments
-- and no settlement, returns pending, and the Siigo credit note pending for contabilidad. Value per appointment in Configuración ›
-- Parámetros («desistimiento_valor_cita»). History in config_historial. Contracts, payments and the existing «Desistir» keep working.
-- Reversible: drop the functions and the table public.desistimientos; delete the parameter; re-apply estado_resultados and
-- novedades_contables from their migrations.

insert into public.config_parametros(clave,modulo,etiqueta,tipo,valor,minimo,maximo,orden,ayuda) values
 ('desistimiento_valor_cita','contratos','Valor retenido por cada cita usada cuando la clienta desiste','entero','100000'::jsonb,0,1000000,10,
  'Cláusula de reembolso y desistimiento: se descuenta por cada cita usada (primera vez, medidas, prueba final) más los arreglos hechos.')
on conflict (clave) do nothing;

create table if not exists public.desistimientos(
 id uuid primary key default gen_random_uuid(),
 contrato_id uuid not null unique references public.contratos(id),
 sede_id uuid not null references public.sedes(id),
 motivo text,
 pagado numeric not null,
 citas int not null check (citas between 0 and 3),
 valor_cita numeric not null,
 arreglos numeric not null default 0 check (arreglos>=0),
 retencion numeric not null check (retencion>=0),
 devolver numeric not null check (devolver>=0),
 estado text not null check (estado in ('pendiente','devuelto','sin_devolucion')),
 fecha_devolucion date,
 medio text,
 cuenta_id uuid references public.cuentas_dinero(id),
 comprobante_path text,
 caja_movimiento_id uuid references public.caja_movimientos(id),
 historico boolean not null default false,
 creado_por uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 devuelto_por uuid references public.profiles(id),
 devuelto_at timestamptz
);
alter table public.desistimientos enable row level security;
create policy desistimientos_ver on public.desistimientos for select to authenticated using (private.es_finanzas() or private.caja_ver(sede_id));
grant select on public.desistimientos to authenticated;
create trigger desistimientos_historial after insert or update on public.desistimientos for each row execute function private.config_historial();

-- Settlement preview. Appointments used: the first visit always; measurements and final fitting when their date already passed.
create or replace function private.desistimiento_calculo(p_contrato uuid, p_citas int default null, p_arreglos numeric default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.contratos; pagado numeric; sug int; vc numeric; ci int; arr numeric; ret numeric; hoy date:=(now() at time zone 'America/Bogota')::date;
begin
 select * into c from public.contratos where id=p_contrato;
 if c.id is null or not (private.es_finanzas() or private.caja_ver(c.sede_id)) then raise exception 'Contrato no disponible.' using errcode='42501'; end if;
 select coalesce(sum(valor_pagado),0) into pagado from public.pagos where contrato_id=c.id and anulado_at is null;
 sug:=1+(case when c.fecha_cita_medidas is not null and c.fecha_cita_medidas<=hoy then 1 else 0 end)+(case when c.fecha_prueba_final is not null and c.fecha_prueba_final<=hoy then 1 else 0 end);
 select coalesce((valor#>>'{}')::numeric,100000) into vc from public.config_parametros where clave='desistimiento_valor_cita';
 vc:=coalesce(vc,100000);
 ci:=least(greatest(coalesce(p_citas,sug),0),3);
 arr:=greatest(coalesce(p_arreglos,c.total_arreglos,0),0);
 ret:=least(pagado,ci*vc+arr);
 return jsonb_build_object('contrato',c.numero_contrato,'cliente',c.cliente_nombre,'pagado',pagado,'citas_sugeridas',sug,'citas',ci,'valor_cita',vc,
  'arreglos',arr,'retencion',ret,'devolver',pagado-ret,'cancelado',lower(coalesce(c.estado,'')) in ('cancelado','cancelada','anulado'));
end $$;

-- Withdraw (if still active, through the existing desistir_contrato) and save the settlement.
create or replace function private.desistimiento_registrar(p_contrato uuid, p_motivo text, p_citas int, p_arreglos numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.contratos; l jsonb;
begin
 select * into c from public.contratos where id=p_contrato for update;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if exists(select 1 from public.desistimientos where contrato_id=c.id) then raise exception 'Este contrato ya tiene su liquidación de desistimiento.'; end if;
 if lower(coalesce(c.estado,'')) not in ('cancelado','cancelada','anulado') then
  perform private.desistir_contrato(c.id,p_motivo);
 elsif not (private.es_finanzas() or private.caja_operar(c.sede_id)) then raise exception 'No puedes liquidar desistimientos de esta sede.' using errcode='42501';
 end if;
 l:=private.desistimiento_calculo(c.id,p_citas,p_arreglos);
 insert into public.desistimientos(contrato_id,sede_id,motivo,pagado,citas,valor_cita,arreglos,retencion,devolver,estado,creado_por)
 values(c.id,c.sede_id,nullif(btrim(coalesce(p_motivo,'')),''),(l->>'pagado')::numeric,(l->>'citas')::int,(l->>'valor_cita')::numeric,(l->>'arreglos')::numeric,
  (l->>'retencion')::numeric,(l->>'devolver')::numeric,case when (l->>'devolver')::numeric>0 then 'pendiente' else 'sin_devolucion' end,auth.uid());
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario)
 select c.id,'Liquidación de desistimiento',format('Pagado $%s · retención $%s (%s cita(s) × $%s + arreglos $%s) · a devolver $%s',
   to_char((l->>'pagado')::numeric,'FM999G999G999'),to_char((l->>'retencion')::numeric,'FM999G999G999'),l->>'citas',to_char((l->>'valor_cita')::numeric,'FM999G999G999'),
   to_char((l->>'arreglos')::numeric,'FM999G999G999'),to_char((l->>'devolver')::numeric,'FM999G999G999')),coalesce(p.nombre,p.email)
 from public.profiles p where p.id=auth.uid();
 return l;
end $$;

-- Register the return: a cash-register expense «Devolución por desistimiento» with receipt (same rules as any expense). Returns made
-- before the cash register existed or more than 31 days ago are registered as «histórico» (administración/contabilidad only).
create or replace function private.desistimiento_devolver(p_id uuid, p_fecha date, p_medio text, p_cuenta uuid, p_comprobante text, p_historico boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare d public.desistimientos; c public.contratos; mov uuid;
begin
 select * into d from public.desistimientos where id=p_id for update;
 if d.id is null then raise exception 'Liquidación no encontrada.'; end if;
 if d.estado<>'pendiente' then raise exception 'Esta devolución ya está registrada.'; end if;
 select * into c from public.contratos where id=d.contrato_id;
 if coalesce(p_historico,false) then
  if not private.es_finanzas() then raise exception 'Solo administración o contabilidad registran devoluciones históricas.' using errcode='42501'; end if;
  if p_fecha is null or p_fecha>(now() at time zone 'America/Bogota')::date then raise exception 'Indica la fecha en que se devolvió.'; end if;
 else
  mov:=private.registrar_movimiento_caja(jsonb_build_object('sede_id',d.sede_id,'fecha',p_fecha,'tipo','egreso','categoria','Devolución por desistimiento','medio',p_medio,
   'valor',d.devolver,'descripcion','Devolución por desistimiento '||c.numero_contrato||' · '||coalesce(c.cliente_nombre,''),'contrato_id',d.contrato_id,
   'comprobante_path',p_comprobante,'cuenta_id',p_cuenta));
 end if;
 update public.desistimientos set estado='devuelto',fecha_devolucion=p_fecha,medio=p_medio,cuenta_id=p_cuenta,comprobante_path=nullif(btrim(coalesce(p_comprobante,'')),''),
  caja_movimiento_id=mov,historico=coalesce(p_historico,false),devuelto_por=auth.uid(),devuelto_at=now() where id=d.id;
end $$;

create or replace function private.desistimientos_listar() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x order by x.liquidado, x.fecha desc),'[]'::jsonb) from (
  select k.id contrato_id, k.numero_contrato numero, k.cliente_nombre cliente, s.id sede_id, s.nombre sede, (coalesce((select max(b.created_at) from public.bitacora_contratos b where b.contrato_id=k.id and b.accion='Desistimiento del contrato'),k.created_at) at time zone 'America/Bogota')::date fecha,
   coalesce((select sum(valor_pagado) from public.pagos p where p.contrato_id=k.id and p.anulado_at is null),0) pagado,
   d.id is not null liquidado, d.id, d.citas, d.arreglos, d.retencion, d.devolver, d.estado, d.fecha_devolucion, d.medio, d.historico
  from public.contratos k join public.sedes s on s.id=k.sede_id left join public.desistimientos d on d.contrato_id=k.id
  where lower(coalesce(k.estado,'')) in ('cancelado','cancelada','anulado') and (private.es_finanzas() or private.caja_ver(k.sede_id))
   and (d.id is not null or exists(select 1 from public.pagos p where p.contrato_id=k.id and p.anulado_at is null))) x;
$$;

revoke all on function private.desistimiento_calculo(uuid,int,numeric), private.desistimiento_registrar(uuid,text,int,numeric),
 private.desistimiento_devolver(uuid,date,text,uuid,text,boolean), private.desistimientos_listar() from public, anon;
grant execute on function private.desistimiento_calculo(uuid,int,numeric), private.desistimiento_registrar(uuid,text,int,numeric),
 private.desistimiento_devolver(uuid,date,text,uuid,text,boolean), private.desistimientos_listar() to authenticated;
create or replace function public.desistimiento_calculo(p_contrato uuid, p_citas int default null, p_arreglos numeric default null) returns jsonb
 language sql stable set search_path='' as $$ select private.desistimiento_calculo(p_contrato,p_citas,p_arreglos); $$;
create or replace function public.desistimiento_registrar(p_contrato uuid, p_motivo text, p_citas int, p_arreglos numeric) returns jsonb
 language sql set search_path='' as $$ select private.desistimiento_registrar(p_contrato,p_motivo,p_citas,p_arreglos); $$;
create or replace function public.desistimiento_devolver(p_id uuid, p_fecha date, p_medio text, p_cuenta uuid, p_comprobante text, p_historico boolean default false) returns void
 language sql set search_path='' as $$ select private.desistimiento_devolver(p_id,p_fecha,p_medio,p_cuenta,p_comprobante,p_historico); $$;
create or replace function public.desistimientos_listar() returns jsonb
 language sql stable set search_path='' as $$ select private.desistimientos_listar(); $$;
revoke all on function public.desistimiento_calculo(uuid,int,numeric), public.desistimiento_registrar(uuid,text,int,numeric),
 public.desistimiento_devolver(uuid,date,text,uuid,text,boolean), public.desistimientos_listar() from public, anon;
grant execute on function public.desistimiento_calculo(uuid,int,numeric), public.desistimiento_registrar(uuid,text,int,numeric),
 public.desistimiento_devolver(uuid,date,text,uuid,text,boolean), public.desistimientos_listar() to authenticated;

do $mig$
declare d text; a text; b text;
begin
 -- Siigo matching: cancelled contracts also get their invoices and credit notes (to know if the return was credited).
 d:=pg_get_functiondef('private.siigo_historico_enlazar()'::regprocedure);
 a:='not in (''anulado'',''cancelado'',''cancelada'',''rechazado'')';
 if (length(d)-length(replace(d,a,'')))/length(a)<>2 then raise exception 'siigo_historico_enlazar: punto'; end if;
 execute replace(d,a,'not in (''rechazado'',''borrador'')');

 -- Estado de resultados (ERP): the return reduces income instead of being an expense.
 d:=pg_get_functiondef('private.estado_resultados(date,date)'::regprocedure);
 a:='and m.categoria is distinct from ''Consignación a banco''';
 if (length(d)-length(replace(d,a,'')))/length(a)<>1 then raise exception 'estado_resultados: punto 1'; end if;
 d:=replace(d,a,a||' and m.categoria is distinct from ''Devolución por desistimiento''');
 a:=E'   select g.sede_id,''gasto'',g.categoria,g.valor from public.gastos g';
 if position(a in d)=0 then raise exception 'estado_resultados: punto 2'; end if;
 d:=replace(d,a,E'   select m.sede_id,''ingreso'',''Devoluciones por desistimiento'',-m.valor from public.caja_movimientos m\n    where m.tipo=''egreso'' and m.anulado_at is null and m.fecha between p_desde and p_hasta and m.categoria=''Devolución por desistimiento''\n   union all\n'||a);
 execute d;

 -- Novedades contables: settlements.
 d:=pg_get_functiondef('public.novedades_contables(uuid)'::regprocedure);
 a:='and k.created_at<now()-interval ''24 hours'';';
 if position(a in d)=0 then raise exception 'novedades_contables: punto'; end if;
 b:=$n$and k.created_at<now()-interval '24 hours'
 union all
 select 'desliq:'||k.id, 'Desistimiento sin liquidar', s.nombre::text, s.id, k.numero_contrato::text,
  format('%s · pagó $%s: liquida la devolución según el contrato',coalesce(k.cliente_nombre,''),to_char(p.pagado,'FM999G999G999')),
  '/dashboard/devoluciones-depositos#desistimientos', 'Sede', false, (coalesce((select max(b.created_at) from public.bitacora_contratos b where b.contrato_id=k.id and b.accion='Desistimiento del contrato'),k.created_at) at time zone 'America/Bogota')::date
 from public.contratos k join public.sedes s on s.id=k.sede_id
 cross join lateral (select coalesce(sum(x.valor_pagado),0) pagado from public.pagos x where x.contrato_id=k.id and x.anulado_at is null) p
 where k.sede_id=any(sedes) and lower(coalesce(k.estado,'')) in ('cancelado','cancelada','anulado') and p.pagado>0
  and not exists(select 1 from public.desistimientos d where d.contrato_id=k.id)
 union all
 select 'desdev:'||d.id, 'Devolución por desistimiento pendiente', s.nombre::text, s.id, k.numero_contrato::text,
  format('%s · devolver $%s (retención $%s)',coalesce(k.cliente_nombre,''),to_char(d.devolver,'FM999G999G999'),to_char(d.retencion,'FM999G999G999')),
  '/dashboard/devoluciones-depositos#desistimientos', 'Sede', false, d.created_at::date
 from public.desistimientos d join public.contratos k on k.id=d.contrato_id join public.sedes s on s.id=d.sede_id
 where d.sede_id=any(sedes) and d.estado='pendiente'
 union all
 select 'desnc:'||d.id, 'Nota crédito de desistimiento pendiente', s.nombre::text, s.id, k.numero_contrato::text,
  format('Devuelto $%s el %s: haz la nota crédito en Siigo por lo devuelto (la factura queda por la retención de $%s)',to_char(d.devolver,'FM999G999G999'),to_char(d.fecha_devolucion,'DD/MM/YYYY'),to_char(d.retencion,'FM999G999G999')),
  '/dashboard?contratoId='||k.id, 'Contabilidad', false, d.fecha_devolucion
 from public.desistimientos d join public.contratos k on k.id=d.contrato_id join public.sedes s on s.id=d.sede_id
 where d.sede_id=any(sedes) and d.estado='devuelto' and d.devolver>0
  and (exists(select 1 from public.siigo_documentos x where x.contrato_id=k.id and x.tipo='factura' and x.estado='enviado')
   or exists(select 1 from public.siigo_historico h where h.contrato_id=k.id and h.tipo='factura' and h.total>0))
  and not exists(select 1 from public.siigo_documentos x where x.contrato_id=k.id and x.tipo='nota_credito' and x.estado in ('enviado','pendiente') and x.created_at>=d.created_at)
  and not exists(select 1 from public.siigo_historico h where h.contrato_id=k.id and h.tipo='nota_credito' and h.fecha>=d.created_at::date);$n$;
 execute replace(d,a,b);
end $mig$;
