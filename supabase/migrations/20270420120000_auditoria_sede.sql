-- Ámbar Exitoso · Etapa 3: auditoría mensual por sede (Manuales › Manual Ámbar › Auditoría mensual). Administration or accounting
-- checks each store once a month with the Manual Ámbar checklist (store, service, contracts, cash, inventory); each item «cumple / no
-- cumple» with a note. The closed audit (% of items that comply) is worth 10 of the 100 points of the Puntaje Ámbar for 45 days.
-- History: private.config_historial(). Reversible: drop table public.auditorias_sede; drop the functions created here; restore
--   public.puntaje_ambar from 20270419120000.

create table if not exists public.auditorias_sede(
 id uuid primary key default gen_random_uuid(),
 sede_id uuid not null references public.sedes(id),
 periodo date not null,
 respuestas jsonb not null default '{}'::jsonb,
 resultado numeric(5,1),
 notas text,
 estado text not null default 'borrador' check (estado in ('borrador','cerrada')),
 auditor_id uuid references public.profiles(id),
 cerrada_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (sede_id, periodo)
);
alter table public.auditorias_sede enable row level security;
create policy auditorias_sede_ver on public.auditorias_sede for select to authenticated using (public.es_admin() or private.es_finanzas() or private.caja_operar(sede_id));
create trigger auditorias_sede_historial after insert or update or delete on public.auditorias_sede for each row execute function private.config_historial();

-- Save (draft) or close the audit of a store and month. p_respuestas: {item_id: {"ok": true|false, "nota": "..."}}.
create or replace function public.auditoria_sede_guardar(p_sede uuid, p_periodo date, p_respuestas jsonb, p_notas text, p_cerrar boolean, p_total_items integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.auditorias_sede; mes date:=date_trunc('month',p_periodo)::date; si int; total int:=greatest(1,coalesce(p_total_items,0)); res numeric;
begin
 if not (public.es_admin() or private.es_finanzas()) then raise exception 'Solo administración o contabilidad hace auditorías.' using errcode='42501'; end if;
 if jsonb_typeof(p_respuestas)<>'object' then raise exception 'Respuestas no válidas.'; end if;
 select * into a from public.auditorias_sede where sede_id=p_sede and periodo=mes for update;
 if a.estado='cerrada' and not public.es_admin() then raise exception 'Esta auditoría ya está cerrada.'; end if;
 select count(*) into si from jsonb_each(p_respuestas) e where (e.value->>'ok')::boolean;
 if p_cerrar and (select count(*) from jsonb_each(p_respuestas) e where e.value ? 'ok')<total then raise exception 'Responde todos los puntos antes de cerrar la auditoría.'; end if;
 res:=round(100.0*si/total,1);
 insert into public.auditorias_sede(sede_id,periodo,respuestas,resultado,notas,estado,auditor_id,cerrada_at,updated_at)
 values(p_sede,mes,p_respuestas,res,nullif(btrim(coalesce(p_notas,'')),''),case when p_cerrar then 'cerrada' else 'borrador' end,auth.uid(),case when p_cerrar then now() end,now())
 on conflict (sede_id,periodo) do update set respuestas=excluded.respuestas,resultado=excluded.resultado,notas=excluded.notas,estado=excluded.estado,auditor_id=excluded.auditor_id,
  cerrada_at=coalesce(excluded.cerrada_at,auditorias_sede.cerrada_at),updated_at=now()
 returning * into a;
 return jsonb_build_object('id',a.id,'resultado',a.resultado,'estado',a.estado);
end $$;

create or replace function public.auditorias_sede_listar(p_sede uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'sede_id',a.sede_id,'sede',s.nombre,'periodo',a.periodo,'respuestas',a.respuestas,'resultado',a.resultado,'notas',a.notas,
  'estado',a.estado,'auditor',coalesce(u.nombre,u.email),'cerrada_at',a.cerrada_at) order by a.periodo desc,s.nombre),'[]'::jsonb)
 from public.auditorias_sede a join public.sedes s on s.id=a.sede_id left join public.profiles u on u.id=a.auditor_id
 where (p_sede is null or a.sede_id=p_sede) and (public.es_admin() or private.es_finanzas() or private.caja_operar(a.sede_id));
$$;
revoke all on function public.auditoria_sede_guardar(uuid,date,jsonb,text,boolean,integer), public.auditorias_sede_listar(uuid) from public, anon;
grant execute on function public.auditoria_sede_guardar(uuid,date,jsonb,text,boolean,integer), public.auditorias_sede_listar(uuid) to authenticated;

