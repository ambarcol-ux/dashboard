-- Aliados: permisos por rol (administración y asesora líder con los mismos; el Propietario los restringe en Accesos). Cada sede sigue viendo solo lo suyo.
insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden) values
 ('aliados.gestionar','Aliados','Crear, editar e inactivar aliados de su sede','Enviar contrato para firma, ver acuerdo firmado y certificación, copiar y reenviar enlaces',false,300),
 ('aliados.aprobar','Aliados','Aprobar o rechazar aliados de su sede','Asigna el código ORG-0001 y envía los enlaces',false,301),
 ('aliados.configurar','Aliados','Configuración del módulo','Subir el acuerdo en Word, tipos de aliado y ficha de medidas',false,302)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso) select r,p from unnest(array['admin','asesora_lider']) r cross join unnest(array['aliados.gestionar','aliados.aprobar','aliados.configurar']) p on conflict do nothing;

create or replace function private.aliados_gestion() returns boolean language sql stable security definer set search_path='' as $$ select public.es_admin() or private.es_contabilidad() or private.tiene_permiso('aliados.gestionar'); $$;
create or replace function private.aliados_configurar() returns boolean language sql stable security definer set search_path='' as $$ select public.es_admin() or private.tiene_permiso('aliados.configurar'); $$;
revoke all on function private.aliados_configurar() from public,anon;
grant execute on function private.aliados_configurar() to authenticated;
alter policy acuerdos_aliado_admin_lee on public.acuerdos_aliado using (private.aliados_configurar());
alter policy tipos_aliado_admin_insert on public.tipos_aliado with check (private.aliados_configurar());
alter policy tipos_aliado_admin_update on public.tipos_aliado using (private.aliados_configurar());
alter policy admin_escribe on public.medidas_campos using (private.aliados_configurar()) with check (private.aliados_configurar());
alter policy admin_escribe on public.aliados_config using (private.aliados_configurar()) with check (private.aliados_configurar());
alter policy aliados_documentos_equipo_envios on storage.objects with check (bucket_id='aliados_documentos' and (name like 'envios/%' or (name like 'medidas/%' and private.aliados_configurar())) and coalesce(private.prov_rol() not in ('','proveedor'),false));

