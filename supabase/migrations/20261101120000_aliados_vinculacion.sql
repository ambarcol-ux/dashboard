-- Aliados (paso 2): tipos con prefijo, estados Pendiente/Activo/Rechazado/Inactivo, código, token, acuerdo y autorización de datos,
-- certificación obligatoria en cambios de cuenta y aprobación con código PREFIJO-0001.
alter table public.tipos_aliado add column if not exists prefijo text unique check (prefijo ~ '^[A-Z]{3}$');
update public.tipos_aliado set nombre='Fotógrafos',prefijo='FOT' where id=1;
update public.tipos_aliado set nombre='Maquilladoras y peinadoras',prefijo='MAQ' where id=2;
update public.tipos_aliado set nombre='Organizadores de eventos',prefijo='ORG' where id=3;
update public.tipos_aliado set nombre='Decoradoras',prefijo='DEC' where id=4;
update public.tipos_aliado set nombre='Salón de eventos',prefijo='SAL' where id=5;

alter table public.aliados drop constraint aliados_estado_check;
alter table public.aliados add constraint aliados_estado_check check (estado in ('pendiente_firma','pendiente','activo','rechazado','inactivo'));
alter table public.aliados
 add column if not exists codigo text unique,
 add column if not exists token uuid not null unique default gen_random_uuid(),
 add column if not exists acuerdo_version text,
 add column if not exists datos_autorizados_at timestamptz,
 add column if not exists datos_texto_version text,
 add column if not exists acuerdo_pdf_path text,
 add column if not exists origen text not null default 'erp' check (origen in ('erp','enlace')),
 add column if not exists revisado_por uuid references public.profiles(id),
 add column if not exists revisado_at timestamptz,
 add column if not exists motivo_rechazo text;
alter table public.aliados_cambios_cuenta add column if not exists certificacion_path text;

-- Cambio de cuenta: exige certificación nueva; queda pendiente (una sola por aliado) hasta aprobación.
create or replace function private.guardar_aliado(p_id uuid, p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $function$
declare a public.aliados; ced text:=regexp_replace(coalesce(p_datos->>'cedula',''),'\D','','g'); nid uuid;
 v_banco text:=nullif(btrim(p_datos->>'banco'),''); v_tcta text:=nullif(btrim(p_datos->>'tipo_cuenta'),''); v_num text:=nullif(regexp_replace(coalesce(p_datos->>'numero_cuenta',''),'\s','','g'),''); v_tit text:=nullif(btrim(p_datos->>'titular_cuenta'),'');
 v_cert text:=nullif(p_datos->>'certificacion_path','');
begin
 if not public.es_admin() then raise exception 'Solo el Administrador crea y edita aliados.' using errcode='42501'; end if;
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

create or replace function private.resolver_cambio_cuenta(p_id bigint, p_aprobar boolean) returns void language plpgsql security definer set search_path='' as $function$
declare c public.aliados_cambios_cuenta;
begin
 if not private.aliados_gestion() then raise exception 'Solo Contabilidad o el Administrador aprueban cambios de cuenta.' using errcode='42501'; end if;
 select * into c from public.aliados_cambios_cuenta where id=p_id and estado='pendiente' for update;
 if c.id is null then raise exception 'Solicitud no encontrada o ya resuelta.'; end if;
 update public.aliados_cambios_cuenta set estado=case when p_aprobar then 'aprobado' else 'rechazado' end,revisado_por=auth.uid(),revisado_at=now() where id=c.id;
 if p_aprobar then update public.aliados set banco=c.banco,tipo_cuenta=c.tipo_cuenta,numero_cuenta=c.numero_cuenta,titular_cuenta=c.titular_cuenta,certificacion_path=coalesce(c.certificacion_path,certificacion_path),cuenta_validada=false,cuenta_validada_por=null,cuenta_validada_at=null where id=c.aliado_id; end if;
end $function$;

-- Aprobar (código PREFIJO-0001 según el tipo) o rechazar (la cédula queda guardada). Devuelve lo necesario para el correo.
create or replace function private.resolver_aliado(p_id uuid,p_aprobar boolean,p_motivo text) returns jsonb language plpgsql security definer set search_path='' as $function$
declare a public.aliados; t public.tipos_aliado; n integer;
begin
 if not public.es_admin() then raise exception 'Solo administración aprueba aliados.' using errcode='42501'; end if;
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
create or replace function public.resolver_aliado(p_id uuid,p_aprobar boolean,p_motivo text) returns jsonb language sql security invoker set search_path='' as $$ select private.resolver_aliado(p_id,p_aprobar,p_motivo); $$;
revoke all on function private.resolver_aliado(uuid,boolean,text),public.resolver_aliado(uuid,boolean,text) from public,anon;
grant execute on function private.resolver_aliado(uuid,boolean,text),public.resolver_aliado(uuid,boolean,text) to authenticated;

create or replace function private.aliados_resumen() returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare limite uuid:=private.aliados_sede_usuario(); gestion boolean:=private.aliados_gestion();
begin
 if auth.uid() is null or private.prov_rol() in ('','proveedor') then raise exception 'No autorizado.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(x order by x->>'nombre') from (select jsonb_build_object('id',a.id,'nombre',a.nombre_completo,'cedula',a.cedula,'celular',a.celular,'correo',a.correo,'direccion',a.direccion,
   'tipo_aliado_id',a.tipo_aliado_id,'tipo',t.nombre,'sede_principal',a.sede_principal,'sede',s.nombre,'estado',a.estado,
   'codigo',a.codigo,'origen',a.origen,'acuerdo_version',a.acuerdo_version,'datos_autorizados_at',a.datos_autorizados_at,'datos_texto_version',a.datos_texto_version,
   'acuerdo_pdf_path',case when gestion then a.acuerdo_pdf_path end,'motivo_rechazo',a.motivo_rechazo,
   'banco',a.banco,'tipo_cuenta',a.tipo_cuenta,'numero_cuenta',case when gestion then a.numero_cuenta else private.mask_cuenta(a.numero_cuenta) end,'cuenta_mascara',private.mask_cuenta(a.numero_cuenta),'titular_cuenta',a.titular_cuenta,
   'cuenta_validada',a.cuenta_validada,'certificacion_path',case when gestion then a.certificacion_path end,
   'cambio_pendiente',(select jsonb_build_object('id',c.id,'banco',c.banco,'tipo_cuenta',c.tipo_cuenta,'numero_cuenta',case when gestion then c.numero_cuenta else private.mask_cuenta(c.numero_cuenta) end,'titular_cuenta',c.titular_cuenta,'solicitado_at',c.solicitado_at,'certificacion_path',case when gestion then c.certificacion_path end) from public.aliados_cambios_cuenta c where c.aliado_id=a.id and c.estado='pendiente'),
   'firma',(select jsonb_build_object('fecha',f.fecha_firma,'version',f.version,'codigo',upper(left(f.hash,12))) from public.contratos_aliado f where f.aliado_id=a.id),
   'contratos',0,'ventas',0) x
  from public.aliados a join public.tipos_aliado t on t.id=a.tipo_aliado_id left join public.sedes s on s.id=a.sede_principal
  where limite is null or a.sede_principal=limite) t2(x)),'[]'::jsonb);
end $function$;