-- Puntaje Ámbar: the store's operation is worth 90 points (same weights × 0.9) and the closed monthly audit 10.
create or replace function public.puntaje_ambar() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare hoy date:=(now() at time zone 'America/Bogota')::date; ini date:=date_trunc('month',(now() at time zone 'America/Bogota'))::date;
 ini_ant date:=(date_trunc('month',(now() at time zone 'America/Bogota'))-interval '1 month')::date; avance numeric; r jsonb;
begin
 avance:=extract(day from hoy)/extract(day from (ini+interval '1 month'-interval '1 day'));
 with i as (select e from jsonb_array_elements(public.manual_indicadores()) e),
 k as (select c.sede_id,(c.created_at at time zone 'America/Bogota')::date dia,coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0) valor from public.contratos c
  where lower(coalesce(c.estado,'')) not in ('cancelado','cancelada','anulado','anulada','rechazado') and (lower(coalesce(c.estado,''))<>'borrador' or coalesce(c.anticipo,0)>0)
   and c.created_at>=ini_ant),
 x as (select e->>'id' id,e->>'nombre' nombre,e,
  coalesce((select sum(valor) from k where k.sede_id=(e->>'id')::uuid and k.dia>=ini),0) vendido,
  coalesce((select sum(valor) from k where k.sede_id=(e->>'id')::uuid and k.dia between ini_ant and ini-1),0) vendido_ant from i),
 p as (select x.*,
  round(0.9*25*least(1,case when x.vendido_ant>0 then (x.vendido/greatest(avance,0.05))/x.vendido_ant else case when x.vendido>0 then 1 else 0 end end),1) ventas,
  round(0.9*20*least(1,coalesce((e->>'contrataron')::numeric/nullif((e->>'asistieron')::numeric,0),0)/0.40),1) conversion,
  round(0.9*10*least(1,coalesce((e->>'asistieron')::numeric/nullif((e->>'citas')::numeric,0),0)/0.70),1) asistencia,
  round(0.9*10*least(1,coalesce((e->>'respuesta_15')::numeric,0)/95),1) atencion,
  round(0.9*15*least(1,coalesce((e->>'dias_cerrados')::numeric/nullif((e->>'dias_habiles')::numeric,0),0)),1) caja,
  round(0.9*10*((coalesce((e->>'firmados_erp')::numeric/nullif((e->>'contratos')::numeric,0),1)+coalesce((e->>'con_correo')::numeric/nullif((e->>'contratos')::numeric,0),1))/2),1) contratos,
  round(0.9*5*((coalesce((e->>'vestidos_con_costo')::numeric/nullif((e->>'vestidos')::numeric,0),0)+coalesce((e->>'vestidos_con_foto')::numeric/nullif((e->>'vestidos')::numeric,0),0))/2),1) inventario,
  round(0.9*5*(1-coalesce((e->>'citas_sin_origen')::numeric/nullif((e->>'citas')::numeric,0),0)),1) datos,
  round(10*coalesce((select a.resultado from public.auditorias_sede a where a.sede_id=(e->>'id')::uuid and a.estado='cerrada' and a.cerrada_at>now()-interval '45 days' order by a.periodo desc limit 1),0)/100,1) auditoria,
  -least(10,5*coalesce((e->>'entregas_con_saldo')::numeric,0))-least(10,2*coalesce((e->>'depositos_atrasados')::numeric,0)) penal
  from x)
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre,
  'puntaje',greatest(0,round(p.ventas+p.conversion+p.asistencia+p.atencion+p.caja+p.contratos+p.inventario+p.datos+p.auditoria+p.penal)),
  'componentes',jsonb_build_array(
   jsonb_build_object('nombre','Ventas del mes vs mes pasado','puntos',p.ventas,'max',22.5),
   jsonb_build_object('nombre','Conversión (asistieron → contrataron)','puntos',p.conversion,'max',18),
   jsonb_build_object('nombre','Caja cerrada cada día','puntos',p.caja,'max',13.5),
   jsonb_build_object('nombre','Asistencia a citas','puntos',p.asistencia,'max',9),
   jsonb_build_object('nombre','Atención en 15 minutos','puntos',p.atencion,'max',9),
   jsonb_build_object('nombre','Contratos completos (firma ERP y correo)','puntos',p.contratos,'max',9),
   jsonb_build_object('nombre','Inventario (costo y fotos)','puntos',p.inventario,'max',4.5),
   jsonb_build_object('nombre','Datos limpios (origen de citas)','puntos',p.datos,'max',4.5),
   jsonb_build_object('nombre','Auditoría mensual (cerrada en los últimos 45 días)','puntos',p.auditoria,'max',10),
   jsonb_build_object('nombre','Penalizaciones (entregas con saldo, depósitos atrasados)','puntos',p.penal,'max',0))) order by p.nombre),'[]'::jsonb) into r from p;
 return r;
end $$;
revoke all on function public.puntaje_ambar() from public, anon;
grant execute on function public.puntaje_ambar() to authenticated;
