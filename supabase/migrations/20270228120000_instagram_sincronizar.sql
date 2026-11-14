-- Instagram: mensajes directos traídos por el ERP cada 2 minutos (Meta no los entrega por webhook sin acceso avanzado).
-- Reversión: select cron.unschedule('instagram-sincronizar');
select cron.schedule('instagram-sincronizar','*/2 * * * *',$c$
 select net.http_post(url:='https://erp.ambarcouture.com/api/meta/redes/sincronizar',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{}'::jsonb, timeout_milliseconds:=60000);
$c$);
