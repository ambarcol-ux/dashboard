-- Medición del consumo de IA (Claude) del ERP: cada llamada guarda función, modelo, tokens y costo estimado en USD.
-- Sirve para saber cuánto cuesta cada parte (WhatsApp, fotos, comentarios, análisis…) antes y después de optimizar.
-- Solo administración la ve. Reversión: drop function public.ia_consumo_resumen(int); drop table public.ia_consumo;
create table if not exists public.ia_consumo(
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 funcion text not null check (length(funcion)<=60),
 modelo text not null check (length(modelo)<=60),
 entrada int not null default 0,
 salida int not null default 0,
 cache_escritura int not null default 0,
 cache_lectura int not null default 0,
 costo_usd numeric(12,6) not null default 0
);
create index if not exists ia_consumo_fecha on public.ia_consumo(created_at desc);
alter table public.ia_consumo enable row level security;
revoke all on public.ia_consumo from anon, authenticated;

-- Summary by day and by function (Bogotá time) for the last N days.
create or replace function public.ia_consumo_resumen(p_dias int default 30)
returns table(dia date, funcion text, llamadas bigint, entrada bigint, salida bigint, cache_lectura bigint, cache_escritura bigint, costo_usd numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración.'; end if;
 return query select (c.created_at at time zone 'America/Bogota')::date, c.funcion, count(*), sum(c.entrada)::bigint, sum(c.salida)::bigint,
  sum(c.cache_lectura)::bigint, sum(c.cache_escritura)::bigint, round(sum(c.costo_usd),4)
 from public.ia_consumo c where c.created_at>now()-make_interval(days=>greatest(1,least(coalesce(p_dias,30),120)))
 group by 1,2 order by 1 desc, 8 desc;
end $$;
revoke all on function public.ia_consumo_resumen(int) from public, anon;
grant execute on function public.ia_consumo_resumen(int) to authenticated;
