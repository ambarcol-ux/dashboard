-- Seguimientos: tres tipos (asistida, vitrina, no asistida), resultados por tipo, cierre y "No necesario", finalizar con motivo,
-- recálculo del histórico. Nothing is removed: closed or superseded stages keep their row with resultado + anulado_at.
alter table public.primeras_citas add column if not exists tipo_seguimiento text, add column if not exists cierre_seguimiento text, add column if not exists motivo_cierre text;
alter table public.primeras_citas_seguimientos add column if not exists motivo text;

create or replace function private.cita_alquilo(p_cita uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.primeras_citas c where c.id=p_cita and (c.alquilo is true or c.resultado_comercial='ALQUILÓ' or c.estado='asistio'))
  or exists(select 1 from public.contratos k where k.primera_cita_id=p_cita and lower(k.estado) not in ('anulado','cancelado','rechazado'))
$$;
create or replace function private.tipo_seguimiento_de(p_cita uuid) returns text language sql stable security definer set search_path='' as $$
 select case when c.origen='vitrina' then 'vitrina' when c.estado='no_asistio' then 'no_asistida' else 'asistida' end from public.primeras_citas c where c.id=p_cita
$$;
-- Closes the plan: pending stages get the given mark (No necesario / Evento ya pasado) and the visit its closing.
create or replace function private.cerrar_plan(p_cita uuid,p_cierre text,p_resultado text,p_marca text,p_motivo text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.primeras_citas_seguimientos set resultado=p_marca,anulado_at=now(),updated_at=clock_timestamp() where cita_id=p_cita and realizado_at is null and anulado_at is null;
 update public.primeras_citas set cierre_seguimiento=p_cierre,resultado_comercial=p_resultado,motivo_cierre=coalesce(p_motivo,motivo_cierre),updated_at=clock_timestamp() where id=p_cita;
end $$;

-- Visit result: follow-up is automatic; attended / walk-in without rental only skip it with a reason of at least 30 characters.
create or replace function private.registrar_resultado_primera_cita(p_id uuid,p_asistio boolean,p_alquilo boolean,p_seguimiento boolean,p_nota text,p_version timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; nota text:=btrim(coalesce(p_nota,'')); v_alquilo boolean; omitir boolean; contrato boolean;
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
 contrato:=exists(select 1 from public.contratos where primera_cita_id=c.id and lower(estado) not in ('anulado','cancelado','rechazado'));
 if contrato and not v_alquilo then raise exception 'Esta cita tiene contrato: el resultado es Asistió · Alquiló.'; end if;
 omitir:=p_asistio and not v_alquilo and p_seguimiento is false;
 if omitir and length(nota)<30 then raise exception 'Para no hacer seguimiento escribe el motivo (mínimo 30 caracteres).'; end if;
 update public.primeras_citas set estado=case when not p_asistio then 'no_asistio' when v_alquilo then 'asistio' when omitir then 'no_cerro' else 'seguimiento' end,
  alquilo=v_alquilo,posible_seguimiento=case when v_alquilo then null else not omitir end,
  resultado_comercial=case when v_alquilo then 'ALQUILÓ' when omitir then 'DESISTIÓ' else 'EN SEGUIMIENTO' end,
  tipo_seguimiento=case when v_alquilo then null when c.origen='vitrina' then 'vitrina' when not p_asistio then 'no_asistida' else 'asistida' end,
  cierre_seguimiento=case when v_alquilo then 'Alquiló' when omitir then 'Sin seguimiento' else null end,
  motivo_cierre=case when omitir then nota else motivo_cierre end,
  motivo=case when nota<>'' then nota else motivo end,responsable_id=auth.uid(),updated_at=clock_timestamp(),
  resultado_visita=case when c.origen<>'vitrina' then resultado_visita when v_alquilo then 'Cerrado' when omitir then 'No cerró' else 'En seguimiento' end
 where id=c.id;
 perform private.replanificar_seguimientos(c.id);
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Resultado de la cita',
  (case when p_asistio then 'Asistió' else 'No asistió' end)||' · '||(case when v_alquilo then 'Alquiló' else 'No alquiló' end)
  ||case when v_alquilo then '' when omitir then ' · Sin seguimiento' else ' · Seguimiento automático' end||case when nota<>'' then ' · '||nota else '' end);
end $$;

-- Walk-ins without rental get the automatic plan unless skipped with a reason of at least 30 characters.
do $$ declare d text:=pg_get_functiondef('private.registrar_vitrina(jsonb)'::regprocedure); a int; b int; begin
 a:=position(' if estado_nuevo in (''asistio'',''seguimiento'') and evento is not null then' in d);
 b:=position(' return new_id;' in d);
 if a=0 or b=0 or b<a then raise exception 'patch vitrina failed'; end if;
 d:=left(d,a-1)||' if estado_nuevo in (''seguimiento'',''no_cerro'') then
  if coalesce((p_datos->>''sin_seguimiento'')::boolean,false) then
   if length(nota)<30 then raise exception ''Para no hacer seguimiento escribe el motivo (mínimo 30 caracteres).''; end if;
   update public.primeras_citas set cierre_seguimiento=''Sin seguimiento'',motivo_cierre=nota,resultado_comercial=''DESISTIÓ'' where id=new_id;
  else
   update public.primeras_citas set tipo_seguimiento=''vitrina'',resultado_comercial=''EN SEGUIMIENTO'' where id=new_id;
   perform private.replanificar_seguimientos(new_id);
  end if;
 end if;
'||substr(d,b);
 execute d;
end $$;

-- Register a follow-up with the result list of its type; closing results mark the next stages "No necesario".
create or replace function private.gestionar_seguimiento_primera_cita(p_id uuid,p_nota text,p_canal text,p_resultado text,p_motivo text,p_version timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; f public.primeras_citas_seguimientos; hoy date:=(now() at time zone 'America/Bogota')::date; t text:=btrim(coalesce(p_nota,'')); previo text; tipo text;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=(select cita_id from public.primeras_citas_seguimientos where id=p_id) for update;
 if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'Seguimiento no disponible.'; end if;
 select * into f from public.primeras_citas_seguimientos where id=p_id for update;
 if p_version is null or f.updated_at<>p_version then raise exception 'El seguimiento cambió. Actualiza antes de guardar.'; end if;
 if f.realizado_at is not null or f.anulado_at is not null or coalesce(c.resultado_comercial,'EN SEGUIMIENTO')<>'EN SEGUIMIENTO' or c.estado='cancelada' then raise exception 'Este seguimiento está cerrado.'; end if;
 if f.fecha>hoy then raise exception 'Este seguimiento es para el %; no se registra antes de su fecha.',to_char(f.fecha,'DD/MM/YYYY'); end if;
 if exists(select 1 from public.primeras_citas_seguimientos where cita_id=c.id and realizado_at is not null and (realizado_at at time zone 'America/Bogota')::date=hoy) then raise exception 'Ya hay un seguimiento registrado hoy para esta cita.'; end if;
 if length(t)<30 or length(t)>1000 then raise exception 'Escribe la conclusión de lo hablado (mínimo 30 caracteres).'; end if;
 select s.nota into previo from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.realizado_at is not null order by s.realizado_at desc limit 1;
 if previo is not null and lower(previo)=lower(t) then raise exception 'La conclusión debe ser distinta a la anterior.'; end if;
 if p_canal is null or p_canal not in ('WhatsApp','Llamada','Correo','Presencial') then raise exception 'Elige el canal.'; end if;
 tipo:=coalesce(c.tipo_seguimiento,private.tipo_seguimiento_de(c.id));
 if p_resultado is null or not p_resultado=any(case when tipo='no_asistida' then array['Sin respuesta','Reagendó','Canceló','Desistió','Alquiló','No desea contacto']
  else array['Sin respuesta','Interesada','Regresó','Alquiló','Desistió','No desea contacto'] end) then raise exception 'Elige un resultado válido.'; end if;
 if p_resultado='Desistió' and (p_motivo is null or p_motivo not in ('Precio','Alquiló en otro lugar','Cambió o canceló el evento','No le gustaron los modelos','Otro')) then raise exception 'Elige el motivo por el que desistió.'; end if;
 update public.primeras_citas_seguimientos set updated_at=clock_timestamp(),nota=t,canal=p_canal,resultado=p_resultado,motivo=case when p_resultado='Desistió' then p_motivo end,realizado_at=now(),responsable_id=auth.uid() where id=p_id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Seguimiento '||f.etapa,p_canal||' · '||p_resultado||case when p_resultado='Desistió' then ' ('||p_motivo||')' else '' end||': '||t);
 if p_resultado in ('Alquiló','Desistió','No desea contacto','Canceló') then
  perform private.cerrar_plan(c.id,case p_resultado when 'No desea contacto' then 'No contactar' when 'Desistió' then 'Desistió: '||p_motivo else p_resultado end,
   case p_resultado when 'Alquiló' then 'ALQUILÓ' when 'No desea contacto' then 'NO CONTACTAR' else 'DESISTIÓ' end,'No necesario');
 elsif not exists(select 1 from public.primeras_citas_seguimientos where cita_id=c.id and realizado_at is null and anulado_at is null) then
  perform private.cerrar_plan(c.id,'Sin respuesta tras 5 intentos','CERRADO SIN RESPUESTA','No necesario');
 end if;
end $$;
create or replace function public.gestionar_seguimiento_primera_cita(p_id uuid,p_nota text,p_canal text,p_resultado text,p_motivo text,p_version timestamptz) returns void language sql security invoker set search_path='' as $$
 select private.gestionar_seguimiento_primera_cita(p_id,p_nota,p_canal,p_resultado,p_motivo,p_version)
$$;

-- "Finalizar seguimiento" (advisor and leader): closing result and reason of at least 30 characters.
create or replace function public.finalizar_seguimiento_primera_cita(p_cita uuid,p_resultado text,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; m text:=btrim(coalesce(p_motivo,''));
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=p_cita for update;
 if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'Cita no disponible.'; end if;
 if coalesce(c.resultado_comercial,'EN SEGUIMIENTO')<>'EN SEGUIMIENTO' then raise exception 'El seguimiento ya está cerrado.'; end if;
 if p_resultado is null or p_resultado not in ('Alquiló','Desistió','No desea contacto','Canceló','Sin respuesta') then raise exception 'Elige el resultado.'; end if;
 if length(m)<30 or length(m)>1000 then raise exception 'Escribe el motivo (mínimo 30 caracteres).'; end if;
 perform private.cerrar_plan(c.id,case p_resultado when 'No desea contacto' then 'No contactar' when 'Sin respuesta' then 'Finalizado sin respuesta' else p_resultado end,
  case p_resultado when 'Alquiló' then 'ALQUILÓ' when 'No desea contacto' then 'NO CONTACTAR' when 'Sin respuesta' then 'CERRADO SIN RESPUESTA' else 'DESISTIÓ' end,'No necesario',m);
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Seguimiento finalizado',p_resultado||': '||m);
end $$;

revoke all on function public.gestionar_seguimiento_primera_cita(uuid,text,text,text,text,timestamptz),private.gestionar_seguimiento_primera_cita(uuid,text,text,text,text,timestamptz),public.finalizar_seguimiento_primera_cita(uuid,text,text) from public,anon;
grant execute on function public.gestionar_seguimiento_primera_cita(uuid,text,text,text,text,timestamptz),private.gestionar_seguimiento_primera_cita(uuid,text,text,text,text,timestamptz),public.finalizar_seguimiento_primera_cita(uuid,text,text) to authenticated;

-- Compliance counts from 29/10/2026.
do $$ declare d text:=pg_get_functiondef('public.seguimientos_resumen()'::regprocedure); begin
 d:=replace(d,'from base group by asignada)','from base where fecha>=date ''2026-10-29'' group by asignada)');
 d:=replace(d,'from base group by sede)','from base where fecha>=date ''2026-10-29'' group by sede)');
 if d not like '%2026-10-29%' then raise exception 'patch resumen failed'; end if;
 execute d;
end $$;

-- Historical recalculation (registered follow-ups are kept).
do $$ declare r record; hoy date:=(now() at time zone 'America/Bogota')::date; begin
 for r in select c.id,c.fecha_evento from public.primeras_citas c where c.estado not in ('agendada','confirmada','cancelada') loop
  if private.cita_alquilo(r.id) then
   update public.primeras_citas_seguimientos set resultado='No necesario',anulado_at=now(),updated_at=clock_timestamp() where cita_id=r.id and realizado_at is null and anulado_at is null;
   update public.primeras_citas set tipo_seguimiento=null,cierre_seguimiento=coalesce(cierre_seguimiento,'Alquiló') where id=r.id;
  elsif (select resultado_comercial from public.primeras_citas where id=r.id)='EN SEGUIMIENTO' then
   update public.primeras_citas set tipo_seguimiento=private.tipo_seguimiento_de(r.id) where id=r.id;
   if r.fecha_evento is not null and r.fecha_evento<hoy+3 then
    perform private.cerrar_plan(r.id,'Evento ya pasado','EVENTO FINALIZADO','Evento ya pasado');
   else
    perform private.replanificar_seguimientos(r.id);
   end if;
  end if;
 end loop;
end $$;

-- Applied afterwards: replanificar_seguimientos reuses the five stage numbers (unique cita_id+etapa, etapa 1..5) instead of adding new ones;
-- then the historical recalculation above was run (migrations replanificar_reutiliza_etapas and seguimientos_recalculo_historico).
