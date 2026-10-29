-- Seguimientos de primeras citas: plan por días hábiles (sin domingos ni festivos), registro con canal y resultado.
-- Superseded pending stages are marked anulado_at (no rows are removed).
-- Revert: drop the new functions; alter table public.primeras_citas_seguimientos drop column canal, drop column resultado, drop column anulado_at;
--   re-apply the previous body of private.editar_comercial_primera_cita.
alter table public.primeras_citas_seguimientos add column if not exists canal text, add column if not exists resultado text, add column if not exists anulado_at timestamptz;

-- Colombian public holidays of a year (fixed, Ley Emiliani moved to Monday, and Easter based).
create or replace function private.festivos_co(p_anio int) returns setof date language plpgsql immutable set search_path='' as $$
declare a int:=p_anio%19; b int:=p_anio/100; c int:=p_anio%100; d int:=b/4; e int:=b%4; f int:=(b+8)/25; g int:=(b-f+1)/3; h int:=(19*a+b-d-g+15)%30;
 i int:=c/4; k int:=c%4; l int:=(32+2*e+2*i-h-k)%7; m int:=(a+11*h+22*l)/451; mes int:=(h+l-7*m+114)/31; dia int:=((h+l-7*m+114)%31)+1;
 pascua date:=make_date(p_anio,mes,dia); x date;
begin
 return next make_date(p_anio,1,1); return next make_date(p_anio,5,1); return next make_date(p_anio,7,20);
 return next make_date(p_anio,8,7); return next make_date(p_anio,12,8); return next make_date(p_anio,12,25);
 foreach x in array array[make_date(p_anio,1,6),make_date(p_anio,3,19),make_date(p_anio,6,29),make_date(p_anio,8,15),make_date(p_anio,10,12),make_date(p_anio,11,1),make_date(p_anio,11,11)] loop
  return next x+((8-extract(isodow from x)::int)%7);
 end loop;
 return next pascua-3; return next pascua-2; return next pascua+43; return next pascua+64; return next pascua+71;
end $$;
create or replace function private.dia_habil(p_dia date) returns boolean language sql immutable set search_path='' as $$
 select extract(isodow from p_dia)<>7 and not exists(select 1 from private.festivos_co(extract(year from p_dia)::int) f where f=p_dia)
$$;

-- Plan: 5 evenly spaced business days from tomorrow to event-3; if fewer fit, one per business day; without event +1,+3,+7,+14,+30.
create or replace function private.plan_seguimiento_fechas(p_hoy date,p_evento date) returns date[] language plpgsql immutable set search_path='' as $$
declare habiles date[]; n int; out date[]:='{}'; x int; d date;
begin
 if p_evento is null then
  foreach x in array array[1,3,7,14,30] loop
   d:=p_hoy+x; while not private.dia_habil(d) loop d:=d+1; end loop;
   if not d=any(out) then out:=out||d; end if;
  end loop;
  return out;
 end if;
 habiles:=array(select g::date from generate_series(p_hoy+1,p_evento-3,interval '1 day') g where private.dia_habil(g::date) order by 1);
 n:=coalesce(array_length(habiles,1),0);
 if n<=5 then return habiles; end if;
 for x in 0..4 loop out:=out||habiles[1+round(x*(n-1)/4.0)::int]; end loop;
 return out;
end $$;

