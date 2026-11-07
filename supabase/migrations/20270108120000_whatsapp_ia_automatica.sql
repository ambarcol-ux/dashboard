-- WhatsApp 304 › respuesta automática de la IA: interruptor general (administración) y pausa por chat.
-- Una persona que escribe en el chat (ERP o celular) pausa la IA en ese chat; vuelve sola tras las horas configuradas o con el botón.
-- Reversión: drop function public.whatsapp_ia_auto_estado(); drop function public.guardar_whatsapp_ia_auto(boolean,integer);
--   drop table public.whatsapp_ia_auto_historial; alter table public.whatsapp_ia_config drop column auto_activa, drop column reactivar_horas;
--   alter table public.whatsapp_conversaciones drop column ia_pausada, drop column ia_pausada_at, drop column ia_pausada_por;
--   alter table public.whatsapp_mensajes drop constraint whatsapp_mensajes_origen_check, add constraint whatsapp_mensajes_origen_check check (origen in ('clienta','erp','celular'));
alter table public.whatsapp_ia_config add column if not exists auto_activa boolean not null default false,
 add column if not exists reactivar_horas integer not null default 12 check (reactivar_horas between 1 and 72);
create table public.whatsapp_ia_auto_historial(
 id bigint generated always as identity primary key,
 activa boolean not null, reactivar_horas integer not null,
 usuario_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table public.whatsapp_ia_auto_historial enable row level security;
create policy whatsapp_ia_auto_historial_ver on public.whatsapp_ia_auto_historial for select to authenticated using ((select public.es_admin()));
revoke insert,update,delete on public.whatsapp_ia_auto_historial from anon, authenticated;

alter table public.whatsapp_conversaciones add column if not exists ia_pausada boolean not null default false,
 add column if not exists ia_pausada_at timestamptz, add column if not exists ia_pausada_por uuid references public.profiles(id) on delete set null;
alter table public.whatsapp_mensajes drop constraint if exists whatsapp_mensajes_origen_check;
alter table public.whatsapp_mensajes add constraint whatsapp_mensajes_origen_check check (origen in ('clienta','erp','celular','ia'));

create or replace function public.guardar_whatsapp_ia_auto(p_activa boolean, p_horas integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración puede encender o apagar la respuesta automática.'; end if;
 if p_horas is null or p_horas<1 or p_horas>72 then raise exception 'Las horas para reactivar deben estar entre 1 y 72.'; end if;
 update public.whatsapp_ia_config set auto_activa=coalesce(p_activa,false),reactivar_horas=p_horas where id=1;
 insert into public.whatsapp_ia_auto_historial(activa,reactivar_horas,usuario_id) values (coalesce(p_activa,false),p_horas,auth.uid());
end $$;
revoke all on function public.guardar_whatsapp_ia_auto(boolean,integer) from public, anon;
grant execute on function public.guardar_whatsapp_ia_auto(boolean,integer) to authenticated;

-- The inbox shows whether automatic replies are on (anyone who can open WhatsApp 304).
create or replace function public.whatsapp_ia_auto_estado() returns jsonb
language sql stable security definer set search_path='' as $$
 select case when public.es_admin() or private.tiene_permiso('panel.whatsapp')
  then (select jsonb_build_object('activa',auto_activa,'horas',reactivar_horas) from public.whatsapp_ia_config where id=1) end
$$;
revoke all on function public.whatsapp_ia_auto_estado() from public, anon;
grant execute on function public.whatsapp_ia_auto_estado() to authenticated;
