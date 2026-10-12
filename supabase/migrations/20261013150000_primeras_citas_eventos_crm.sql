-- ERP → CRM (Apps Script): every ERP-native booking, reschedule and cancellation is queued
-- for the CRM, which keeps sending confirmations, reminders, POSCITA and Meta CAPI.
-- Apps Script pulls the queue with the worker secret; nothing new is exposed publicly.
-- Rows imported from the CRM (crm_origen_id) are never echoed back.
create table public.primeras_citas_eventos_crm (
 id uuid primary key default gen_random_uuid(),
 cita_id uuid not null references public.primeras_citas(id),
 evento text not null check (evento in ('BOOKING_CREATED','BOOKING_RESCHEDULED','BOOKING_CANCELLED')),
 revision integer not null,
 datos jsonb not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 estado text not null default 'pendiente' check (estado in ('pendiente','enviando','entregado','error','omitido')),
 intentos integer not null default 0,
 respuesta text
);
create index primeras_citas_eventos_crm_pendientes on public.primeras_citas_eventos_crm(created_at) where estado in ('pendiente','error','enviando');
create index primeras_citas_eventos_crm_cita on public.primeras_citas_eventos_crm(cita_id,created_at);
alter table public.primeras_citas_eventos_crm enable row level security;
revoke all on public.primeras_citas_eventos_crm from public,anon,authenticated;
grant select on public.primeras_citas_eventos_crm to authenticated;
grant all on public.primeras_citas_eventos_crm to service_role;
create policy eventos_crm_lectura on public.primeras_citas_eventos_crm for select to authenticated using(exists(select 1 from public.primeras_citas c where c.id=cita_id));

create function private.encolar_evento_crm_primera_cita() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text;
begin
 if new.crm_origen_id is not null then return new; end if;
 if tg_op='INSERT' then kind:='BOOKING_CREATED';
 elsif new.estado='cancelada' and old.estado<>'cancelada' then kind:='BOOKING_CANCELLED';
 elsif new.estado='cancelada' then return new;
 elsif (new.fecha,new.hora,new.modalidad,new.sede_id) is distinct from (old.fecha,old.hora,old.modalidad,old.sede_id) then kind:='BOOKING_RESCHEDULED';
 else return new;
 end if;
 -- Snapshot at change time: a later edit never rewrites what an earlier event said.
 insert into public.primeras_citas_eventos_crm(cita_id,evento,revision,datos) values(new.id,kind,new.revision,jsonb_build_object(
  'fecha',new.fecha,'hora',to_char(new.hora,'HH24:MI'),'modalidad',new.modalidad,'sede_id',new.sede_id,'sede',(select nombre from public.sedes where id=new.sede_id),
  'nombre',new.cliente_nombre,'email',new.email,'telefono',new.telefono,'documento',new.cliente_documento,'tipo_vestido',new.tipo_vestido,'fecha_evento',new.fecha_evento,
  'motivo',new.motivo,'enlace_virtual',new.enlace_virtual,'creada',new.created_at,
  'anterior',case when kind='BOOKING_RESCHEDULED' then jsonb_build_object('fecha',old.fecha,'hora',to_char(old.hora,'HH24:MI')) end));
 return new;
end; $$;
revoke all on function private.encolar_evento_crm_primera_cita() from public,anon,authenticated;
create trigger encolar_evento_crm_primera_cita after insert or update of fecha,hora,modalidad,sede_id,estado on public.primeras_citas for each row execute function private.encolar_evento_crm_primera_cita();

-- reservar_primera_cita_completa/documento fill tipo_vestido, fecha_evento and cliente_documento right after the INSERT,
-- in the same transaction; keep the still-pending CREATED event in sync with them.
create function private.actualizar_evento_crm_creacion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.primeras_citas_eventos_crm set datos=datos||jsonb_build_object('tipo_vestido',new.tipo_vestido,'fecha_evento',new.fecha_evento,'documento',new.cliente_documento),updated_at=now()
 where cita_id=new.id and evento='BOOKING_CREATED' and estado='pendiente';
 return new;
end; $$;
revoke all on function private.actualizar_evento_crm_creacion() from public,anon,authenticated;
create trigger actualizar_evento_crm_creacion after update of tipo_vestido,fecha_evento,cliente_documento on public.primeras_citas for each row execute function private.actualizar_evento_crm_creacion();

-- Server-only claim, oldest first so a reschedule never reaches the CRM before its booking.
create function public.tomar_evento_crm_primera_cita() returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.primeras_citas_eventos_crm;
begin
 update public.primeras_citas_eventos_crm set estado='error',respuesta='Sin confirmación del CRM; se reintentará.',updated_at=now() where estado='enviando' and updated_at<now()-interval '10 minutes';
 select * into r from public.primeras_citas_eventos_crm e where estado in ('pendiente','error') and intentos<5 and (estado='pendiente' or updated_at<now()-interval '5 minutes')
  and not exists(select 1 from public.primeras_citas_eventos_crm x where x.cita_id=e.cita_id and x.created_at<e.created_at and x.estado not in ('entregado','omitido') and x.intentos<5)
  order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.primeras_citas_eventos_crm set estado='enviando',intentos=intentos+1,updated_at=now() where id=r.id;
 return to_jsonb(r);
end; $$;
revoke all on function public.tomar_evento_crm_primera_cita() from public,anon,authenticated;
grant execute on function public.tomar_evento_crm_primera_cita() to service_role;
notify pgrst,'reload schema';
