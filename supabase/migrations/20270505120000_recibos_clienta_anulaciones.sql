-- Controles de efectivo:
-- 1) Recibo a la clienta: every contract payment, deposit received or deposit returned that reaches the cash register (caja_movimientos
--    origen pago/deposito/devolucion, today or yesterday) queues a receipt for the customer (WhatsApp template ambar_recibo_pago /
--    ambar_deposito_recibido / ambar_deposito_devuelto, and e-mail when she has one), sent by /api/contratos/recibos. If the store
--    receives money and does not register it, or registers less, the customer notices.
-- 2) Anular un abono: only administración or contabilidad annul a contract payment; anyone else sends a request that they approve or
--    reject (Cierres de caja › Anulaciones por aprobar). The payment stays valid until then.
-- History: private.config_historial(). Reversible: drop the triggers/functions/tables created here and restore public.anular_pago_contrato
-- from private.anular_pago_ejecutar.

create table if not exists public.recibos_clienta(
 id uuid primary key default gen_random_uuid(),
 movimiento_id uuid not null unique references public.caja_movimientos(id) on delete cascade,
 contrato_id uuid references public.contratos(id),
 tipo text not null check (tipo in ('pago','deposito','devolucion')),
 valor numeric(14,2) not null,
 medio text,
 enviado_at timestamptz,
 via text,
 wa_id text,
 error text,
 intentos int not null default 0,
 created_at timestamptz not null default now()
);
alter table public.recibos_clienta enable row level security;
create policy recibos_clienta_ver on public.recibos_clienta for select to authenticated using (public.es_admin() or private.es_finanzas());

create or replace function private.recibo_clienta_encolar() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.origen not in ('pago','deposito','devolucion') or new.contrato_id is null or new.anulado_at is not null or new.fecha<private.caja_hoy()-1 then return new; end if;
 insert into public.recibos_clienta(movimiento_id,contrato_id,tipo,valor,medio) values(new.id,new.contrato_id,new.origen,new.valor,new.medio) on conflict do nothing;
 perform net.http_post(url:='https://erp.ambarcouture.com/api/contratos/recibos',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=20000);
 return new;
exception when others then return new; -- a receipt never blocks the cash register
end $$;
create or replace trigger recibo_clienta_encolar after insert on public.caja_movimientos for each row execute function private.recibo_clienta_encolar();

-- Receipts due (service role, /api/contratos/recibos): claims them and returns what each message needs.
create or replace function public.recibos_clienta_tomar(p_limite int default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Solo el servidor.' using errcode='42501'; end if;
 with t as (update public.recibos_clienta set intentos=intentos+1 where id in (select id from public.recibos_clienta where enviado_at is null and intentos<3 and created_at>now()-interval '2 days'
   order by created_at limit p_limite for update skip locked) returning *)
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'tipo',t.tipo,'valor',t.valor,'medio',t.medio,'contrato',c.numero_contrato,'nombre',c.cliente_nombre,
  'telefono',coalesce(nullif(c.cliente_whatsapp,''),c.whatsapp),'email',c.cliente_email,'sede',s.nombre,
  'saldo',greatest(0,coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0)-coalesce(c.anticipo,0)),'deposito',coalesce(c.valor_deposito,0))),'[]'::jsonb) into r
 from t join public.contratos c on c.id=t.contrato_id left join public.sedes s on s.id=c.sede_id;
 return r;
end $$;
revoke all on function public.recibos_clienta_tomar(int) from public, anon, authenticated;
grant execute on function public.recibos_clienta_tomar(int) to service_role;

-- Pending receipts are retried every 30 minutes.
select cron.schedule('recibos-clienta','*/30 * * * *',$c$
 select net.http_post(url:='https://erp.ambarcouture.com/api/contratos/recibos',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=20000) where exists(select 1 from public.recibos_clienta where enviado_at is null and intentos<3 and created_at>now()-interval '2 days');
$c$);

-- 2) Anulación de abonos con aprobación.
create table if not exists public.anulaciones_pago(
 id uuid primary key default gen_random_uuid(),
 pago_id uuid not null references public.pagos(id),
 motivo text not null,
 estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
 solicitado_por uuid default auth.uid(),
 solicitado_at timestamptz not null default now(),
 resuelto_por uuid,
 resuelto_at timestamptz,
 nota text
);
create unique index if not exists anulaciones_pago_pendiente on public.anulaciones_pago(pago_id) where estado='pendiente';
alter table public.anulaciones_pago enable row level security;
create policy anulaciones_pago_ver on public.anulaciones_pago for select to authenticated using (public.es_admin() or private.es_finanzas() or solicitado_por=auth.uid());
create trigger anulaciones_pago_historial after insert or update or delete on public.anulaciones_pago for each row execute function private.config_historial();

