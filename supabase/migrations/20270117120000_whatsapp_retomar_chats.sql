-- WhatsApp 304: chats the AI picks up again at a set time (for example, unanswered ad chats while Meta's 24-hour window is still open).
-- Every 5 minutes Supabase calls /api/whatsapp/retomar with the same worker secret as the other jobs.
-- Reversión: select cron.unschedule('whatsapp-retomar'); alter table public.whatsapp_conversaciones drop column ia_retomar_at;
alter table public.whatsapp_conversaciones add column if not exists ia_retomar_at timestamptz;
create index if not exists whatsapp_conversaciones_retomar_idx on public.whatsapp_conversaciones(ia_retomar_at) where ia_retomar_at is not null;
select cron.schedule('whatsapp-retomar','*/5 * * * *',$$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/whatsapp/retomar',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=55000);
$$);
