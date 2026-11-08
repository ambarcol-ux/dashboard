-- IA de WhatsApp › chat de conocimientos: administración conversa con la IA sobre lo que sabe; los cambios se proponen
-- (antes → después) y solo se aplican cuando administración confirma. La conversación queda guardada.
-- Reversión: drop table public.whatsapp_ia_conocimiento_chat;
create table public.whatsapp_ia_conocimiento_chat(
 id bigint generated always as identity primary key,
 rol text not null check (rol in ('admin','ia')),
 texto text not null,
 propuesta jsonb,
 estado text check (estado in ('pendiente','aplicada','descartada')),
 usuario_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);
create index whatsapp_ia_conocimiento_chat_fecha on public.whatsapp_ia_conocimiento_chat(created_at desc);
alter table public.whatsapp_ia_conocimiento_chat enable row level security;
create policy whatsapp_ia_conocimiento_chat_ver on public.whatsapp_ia_conocimiento_chat for select to authenticated using ((select public.es_admin()));
revoke insert,update,delete on public.whatsapp_ia_conocimiento_chat from anon, authenticated;
