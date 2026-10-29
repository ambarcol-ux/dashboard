-- Seguimientos parte B: responsable de cada seguimiento, traspaso a la líder al desactivar, resumen (indicadores, alertas, cumplimiento).
-- Revert: drop trigger profiles_traspasar_seguimientos on public.profiles; drop the new functions; alter table public.primeras_citas_seguimientos drop column asignado_a.
alter table public.primeras_citas_seguimientos add column if not exists asignado_a uuid references public.profiles(id);
update public.primeras_citas_seguimientos s set asignado_a=coalesce(c.asesora_id,c.responsable_id)
 from public.primeras_citas c where c.id=s.cita_id and s.asignado_a is null and s.realizado_at is null and s.anulado_at is null;

-- New plans are assigned to the advisor of the visit.
do $$ declare d text:=pg_get_functiondef('private.replanificar_seguimientos(uuid)'::regprocedure); begin
 d:=replace(d,'insert into public.primeras_citas_seguimientos(cita_id,etapa,fecha) values(c.id,etapa,d);','insert into public.primeras_citas_seguimientos(cita_id,etapa,fecha,asignado_a) values(c.id,etapa,d,coalesce(c.asesora_id,c.responsable_id));');
 if d not like '%asignado_a%' then raise exception 'patch replanificar failed'; end if;
 execute d;
end $$;

-- Leader of a sede (active asesora_lider with that sede).
create or replace function private.lider_de_sede(p_sede uuid) returns uuid language sql stable security definer set search_path='' as $$
 select p.id from public.profiles p join public.usuario_sedes us on us.usuario_id=p.id and us.activo and us.sede_id=p_sede
 where p.rol_id='asesora_lider' and coalesce(p.activo,true) order by us.created_at limit 1
$$;

-- A deactivated person hands their pending follow-ups to the leader of each visit's sede.
create or replace function private.traspasar_seguimientos() returns trigger language plpgsql security definer set search_path='' as $$
declare r record; lider uuid;
begin
 if coalesce(old.activo,true) and new.activo is false then
  for r in select s.id,s.cita_id,c.sede_id from public.primeras_citas_seguimientos s join public.primeras_citas c on c.id=s.cita_id
   where s.asignado_a=new.id and s.realizado_at is null and s.anulado_at is null loop
   lider:=private.lider_de_sede(r.sede_id);
   if lider is not null and lider<>new.id then
    update public.primeras_citas_seguimientos set asignado_a=lider,updated_at=clock_timestamp() where id=r.id;
    insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(r.cita_id,auth.uid(),'Seguimiento reasignado','Pasa a la líder de la sede porque '||coalesce(new.nombre,new.email)||' fue desactivada.');
   end if;
  end loop;
 end if;
 return new;
end $$;
create trigger profiles_traspasar_seguimientos after update of activo on public.profiles for each row execute function private.traspasar_seguimientos();

-- Summary by role: asesora = her own follow-ups; asesora_lider / franquiciado = their sedes; admin (and roles seeing every sede) = all.
create or replace function public.seguimientos_resumen() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_rol text; v_sedes uuid[]; v_hoy date:=(now() at time zone 'America/Bogota')::date; out jsonb;
begin
 if v_uid is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 select p.rol_id into v_rol from public.profiles p where p.id=v_uid and coalesce(p.activo,true);
 v_sedes:=private.sedes_usuario(v_uid);
 with base as (
  select s.*,c.sede_id,c.cliente_nombre,c.telefono,c.resultado_comercial,c.fecha_evento,se.nombre sede,coalesce(pr.nombre,pr.email,'Sin asignar') asignada
  from public.primeras_citas_seguimientos s join public.primeras_citas c on c.id=s.cita_id
  left join public.sedes se on se.id=c.sede_id left join public.profiles pr on pr.id=s.asignado_a
  where s.anulado_at is null and (v_rol='admin' or (v_rol in ('asesora_lider','franquiciado') and c.sede_id=any(v_sedes))
   or (v_rol not in ('admin','asesora_lider','franquiciado') and (s.asignado_a=v_uid or (v_rol is not null and exists(select 1 from public.roles x where x.id=v_rol and x.ve_todas_sedes)))))
 ), citas as (select cita_id,max(resultado_comercial) resultado,bool_or(realizado_at is null) abierta from base group by cita_id)
 select jsonb_build_object(
  'en_seguimiento',(select count(*) from citas where abierta and coalesce(resultado,'EN SEGUIMIENTO')='EN SEGUIMIENTO'),
  'hoy',(select count(*) from base where realizado_at is null and fecha=v_hoy),
  'vencidos',(select count(*) from base where realizado_at is null and fecha<v_hoy),
  'recuperadas_pct',(select case when count(*)=0 then 0 else round(100.0*count(*) filter (where resultado='ALQUILÓ')/count(*)) end from citas),
  'alertas',coalesce((select jsonb_agg(jsonb_build_object('cita_id',cita_id,'cliente',cliente_nombre,'telefono',telefono,'fecha',fecha,'sede',sede,'asignada',asignada,'estado',case when fecha=v_hoy then 'Hoy' else 'Vencido' end) order by fecha)
    from base where realizado_at is null and fecha<=v_hoy),'[]'::jsonb),
  'por_asesora',coalesce((select jsonb_agg(x order by x->>'nombre') from (select jsonb_build_object('nombre',asignada,'debidos',count(*) filter (where fecha<=v_hoy),'hechos',count(*) filter (where realizado_at is not null),
    'cumplimiento',case when count(*) filter (where fecha<=v_hoy)=0 then 100 else round(100.0*count(*) filter (where realizado_at is not null and fecha<=v_hoy)/count(*) filter (where fecha<=v_hoy)) end) x from base group by asignada) t),'[]'::jsonb),
  'por_sede',coalesce((select jsonb_agg(x order by x->>'nombre') from (select jsonb_build_object('nombre',coalesce(sede,'Sin sede'),'debidos',count(*) filter (where fecha<=v_hoy),'hechos',count(*) filter (where realizado_at is not null),
    'cumplimiento',case when count(*) filter (where fecha<=v_hoy)=0 then 100 else round(100.0*count(*) filter (where realizado_at is not null and fecha<=v_hoy)/count(*) filter (where fecha<=v_hoy)) end) x from base group by sede) t),'[]'::jsonb)
 ) into out;
 return out;
end $$;
revoke all on function public.seguimientos_resumen() from public,anon;
grant execute on function public.seguimientos_resumen() to authenticated;
