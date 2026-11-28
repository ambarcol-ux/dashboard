-- Convertir más citas (A): the advisor records the confirmation call of a visit (today or tomorrow, not yet confirmed); the alert
-- «Citas por confirmar» stops counting a visit called in the last 20 hours. Kept in the visit's history.
-- Reversión: drop function public.registrar_llamada_confirmacion(uuid,text); restore the «citas_por_confirmar» condition of
--   private.alertas_inicio_sede without the «Llamada de confirmación» clause.
create or replace function public.registrar_llamada_confirmacion(p_id uuid, p_resultado text)
returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 if p_resultado not in ('Contestó y viene','No contestó','Pide otra hora','No viene') then raise exception 'Elige el resultado de la llamada.'; end if;
 select * into c from public.primeras_citas where id=p_id;
 if c.id is null or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'No tienes acceso a esta visita.' using errcode='42501'; end if;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(p_id,auth.uid(),'Llamada de confirmación',p_resultado);
end $$;
revoke all on function public.registrar_llamada_confirmacion(uuid,text) from public, anon;
grant execute on function public.registrar_llamada_confirmacion(uuid,text) to authenticated;

do $m$
declare f text:=pg_get_functiondef('private.alertas_inicio_sede(uuid)'::regprocedure);
 a text:=$x$and p.fecha between hoy and hoy+1 and ((p.fecha+p.hora) at time zone 'America/Bogota')>now()$x$;
begin
 if position('Llamada de confirmación' in f)>0 then return; end if;
 if position(a in f)=0 then raise exception 'alertas_inicio_sede cambió: revisar antes de aplicar'; end if;
 execute replace(f,a,a||$x$
   and not exists(select 1 from public.primeras_citas_historial h where h.cita_id=p.id and h.accion='Llamada de confirmación' and h.created_at>now()-interval '20 hours')$x$);
end $m$;
