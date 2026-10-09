-- Historical appointments remain intact; staff can complete their document after verification.
alter table public.primeras_citas add column cliente_documento text check(cliente_documento ~ '^[0-9]{5,15}$');
create index primeras_citas_documento_idx on public.primeras_citas(cliente_documento) where cliente_documento is not null;
create function public.reservar_primera_cita_documento(p_id uuid,p_fecha date,p_hora time,p_modalidad text,p_sede uuid,p_nombre text,p_telefono text,p_email text,p_consentimiento boolean,p_limite text,p_fecha_evento date,p_tipo_vestido text,p_documento text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; prior text;
begin
 if p_documento is null or p_documento !~ '^[0-9]{5,15}$' then raise exception 'Ingresa una cédula válida.';end if;
 r:=public.reservar_primera_cita_completa(p_id,p_fecha,p_hora,p_modalidad,p_sede,p_nombre,p_telefono,p_email,p_consentimiento,p_limite,p_fecha_evento,p_tipo_vestido);
 if (r->>'reservada')::boolean then
  select cliente_documento into prior from public.primeras_citas where id=p_id for update;
  if prior is not null and prior<>p_documento then raise exception 'Reserva ya utilizada con otra cédula.';end if;
  update public.primeras_citas set cliente_documento=p_documento where id=p_id;
 end if;
 return r;
end; $$;
revoke all on function public.reservar_primera_cita_documento(uuid,date,time,text,uuid,text,text,text,boolean,text,date,text,text) from public,anon,authenticated;
grant execute on function public.reservar_primera_cita_documento(uuid,date,time,text,uuid,text,text,text,boolean,text,date,text,text) to service_role;

create function private.guardar_documento_primera_cita(p_id uuid,p_documento text,p_version timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare c public.primeras_citas;
begin
 select * into c from public.primeras_citas where id=p_id for update;
 if auth.uid() is null or not found or not private.acceso_primera_cita(c.sede_id,c.modalidad) then raise exception 'No tienes acceso a esta cita.' using errcode='42501';end if;
 if p_version is null or p_version<>c.updated_at then raise exception 'La cita cambió. Actualiza antes de guardar.';end if;
 if p_documento is null or p_documento !~ '^[0-9]{5,15}$' then raise exception 'Ingresa una cédula válida.';end if;
 if c.cliente_documento is not distinct from p_documento then return;end if;
 update public.primeras_citas set cliente_documento=p_documento,updated_at=clock_timestamp() where id=p_id;
 insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(p_id,auth.uid(),'Datos de la cita','Cédula actualizada para reprogramación');
end; $$;
create function public.guardar_documento_primera_cita(p_id uuid,p_documento text,p_version timestamptz) returns void language sql security invoker set search_path='' as $$ select private.guardar_documento_primera_cita(p_id,p_documento,p_version); $$;
revoke all on function public.guardar_documento_primera_cita(uuid,text,timestamptz),private.guardar_documento_primera_cita(uuid,text,timestamptz) from public,anon;
grant execute on function public.guardar_documento_primera_cita(uuid,text,timestamptz),private.guardar_documento_primera_cita(uuid,text,timestamptz) to authenticated;

create function public.buscar_primera_cita_documento(p_documento text,p_limite_ip text,p_limite_documento text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare k text; attempts integer; blocked boolean:=false;
begin
 if p_documento is null or p_documento !~ '^[0-9]{5,15}$' or p_limite_ip is null or p_limite_documento is null or length(p_limite_ip)<>64 or length(p_limite_documento)<>64 then raise exception 'Datos inválidos.';end if;
 for k in select distinct x from unnest(array[p_limite_ip,p_limite_documento])x order by x loop
  insert into private.primeras_citas_limites(clave,ventana,intentos) values(k,now(),1)
  on conflict(clave) do update set intentos=case when primeras_citas_limites.ventana<now()-interval '1 hour' then 1 else primeras_citas_limites.intentos+1 end,ventana=case when primeras_citas_limites.ventana<now()-interval '1 hour' then now() else primeras_citas_limites.ventana end returning intentos into attempts;
  if attempts>(case when k=p_limite_documento then 5 else 20 end) then blocked:=true;end if;
 end loop;
 if blocked then return '[]'::jsonb;end if;
 return coalesce((select jsonb_agg(to_jsonb(t)) from (
  select c.id,c.fecha,c.hora,c.modalidad,s.nombre as sede from public.primeras_citas c join public.sedes s on s.id=c.sede_id
  where c.cliente_documento=p_documento and c.estado in ('agendada','confirmada','no_asistio') and c.resultado_comercial<>'NO CONTACTAR'
   and c.fecha>=(now() at time zone 'America/Bogota')::date-30
   and not exists(select 1 from public.contratos where primera_cita_id=c.id)
  order by c.fecha desc,c.hora desc limit 3
 )t),'[]'::jsonb);
end; $$;
revoke all on function public.buscar_primera_cita_documento(text,text,text) from public,anon,authenticated;
grant execute on function public.buscar_primera_cita_documento(text,text,text) to service_role;
notify pgrst,'reload schema';
