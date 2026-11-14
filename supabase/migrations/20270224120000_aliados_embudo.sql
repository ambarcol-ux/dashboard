-- Embudo de Aliados directos (puntos aprobados por la dueña el 14/11/2026):
-- a) Origen: de qué anuncio/canal y de qué chat del 304 llegó cada aliado.
-- b) Recordatorio a quien conversó como posible aliado y no terminó la vinculación (plantilla ambar_aliado_recordatorio, cuando Meta la apruebe).
-- c) Bienvenida por WhatsApp al aprobarlo (en la app).
-- Además: aliados extranjeros con pasaporte (letras y números) y las automatizaciones de clientas no les escriben a los aliados.
-- Reversión: alter table public.aliados drop column conversacion_id, drop column origen_detalle;
--   alter table public.aliados drop constraint aliados_cedula_check, add constraint aliados_cedula_check check (cedula ~ '^[0-9]{5,15}$');
--   alter table public.whatsapp_conversaciones drop column aliado_recordatorio_at; drop function public.crm_aliados_tomar(int), private.crm_aliados_tomar(int);
--   volver a aplicar private.crm_tel_ocupado y private.crm_reactivacion_tomar de 20270222120000_crm_autogestion_leads.sql.
alter table public.aliados drop constraint aliados_cedula_check,
 add constraint aliados_cedula_check check (cedula ~ '^[0-9A-Z]{5,15}$');
alter table public.aliados
 add column if not exists conversacion_id uuid references public.whatsapp_conversaciones(id) on delete set null,
 add column if not exists origen_detalle text check (origen_detalle is null or length(origen_detalle)<=120);
alter table public.whatsapp_conversaciones add column if not exists aliado_recordatorio_at timestamptz;

-- Customer automations skip phones of allies too.
create or replace function private.crm_tel_ocupado(p_tel text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.primeras_citas c where right(regexp_replace(coalesce(c.telefono,''),'\D','','g'),10)=right(regexp_replace(coalesce(p_tel,''),'\D','','g'),10)
   and c.estado<>'cancelada' and c.created_at>now()-interval '240 days')
  or exists(select 1 from public.contratos k where lower(coalesce(k.estado,'')) not in ('anulado','cancelado','borrador','rechazado') and k.created_at>now()-interval '240 days'
   and right(regexp_replace(coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp,''),'\D','','g'),10)=right(regexp_replace(coalesce(p_tel,''),'\D','','g'),10))
  or exists(select 1 from public.aliados a where right(regexp_replace(coalesce(a.celular,''),'\D','','g'),10)=right(regexp_replace(coalesce(p_tel,''),'\D','','g'),10))
$$;

-- Ally chats are not reactivated with the customer greeting.
do $do$
declare d text;
begin
 d:=pg_get_functiondef('private.crm_reactivacion_tomar(int)'::regprocedure);
 d:=replace(d,$x$and not w.ia_pausada and not w.ia_atender and coalesce(w.etiqueta,'')<>'reclamo'
   and (w.cierre_crm_at is null$x$,$x$and not w.ia_pausada and not w.ia_atender and coalesce(w.etiqueta,'') not in ('reclamo','aliado')
   and (w.cierre_crm_at is null$x$);
 if position($x$not in ('reclamo','aliado')$x$ in d)=0 then raise exception 'crm_reactivacion_tomar: texto no encontrado'; end if;
 execute d;
end $do$;

-- b) Possible allies who talked 1–10 days ago and have not signed up: one reminder per conversation round.
create or replace function private.crm_aliados_tomar(p_limite int)
returns table(conv_id uuid, telefono text, nombre text)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
begin
 return query
 with d as (
  select w.id from public.whatsapp_conversaciones w
  where w.etiqueta='aliado' and coalesce(w.canal,'whatsapp')='whatsapp' and length(regexp_replace(coalesce(w.telefono,''),'\D','','g'))>=10
   and w.ultimo_entrante_at between now()-interval '10 days' and now()-interval '24 hours'
   and not w.ia_pausada and not w.ia_atender
   and (w.aliado_recordatorio_at is null or w.aliado_recordatorio_at<w.ultimo_entrante_at)
   and not exists(select 1 from public.aliados a where right(regexp_replace(coalesce(a.celular,''),'\D','','g'),10)=right(regexp_replace(w.telefono,'\D','','g'),10))
  order by w.ultimo_entrante_at desc limit greatest(1,least(p_limite,50))
  for update skip locked),
 m as (update public.whatsapp_conversaciones w set aliado_recordatorio_at=now() from d where w.id=d.id returning w.id,w.telefono,w.nombre)
 select m.id,m.telefono,m.nombre from m;
end $$;
create or replace function public.crm_aliados_tomar(p_limite int) returns table(conv_id uuid, telefono text, nombre text)
language sql security definer set search_path='' as $$ select * from private.crm_aliados_tomar(p_limite) $$;
revoke all on function private.crm_aliados_tomar(int), public.crm_aliados_tomar(int) from public, anon, authenticated;
grant execute on function public.crm_aliados_tomar(int) to service_role;

select cron.schedule('crm-aliados','35 15,21 * * 1-6',$c$
 select net.http_post(url:='https://erp.ambarcouture.com/api/crm/automatico',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{"tipo":"aliados"}'::jsonb, timeout_milliseconds:=60000);
$c$);
