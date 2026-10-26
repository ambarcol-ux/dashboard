-- Aliados (paso 3): versiones del acuerdo de vinculación subido en Word. Nunca se borran; la vigente es la de mayor número.
create table public.acuerdos_aliado (
 version integer generated always as identity primary key,
 archivo_path text not null,
 archivo_nombre text not null,
 secciones jsonb not null,
 nota text not null default '',
 subido_por uuid references public.profiles(id),
 subido_por_nombre text,
 subido_en timestamptz not null default now()
);
alter table public.acuerdos_aliado enable row level security;
create policy acuerdos_aliado_admin_lee on public.acuerdos_aliado for select to authenticated using (public.es_admin());
revoke insert,update,delete,truncate on public.acuerdos_aliado from anon,authenticated;
