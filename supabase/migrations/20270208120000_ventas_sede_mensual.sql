-- Comparativo de contratos por sede y mes (cantidad, valor y valor promedio), con alerta cuando el valor promedio del mes cae
-- por debajo del 75 % del promedio de los 3 meses anteriores. Lo usan Reportes y el reporte semanal del embudo.
-- Reversión: drop function public.ventas_sede_mensual(int);
create or replace function public.ventas_sede_mensual(p_meses int) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 if auth.role()<>'service_role' and not coalesce(public.es_admin(),false) then raise exception 'Solo administración.' using errcode='42501'; end if;
 with k as (
  select s.nombre sede, date_trunc('month',c.created_at at time zone 'America/Bogota')::date mes, c.valor_total
  from public.contratos c join public.sedes s on s.id=c.sede_id
  where lower(coalesce(c.estado,'')) not in ('anulado','cancelado','borrador','rechazado')
   and c.created_at>=date_trunc('month',now() at time zone 'America/Bogota')-make_interval(months=>least(greatest(p_meses,1),24)+2)),
 g as (select sede,mes,count(*)::int contratos,coalesce(sum(valor_total),0)::bigint valor,coalesce(avg(valor_total),0)::bigint promedio from k group by 1,2),
 h as (select g.*,(select avg(p.promedio)::bigint from g p where p.sede=g.sede and p.mes between g.mes-interval '3 months' and g.mes-interval '1 month') promedio_3m from g)
 select coalesce(jsonb_agg(jsonb_build_object('sede',sede,'mes',mes,'contratos',contratos,'valor',valor,'promedio',promedio,'promedio_3m',promedio_3m,
   'alerta',promedio_3m>0 and promedio<promedio_3m*0.75) order by sede,mes),'[]') into r
 from h where mes>=date_trunc('month',now() at time zone 'America/Bogota')-make_interval(months=>least(greatest(p_meses,1),24)-1);
 return r;
end $$;
revoke all on function public.ventas_sede_mensual(int) from public, anon;
grant execute on function public.ventas_sede_mensual(int) to authenticated, service_role;