-- Replaces the pending stages of an open plan (done stages stay as history).
create or replace function private.replanificar_seguimientos(p_cita uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; hoy date:=(now() at time zone 'America/Bogota')::date; fechas date[]; d date; etapa int;
begin
 select * into c from public.primeras_citas where id=p_cita;
 if c.id is null then return; end if;
 update public.primeras_citas_seguimientos set anulado_at=now(),updated_at=clock_timestamp() where cita_id=c.id and realizado_at is null and anulado_at is null;
 if coalesce(c.resultado_comercial,'EN SEGUIMIENTO')<>'EN SEGUIMIENTO' or c.estado='cancelada'
  or exists(select 1 from public.contratos where primera_cita_id=c.id and lower(estado) not in ('anulado','cancelado','rechazado')) then return; end if;
 fechas:=private.plan_seguimiento_fechas(hoy,c.fecha_evento);
 select coalesce(max(s.etapa),0) into etapa from public.primeras_citas_seguimientos s where s.cita_id=c.id;
 foreach d in array fechas loop
  etapa:=etapa+1;
  insert into public.primeras_citas_seguimientos(cita_id,etapa,fecha) values(c.id,etapa,d);
 end loop;
end $$;

create or replace function private.editar_comercial_primera_cita(p_id uuid, p_datos jsonb, p_version timestamp with time zone) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; event_date date; result text; link text;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=p_id for update;
 if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'Cita no disponible.'; end if;
 if p_version is null or c.updated_at<>p_version then raise exception 'La cita cambió. Actualiza antes de guardar.'; end if;
 event_date:=nullif(p_datos->>'fecha_evento','')::date;result:=p_datos->>'resultado';link:=trim(coalesce(p_datos->>'enlace_virtual',''));
 if c.estado='cancelada' then raise exception 'La cita está cancelada.'; end if;
 if result is null or result not in ('EN SEGUIMIENTO','ALQUILÓ','AGENDÓ NUEVA CITA','DESISTIÓ','CERRADO SIN RESPUESTA','NO CONTACTAR','EVENTO FINALIZADO') or length(link)>500 or (link<>'' and link !~ '^https://meet\.google\.com/[a-z-]+$') then raise exception 'Resultado o enlace de Meet inválido.'; end if;
 if event_date is not null and (event_date<c.fecha or event_date>c.fecha+1825) then raise exception 'Revisa la fecha del evento.'; end if;
 if result='ALQUILÓ' and not exists(select 1 from public.contratos where primera_cita_id=c.id and lower(estado) in ('firmado','pagado totalmente','entregado','mantenimiento','finalizado')) then raise exception 'Crea y confirma el contrato para registrar el cierre.'; end if;
 if result='AGENDÓ NUEVA CITA' and not exists(select 1 from public.primeras_citas where id=nullif(p_datos->>'nueva_cita','')::uuid and id<>c.id and telefono=c.telefono and estado in ('agendada','confirmada')) then raise exception 'Selecciona una nueva cita válida del mismo cliente.'; end if;
 if result in ('DESISTIÓ','CERRADO SIN RESPUESTA','NO CONTACTAR','EVENTO FINALIZADO') and length(trim(coalesce(p_datos->>'nota','')))<5 then raise exception 'Registra el motivo del cierre.'; end if;
 update public.primeras_citas set fecha_evento=event_date,enlace_virtual=link,resultado_comercial=result,nueva_cita_id=case when result='AGENDÓ NUEVA CITA' then nullif(p_datos->>'nueva_cita','')::uuid else nueva_cita_id end,updated_at=clock_timestamp() where id=c.id;
 -- Plan: created when missing, recalculated (pending only) when the event date changes, closed with any other result.
 if result<>'EN SEGUIMIENTO' then perform private.replanificar_seguimientos(c.id);
 elsif c.estado in ('asistio','seguimiento','no_cerro') and (event_date is distinct from c.fecha_evento
  or not exists(select 1 from public.primeras_citas_seguimientos where cita_id=c.id and anulado_at is null)) then perform private.replanificar_seguimientos(c.id);
 end if;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Gestión comercial',result||case when result='AGENDÓ NUEVA CITA' then ' · Reserva: '||(p_datos->>'nueva_cita') else '' end||'. '||left(coalesce(p_datos->>'nota',''),1000));
end $$;

-- Register a follow-up: text >= 30 chars and different from the previous one, channel and result; on or after its date, one per day.
create or replace function private.gestionar_seguimiento_primera_cita(p_id uuid,p_nota text,p_canal text,p_resultado text,p_version timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas; f public.primeras_citas_seguimientos; hoy date:=(now() at time zone 'America/Bogota')::date; t text:=btrim(coalesce(p_nota,'')); previo text;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
 select * into c from public.primeras_citas where id=(select cita_id from public.primeras_citas_seguimientos where id=p_id) for update;
 if not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'Seguimiento no disponible.'; end if;
 select * into f from public.primeras_citas_seguimientos where id=p_id for update;
 if p_version is null or f.updated_at<>p_version then raise exception 'El seguimiento cambió. Actualiza antes de guardar.'; end if;
 if f.realizado_at is not null or f.anulado_at is not null or coalesce(c.resultado_comercial,'EN SEGUIMIENTO')<>'EN SEGUIMIENTO' or c.estado='cancelada' then raise exception 'Este seguimiento está cerrado.'; end if;
 if f.fecha>hoy then raise exception 'Este seguimiento es para el %; no se registra antes de su fecha.',to_char(f.fecha,'DD/MM/YYYY'); end if;
 if exists(select 1 from public.primeras_citas_seguimientos where cita_id=c.id and realizado_at is not null and (realizado_at at time zone 'America/Bogota')::date=hoy) then raise exception 'Ya hay un seguimiento registrado hoy para esta cita.'; end if;
 if length(t)<30 or length(t)>1000 then raise exception 'Escribe qué pasó en el seguimiento (mínimo 30 caracteres).'; end if;
 select s.nota into previo from public.primeras_citas_seguimientos s where s.cita_id=c.id and s.realizado_at is not null order by s.realizado_at desc limit 1;
 if previo is not null and lower(previo)=lower(t) then raise exception 'El registro debe ser distinto al anterior.'; end if;
 if p_canal is null or p_canal not in ('WhatsApp','Llamada','Correo','Presencial') then raise exception 'Elige el canal.'; end if;
 if p_resultado is null or p_resultado not in ('Sin respuesta','Interesada','Reagendó','Alquiló','Descartó','No desea contacto') then raise exception 'Elige el resultado.'; end if;
 update public.primeras_citas_seguimientos set updated_at=clock_timestamp(),nota=t,canal=p_canal,resultado=p_resultado,realizado_at=now(),responsable_id=auth.uid() where id=p_id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),'Seguimiento '||f.etapa,p_canal||' · '||p_resultado||': '||t);
 if p_resultado in ('Alquiló','Descartó','No desea contacto') then
  update public.primeras_citas set resultado_comercial=case p_resultado when 'Alquiló' then 'ALQUILÓ' when 'Descartó' then 'DESISTIÓ' else 'NO CONTACTAR' end,updated_at=clock_timestamp() where id=c.id;
  update public.primeras_citas_seguimientos set anulado_at=now(),updated_at=clock_timestamp() where cita_id=c.id and realizado_at is null and anulado_at is null;
 end if;
end $$;
create or replace function public.gestionar_seguimiento_primera_cita(p_id uuid,p_nota text,p_canal text,p_resultado text,p_version timestamptz) returns void language sql security invoker set search_path='' as $$
 select private.gestionar_seguimiento_primera_cita(p_id,p_nota,p_canal,p_resultado,p_version)
$$;
revoke all on function public.gestionar_seguimiento_primera_cita(uuid,text,text,text,timestamptz),private.gestionar_seguimiento_primera_cita(uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.gestionar_seguimiento_primera_cita(uuid,text,text,text,timestamptz),private.gestionar_seguimiento_primera_cita(uuid,text,text,text,timestamptz) to authenticated;