create or replace function private.guardar_aliado(p_id uuid, p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $function$
declare a public.aliados; ced text:=regexp_replace(coalesce(p_datos->>'cedula',''),'\D','','g'); nid uuid;
 v_banco text:=nullif(btrim(p_datos->>'banco'),''); v_tcta text:=nullif(btrim(p_datos->>'tipo_cuenta'),''); v_num text:=nullif(regexp_replace(coalesce(p_datos->>'numero_cuenta',''),'\s','','g'),''); v_tit text:=nullif(btrim(p_datos->>'titular_cuenta'),'');
 v_cert text:=nullif(p_datos->>'certificacion_path','');
begin
 if not (public.es_admin() or private.tiene_permiso('aliados.gestionar')) then raise exception 'No tienes permiso para crear o editar aliados.' using errcode='42501'; end if;
 -- Fuera del Propietario, solo aliados de la propia sede.
 if not private.agenda_es_propietario() then
  if nullif(p_datos->>'sede_principal','')::uuid is distinct from private.metas_sede_usuario() then raise exception 'Solo puedes crear o editar aliados de tu sede.' using errcode='42501'; end if;
  if p_id is not null and not private.aliado_visible(p_id) then raise exception 'Aliado de otra sede.' using errcode='42501'; end if;
 end if;
 if exists(select 1 from public.aliados x where x.cedula=ced and x.id is distinct from p_id) then raise exception 'Ya existe un aliado con la cédula %.',ced; end if;
 if v_cert is not null and not exists(select 1 from storage.objects where bucket_id='aliados_documentos' and name=v_cert) then raise exception 'La certificación bancaria no se encontró.'; end if;
 if p_id is null then
  insert into public.aliados(nombre_completo,cedula,celular,correo,direccion,tipo_aliado_id,sede_principal,banco,tipo_cuenta,numero_cuenta,titular_cuenta,certificacion_path,creado_por)
  values(btrim(p_datos->>'nombre_completo'),ced,btrim(p_datos->>'celular'),lower(btrim(p_datos->>'correo')),btrim(p_datos->>'direccion'),(p_datos->>'tipo_aliado_id')::smallint,nullif(p_datos->>'sede_principal','')::uuid,v_banco,v_tcta,v_num,v_tit,v_cert,auth.uid())
  returning id into nid;
  return nid;
 end if;
 select * into a from public.aliados where id=p_id for update;
 if a.id is null then raise exception 'Aliado no encontrado.'; end if;
 update public.aliados set nombre_completo=btrim(p_datos->>'nombre_completo'),cedula=ced,celular=btrim(p_datos->>'celular'),correo=lower(btrim(p_datos->>'correo')),direccion=btrim(p_datos->>'direccion'),
  tipo_aliado_id=(p_datos->>'tipo_aliado_id')::smallint,sede_principal=nullif(p_datos->>'sede_principal','')::uuid,
  estado=case when a.estado in ('activo','inactivo') and p_datos->>'estado' in ('activo','inactivo') then p_datos->>'estado' else a.estado end
 where id=a.id;
 if v_num is not null and (v_banco,v_tcta,v_num,v_tit) is distinct from (a.banco,a.tipo_cuenta,a.numero_cuenta,a.titular_cuenta) then
  if a.numero_cuenta is null then update public.aliados set banco=v_banco,tipo_cuenta=v_tcta,numero_cuenta=v_num,titular_cuenta=v_tit,certificacion_path=coalesce(v_cert,certificacion_path) where id=a.id;
  else
   if v_banco is null or v_tcta is null or v_tit is null then raise exception 'Completa banco, tipo, número y titular de la nueva cuenta.'; end if;
   if v_cert is null then raise exception 'Adjunta la certificación bancaria de la nueva cuenta.'; end if;
   insert into public.aliados_cambios_cuenta(aliado_id,banco,tipo_cuenta,numero_cuenta,titular_cuenta,certificacion_path,solicitado_por) values(a.id,v_banco,v_tcta,v_num,v_tit,v_cert,auth.uid())
   on conflict (aliado_id) where estado='pendiente' do update set banco=excluded.banco,tipo_cuenta=excluded.tipo_cuenta,numero_cuenta=excluded.numero_cuenta,titular_cuenta=excluded.titular_cuenta,certificacion_path=excluded.certificacion_path,solicitado_por=excluded.solicitado_por,solicitado_at=now();
  end if;
 end if;
 return a.id;
end $function$;

create or replace function private.resolver_aliado(p_id uuid,p_aprobar boolean,p_motivo text) returns jsonb language plpgsql security definer set search_path='' as $function$
declare a public.aliados; t public.tipos_aliado; n integer;
begin
 if not (public.es_admin() or private.tiene_permiso('aliados.aprobar')) or not private.aliado_visible(p_id) then raise exception 'No tienes permiso para aprobar aliados.' using errcode='42501'; end if;
 select * into a from public.aliados where id=p_id for update;
 if a.id is null then raise exception 'Aliado no encontrado.'; end if;
 if a.estado<>'pendiente' then raise exception 'Solo se aprueban o rechazan aliados en estado Pendiente.'; end if;
 select * into t from public.tipos_aliado where id=a.tipo_aliado_id for update;
 if p_aprobar then
  if t.prefijo is null then raise exception 'El tipo % no tiene prefijo de código.',t.nombre; end if;
  select coalesce(max(substring(codigo from '-(\d+)$')::integer),0)+1 into n from public.aliados where codigo like t.prefijo||'-%';
  update public.aliados set estado='activo',codigo=coalesce(a.codigo,t.prefijo||'-'||lpad(n::text,4,'0')),revisado_por=auth.uid(),revisado_at=now(),motivo_rechazo=null where id=a.id returning * into a;
 else
  update public.aliados set estado='rechazado',revisado_por=auth.uid(),revisado_at=now(),motivo_rechazo=nullif(btrim(p_motivo),'') where id=a.id returning * into a;
 end if;
 return jsonb_build_object('id',a.id,'estado',a.estado,'codigo',a.codigo,'token',a.token,'nombre',a.nombre_completo,'correo',a.correo,'motivo',a.motivo_rechazo);
end $function$;
