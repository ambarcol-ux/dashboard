-- Plan Ahorro XV › automatic WhatsApp messages (templates in docs/plantillas-whatsapp.md):
--  pago (cuota recibida, right after it is registered) · recordatorio (2 days before the payment day if the month is not paid yet)
--  pendiente (3 to 10 days after the payment day if still behind, once a month) · listo (once, from 3 months before the event).
-- Each message is claimed here first (one per plan, type and key), so it never goes out twice; if Meta has not approved the template
-- the claim is removed and it is tried again later. Reminder types only go out from 9 a. m. to 7 p. m. (Bogotá).
-- Reversión: select cron.unschedule('plan-ahorro-avisos'); drop function public.planes_ahorro_avisos_tomar(int); drop table public.planes_ahorro_avisos;

create table if not exists public.planes_ahorro_avisos(
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references public.planes_ahorro(id),
 tipo text not null check (tipo in ('pago','recordatorio','pendiente','listo')),
 clave text not null,
 wa_id text,
 error text,
 created_at timestamptz not null default now(),
 unique(plan_id,tipo,clave)
);
alter table public.planes_ahorro_avisos enable row level security;
create policy planes_ahorro_avisos_ver on public.planes_ahorro_avisos for select to authenticated
 using (exists(select 1 from public.planes_ahorro p where p.id=plan_id and (public.es_admin() or private.caja_operar(p.sede_id))));
revoke insert,update,delete on public.planes_ahorro_avisos from anon, authenticated;

-- Claims the messages due now and returns what each one needs (service role only, called by /api/plan-ahorro/avisos).
create or replace function public.planes_ahorro_avisos_tomar(p_limite int default 40) returns table(
 aviso_id uuid,plan_id uuid,tipo text,telefono text,nombre text,sede text,cuota numeric,valor numeric,ahorrado numeric,disponible numeric,vence date,usar_desde date)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare ahora timestamp:=now() at time zone 'America/Bogota'; hoy date:=ahora::date; hora int:=extract(hour from ahora)::int;
 r record; venc date; esperados int; ah numeric; pct numeric; k text; n int:=0; aid uuid;
begin
 for r in select p.*,s.nombre sede_nombre,(select coalesce(sum(g.valor),0) from public.planes_ahorro_pagos g where g.plan_id=p.id) total
  from public.planes_ahorro p join public.sedes s on s.id=p.sede_id where p.estado='activo' order by p.created_at loop
  exit when n>=p_limite;
  ah:=r.total; pct:=((private.plan_ahorro_premio(ah))->>'pct')::numeric;
  -- Cuota recibida: payments of the last 3 days without their message.
  for k,venc in select g.id::text,g.fecha from public.planes_ahorro_pagos g where g.plan_id=r.id and g.created_at>now()-interval '3 days' loop
   insert into public.planes_ahorro_avisos(plan_id,tipo,clave) values(r.id,'pago',k) on conflict do nothing returning id into aid;
   if aid is not null then
    aviso_id:=aid;plan_id:=r.id;tipo:='pago';telefono:=r.telefono;nombre:=r.titular_nombre;sede:=r.sede_nombre;cuota:=r.cuota_mensual;
    valor:=(select g.valor from public.planes_ahorro_pagos g where g.id=k::uuid);ahorrado:=ah;disponible:=ah+round(ah*pct/100);vence:=null;usar_desde:=r.fecha_evento-90;
    return next;n:=n+1;aid:=null;
   end if;
  end loop;
  continue when hora<9 or hora>=19;
  venc:=make_date(extract(year from hoy)::int,extract(month from hoy)::int,r.dia_pago);
  -- Cuotas expected up to this month's payment day (the month it signed counts as paid at signup).
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
end $$;
revoke all on function public.planes_ahorro_avisos_tomar(int) from public, anon, authenticated;
grant execute on function public.planes_ahorro_avisos_tomar(int) to service_role;

-- Every 15 minutes from 7 a. m. to 7 p. m. (Bogotá): the payment confirmation goes out soon after the cuota is registered.
select cron.schedule('plan-ahorro-avisos','*/15 12-23,0 * * *',$c$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/plan-ahorro/avisos',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000);
$c$);
