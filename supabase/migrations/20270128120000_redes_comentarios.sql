-- WhatsApp 304 › Comentarios: comentarios de las publicaciones de Instagram (webhook «comments»), con respuesta sugerida por la IA
-- y respuesta pública o por mensaje privado desde el ERP. Los ven quienes tienen el panel de WhatsApp.
-- Reversión: alter publication supabase_realtime drop table public.redes_comentarios; drop table public.redes_comentarios;
create table if not exists public.redes_comentarios(
 id uuid primary key default gen_random_uuid(),
 canal text not null default 'instagram' check (canal in ('instagram','facebook')),
 comentario_id text not null unique,
 publicacion_id text, publicacion_url text, publicacion_texto text,
 padre_id text,
 autor_id text, autor_nombre text,
 texto text,
 created_at timestamptz not null default now(),
 estado text not null default 'pendiente' check (estado in ('pendiente','respondido','privado','ignorado')),
 ia_sugerencia text, ia_error text, ia_at timestamptz,
 respuesta text, respuesta_id text, respondido_por uuid references public.profiles(id) on delete set null, respondido_at timestamptz
);
create index if not exists redes_comentarios_estado on public.redes_comentarios(estado, created_at desc);
alter table public.redes_comentarios enable row level security;
create policy redes_comentarios_ver on public.redes_comentarios for select to authenticated using ((select private.whatsapp_puede_ver(null)));
revoke insert, update, delete on public.redes_comentarios from anon, authenticated;
alter publication supabase_realtime add table public.redes_comentarios;
