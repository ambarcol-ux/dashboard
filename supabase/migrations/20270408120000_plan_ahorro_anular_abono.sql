-- Plan Ahorro XV: anular un abono mal registrado. The payment stays (marked «anulado» with reason), its income in Cierres de caja is
-- annulled too (same rule as any cash movement: the day must be open), and it no longer counts in what the family saved, the level,
-- the extra or the reminders. Annulling the income directly in Cierres de caja also annuls the payment. Each change is in the history.
-- Reversible: drop plan_ahorro_anular_pago and plan_ahorro_pagos_listar; restore planes_ahorro_listar, planes_ahorro_avisos_tomar and
--   private.anular_movimiento_caja from their previous migrations; drop the three anulado columns of planes_ahorro_pagos.

alter table public.planes_ahorro_pagos
 add column if not exists anulado_at timestamptz,
 add column if not exists anulado_por uuid references public.profiles(id),
 add column if not exists motivo_anulacion text;

-- Payments of a plan (with the annulled ones) for its card.
create or replace function public.plan_ahorro_pagos_listar(p_plan uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'fecha',g.fecha,'valor',g.valor,'medio',g.medio,'nota',g.nota,'registrado_por',coalesce(u.nombre,u.email),
   'anulado',g.anulado_at is not null,'motivo_anulacion',g.motivo_anulacion) order by g.fecha desc,g.created_at desc),'[]'::jsonb)
 from public.planes_ahorro_pagos g join public.planes_ahorro p on p.id=g.plan_id left join public.profiles u on u.id=g.registrado_por
 where g.plan_id=p_plan and (public.es_admin() or private.caja_operar(p.sede_id));
$$;

