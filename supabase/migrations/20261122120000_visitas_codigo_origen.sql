-- Primeras visitas: código CIT/VIT-SEDE-0000, origen de la visita (visita, contrato o clienta de aliado),
-- contrato directo exige visita (aliados no), vincular = Alquiló, vitrina "Registrada al contratar".
-- Revert: remove the new columns, functions and triggers; re-apply the previous bodies of
--   private.vincular_primera_cita, private.contrato_auto_vincular_cita, private.duplicados_vitrina and private.registrar_vitrina.
alter table public.primeras_citas add column if not exists codigo text unique,
 add column if not exists visita_origen_id uuid references public.primeras_citas(id),
 add column if not exists contrato_origen_id uuid references public.contratos(id),
 add column if not exists aliado_clienta_origen_id uuid references public.aliado_clientas(id),
 add column if not exists registrada_al_contratar boolean not null default false;

-- 1. Code per visit: CIT (cita) or VIT (vitrina) - first 3 letters of the sede - 4-digit sequence per prefix and sede.
create or replace function private.codigo_visita(p_origen text,p_sede uuid) returns text language plpgsql security definer set search_path='' as $$
declare pre text; n int;
begin
 pre:=case when p_origen='vitrina' then 'VIT' else 'CIT' end||'-'||coalesce(upper(left(regexp_replace(private.norm_nombre((select nombre from public.sedes where id=p_sede)),'[^a-z]','','g'),3)),'SIN');
 perform pg_advisory_xact_lock(hashtext('codigo_visita:'||pre));
 select coalesce(max(substr(codigo,length(pre)+2)::int),0)+1 into n from public.primeras_citas where codigo like pre||'-%' and substr(codigo,length(pre)+2)~'^[0-9]+$';
 return pre||'-'||lpad(n::text,4,'0');
end $$;

-- 3. Origin of a visit by document, phone or email: latest earlier visit, latest contract, ally client.
create or replace function private.origen_visita(p_id uuid,p_doc text,p_tel text,p_mail text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'visita',(select c.id from public.primeras_citas c where c.id is distinct from p_id and c.estado<>'cancelada'
    and ((private.norm_doc(p_doc) is not null and private.norm_doc(c.cliente_documento)=private.norm_doc(p_doc)) or (private.norm_tel(p_tel) is not null and private.norm_tel(c.telefono)=private.norm_tel(p_tel)) or (private.norm_mail(p_mail) is not null and private.norm_mail(c.email)=private.norm_mail(p_mail)))
    order by c.fecha desc,c.created_at desc limit 1),
  'contrato',(select k.id from public.contratos k where lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado','borrador')
    and ((private.norm_doc(p_doc) is not null and private.norm_doc(k.cliente_documento)=private.norm_doc(p_doc)) or (private.norm_tel(p_tel) is not null and private.norm_tel(coalesce(k.cliente_whatsapp,k.whatsapp))=private.norm_tel(p_tel)) or (private.norm_mail(p_mail) is not null and private.norm_mail(k.cliente_email)=private.norm_mail(p_mail)))
    order by k.created_at desc limit 1),
  'aliado',(select a.id from public.aliado_clientas a
    where (private.norm_doc(p_doc) is not null and private.norm_doc(p_doc) in (private.norm_doc(a.clienta_documento),private.norm_doc(a.rep_cedula)))
     or (private.norm_tel(p_tel) is not null and private.norm_tel(p_tel) in (private.norm_tel(a.clienta_celular),private.norm_tel(a.rep_celular)))
     or (private.norm_mail(p_mail) is not null and private.norm_mail(p_mail) in (private.norm_mail(a.clienta_correo),private.norm_mail(a.rep_correo)))
    order by a.creado_en desc limit 1))
$$;