-- The annulment itself (previous body of public.anular_pago_contrato).
do $$
declare d text:=pg_get_functiondef('public.anular_pago_contrato(uuid,text)'::regprocedure);
begin
 d:=replace(d,'FUNCTION public.anular_pago_contrato(','FUNCTION private.anular_pago_ejecutar(');
 execute d;
end $$;

create or replace function public.anular_pago_contrato(p_pago uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pg public.pagos; sede uuid; m text:=btrim(coalesce(p_motivo,''));
begin
 if public.es_admin() or private.es_finanzas() then return private.anular_pago_ejecutar(p_pago,m); end if;
 if length(m)<10 then raise exception 'El motivo es obligatorio (mínimo 10 caracteres).'; end if;
 select * into pg from public.pagos where id=p_pago;
 if pg.id is null then raise exception 'Pago no encontrado.'; end if;
 if pg.anulado_at is not null then raise exception 'El pago ya está anulado.'; end if;
 select sede_id into sede from public.contratos where id=pg.contrato_id;
 if not private.caja_ver(sede) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 if exists(select 1 from public.anulaciones_pago where pago_id=p_pago and estado='pendiente') then
  return jsonb_build_object('ok',false,'solicitud',true,'mensaje','Ya hay una solicitud de anulación pendiente para este abono.'); end if;
 insert into public.anulaciones_pago(pago_id,motivo) values(p_pago,m);
 insert into public.historial_cambios_contrato(contrato_id,usuario_id,motivo,campo,valor_anterior,valor_nuevo) values(pg.contrato_id,auth.uid(),'Solicitud de anulación: '||m,'Pago',pg.valor_pagado,pg.valor_pagado);
 return jsonb_build_object('ok',false,'solicitud',true,'mensaje','Solicitud enviada a administración. El abono sigue vigente hasta que la aprueben.');
end $$;

create or replace function public.anulaciones_pago_pendientes() returns jsonb
language sql stable security definer set search_path='' as $$
 select case when not (public.es_admin() or private.es_finanzas()) then '[]'::jsonb else coalesce((
  select jsonb_agg(jsonb_build_object('id',a.id,'motivo',a.motivo,'solicitado_at',a.solicitado_at,'solicitante',coalesce(u.nombre,u.email),
   'contrato',c.numero_contrato,'cliente',c.cliente_nombre,'sede',s.nombre,'valor',p.valor_pagado,'medio',p.medio_pago,'fecha_pago',private.dia_pago(p.fecha_pago)) order by a.solicitado_at)
  from public.anulaciones_pago a join public.pagos p on p.id=a.pago_id join public.contratos c on c.id=p.contrato_id left join public.sedes s on s.id=c.sede_id
  left join public.profiles u on u.id=a.solicitado_por where a.estado='pendiente'),'[]'::jsonb) end;
$$;

create or replace function public.anulaciones_pago_resolver(p_id uuid, p_aprobar boolean, p_nota text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.anulaciones_pago;
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad.' using errcode='42501'; end if;
 select * into a from public.anulaciones_pago where id=p_id for update;
 if a.id is null or a.estado<>'pendiente' then raise exception 'La solicitud ya fue resuelta.'; end if;
 if p_aprobar then perform private.anular_pago_ejecutar(a.pago_id,left(a.motivo||' · aprobado por administración'||coalesce(' ('||nullif(btrim(p_nota),'')||')',''),500)); end if;
 update public.anulaciones_pago set estado=case when p_aprobar then 'aprobada' else 'rechazada' end,resuelto_por=auth.uid(),resuelto_at=now(),nota=nullif(btrim(coalesce(p_nota,'')),'') where id=p_id;
 return jsonb_build_object('ok',true);
end $$;

revoke all on function public.anulaciones_pago_pendientes(), public.anulaciones_pago_resolver(uuid,boolean,text) from public, anon;
grant execute on function public.anulaciones_pago_pendientes(), public.anulaciones_pago_resolver(uuid,boolean,text) to authenticated;
revoke all on function private.anular_pago_ejecutar(uuid,text) from public, anon, authenticated;
