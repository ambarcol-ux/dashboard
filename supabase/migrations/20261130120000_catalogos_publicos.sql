-- Links públicos del catálogo según el filtro (tipo, categoría, sede). Se leen solo por la API del servidor; se pueden desactivar.
-- Revert: drop table public.catalogos_publicos.
create table if not exists public.catalogos_publicos(token uuid primary key default gen_random_uuid(),titulo text not null check (length(titulo) between 2 and 120),
 clasificacion_id int references public.clasificaciones_vestido(id),categoria text,sede_id uuid references public.sedes(id),
 activo boolean not null default true,creado_por uuid default auth.uid() references public.profiles(id),created_at timestamptz not null default now());
alter table public.catalogos_publicos enable row level security;
revoke all on public.catalogos_publicos from anon;
create policy catalogos_publicos_leer on public.catalogos_publicos for select to authenticated using (true);
create policy catalogos_publicos_crear on public.catalogos_publicos for insert to authenticated with check (creado_por=auth.uid());
create policy catalogos_publicos_editar on public.catalogos_publicos for update to authenticated using (public.es_admin() or creado_por=auth.uid()) with check (public.es_admin() or creado_por=auth.uid());
