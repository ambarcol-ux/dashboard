-- Primeras visitas por fecha de solicitud: listar las citas que las clientas pidieron entre dos fechas (no el día de la cita),
-- y la alerta «Citas solicitadas hoy» en el Inicio.
-- Reversión: drop function public.listar_primeras_citas_solicitadas(date,date); drop function private.listar_primeras_citas_solicitadas(date,date);
--   y volver a aplicar private.alertas_inicio_sede de 20270103120000 (quitar 'citas_solicitadas_hoy').
create or replace function private.listar_primeras_citas_solicitadas(p_desde date, p_hasta date) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and activo is true and lower(rol) in ('admin','asesora')) then raise exception 'No tienes acceso a primeras visitas.'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Selecciona un periodo de hasta un año.'; end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
  select c.*,s.nombre sede,p.nombre responsable,a.nombre asesora_nombre,k.id contrato_id,k.numero_contrato,k.estado contrato_estado
  from public.primeras_citas c join public.sedes s on s.id=c.sede_id left join public.profiles p on p.id=c.responsable_id left join public.profiles a on a.id=c.asesora_id left join public.contratos k on k.primera_cita_id=c.id
  where (c.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta and private.acceso_primera_cita(c.sede_id,c.modalidad)
 )t),'[]'::jsonb);
end $$;
create or replace function public.listar_primeras_citas_solicitadas(p_desde date, p_hasta date) returns jsonb
language sql set search_path='' as $$ select private.listar_primeras_citas_solicitadas(p_desde,p_hasta); $$;
revoke all on function private.listar_primeras_citas_solicitadas(date,date), public.listar_primeras_citas_solicitadas(date,date) from public, anon;
grant execute on function private.listar_primeras_citas_solicitadas(date,date), public.listar_primeras_citas_solicitadas(date,date) to authenticated;

do $do$
declare d text;
begin
 d:=pg_get_functiondef('private.alertas_inicio_sede(uuid)'::regprocedure);
 d:=replace(d,$x$  'citas_hoy',$x$,$x$  'citas_solicitadas_hoy',(select count(*) from public.primeras_citas p where (lim is null or p.sede_id=any(lim)) and coalesce(p.origen,'cita')='cita' and (p.created_at at time zone 'America/Bogota')::date=hoy),
  'citas_hoy',$x$);
 if position('citas_solicitadas_hoy' in d)=0 then raise exception 'alertas_inicio_sede: no se encontró el texto a reemplazar'; end if;
 execute d;
end $do$;
