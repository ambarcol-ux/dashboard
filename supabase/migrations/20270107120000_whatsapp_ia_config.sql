-- WhatsApp 304 › IA de WhatsApp: conocimientos, instrucciones y reglas de paso a una persona que escribe administración.
-- Cada guardado queda en el historial. La IA marca los chats que una persona debe atender (urgente + motivo).
-- Reversión: drop function public.guardar_whatsapp_ia(text,text,text); drop table public.whatsapp_ia_historial; drop table public.whatsapp_ia_config;
--   alter table public.whatsapp_conversaciones drop column ia_atender, drop column ia_motivo;
create table public.whatsapp_ia_config(
 id smallint primary key default 1 check (id=1),
 conocimientos text not null default '',
 instrucciones text not null default '',
 escalamiento text not null default '',
 actualizado_por uuid references public.profiles(id) on delete set null,
 actualizado_at timestamptz not null default now()
);
insert into public.whatsapp_ia_config(id) values (1) on conflict do nothing;
create table public.whatsapp_ia_historial(
 id bigint generated always as identity primary key,
 conocimientos text not null, instrucciones text not null, escalamiento text not null,
 usuario_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table public.whatsapp_ia_config enable row level security;
alter table public.whatsapp_ia_historial enable row level security;
create policy whatsapp_ia_config_ver on public.whatsapp_ia_config for select to authenticated using ((select public.es_admin()));
create policy whatsapp_ia_historial_ver on public.whatsapp_ia_historial for select to authenticated using ((select public.es_admin()));
revoke insert,update,delete on public.whatsapp_ia_config, public.whatsapp_ia_historial from anon, authenticated;

alter table public.whatsapp_conversaciones add column if not exists ia_atender boolean not null default false, add column if not exists ia_motivo text;

create or replace function public.guardar_whatsapp_ia(p_conocimientos text, p_instrucciones text, p_escalamiento text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración puede cambiar la IA de WhatsApp.'; end if;
 if length(coalesce(p_conocimientos,''))+length(coalesce(p_instrucciones,''))+length(coalesce(p_escalamiento,''))>60000 then raise exception 'El texto es demasiado largo (máximo 60.000 caracteres en total).'; end if;
 update public.whatsapp_ia_config set conocimientos=coalesce(p_conocimientos,''),instrucciones=coalesce(p_instrucciones,''),escalamiento=coalesce(p_escalamiento,''),actualizado_por=auth.uid(),actualizado_at=now() where id=1;
 insert into public.whatsapp_ia_historial(conocimientos,instrucciones,escalamiento,usuario_id) values (coalesce(p_conocimientos,''),coalesce(p_instrucciones,''),coalesce(p_escalamiento,''),auth.uid());
end $$;
revoke all on function public.guardar_whatsapp_ia(text,text,text) from public, anon;
grant execute on function public.guardar_whatsapp_ia(text,text,text) to authenticated;
