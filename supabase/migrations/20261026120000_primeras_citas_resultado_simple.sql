-- Primeras visitas: resultado simple que registra la asesora.
--  Asistencia: Asistió / No asistió (obligatoria)
--  Alquiló:    Alquiló / No alquiló (obligatoria si asistió; alquilar = cerrar)
--  Posible seguimiento: Sí / No (obligatoria si no alquiló)

alter table public.primeras_citas add column if not exists alquilo boolean;
alter table public.primeras_citas add column if not exists posible_seguimiento boolean;

-- Datos existentes: se traduce lo que ya registraron las asesoras (no las respuestas del cliente).
update public.primeras_citas c set alquilo=true, posible_seguimiento=null
 where c.alquilo is null and (c.resultado_comercial='ALQUILÓ' or (c.origen='vitrina' and c.resultado_visita in ('Cerrado','Contrato pendiente'))
  or exists(select 1 from public.contratos k where k.primera_cita_id=c.id and lower(k.estado) not in ('anulado','cancelado','rechazado')));
update public.primeras_citas set alquilo=false, posible_seguimiento=true where alquilo is null and estado='seguimiento';
update public.primeras_citas set alquilo=false, posible_seguimiento=false where alquilo is null and estado='no_cerro';
update public.primeras_citas set alquilo=false, posible_seguimiento=(resultado_comercial in ('EN SEGUIMIENTO','AGENDÓ NUEVA CITA')) where alquilo is null and estado='no_asistio';

-- Vitrinas: el resultado elegido al registrarlas define si alquiló y si hay seguimiento.
create or replace function private.vitrina_resultado_simple()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.origen='vitrina' and new.resultado_visita is not null and (tg_op='INSERT' or new.resultado_visita is distinct from old.resultado_visita) then
  new.alquilo:=new.resultado_visita in ('Cerrado','Contrato pendiente');
  new.posible_seguimiento:=case when new.alquilo then null else new.resultado_visita='En seguimiento' end;
 end if;
 return new;
end $$;
create or replace trigger vitrina_resultado_simple before insert or update of resultado_visita on public.primeras_citas
 for each row execute function private.vitrina_resultado_simple();

-- Un contrato activo vinculado a la cita es un alquiler.
create or replace function private.contrato_marca_alquiler()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.primera_cita_id is not null and lower(coalesce(new.estado,'')) not in ('anulado','cancelado','rechazado') then
  update public.primeras_citas set alquilo=true,posible_seguimiento=null,
   estado=case when estado in ('agendada','confirmada','seguimiento','no_cerro') then 'asistio' else estado end,
   resultado_comercial='ALQUILÓ'
  where id=new.primera_cita_id and (alquilo is distinct from true or estado in ('agendada','confirmada','seguimiento','no_cerro'));
 end if;
 return new;
end $$;
create or replace trigger contrato_marca_alquiler after insert or update of primera_cita_id, estado on public.contratos
 for each row execute function private.contrato_marca_alquiler();

create or replace function private.registrar_resultado_primera_cita(p_id uuid, p_asistio boolean, p_alquilo boolean, p_seguimiento boolean, p_nota text, p_version timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; nota text:=btrim(coalesce(p_nota,'')); v_estado text; v_resultado text; v_alquilo boolean; v_seg boolean; contrato boolean;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=p_id for update;
 if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'Cita no disponible para tu usuario.'; end if;
 if p_version is null or c.updated_at<>p_version then raise exception 'La cita cambió. Actualiza antes de guardar.'; end if;
 if c.estado='cancelada' then raise exception 'La cita está cancelada.'; end if;
 if length(nota)>1000 then raise exception 'La nota es muy larga.'; end if;
 if p_asistio is null then raise exception 'Elige si asistió o no asistió.'; end if;
 if c.origen<>'vitrina' and (c.fecha+c.hora) at time zone 'America/Bogota'>now() then raise exception 'La cita todavía no ha ocurrido.'; end if;
 if c.origen='vitrina' and not p_asistio then raise exception 'Una vitrina siempre es una clienta que asistió.'; end if;
 if p_asistio and p_alquilo is null then raise exception 'Elige si alquiló o no alquiló.'; end if;
 v_alquilo:=p_asistio and p_alquilo;
 if not v_alquilo and p_seguimiento is null then raise exception 'Elige si hay posible seguimiento.'; end if;
 v_seg:=case when v_alquilo then null else p_seguimiento end;
 contrato:=exists(select 1 from public.contratos where primera_cita_id=c.id and lower(estado) not in ('anulado','cancelado','rechazado'));
 if contrato and not v_alquilo then raise exception 'Esta cita tiene contrato: el resultado es Asistió · Alquiló.'; end if;
 v_estado:=case when not p_asistio then 'no_asistio' when v_alquilo then 'asistio' when v_seg then 'seguimiento' else 'no_cerro' end;
 v_resultado:=case when v_alquilo then 'ALQUILÓ' when v_seg then 'EN SEGUIMIENTO' else 'DESISTIÓ' end;
 update public.primeras_citas set estado=v_estado,alquilo=v_alquilo,posible_seguimiento=v_seg,resultado_comercial=v_resultado,
  motivo=case when nota<>'' then nota else motivo end,responsable_id=auth.uid(),updated_at=clock_timestamp(),
  resultado_visita=case when c.origen<>'vitrina' then resultado_visita when v_alquilo then 'Cerrado' when v_seg then 'En seguimiento' else 'No cerró' end
 where id=c.id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Resultado de la cita',
  (case when p_asistio then 'Asistió' else 'No asistió' end)||' · '||(case when v_alquilo then 'Alquiló' else 'No alquiló' end)
  ||case when v_alquilo then '' else ' · Posible seguimiento: '||case when v_seg then 'Sí' else 'No' end end||case when nota<>'' then ' · '||nota else '' end);
end $$;

create or replace function public.registrar_resultado_primera_cita(p_id uuid, p_asistio boolean, p_alquilo boolean, p_seguimiento boolean, p_nota text, p_version timestamptz)
returns void language sql set search_path='' as $$ select private.registrar_resultado_primera_cita(p_id,p_asistio,p_alquilo,p_seguimiento,p_nota,p_version); $$;
revoke all on function private.registrar_resultado_primera_cita(uuid,boolean,boolean,boolean,text,timestamptz), public.registrar_resultado_primera_cita(uuid,boolean,boolean,boolean,text,timestamptz),
 private.vitrina_resultado_simple(), private.contrato_marca_alquiler() from public, anon;
grant execute on function private.registrar_resultado_primera_cita(uuid,boolean,boolean,boolean,text,timestamptz), public.registrar_resultado_primera_cita(uuid,boolean,boolean,boolean,text,timestamptz) to authenticated;
