-- QR per dress: random, unique token independent of the code; public per-IP limit reusing private.primeras_citas_limites.
-- Revert: drop function public.consumir_limite_publico(text,int,int); drop index vestidos_qr_token_key; alter table public.vestidos drop column qr_token;
alter table public.vestidos add column if not exists qr_token uuid not null default gen_random_uuid();
create unique index if not exists vestidos_qr_token_key on public.vestidos(qr_token);

create or replace function public.consumir_limite_publico(p_clave text, p_max int, p_segundos int)
returns boolean language plpgsql security definer set search_path='' as $$
declare n int;
begin
 insert into private.primeras_citas_limites(clave,ventana,intentos) values(p_clave,now(),1)
 on conflict(clave) do update set
  intentos=case when primeras_citas_limites.ventana<now()-make_interval(secs=>p_segundos) then 1 else primeras_citas_limites.intentos+1 end,
  ventana=case when primeras_citas_limites.ventana<now()-make_interval(secs=>p_segundos) then now() else primeras_citas_limites.ventana end
 returning intentos into n;
 return n<=p_max;
end $$;
revoke all on function public.consumir_limite_publico(text,int,int) from public, anon, authenticated;
grant execute on function public.consumir_limite_publico(text,int,int) to service_role;
