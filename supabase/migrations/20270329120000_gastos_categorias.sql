-- Gastos: categories added on the spot from «Registrar gasto» (besides the base list in the page). History via config_historial.
-- Reversible: drop the functions and the table.
create table if not exists public.gastos_categorias(
 id uuid primary key default gen_random_uuid(),
 nombre text not null check (length(btrim(nombre)) between 2 and 60),
 activo boolean not null default true,
 creado_por uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create unique index if not exists gastos_categorias_nombre on public.gastos_categorias(lower(btrim(nombre)));
create trigger gastos_categorias_historial after insert or update or delete on public.gastos_categorias for each row execute function private.config_historial();
alter table public.gastos_categorias enable row level security;
create policy gastos_categorias_ver on public.gastos_categorias for select to authenticated using (private.es_finanzas() or private.tiene_permiso('panel.gastos'));
revoke insert,update,delete on public.gastos_categorias from anon, authenticated;

create or replace function public.gastos_categoria_crear(p_nombre text) returns text
language plpgsql security definer set search_path='' as $$
declare n text:=btrim(regexp_replace(coalesce(p_nombre,''),'\s+',' ','g')); e text;
begin
 if not (private.es_finanzas() or private.tiene_permiso('panel.gastos')) then raise exception 'No puedes crear categorías de gastos.' using errcode='42501'; end if;
 if length(n) not between 2 and 60 then raise exception 'Escribe el nombre de la categoría (2 a 60 caracteres).'; end if;
 if lower(n)='retiro de utilidades' then raise exception 'Los retiros de utilidades se registran con el tipo «Retiro de utilidades».'; end if;
 n:=upper(left(n,1))||substr(n,2);
 select nombre into e from public.gastos_categorias where lower(btrim(nombre))=lower(n);
 if e is not null then update public.gastos_categorias set activo=true where lower(btrim(nombre))=lower(n); return e; end if;
 insert into public.gastos_categorias(nombre,creado_por) values(n,auth.uid());
 return n;
end $$;
revoke all on function public.gastos_categoria_crear(text) from public, anon;
grant execute on function public.gastos_categoria_crear(text) to authenticated;
