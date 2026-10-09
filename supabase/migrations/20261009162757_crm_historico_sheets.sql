-- Preserve source rows independently of calendar validation and messaging.
create table public.crm_historico (
 id uuid primary key default gen_random_uuid(),
 archivo_origen text not null, hoja text not null check(hoja in ('CITAS','VITRINA','POST_CITA','SEGUIMIENTO COMERCIAL')),
 fila integer not null check(fila>=2), id_externo text not null,
 importado_at timestamptz not null default now(),
 sede_id uuid references public.sedes(id), fecha date,
 nombre text not null default '', asesora text not null default '',
 asistencia boolean, alquilo boolean, recuperada boolean not null default false,
 motivo text not null default '', incidencia text not null default '',
 datos jsonb not null, valores_originales jsonb not null, calendario jsonb,
 unique(archivo_origen,hoja,fila)
);
create index crm_historico_sede_fecha on public.crm_historico(sede_id,fecha);
create index crm_historico_id_externo on public.crm_historico(hoja,id_externo);
alter table public.crm_historico enable row level security;
revoke all on public.crm_historico from public,anon,authenticated;
grant select on public.crm_historico to authenticated;
grant all on public.crm_historico to service_role;
create policy crm_historico_lectura on public.crm_historico for select to authenticated using(private.acceso_primera_cita(sede_id,'presencial'));

alter table public.primeras_citas add column crm_origen_id uuid unique references public.crm_historico(id), add column crm_mensajes_activos boolean not null default false;
alter table public.primeras_citas alter column consentimiento_at drop not null;
alter table public.primeras_citas add constraint primeras_citas_consentimiento_origen check(consentimiento_at is not null or crm_origen_id is not null);

create or replace function private.programar_mensajes_primera_cita() returns trigger language plpgsql security invoker set search_path='' as $$
declare start_at timestamptz;
begin
 if new.estado='cancelada' or new.resultado_comercial='NO CONTACTAR' then
  update public.primeras_citas_mensajes set estado='omitido',updated_at=now() where cita_id=new.id and estado in ('pendiente','error');return new;
 end if;
 if new.crm_origen_id is not null and not new.crm_mensajes_activos then return new;end if;
 if tg_op='UPDATE' and new.revision=old.revision and new.estado=old.estado and new.resultado_comercial=old.resultado_comercial and new.crm_mensajes_activos=old.crm_mensajes_activos then return new; end if;
 if tg_op='UPDATE' and new.revision=old.revision and new.crm_mensajes_activos=old.crm_mensajes_activos then return new; end if;
 update public.primeras_citas_mensajes set estado='omitido',updated_at=now() where cita_id=new.id and revision<>new.revision and estado in ('pendiente','error');
 start_at:=(new.fecha+new.hora) at time zone 'America/Bogota';
 insert into public.primeras_citas_mensajes(cita_id,revision,tipo,programado_at)
 select new.id,new.revision,t,dt from (values ('confirmacion',now()),('recordatorio24',start_at-interval '24 hours'),('recordatorio2',start_at-interval '2 hours'),('post_cita',start_at+interval '150 minutes'),('correo_interno',now())) q(t,dt)
 where dt>=now() or t in ('confirmacion','correo_interno') on conflict do nothing;
 return new;
end; $$;
notify pgrst,'reload schema';
