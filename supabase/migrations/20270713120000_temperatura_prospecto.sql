-- Temperatura del prospecto (v1): the WhatsApp AI rates each chat caliente / tibio / frio with its reason; the first visit booked from
-- that phone keeps the rating it had when it was created, so it can be compared later with what really happened (attended, rented).
-- Reversión: drop trigger primeras_citas_temperatura on public.primeras_citas; drop function private.primeras_citas_temperatura();
--   alter table public.whatsapp_conversaciones drop column temperatura, drop column temperatura_motivo, drop column temperatura_at;
--   alter table public.primeras_citas drop column temperatura, drop column temperatura_motivo;
alter table public.whatsapp_conversaciones add column if not exists temperatura text check (temperatura in ('caliente','tibio','frio')),
 add column if not exists temperatura_motivo text, add column if not exists temperatura_at timestamptz;
alter table public.primeras_citas add column if not exists temperatura text check (temperatura in ('caliente','tibio','frio')),
 add column if not exists temperatura_motivo text;

create or replace function private.primeras_citas_temperatura() returns trigger language plpgsql security definer set search_path='' as $$
declare t text; m text; tel text:=right(regexp_replace(coalesce(new.telefono,''),'\D','','g'),10);
begin
 if new.temperatura is null and length(tel)=10 then
  select w.temperatura, w.temperatura_motivo into t, m from public.whatsapp_conversaciones w
   where right(regexp_replace(coalesce(w.telefono,''),'\D','','g'),10)=tel and w.temperatura is not null and w.temperatura_at>now()-interval '30 days'
   order by w.temperatura_at desc limit 1;
  new.temperatura:=t; new.temperatura_motivo:=m;
 end if;
 return new;
end $$;
create or replace trigger primeras_citas_temperatura before insert on public.primeras_citas for each row execute function private.primeras_citas_temperatura();
