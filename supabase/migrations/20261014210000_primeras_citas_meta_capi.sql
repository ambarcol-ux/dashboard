-- Meta Conversions API from the ERP (replaces the CRM Apps Script CAPI).
-- Events per first visit: Schedule (ERP-native booking), AppointmentAttended, Purchase (rented).
-- Visits imported from the CRM reuse the Apps Script event_id (capi_<etapa>_<id externo>) so Meta
-- deduplicates anything the script already sent; Schedule for those was sent by the script.
create table public.primeras_citas_capi (
 id uuid primary key default gen_random_uuid(),
 cita_id uuid not null references public.primeras_citas(id) on delete cascade,
 evento text not null check (evento in ('Schedule','AppointmentAttended','Purchase')),
 event_id text not null unique,
 event_time timestamptz not null default now(),
 estado text not null default 'pendiente' check (estado in ('pendiente','enviando','enviado','error','omitido')),
 intentos integer not null default 0,
 respuesta text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index primeras_citas_capi_pendientes on public.primeras_citas_capi(created_at) where estado in ('pendiente','error','enviando');
alter table public.primeras_citas_capi enable row level security;
revoke all on public.primeras_citas_capi from public,anon,authenticated;
grant all on public.primeras_citas_capi to service_role;

create function private.encolar_capi_primera_cita() returns trigger language plpgsql security definer set search_path='' as $$
declare ext text; attended boolean; rented boolean;
begin
 if new.crm_origen_id is not null then select id_externo into ext from public.crm_historico where id=new.crm_origen_id; end if;
 if tg_op='INSERT' and new.crm_origen_id is null then
  insert into public.primeras_citas_capi(cita_id,evento,event_id,event_time) values(new.id,'Schedule','erp_schedule_'||new.id,new.created_at) on conflict (event_id) do nothing;
 end if;
 attended:=new.respuesta_asistencia is true or new.estado in ('asistio','seguimiento','no_cerro');
 rented:=new.respuesta_alquiler is true or new.resultado_comercial='ALQUILÓ';
 if attended or rented then
  insert into public.primeras_citas_capi(cita_id,evento,event_id) values(new.id,'AppointmentAttended',coalesce('capi_asistio_'||ext,'erp_asistio_'||new.id)) on conflict (event_id) do nothing;
 end if;
 if rented then
  insert into public.primeras_citas_capi(cita_id,evento,event_id) values(new.id,'Purchase',coalesce('capi_alquilo_'||ext,'erp_alquilo_'||new.id)) on conflict (event_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.encolar_capi_primera_cita() from public,anon,authenticated;
create trigger encolar_capi_primera_cita after insert or update of respuesta_asistencia,respuesta_alquiler,resultado_comercial,estado on public.primeras_citas
 for each row execute function private.encolar_capi_primera_cita();

-- Worker claim: one event at a time, never re-sent once Meta accepted it.
create function public.tomar_capi_primera_cita() returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.primeras_citas_capi; c public.primeras_citas;
begin
 update public.primeras_citas_capi set estado='error',respuesta='Resultado desconocido; se reintentará.',updated_at=now() where estado='enviando' and updated_at<now()-interval '10 minutes';
 select * into e from public.primeras_citas_capi where estado in ('pendiente','error') and intentos<5 and (estado='pendiente' or updated_at<now()-interval '10 minutes')
  order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 -- Meta only accepts events up to 7 days old.
 if e.event_time<now()-interval '7 days' then
  update public.primeras_citas_capi set estado='omitido',respuesta='Evento con más de 7 días',updated_at=now() where id=e.id; return jsonb_build_object('omitido',true);
 end if;
 select * into c from public.primeras_citas where id=e.cita_id;
 update public.primeras_citas_capi set estado='enviando',intentos=intentos+1,updated_at=now() where id=e.id;
 return jsonb_build_object('evento',to_jsonb(e),'cita',jsonb_build_object('id',c.id,'email',c.email,'telefono',c.telefono,'cliente_nombre',c.cliente_nombre),'sede',(select nombre from public.sedes where id=c.sede_id));
end $$;
revoke all on function public.tomar_capi_primera_cita() from public,anon,authenticated;
grant execute on function public.tomar_capi_primera_cita() to service_role;

-- Backfill what Meta can still accept (last 6 days) for ERP-native visits the script never reported.
insert into public.primeras_citas_capi(cita_id,evento,event_id,event_time)
select id,'Schedule','erp_schedule_'||id,created_at from public.primeras_citas where crm_origen_id is null and created_at>now()-interval '6 days'
on conflict (event_id) do nothing;
insert into public.primeras_citas_capi(cita_id,evento,event_id,event_time)
select id,'AppointmentAttended','erp_asistio_'||id,updated_at from public.primeras_citas
 where crm_origen_id is null and updated_at>now()-interval '6 days' and (respuesta_asistencia is true or estado in ('asistio','seguimiento','no_cerro') or respuesta_alquiler is true or resultado_comercial='ALQUILÓ')
on conflict (event_id) do nothing;
insert into public.primeras_citas_capi(cita_id,evento,event_id,event_time)
select id,'Purchase','erp_alquilo_'||id,updated_at from public.primeras_citas
 where crm_origen_id is null and updated_at>now()-interval '6 days' and (respuesta_alquiler is true or resultado_comercial='ALQUILÓ')
on conflict (event_id) do nothing;
