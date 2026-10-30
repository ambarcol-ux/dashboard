-- Vínculo automático primera cita/vitrina -> contrato por documento, teléfono o correo (normalizados solo al comparar).
-- Name comparison reuses private.norm_nombre.
-- Revert: drop trigger contratos_auto_vincular_cita on public.contratos; drop the new functions;
--   re-apply the previous bodies of private.vincular_primera_cita and private.contrato_marca_alquiler.
create or replace function private.norm_tel(t text) returns text language sql immutable set search_path='' as $$
 select nullif(case when length(d)>10 and d like '57%' then substr(d,3) else d end,'') from (select regexp_replace(coalesce(t,''),'\D','','g') d) x
$$;
create or replace function private.norm_doc(t text) returns text language sql immutable set search_path='' as $$
 select nullif(regexp_replace(upper(coalesce(t,'')),'[^0-9A-Z]','','g'),'')
$$;
create or replace function private.norm_mail(t text) returns text language sql immutable set search_path='' as $$
 select nullif(lower(btrim(coalesce(t,''))),'')
$$;

-- Latest open cita (no contract, not cancelled, on or before the contract date) matching document, phone or email.
create or replace function private.cita_coincidente(p_doc text,p_tel text,p_mail text,p_fecha date) returns uuid language sql stable security definer set search_path='' as $$
 select c.id from public.primeras_citas c
 where c.estado<>'cancelada' and c.fecha<=p_fecha
  and not exists(select 1 from public.contratos k where k.primera_cita_id=c.id)
  and ((private.norm_doc(p_doc) is not null and private.norm_doc(c.cliente_documento)=private.norm_doc(p_doc))
   or (private.norm_tel(p_tel) is not null and private.norm_tel(c.telefono)=private.norm_tel(p_tel))
   or (private.norm_mail(p_mail) is not null and private.norm_mail(c.email)=private.norm_mail(p_mail)))
 order by c.fecha desc,c.created_at desc limit 1
$$;

-- Automatic links skip the manual-link checks (sede, attendance) of vincular_primera_cita.
do $$ declare d text:=pg_get_functiondef('private.vincular_primera_cita()'::regprocedure); begin
 d:=replace(d,' select * into c from public.primeras_citas where id=new.primera_cita_id for update;',
  ' select * into c from public.primeras_citas where id=new.primera_cita_id for update;
 if current_setting(''ambar.vinculo_auto'',true)=''1'' then
  insert into public.primeras_citas_historial(cita_id,usuario_id,accion,detalle) values(c.id,auth.uid(),''Contrato vinculado'',coalesce(new.numero_contrato,new.id::text));
  return new;
 end if;');
 if d not like '%ambar.vinculo_auto%' then raise exception 'patch vincular failed'; end if;
 execute d;
end $$;

-- A linked contract also closes the follow-up plan as Alquiló.
do $$ declare d text:=pg_get_functiondef('private.contrato_marca_alquiler()'::regprocedure); begin
 d:=replace(d,' end if;
 return new;',' perform private.cerrar_plan(new.primera_cita_id,''Alquiló'',''ALQUILÓ'',''No necesario'') where exists(select 1 from public.primeras_citas where id=new.primera_cita_id and cierre_seguimiento is distinct from ''Alquiló'');
 end if;
 return new;');
 if d not like '%cerrar_plan%' then raise exception 'patch marca failed'; end if;
 execute d;
end $$;

-- New contracts without origin take the matching cita or vitrina.
create or replace function private.contrato_auto_vincular_cita() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.primera_cita_id is null and lower(coalesce(new.estado,'')) not in ('anulado','cancelado','rechazado') then
  new.primera_cita_id:=private.cita_coincidente(new.cliente_documento,new.cliente_whatsapp,new.cliente_email,coalesce(new.fecha_elaboracion::date,(now() at time zone 'America/Bogota')::date));
  if new.primera_cita_id is not null then perform set_config('ambar.vinculo_auto','1',true); end if;
 end if;
 return new;
end $$;
create trigger contratos_auto_vincular_cita before insert on public.contratos for each row execute function private.contrato_auto_vincular_cita();

-- Name-only candidates in the same sede, to link by hand (admin / leader of the sede).
create or replace function public.candidatos_vinculo_nombre() returns table(cita_id uuid,cliente text,fecha date,sede text,contrato_id uuid,numero_contrato text,contrato_fecha date)
language sql stable security definer set search_path='' as $$
 select c.id,c.cliente_nombre,c.fecha,se.nombre,k.id,k.numero_contrato,coalesce(k.fecha_elaboracion::date,k.created_at::date)
 from public.primeras_citas c join public.contratos k on k.primera_cita_id is null and k.sede_id=c.sede_id
  and private.norm_nombre(k.cliente_nombre)=private.norm_nombre(c.cliente_nombre) and private.norm_nombre(c.cliente_nombre)<>''
  and coalesce(k.fecha_elaboracion::date,k.created_at::date)>=c.fecha and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado','borrador')
 left join public.sedes se on se.id=c.sede_id
 where c.estado<>'cancelada' and not exists(select 1 from public.contratos x where x.primera_cita_id=c.id)
  and (public.es_admin() or (exists(select 1 from public.profiles p where p.id=auth.uid() and p.rol_id='asesora_lider') and c.sede_id=any(private.sedes_usuario(auth.uid()))))
 order by c.fecha desc
$$;
create or replace function public.vincular_cita_contrato(p_cita uuid,p_contrato uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.candidatos_vinculo_nombre() x where x.cita_id=p_cita and x.contrato_id=p_contrato) then raise exception 'Vínculo no disponible.' using errcode='42501'; end if;
 perform set_config('ambar.vinculo_auto','1',true); perform set_config('ambar.fusion_ficha','1',true);
 update public.contratos set primera_cita_id=p_cita where id=p_contrato and primera_cita_id is null;
end $$;
revoke all on function public.candidatos_vinculo_nombre(),public.vincular_cita_contrato(uuid,uuid) from public,anon;
grant execute on function public.candidatos_vinculo_nombre(),public.vincular_cita_contrato(uuid,uuid) to authenticated;

-- One-time: link existing contracts (not drafts) to the latest earlier matching cita; one contract per cita.
do $$ declare r record; v uuid; n int:=0; begin
 perform set_config('ambar.vinculo_auto','1',true); perform set_config('ambar.fusion_ficha','1',true);
 for r in select k.* from public.contratos k where k.primera_cita_id is null and lower(coalesce(k.estado,'')) not in ('anulado','cancelado','rechazado','borrador')
  order by coalesce(k.fecha_elaboracion::date,k.created_at::date),k.created_at loop
  v:=private.cita_coincidente(r.cliente_documento,r.cliente_whatsapp,r.cliente_email,coalesce(r.fecha_elaboracion::date,r.created_at::date));
  if v is not null then update public.contratos set primera_cita_id=v where id=r.id; n:=n+1; end if;
 end loop;
 raise notice 'vinculados %',n;
end $$;
