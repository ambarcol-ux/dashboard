-- Every 5 minutes Supabase asks the ERP to send due first-visit WhatsApp messages and customer emails
-- (replaces the Apps Script trigger). The route does nothing while FIRST_VISIT_MESSAGES_ENABLED is off.
-- The bearer secret lives in Supabase Vault as 'erp_worker_secret' (same value as FIRST_VISIT_WORKER_SECRET
-- in Vercel); it was created with vault.create_secret and is never stored in the repository.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('primeras-citas-envios','*/5 * * * *',$$
 select net.http_post(
  url:='https://erp.ambarcouture.com/api/primeras-citas/procesar',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb,
  timeout_milliseconds:=55000);
$$);
