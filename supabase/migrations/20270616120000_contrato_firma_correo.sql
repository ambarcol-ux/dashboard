-- Contract to the customer's e-mail for signature + reminders (app/api/contratos/recibos, worker every 5 minutes with {"solo":"firma"}).
-- A draft (borrador) with a valid e-mail gets the signing link right away, then reminders at 24 hours, 3 days and 7 days; it stops when
-- she signs, the contract stops being a draft or the event passes. Each send is logged in bitacora_contratos («Contrato enviado para firma»).
-- Only drafts created from 2026-11-24 (older ones are handled by the sedes). Revert: unschedule 'contratos-firma-correo' and drop the function.
create or replace function public.contratos_firma_por_enviar(p_limite int default 20)
returns table(id uuid,numero text,nombre text,email text,sede text,fecha_evento date,valor numeric,abono numeric,envios int)
language sql stable security definer set search_path='' as $$
 with k as(
  select c.id,c.numero_contrato::text numero,c.cliente_nombre::text nombre,trim(c.cliente_email)::text email,s.nombre::text sede,c.fecha_evento::date fecha_evento,
   coalesce(c.valor_total,0)+coalesce(c.total_arreglos,0) valor,coalesce(c.anticipo,0) abono,
   (select count(*) from public.bitacora_contratos b where b.contrato_id=c.id and b.accion='Contrato enviado para firma')::int envios,
   (select max(b.created_at) from public.bitacora_contratos b where b.contrato_id=c.id and b.accion='Contrato enviado para firma') ultimo
  from public.contratos c left join public.sedes s on s.id=c.sede_id
  where lower(coalesce(c.estado,''))='borrador' and c.created_at>='2026-11-24 00:00:00-05'
   and trim(coalesce(c.cliente_email,'')) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
   and (c.fecha_evento is null or c.fecha_evento>=(now() at time zone 'America/Bogota')::date))
 select k.id,k.numero,k.nombre,k.email,k.sede,k.fecha_evento,k.valor,k.abono,k.envios from k
 where k.envios=0 or (k.envios=1 and k.ultimo<now()-interval '24 hours') or (k.envios=2 and k.ultimo<now()-interval '48 hours')
  or (k.envios=3 and k.ultimo<now()-interval '4 days')
 order by k.envios,k.numero limit greatest(1,least(coalesce(p_limite,20),50));
$$;
revoke all on function public.contratos_firma_por_enviar(int) from public,anon,authenticated;
grant execute on function public.contratos_firma_por_enviar(int) to service_role;

select cron.schedule('contratos-firma-correo','*/5 * * * *',$job$
 select net.http_post(url:='https://erp.ambarcouture.com/api/contratos/recibos',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_worker_secret')),
  body:='{"solo":"firma"}'::jsonb, timeout_milliseconds:=55000) where exists(select 1 from public.contratos_firma_por_enviar(1));
$job$);
