-- IA de WhatsApp › análisis semanal: cada lunes 7:40 a. m. (Bogotá) se comparan los chats que terminaron en primera cita con los
-- que no; el informe queda en el chat de conocimientos con los cambios propuestos (se aplican solo con el «sí» de administración).
-- Reversión: select cron.unschedule('whatsapp-analisis-semanal'); drop table public.whatsapp_ia_analisis;
create table if not exists public.whatsapp_ia_analisis(
 id bigint generated always as identity primary key,
 desde date not null, hasta date not null,
 metricas jsonb not null, resumen text not null, propuesta jsonb,
 created_at timestamptz not null default now()
);
alter table public.whatsapp_ia_analisis enable row level security;
create policy whatsapp_ia_analisis_ver on public.whatsapp_ia_analisis for select to authenticated using ((select public.es_admin()));
revoke insert,update,delete on public.whatsapp_ia_analisis from anon, authenticated;
select cron.schedule('whatsapp-analisis-semanal','40 12 * * 1',$$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/whatsapp/analisis',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000);
$$);
