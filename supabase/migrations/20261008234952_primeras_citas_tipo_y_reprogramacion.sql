-- Enforce new choices only for new booking requests; preserve historical free-text values.
create or replace function public.reservar_primera_cita_completa(p_id uuid,p_fecha date,p_hora time,p_modalidad text,p_sede uuid,p_nombre text,p_telefono text,p_email text,p_consentimiento boolean,p_limite text,p_fecha_evento date,p_tipo_vestido text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; c public.primeras_citas;
begin
 if p_tipo_vestido is null or p_tipo_vestido not in ('Gala','Quince','Novia') or (p_fecha_evento is not null and (p_fecha_evento<p_fecha or p_fecha_evento>p_fecha+1825)) then raise exception 'Revisa la fecha del evento y tipo de vestido.'; end if;
 r:=public.reservar_primera_cita(p_id,p_fecha,p_hora,p_modalidad,p_sede,p_nombre,p_telefono,p_email,p_consentimiento,p_limite);
 if (r->>'reservada')::boolean then
  select * into c from public.primeras_citas where id=p_id for update;
  if c.fecha_evento is not null and c.fecha_evento is distinct from p_fecha_evento or c.tipo_vestido<>'' and c.tipo_vestido<>trim(p_tipo_vestido) then raise exception 'Reserva ya utilizada.'; end if;
  update public.primeras_citas set fecha_evento=p_fecha_evento,tipo_vestido=trim(p_tipo_vestido) where id=p_id;
 end if;
 return r;
end; $$;
notify pgrst,'reload schema';

-- No public directory. Only the trusted server receives matching appointments to email their owner.
create function public.recuperar_enlace_primera_cita(p_nombre text,p_email text,p_limite_ip text,p_limite_email text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare k text; attempts integer; blocked boolean:=false; norm_name text;
begin
 if p_nombre is null or length(trim(p_nombre)) not between 2 and 120 or p_email is null or length(p_email)>160 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_limite_ip is null or p_limite_email is null or length(p_limite_ip)<>64 or length(p_limite_email)<>64 then raise exception 'Datos inválidos.';end if;
 for k in select distinct x from unnest(array[p_limite_ip,p_limite_email])x order by x loop
  insert into private.primeras_citas_limites(clave,ventana,intentos) values(k,now(),1)
  on conflict(clave) do update set intentos=case when primeras_citas_limites.ventana<now()-interval '1 hour' then 1 else primeras_citas_limites.intentos+1 end,ventana=case when primeras_citas_limites.ventana<now()-interval '1 hour' then now() else primeras_citas_limites.ventana end returning intentos into attempts;
  if attempts>(case when k=p_limite_email then 3 else 10 end) then blocked:=true;end if;
 end loop;
 if blocked then return '[]'::jsonb;end if;
 norm_name:=translate(lower(regexp_replace(trim(p_nombre),'\s+',' ','g')),'áéíóúüñ','aeiouun');
 return coalesce((select jsonb_agg(to_jsonb(t)) from (
  select c.id,c.email,c.fecha,c.revision from public.primeras_citas c
  where lower(trim(c.email))=lower(trim(p_email)) and translate(lower(regexp_replace(trim(c.cliente_nombre),'\s+',' ','g')),'áéíóúüñ','aeiouun')=norm_name
   and c.estado in ('agendada','confirmada','no_asistio') and c.resultado_comercial<>'NO CONTACTAR'
   and c.fecha>=(now() at time zone 'America/Bogota')::date-30
   and not exists(select 1 from public.contratos where primera_cita_id=c.id)
  order by c.fecha desc,c.hora desc limit 3
 )t),'[]'::jsonb);
end; $$;
revoke all on function public.recuperar_enlace_primera_cita(text,text,text,text) from public,anon,authenticated;
grant execute on function public.recuperar_enlace_primera_cita(text,text,text,text) to service_role;
notify pgrst,'reload schema';
