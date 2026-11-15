-- Estudio de contenido › Kit de marca: logo, colores, tipografías, usuario de Instagram y frase. Las plantillas de diseño los usan para
-- poner la marca sobre las fotos de cada pieza (se dibujan en el navegador y se guardan como JPG en contenido_marketing).
-- Una sola fila ('principal'); escribe solo administración por el servidor. Cambios en config_historial.
-- Reversión: drop table public.contenido_marca;
create table if not exists public.contenido_marca(
 id text primary key default 'principal' check (id='principal'),
 logo_url text,
 color_principal text not null default '#1f1f1f' check (color_principal ~ '^#[0-9a-fA-F]{6}$'),
 color_secundario text not null default '#c9a227' check (color_secundario ~ '^#[0-9a-fA-F]{6}$'),
 color_texto text not null default '#ffffff' check (color_texto ~ '^#[0-9a-fA-F]{6}$'),
 fuente_titulo text not null default 'Playfair Display' check (length(fuente_titulo)<=60),
 fuente_texto text not null default 'Montserrat' check (length(fuente_texto)<=60),
 usuario_instagram text check (usuario_instagram is null or length(usuario_instagram)<=40),
 frase text check (frase is null or length(frase)<=80),
 actualizado_por uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now()
);
insert into public.contenido_marca(id) values('principal') on conflict do nothing;
alter table public.contenido_marca enable row level security;
create policy contenido_marca_ver on public.contenido_marca for select to authenticated
 using ((select public.es_admin()) or (select private.tiene_permiso('panel.estudio_contenido')));
revoke insert,update,delete on public.contenido_marca from anon, authenticated;
create trigger contenido_marca_historial after insert or update or delete on public.contenido_marca for each row execute function private.config_historial();
