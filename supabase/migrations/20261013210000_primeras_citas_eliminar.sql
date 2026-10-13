-- Only users listed in private.eliminadores_primeras_citas can delete a first visit
-- (e.g. test bookings), in every site.
-- preparar_eliminacion_primera_cita checks permission, version and contracts, keeps an audit snapshot and
-- tells the CRM to cancel the visit when it already has it; the API route then removes the rows.

create table private.eliminadores_primeras_citas (
 usuario_id uuid primary key references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now()
);
revoke all on private.eliminadores_primeras_citas from public,anon,authenticated;
-- andres@ambarcouture.com (brand owner)
insert into private.eliminadores_primeras_citas(usuario_id)
 select id from public.profiles where id='3eb2e7b7-02ed-49e4-a1b3-eaf5258a1b59' on conflict do nothing;

create table private.primeras_citas_eliminadas (
 id uuid primary key default gen_random_uuid(),
 cita_id uuid not null,
 datos jsonb not null,
 historial jsonb not null,
 motivo text not null,
 usuario_id uuid not null,
 eliminada_at timestamptz not null default now()
);
revoke all on private.primeras_citas_eliminadas from public,anon,authenticated;

-- The CRM outbox keeps snapshots, so a cancellation can outlive a deleted visit.
alter table public.primeras_citas_eventos_crm drop constraint primeras_citas_eventos_crm_cita_id_fkey;

create function private.puede_eliminar_primeras_citas() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.eliminadores_primeras_citas e join public.profiles p on p.id=e.usuario_id where e.usuario_id=auth.uid() and p.activo is true);
$$;
create function public.puede_eliminar_primeras_citas() returns boolean language sql stable security invoker set search_path='' as $$ select private.puede_eliminar_primeras_citas(); $$;

create function private.preparar_eliminacion_primera_cita(p_id uuid,p_motivo text,p_version timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; reason text:=trim(coalesce(p_motivo,''));
begin
 if not private.puede_eliminar_primeras_citas() then raise exception 'No tienes permiso para eliminar citas.' using errcode='42501'; end if;
 select * into c from public.primeras_citas where id=p_id for update;
 if not found then raise exception 'La cita ya no existe.'; end if;
 if p_version is null or c.updated_at<>p_version then raise exception 'La cita cambió. Actualiza antes de eliminar.'; end if;
 if length(reason) not between 5 and 1000 then raise exception 'Escribe el motivo de la eliminación (mínimo 5 caracteres).'; end if;
 if exists(select 1 from public.contratos where primera_cita_id=c.id) then raise exception 'La cita tiene un contrato asociado. Revisa el contrato antes de eliminarla.'; end if;
 insert into private.primeras_citas_eliminadas(cita_id,datos,historial,motivo,usuario_id) values(c.id,to_jsonb(c)||jsonb_build_object('sede',(select nombre from public.sedes where id=c.sede_id)),
  coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.primeras_citas_historial h where h.cita_id=c.id),'[]'::jsonb),reason,auth.uid());
 -- Events the CRM never took are skipped; if it already has the visit, it is told to cancel it.
 update public.primeras_citas_eventos_crm set estado='omitido',respuesta='Cita eliminada del ERP',updated_at=now() where cita_id=c.id and estado in ('pendiente','error');
 if c.crm_origen_id is null and exists(select 1 from public.primeras_citas_eventos_crm where cita_id=c.id and estado in ('entregado','enviando'))
  and not exists(select 1 from public.primeras_citas_eventos_crm where cita_id=c.id and evento='BOOKING_CANCELLED' and estado in ('entregado','enviando')) then
  insert into public.primeras_citas_eventos_crm(cita_id,evento,revision,datos) values(c.id,'BOOKING_CANCELLED',c.revision,jsonb_build_object(
   'fecha',c.fecha,'hora',to_char(c.hora,'HH24:MI'),'modalidad',c.modalidad,'sede_id',c.sede_id,'sede',(select nombre from public.sedes where id=c.sede_id),
   'nombre',c.cliente_nombre,'email',c.email,'telefono',c.telefono,'documento',c.cliente_documento,'tipo_vestido',c.tipo_vestido,'fecha_evento',c.fecha_evento,
   'motivo','Cita eliminada del ERP: '||reason,'enlace_virtual',c.enlace_virtual,'creada',c.created_at,'anterior',null));
 end if;
 update public.primeras_citas set nueva_cita_id=null where nueva_cita_id=c.id;
end; $$;
create function public.preparar_eliminacion_primera_cita(p_id uuid,p_motivo text,p_version timestamptz) returns void language sql security invoker set search_path='' as $$ select private.preparar_eliminacion_primera_cita(p_id,p_motivo,p_version); $$;

revoke all on function private.puede_eliminar_primeras_citas(),public.puede_eliminar_primeras_citas(),
 private.preparar_eliminacion_primera_cita(uuid,text,timestamptz),public.preparar_eliminacion_primera_cita(uuid,text,timestamptz) from public,anon;
grant execute on function private.puede_eliminar_primeras_citas(),public.puede_eliminar_primeras_citas(),
 private.preparar_eliminacion_primera_cita(uuid,text,timestamptz),public.preparar_eliminacion_primera_cita(uuid,text,timestamptz) to authenticated;