create or replace function public.plan_ahorro_anular_pago(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare g public.planes_ahorro_pagos; pl public.planes_ahorro; reason text:=btrim(coalesce(p_motivo,''));
begin
 select * into g from public.planes_ahorro_pagos where id=p_id for update;
 if g.id is null then raise exception 'Abono no encontrado.'; end if;
 select * into pl from public.planes_ahorro where id=g.plan_id for update;
 if not (public.es_admin() or private.caja_operar(pl.sede_id)) then raise exception 'No puedes anular abonos de esta sede.' using errcode='42501'; end if;
 if g.anulado_at is not null then raise exception 'Este abono ya está anulado.'; end if;
 if pl.estado<>'activo' then raise exception 'El plan ya está cerrado: no se pueden anular sus abonos.'; end if;
 if length(reason) not between 5 and 500 then raise exception 'Escribe el motivo de la anulación (mínimo 5 caracteres).'; end if;
 update public.planes_ahorro_pagos set anulado_at=now(),anulado_por=auth.uid(),motivo_anulacion=reason where id=p_id;
 -- Its income in Cierres de caja (rejected if that day is already closed, as for any movement).
 if g.caja_movimiento_id is not null and exists(select 1 from public.caja_movimientos where id=g.caja_movimiento_id and anulado_at is null) then
  perform private.anular_movimiento_caja(g.caja_movimiento_id,reason);
 end if;
 update public.planes_ahorro set updated_at=now() where id=pl.id;
end $$;
revoke all on function public.plan_ahorro_pagos_listar(uuid), public.plan_ahorro_anular_pago(uuid,text) from public, anon;
grant execute on function public.plan_ahorro_pagos_listar(uuid), public.plan_ahorro_anular_pago(uuid,text) to authenticated;

-- Annulling the income directly in Cierres de caja also annuls the plan's payment.
create or replace function private.anular_movimiento_caja(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path to '' as $function$
declare u public.profiles; m public.caja_movimientos; reason text:=btrim(coalesce(p_motivo,''));
begin
 u:=private.caja_perfil();
 select * into m from public.caja_movimientos where id=p_id for update;
 if not found or u.id is null or not private.caja_operar(m.sede_id) then raise exception 'Movimiento no disponible.' using errcode='42501'; end if;
 if m.anulado_at is not null then raise exception 'El movimiento ya está anulado.'; end if;
 if private.caja_dia_cerrado(m.sede_id,m.fecha) then raise exception 'La caja de ese día ya está cerrada; un administrador debe reabrirla.'; end if;
 if length(reason) not between 5 and 500 then raise exception 'Escribe el motivo de la anulación (mínimo 5 caracteres).'; end if;
 update public.caja_movimientos set anulado_at=now(),anulado_por=u.id,motivo_anulacion=reason where id=p_id;
 if m.origen='pago' then
  update public.contratos k set anticipo=coalesce(k.anticipo,0)-m.valor from public.pagos p where p.id=m.origen_id and k.id=p.contrato_id;
 end if;
 if m.origen='plan_ahorro' then
  update public.planes_ahorro_pagos set anulado_at=now(),anulado_por=u.id,motivo_anulacion=reason where id=m.origen_id and anulado_at is null;
 end if;
end $function$;

-- What the family saved, the level, the extra and the reminders only count payments that are not annulled.
create or replace function public.planes_ahorro_listar(p_sede uuid default null::uuid)
 returns table(id uuid, numero integer, sede_id uuid, sede text, titular_nombre text, telefono text, email text, quinceanera_nombre text, fecha_evento date, cuota_mensual numeric, dia_pago integer, estado text, contrato_id uuid, created_at timestamp with time zone, ahorrado numeric, pagos integer, ultimo_pago date, extra numeric, disponible numeric, nivel text, premios text, siguiente text, falta numeric, usar_desde date, meses_pagados integer, meses_esperados integer, al_dia boolean, devolucion numeric, notas text, cerrado_nota text)
 language sql stable security definer set search_path to '' as $function$
 with base as(
  select p.*,s.nombre sede_nombre,coalesce(sum(g.valor),0) ah,count(g.id)::int n,max(g.fecha) ult
  from public.planes_ahorro p join public.sedes s on s.id=p.sede_id left join public.planes_ahorro_pagos g on g.plan_id=p.id and g.anulado_at is null
  where (public.es_admin() or private.caja_operar(p.sede_id)) and (p_sede is null or p.sede_id=p_sede)
  group by p.id,s.nombre)
 select b.id,b.numero,b.sede_id,b.sede_nombre,b.titular_nombre,b.telefono,b.email,b.quinceanera_nombre,b.fecha_evento,b.cuota_mensual,b.dia_pago,b.estado,b.contrato_id,b.created_at,
  b.ah,b.n,b.ult,round(b.ah*(r->>'pct')::numeric/100),b.ah+round(b.ah*(r->>'pct')::numeric/100),r->>'nivel',r->>'premios',r->>'siguiente',greatest(0,round((r->>'falta')::numeric)),
  (b.fecha_evento-90),floor(b.ah/b.cuota_mensual)::int,e.esperados,b.estado<>'activo' or b.ah>=b.cuota_mensual*e.esperados,round(b.ah*0.9),b.notas,b.cerrado_nota
 from base b cross join lateral (select private.plan_ahorro_premio(b.ah) r) x
 cross join lateral (select (extract(year from age(date_trunc('month',(now() at time zone 'America/Bogota')::date),date_trunc('month',b.created_at at time zone 'America/Bogota')))*12
  +extract(month from age(date_trunc('month',(now() at time zone 'America/Bogota')::date),date_trunc('month',b.created_at at time zone 'America/Bogota'))))::int d) m
 cross join lateral (select m.d+1-case when m.d>0 and extract(day from (now() at time zone 'America/Bogota'))<=b.dia_pago then 1 else 0 end esperados) e
 order by b.estado<>'activo',b.fecha_evento;
$function$;

create or replace function public.planes_ahorro_avisos_tomar(p_limite integer default 40)
 returns table(aviso_id uuid, plan_id uuid, tipo text, telefono text, nombre text, sede text, cuota numeric, valor numeric, ahorrado numeric, disponible numeric, vence date, usar_desde date)
 language plpgsql security definer set search_path to '' as $function$
#variable_conflict use_column
declare ahora timestamp:=now() at time zone 'America/Bogota'; hoy date:=ahora::date; hora int:=extract(hour from ahora)::int;
 r record; venc date; esperados int; ah numeric; pct numeric; k text; n int:=0; aid uuid;
begin
 for r in select p.*,s.nombre sede_nombre,(select coalesce(sum(g.valor),0) from public.planes_ahorro_pagos g where g.plan_id=p.id and g.anulado_at is null) total
  from public.planes_ahorro p join public.sedes s on s.id=p.sede_id where p.estado='activo' order by p.created_at loop
  exit when n>=p_limite;
  ah:=r.total; pct:=((private.plan_ahorro_premio(ah))->>'pct')::numeric;
  for k,venc in select g.id::text,g.fecha from public.planes_ahorro_pagos g where g.plan_id=r.id and g.anulado_at is null and g.created_at>now()-interval '3 days' loop
   insert into public.planes_ahorro_avisos(plan_id,tipo,clave) values(r.id,'pago',k) on conflict do nothing returning id into aid;
   if aid is not null then
    aviso_id:=aid;plan_id:=r.id;tipo:='pago';telefono:=r.telefono;nombre:=r.titular_nombre;sede:=r.sede_nombre;cuota:=r.cuota_mensual;
    valor:=(select g.valor from public.planes_ahorro_pagos g where g.id=k::uuid);ahorrado:=ah;disponible:=ah+round(ah*pct/100);vence:=null;usar_desde:=r.fecha_evento-90;
    return next;n:=n+1;aid:=null;
   end if;
  end loop;
  continue when hora<9 or hora>=19;
  venc:=make_date(extract(year from hoy)::int,extract(month from hoy)::int,r.dia_pago);
  esperados:=(extract(year from age(date_trunc('month',hoy),date_trunc('month',r.created_at at time zone 'America/Bogota')))*12
   +extract(month from age(date_trunc('month',hoy),date_trunc('month',r.created_at at time zone 'America/Bogota'))))::int+1;
  k:=to_char(hoy,'YYYY-MM');
  if esperados>1 and hoy between venc-2 and venc-1 and ah<r.cuota_mensual*esperados then
   insert into public.planes_ahorro_avisos(plan_id,tipo,clave) values(r.id,'recordatorio',k) on conflict do nothing returning id into aid;
   if aid is not null then
    aviso_id:=aid;plan_id:=r.id;tipo:='recordatorio';telefono:=r.telefono;nombre:=r.titular_nombre;sede:=r.sede_nombre;cuota:=r.cuota_mensual;valor:=null;ahorrado:=ah;
    disponible:=ah+round(ah*pct/100);vence:=venc;usar_desde:=r.fecha_evento-90;return next;n:=n+1;aid:=null;
   end if;
  end if;
  if esperados>1 and hoy between venc+3 and venc+10 and ah<r.cuota_mensual*esperados then
   insert into public.planes_ahorro_avisos(plan_id,tipo,clave) values(r.id,'pendiente',k) on conflict do nothing returning id into aid;
   if aid is not null then
    aviso_id:=aid;plan_id:=r.id;tipo:='pendiente';telefono:=r.telefono;nombre:=r.titular_nombre;sede:=r.sede_nombre;cuota:=r.cuota_mensual;valor:=null;ahorrado:=ah;
    disponible:=ah+round(ah*pct/100);vence:=venc;usar_desde:=r.fecha_evento-90;return next;n:=n+1;aid:=null;
   end if;
  end if;
  if hoy>=r.fecha_evento-90 and ah>0 then
   insert into public.planes_ahorro_avisos(plan_id,tipo,clave) values(r.id,'listo','1') on conflict do nothing returning id into aid;
   if aid is not null then
    aviso_id:=aid;plan_id:=r.id;tipo:='listo';telefono:=r.telefono;nombre:=r.titular_nombre;sede:=r.sede_nombre;cuota:=r.cuota_mensual;valor:=null;ahorrado:=ah;
    disponible:=ah+round(ah*pct/100);vence:=null;usar_desde:=r.fecha_evento-90;return next;n:=n+1;aid:=null;
   end if;
  end if;
 end loop;
end $function$;
