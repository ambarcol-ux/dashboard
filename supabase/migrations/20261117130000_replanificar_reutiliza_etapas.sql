-- Copied from Supabase (applied as 20261029212919). Placed after seguimientos_tipos so replay order matches. Later patched by seguimientos_responsable.
create or replace function private.replanificar_seguimientos(p_cita uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; hoy date:=(now() at time zone 'America/Bogota')::date; fechas date[]; libres int[]; i int; e int; quien uuid;
begin
 select * into c from public.primeras_citas where id=p_cita;
 if c.id is null then return; end if;
 update public.primeras_citas_seguimientos set anulado_at=now(),updated_at=clock_timestamp() where cita_id=c.id and realizado_at is null and anulado_at is null;
 if coalesce(c.resultado_comercial,'EN SEGUIMIENTO')<>'EN SEGUIMIENTO' or c.estado='cancelada'
  or exists(select 1 from public.contratos where primera_cita_id=c.id and lower(estado) not in ('anulado','cancelado','rechazado')) then return; end if;
 -- Five attempts in total: stages already registered keep their number; the plan uses the free ones.
 libres:=array(select g from generate_series(1,5) g where not exists(select 1 from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.etapa=g and s.realizado_at is not null) order by g);
 fechas:=private.plan_seguimiento_fechas(hoy,c.fecha_evento);
 quien:=coalesce(c.asesora_id,c.responsable_id);
 for i in 1..least(coalesce(array_length(fechas,1),0),coalesce(array_length(libres,1),0)) loop
  e:=libres[i];
  if exists(select 1 from public.primeras_citas_seguimientos where cita_id=c.id and etapa=e) then
   update public.primeras_citas_seguimientos set fecha=fechas[i],anulado_at=null,resultado=null,nota='',canal=null,motivo=null,asignado_a=quien,updated_at=clock_timestamp() where cita_id=c.id and etapa=e;
  else
   insert into public.primeras_citas_seguimientos(cita_id,etapa,fecha,asignado_a) values(c.id,e,fechas[i],quien);
  end if;
 end loop;
end $$;