create or replace function private.primera_cita_codigo_origen() returns trigger language plpgsql security definer set search_path='' as $$
declare o jsonb;
begin
 if new.codigo is null then new.codigo:=private.codigo_visita(new.origen,new.sede_id); end if;
 if current_setting('ambar.al_contratar',true)='1' then new.registrada_al_contratar:=true; perform set_config('ambar.al_contratar','',true); end if;
 o:=private.origen_visita(new.id,new.cliente_documento,new.telefono,new.email);
 new.visita_origen_id:=coalesce(new.visita_origen_id,(o->>'visita')::uuid);
 new.contrato_origen_id:=coalesce(new.contrato_origen_id,(o->>'contrato')::uuid);
 new.aliado_clienta_origen_id:=coalesce(new.aliado_clienta_origen_id,(o->>'aliado')::uuid);
 return new;
end $$;
create trigger primera_cita_codigo_origen before insert on public.primeras_citas for each row execute function private.primera_cita_codigo_origen();

-- Existing visits get their code in creation order (notification triggers off: only the code changes).
alter table public.primeras_citas disable trigger notificar_cambio_primera_cita;
alter table public.primeras_citas disable trigger encolar_evento_crm_primera_cita;
alter table public.primeras_citas disable trigger encolar_capi_primera_cita;
alter table public.primeras_citas disable trigger programar_mensajes_primera_cita;
do $$ declare r record; begin
 for r in select id,origen,sede_id from public.primeras_citas where codigo is null order by created_at,id loop
  update public.primeras_citas set codigo=private.codigo_visita(r.origen,r.sede_id) where id=r.id;
 end loop;
end $$;
alter table public.primeras_citas enable trigger notificar_cambio_primera_cita;
alter table public.primeras_citas enable trigger encolar_evento_crm_primera_cita;
alter table public.primeras_citas enable trigger encolar_capi_primera_cita;
alter table public.primeras_citas enable trigger programar_mensajes_primera_cita;

-- 2. Linking also works for scheduled visits (the link marks them Alquiló); only cancelled visits are refused.
do $$ declare d text:=pg_get_functiondef('private.vincular_primera_cita()'::regprocedure); begin
 d:=replace(d,'if c.estado not in (''asistio'',''seguimiento'') then raise exception ''Registra primero la atención de la primera cita.''; end if;','if c.estado=''cancelada'' then raise exception ''La visita está cancelada.''; end if;');
 if d like '%Registra primero la atención%' then raise exception 'patch vincular failed'; end if;
 execute d;
end $$;

