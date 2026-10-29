-- Análisis comercial de seguimientos por tipo, sede y asesora (alcance por rol como seguimientos_resumen).
-- Revert: drop function public.seguimientos_analisis();
create or replace function public.seguimientos_analisis() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_rol text; v_sedes uuid[]; v_hoy date:=(now() at time zone 'America/Bogota')::date; out jsonb;
begin
 if v_uid is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 select p.rol_id into v_rol from public.profiles p where p.id=v_uid and coalesce(p.activo,true);
 v_sedes:=private.sedes_usuario(v_uid);
 with citas as (
  select c.id,c.tipo_seguimiento tipo,coalesce(se.nombre,'Sin sede') sede,c.resultado_comercial res,
   coalesce((select coalesce(pr.nombre,pr.email) from public.primeras_citas_seguimientos s join public.profiles pr on pr.id=s.asignado_a where s.cita_id=c.id order by s.etapa desc limit 1),'Sin asignar') asesora,
   (select count(*) from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.realizado_at is not null) contactos,
   exists(select 1 from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.realizado_at is null and s.anulado_at is null and s.fecha=v_hoy) hoy,
   exists(select 1 from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.realizado_at is null and s.anulado_at is null and s.fecha<v_hoy) vencida,
   (select count(*) from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.fecha between date '2026-10-29' and v_hoy and (s.realizado_at is not null or s.anulado_at is null)) debidos,
   (select count(*) from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.fecha between date '2026-10-29' and v_hoy and s.realizado_at is not null) hechos,
   (select s.motivo from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.resultado='Desistió' order by s.realizado_at desc limit 1) motivo
  from public.primeras_citas c left join public.sedes se on se.id=c.sede_id
  where c.tipo_seguimiento is not null
   and (v_rol='admin' or exists(select 1 from public.roles x where x.id=v_rol and x.ve_todas_sedes)
    or (v_rol in ('asesora_lider','franquiciado') and c.sede_id=any(v_sedes))
    or exists(select 1 from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.asignado_a=v_uid))
 ), agg as (
  select case when grouping(tipo)=0 then 'tipo' when grouping(sede)=0 then 'sede' else 'asesora' end dim,
   coalesce(tipo,sede,asesora) nombre,
   count(*) filter (where res='EN SEGUIMIENTO') en_seguimiento,count(*) filter (where hoy) hoy,count(*) filter (where vencida) vencidas,
   round(100.0*count(*) filter (where res='ALQUILÓ')/greatest(count(*),1)) recuperacion,
   round(avg(contactos),1) contactos_promedio,
   case when sum(debidos)=0 then null else round(100.0*sum(hechos)/sum(debidos)) end cumplimiento,
   array_agg(motivo) filter (where motivo is not null) motivos
  from citas group by grouping sets ((tipo),(sede),(asesora))
 )
 select coalesce(jsonb_agg(jsonb_build_object('dim',dim,'nombre',nombre,'en_seguimiento',en_seguimiento,'hoy',hoy,'vencidas',vencidas,'recuperacion',recuperacion,
   'contactos_promedio',contactos_promedio,'cumplimiento',cumplimiento,
   'motivos',(select coalesce(jsonb_object_agg(m,n),'{}'::jsonb) from (select m,count(*) n from unnest(coalesce(motivos,'{}')) m group by m) z)) order by dim,nombre),'[]'::jsonb)
 into out from agg;
 return out;
end $$;
revoke all on function public.seguimientos_analisis() from public,anon;
grant execute on function public.seguimientos_analisis() to authenticated;
