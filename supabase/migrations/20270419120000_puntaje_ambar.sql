-- Ámbar Exitoso · Etapa 3: Puntaje Ámbar por sede (0–100), one number that says how well each store runs. Built on the same indicators
-- as the Manual Ámbar (public.manual_indicadores, last 30 days, stores the user can see) plus the month's sales pace:
--  ventas 25 (projected month vs last month) · conversión 20 (asistieron→contrataron vs 40 %) · asistencia 10 (vs 70 %) ·
--  atención 10 (chats ≤15 min vs 95 %) · caja 15 (days closed) · contratos completos 10 (signed in ERP + e-mail) ·
--  inventario 5 (cost + photo) · datos limpios 5 (citas with origin); penalties: delivered with balance (−5 each, max −10),
--  late deposit returns (−2 each, max −10). Read-only. Reversible: drop function public.puntaje_ambar().

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
  round(25*least(1,case when x.vendido_ant>0 then (x.vendido/greatest(avance,0.05))/x.vendido_ant else case when x.vendido>0 then 1 else 0 end end),1) ventas,
  round(20*least(1,coalesce((e->>'contrataron')::numeric/nullif((e->>'asistieron')::numeric,0),0)/0.40),1) conversion,
  round(10*least(1,coalesce((e->>'asistieron')::numeric/nullif((e->>'citas')::numeric,0),0)/0.70),1) asistencia,
  round(10*least(1,coalesce((e->>'respuesta_15')::numeric,0)/95),1) atencion,
  round(15*least(1,coalesce((e->>'dias_cerrados')::numeric/nullif((e->>'dias_habiles')::numeric,0),0)),1) caja,
  round(10*((coalesce((e->>'firmados_erp')::numeric/nullif((e->>'contratos')::numeric,0),1)+coalesce((e->>'con_correo')::numeric/nullif((e->>'contratos')::numeric,0),1))/2),1) contratos,
  round(5*((coalesce((e->>'vestidos_con_costo')::numeric/nullif((e->>'vestidos')::numeric,0),0)+coalesce((e->>'vestidos_con_foto')::numeric/nullif((e->>'vestidos')::numeric,0),0))/2),1) inventario,
  round(5*(1-coalesce((e->>'citas_sin_origen')::numeric/nullif((e->>'citas')::numeric,0),0)),1) datos,
  -least(10,5*coalesce((e->>'entregas_con_saldo')::numeric,0))-least(10,2*coalesce((e->>'depositos_atrasados')::numeric,0)) penal
  from x)
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre,
  'puntaje',greatest(0,round(p.ventas+p.conversion+p.asistencia+p.atencion+p.caja+p.contratos+p.inventario+p.datos+p.penal)),
  'componentes',jsonb_build_array(
   jsonb_build_object('nombre','Ventas del mes vs mes pasado','puntos',p.ventas,'max',25),
   jsonb_build_object('nombre','Conversión (asistieron → contrataron)','puntos',p.conversion,'max',20),
   jsonb_build_object('nombre','Caja cerrada cada día','puntos',p.caja,'max',15),
   jsonb_build_object('nombre','Asistencia a citas','puntos',p.asistencia,'max',10),
   jsonb_build_object('nombre','Atención en 15 minutos','puntos',p.atencion,'max',10),
   jsonb_build_object('nombre','Contratos completos (firma ERP y correo)','puntos',p.contratos,'max',10),
   jsonb_build_object('nombre','Inventario (costo y fotos)','puntos',p.inventario,'max',5),
   jsonb_build_object('nombre','Datos limpios (origen de citas)','puntos',p.datos,'max',5),
   jsonb_build_object('nombre','Penalizaciones (entregas con saldo, depósitos atrasados)','puntos',p.penal,'max',0))) order by p.nombre),'[]'::jsonb) into r from p;
 return r;
end $$;
revoke all on function public.puntaje_ambar() from public, anon;
grant execute on function public.puntaje_ambar() to authenticated;