-- 2. A direct contract (not ally) created by a user needs its visit.
do $$ declare d text:=pg_get_functiondef('private.contrato_auto_vincular_cita()'::regprocedure); begin
 d:=replace(d,' return new;
end',' if new.primera_cita_id is null and not coalesce(new.tiene_aliado,false) and auth.uid() is not null then
  raise exception ''Busca la visita de la clienta o registra la vitrina antes de crear el contrato.'';
 end if;
 return new;
end');
 if d not like '%registra la vitrina antes%' then raise exception 'patch auto vincular failed'; end if;
 execute d;
end $$;

-- 2. Visits available for a new contract: not cancelled, without active contract, in the user's access.
create or replace function public.buscar_visitas_contrato(p_q text) returns table(id uuid,codigo text,cliente text,telefono text,documento text,fecha date,sede_id uuid,sede text,origen text,estado text)
language sql stable security definer set search_path='' as $$
 select c.id,c.codigo,c.cliente_nombre,c.telefono,c.cliente_documento,c.fecha,c.sede_id,s.nombre,c.origen,c.estado
 from public.primeras_citas c join public.sedes s on s.id=c.sede_id
 where auth.uid() is not null and length(btrim(coalesce(p_q,'')))>=3 and c.estado<>'cancelada' and private.acceso_primera_cita(c.sede_id,c.modalidad)
  and not exists(select 1 from public.contratos k where k.primera_cita_id=c.id and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado'))
  and (c.codigo ilike '%'||btrim(p_q)||'%' or private.norm_nombre(c.cliente_nombre) like '%'||private.norm_nombre(p_q)||'%'
   or (private.norm_tel(p_q) is not null and length(private.norm_tel(p_q))>=7 and private.norm_tel(c.telefono) like '%'||private.norm_tel(p_q)||'%')
   or (private.norm_doc(p_q) is not null and private.norm_doc(c.cliente_documento)=private.norm_doc(p_q)))
 order by c.fecha desc limit 10
$$;
revoke all on function public.buscar_visitas_contrato(text) from public,anon;
grant execute on function public.buscar_visitas_contrato(text) to authenticated;

-- 3. Warning when registering a visit: email and ally clients join the duplicate check; "Ya alquiló" / "Ya vino".
create or replace function private.duplicados_vitrina(p_telefono text,p_documento text,p_email text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb:=private.duplicados_vitrina(p_telefono,p_documento); mail text:=private.norm_mail(p_email); extra jsonb; ali jsonb;
begin
 if mail is not null then
  extra:=coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.cliente_nombre,'fecha',c.fecha,'hora',to_char(c.hora,'HH24:MI'),'sede',s.nombre,'sede_id',c.sede_id,'estado',c.estado,'origen',c.origen,
    'vinculable',c.estado<>'cancelada' and private.acceso_primera_cita(c.sede_id,c.modalidad),'pendiente',c.estado in ('agendada','confirmada')))
   from public.primeras_citas c join public.sedes s on s.id=c.sede_id where private.norm_mail(c.email)=mail and not (base->'visitas') @> jsonb_build_array(jsonb_build_object('id',c.id))),'[]'::jsonb);
  base:=jsonb_set(base,'{visitas}',(base->'visitas')||extra);
  extra:=coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'numero_contrato',k.numero_contrato,'nombre',k.cliente_nombre,'sede',s.nombre,'fecha_evento',k.fecha_evento))
   from public.contratos k left join public.sedes s on s.id=k.sede_id where lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado') and private.norm_mail(k.cliente_email)=mail
    and not (base->'contratos') @> jsonb_build_array(jsonb_build_object('id',k.id))),'[]'::jsonb);
  base:=jsonb_set(base,'{contratos}',(base->'contratos')||extra);
 end if;
 ali:=coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'nombre',a.clienta_nombre,'aliado',al.nombre_completo,'contrato',a.contrato_id is not null))
  from public.aliado_clientas a left join public.aliados al on al.id=a.aliado_id
  where a.id=(select (private.origen_visita(null,p_documento,p_telefono,p_email)->>'aliado')::uuid)),'[]'::jsonb);
 return base||jsonb_build_object('aliados',ali,'aviso',case when jsonb_array_length(base->'contratos')>0 or exists(select 1 from jsonb_array_elements(ali) x where (x->>'contrato')::boolean) then 'Ya alquiló'
  when jsonb_array_length(base->'visitas')>0 or jsonb_array_length(ali)>0 then 'Ya vino' end);
end $$;
create or replace function public.duplicados_vitrina(p_telefono text,p_documento text,p_email text) returns jsonb language sql stable set search_path='' as $$
 select private.duplicados_vitrina(p_telefono,p_documento,p_email)
$$;
revoke all on function public.duplicados_vitrina(text,text,text),private.duplicados_vitrina(text,text,text) from public,anon;
grant execute on function public.duplicados_vitrina(text,text,text),private.duplicados_vitrina(text,text,text) to authenticated;

-- 4. Vitrina registered from the contract form.
do $$ declare d text:=pg_get_functiondef('private.registrar_vitrina(jsonb)'::regprocedure); begin
 d:=replace(d,' insert into public.primeras_citas(id,origen,',' if coalesce((p_datos->>''al_contratar'')::boolean,false) then perform set_config(''ambar.al_contratar'',''1'',true); end if;
 insert into public.primeras_citas(id,origen,');
 d:=replace(d,' returning id into new_id;',' returning id into new_id;
 if coalesce((p_datos->>''al_contratar'')::boolean,false) then
  insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(new_id,auth.uid(),''Registrada al contratar'',''Vitrina creada desde el formulario de contrato.'');
 end if;');
 if d not like '%ambar.al_contratar%' or d not like '%Registrada al contratar%' then raise exception 'patch registrar_vitrina failed'; end if;
 execute d;
end $$;
