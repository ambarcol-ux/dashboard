-- IA de WhatsApp que aprende sola: análisis diario (antes semanal) que aplica sus mejoras automáticamente (autorizado por administración,
-- con historial para volver atrás) y registro de los datos que le faltaron cuando pasó un chat a una persona, para que administración los complete.
-- Reversión: select cron.schedule('whatsapp-analisis-semanal','40 12 * * 1',<mismo comando>); drop table public.whatsapp_ia_faltantes;
--   drop function public.guardar_whatsapp_ia_servidor(text,text,text), public.completar_dato_ia(bigint,text,boolean), public.guardar_whatsapp_ia_aprender(boolean); alter table public.whatsapp_ia_config drop column auto_aprender;
alter table public.whatsapp_ia_config add column if not exists auto_aprender boolean not null default true;

create table if not exists public.whatsapp_ia_faltantes(
 id bigint generated always as identity primary key,
 conversacion_id uuid references public.whatsapp_conversaciones(id) on delete set null,
 falta text not null check (length(trim(falta)) between 3 and 300),
 pregunta text,
 veces int not null default 1,
 estado text not null default 'pendiente' check (estado in ('pendiente','resuelto','descartado')),
 respuesta text,
 created_at timestamptz not null default now(), ultima_at timestamptz not null default now(), resuelto_at timestamptz
);
create index if not exists whatsapp_ia_faltantes_estado on public.whatsapp_ia_faltantes(estado, ultima_at desc);
alter table public.whatsapp_ia_faltantes enable row level security;
create policy whatsapp_ia_faltantes_ver on public.whatsapp_ia_faltantes for select to authenticated using ((select public.es_admin()));
revoke insert, update, delete on public.whatsapp_ia_faltantes from anon, authenticated;

-- Server (daily analysis): saves the AI settings without a user session; the history shows it as an automatic change.
create or replace function public.guardar_whatsapp_ia_servidor(p_conocimientos text, p_instrucciones text, p_escalamiento text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if length(coalesce(p_conocimientos,''))+length(coalesce(p_instrucciones,''))+length(coalesce(p_escalamiento,''))>60000 then raise exception 'El texto es demasiado largo.'; end if;
 update public.whatsapp_ia_config set conocimientos=coalesce(p_conocimientos,''),instrucciones=coalesce(p_instrucciones,''),escalamiento=coalesce(p_escalamiento,''),actualizado_por=null,actualizado_at=now() where id=1;
 insert into public.whatsapp_ia_historial(conocimientos,instrucciones,escalamiento,usuario_id) values (coalesce(p_conocimientos,''),coalesce(p_instrucciones,''),coalesce(p_escalamiento,''),null);
end $$;
revoke all on function public.guardar_whatsapp_ia_servidor(text,text,text) from public, anon, authenticated;
grant execute on function public.guardar_whatsapp_ia_servidor(text,text,text) to service_role;

-- Administration turns the daily automatic learning on or off.
create or replace function public.guardar_whatsapp_ia_aprender(p_activa boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.es_admin() then raise exception 'Solo administración puede cambiar la IA de WhatsApp.'; end if;
 update public.whatsapp_ia_config set auto_aprender=coalesce(p_activa,true) where id=1;
end $$;
revoke all on function public.guardar_whatsapp_ia_aprender(boolean) from public, anon;
grant execute on function public.guardar_whatsapp_ia_aprender(boolean) to authenticated;

-- Administration answers a missing piece of information: it is added to the AI's knowledge (and kept in the history) or set aside.
create or replace function public.completar_dato_ia(p_id bigint, p_respuesta text, p_descartar boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare f public.whatsapp_ia_faltantes; c public.whatsapp_ia_config; t text:=btrim(coalesce(p_respuesta,''));
begin
 if not public.es_admin() then raise exception 'Solo administración puede completar lo que le falta a la IA.'; end if;
 select * into f from public.whatsapp_ia_faltantes where id=p_id for update;
 if f.id is null or f.estado<>'pendiente' then raise exception 'Este dato ya fue atendido.'; end if;
 if p_descartar then update public.whatsapp_ia_faltantes set estado='descartado',resuelto_at=now() where id=p_id; return; end if;
 if length(t)<2 or length(t)>2000 then raise exception 'Escribe la información (máximo 2000 caracteres).'; end if;
 select * into c from public.whatsapp_ia_config where id=1;
 perform public.guardar_whatsapp_ia(rtrim(coalesce(c.conocimientos,''))||E'\n- '||f.falta||': '||t,c.instrucciones,c.escalamiento);
 update public.whatsapp_ia_faltantes set estado='resuelto',respuesta=t,resuelto_at=now() where id=p_id;
end $$;
revoke all on function public.completar_dato_ia(bigint,text,boolean) from public, anon;
grant execute on function public.completar_dato_ia(bigint,text,boolean) to authenticated;

-- The analysis now runs every day at 7:40 a. m. (Bogotá).
select cron.schedule('whatsapp-analisis-semanal','40 12 * * *',$$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/whatsapp/analisis',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000);
$$);
