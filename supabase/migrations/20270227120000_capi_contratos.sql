-- Meta: cada contrato vigente con autorización de datos para marketing (cláusula 17, autoriza_uso_imagen) se envía como «Purchase»
-- con su valor, aunque no venga de una primera cita (clientas directas, de aliados o contratos sin vincular). Se envía como venta
-- en tienda física (action_source physical_store), que Meta acepta hasta 62 días después. Si el contrato viene de una primera cita,
-- usa el mismo event_id del «Alquiló» de esa cita para que Meta no lo cuente dos veces.
-- Reversión: delete from public.primeras_citas_capi where contrato_id is not null; drop function private.capi_contratos_encolar(int);
--   drop function public.capi_contratos_encolar(int); alter table public.primeras_citas_capi drop constraint primeras_citas_capi_origen,
--   drop column contrato_id, drop column valor, drop column action_source, alter column cita_id set not null;
--   volver a aplicar public.tomar_capi_primera_cita anterior (20261014210000_primeras_citas_meta_capi.sql).
alter table public.primeras_citas_capi
 alter column cita_id drop not null,
 add column if not exists contrato_id uuid references public.contratos(id) on delete cascade,
 add column if not exists valor numeric(14,2),
 add column if not exists action_source text not null default 'system_generated' check (action_source in ('system_generated','physical_store'));
alter table public.primeras_citas_capi add constraint primeras_citas_capi_origen check (cita_id is not null or contrato_id is not null);

-- Queues the contracts of the last N days (max 62) not yet sent. Called by the worker every run with 7; once by hand for the backlog.
create or replace function private.capi_contratos_encolar(p_dias int) returns int
language plpgsql security definer set search_path='' as $$
declare n int;
begin
 insert into public.primeras_citas_capi(contrato_id,evento,event_id,event_time,valor,action_source)
 select k.id,'Purchase',case when k.primera_cita_id is not null then 'erp_alquilo_'||k.primera_cita_id else 'erp_contrato_'||k.id end,
  k.created_at,nullif(k.valor_total,0),'physical_store'
 from public.contratos k
 where k.created_at>now()-make_interval(days=>greatest(1,least(coalesce(p_dias,7),62)))
  and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','borrador','rechazado')
  and coalesce(k.autoriza_uso_imagen,false)
  and (coalesce(k.cliente_email,'')<>'' or coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp,'')<>'')
  and not exists(select 1 from public.primeras_citas_capi p where p.contrato_id=k.id)
  and not exists(select 1 from public.primeras_citas_capi p where p.evento='Purchase' and k.primera_cita_id is not null and p.cita_id=k.primera_cita_id)
 on conflict (event_id) do nothing;
 get diagnostics n=row_count;
 return n;
end $$;
create or replace function public.capi_contratos_encolar(p_dias int) returns int
language sql security definer set search_path='' as $$ select private.capi_contratos_encolar(p_dias) $$;
revoke all on function private.capi_contratos_encolar(int), public.capi_contratos_encolar(int) from public, anon, authenticated;
grant execute on function public.capi_contratos_encolar(int) to service_role;

-- The worker's queue now also serves contract events: data from the contract, 62 days for store sales.
create or replace function public.tomar_capi_primera_cita()
 returns jsonb language plpgsql set search_path to '' as $function$
declare e public.primeras_citas_capi; c public.primeras_citas; k public.contratos;
begin
 update public.primeras_citas_capi set estado='error',respuesta='Resultado desconocido; se reintentará.',updated_at=now() where estado='enviando' and updated_at<now()-interval '10 minutes';
 select * into e from public.primeras_citas_capi where estado in ('pendiente','error') and intentos<5 and (estado='pendiente' or updated_at<now()-interval '10 minutes')
  order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 if e.event_time<now()-(case when e.action_source='physical_store' then interval '62 days' else interval '7 days' end) then
  update public.primeras_citas_capi set estado='omitido',respuesta=case when e.action_source='physical_store' then 'Venta con más de 62 días' else 'Evento con más de 7 días' end,updated_at=now() where id=e.id;
  return jsonb_build_object('omitido',true);
 end if;
 update public.primeras_citas_capi set estado='enviando',intentos=intentos+1,updated_at=now() where id=e.id;
 if e.cita_id is not null then
  select * into c from public.primeras_citas where id=e.cita_id;
  return jsonb_build_object('evento',to_jsonb(e),'cita',jsonb_build_object('id',c.id,'email',c.email,'telefono',c.telefono,'cliente_nombre',c.cliente_nombre),'sede',(select nombre from public.sedes where id=c.sede_id));
 end if;
 select * into k from public.contratos where id=e.contrato_id;
 return jsonb_build_object('evento',to_jsonb(e),'cita',jsonb_build_object('id',coalesce(k.primera_cita_id,k.id),'email',k.cliente_email,'telefono',coalesce(nullif(k.cliente_whatsapp,''),k.whatsapp),'cliente_nombre',k.cliente_nombre),'sede',(select nombre from public.sedes where id=k.sede_id));
end; $function$;
