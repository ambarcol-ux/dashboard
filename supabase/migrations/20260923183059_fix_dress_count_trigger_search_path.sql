-- Copied from Supabase (applied migration 20260923183059).
create or replace function public.funcion_sincronizar_conteo_vestidos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.contratos
    set vestidos_count = coalesce(vestidos_count,0) + 1
    where id = new.contrato_id;
  elsif tg_op = 'DELETE' then
    update public.contratos
    set vestidos_count = greatest(coalesce(vestidos_count,0) - 1, 0)
    where id = old.contrato_id;
  end if;
  return null;
end;
$$;
