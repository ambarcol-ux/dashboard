-- Módulo Aliados Directos (guía del 20/10/2026): perfil del aliado con cuenta bancaria, contrato de aliado con
-- firma única, sección Aliado en el contrato del cliente (tipo, aliado, línea 1-4) y control de comisiones.
-- No cambia la Red VIP de aliados existente (referidores).

create table public.tipos_aliado (
 id smallint generated always as identity primary key,
 nombre text not null unique check (length(btrim(nombre)) between 2 and 60),
 activo boolean not null default true
);
insert into public.tipos_aliado(nombre) values ('Fotógrafo'),('Maquillaje y peinado'),('Organizador de eventos'),('Decoración'),('Salón de eventos');

create table public.lineas_aliado (
 id smallint primary key check (id between 1 and 4),
 nombre text not null check (length(btrim(nombre)) between 1 and 60),
 tipo_comision text not null default 'valor' check (tipo_comision in ('porcentaje','valor')),
 valor_comision numeric(14,2) not null default 0 check (valor_comision>=0)
);
insert into public.lineas_aliado(id,nombre) values (1,'Línea 1'),(2,'Línea 2'),(3,'Línea 3'),(4,'Línea 4');

create table public.aliados (
 id uuid primary key default gen_random_uuid(),
 nombre_completo text not null check (length(btrim(nombre_completo)) between 3 and 140),
 cedula text not null check (cedula ~ '^[0-9]{5,15}$'),
 celular text not null check (celular ~ '^[0-9+ ()-]{7,20}$'),
 correo text not null check (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
 direccion text not null check (length(btrim(direccion)) between 5 and 200),
 tipo_aliado_id smallint not null references public.tipos_aliado(id),
 sede_principal uuid references public.sedes(id),
 banco text, tipo_cuenta text, numero_cuenta text, titular_cuenta text,
 cuenta_validada boolean not null default false, cuenta_validada_por uuid references public.profiles(id), cuenta_validada_at timestamptz,
 certificacion_path text,
 estado text not null default 'pendiente_firma' check (estado in ('pendiente_firma','activo','inactivo')),
 creado_por uuid references public.profiles(id),
 fecha_creacion timestamptz not null default now()
);
create unique index aliados_cedula_unica on public.aliados(cedula);

create table public.aliados_cambios_cuenta (
 id bigint generated always as identity primary key,
 aliado_id uuid not null references public.aliados(id),
 banco text not null, tipo_cuenta text not null, numero_cuenta text not null, titular_cuenta text not null,
 estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado')),
 solicitado_por uuid references public.profiles(id), solicitado_at timestamptz not null default now(),
 revisado_por uuid references public.profiles(id), revisado_at timestamptz
);
create unique index aliados_un_cambio_pendiente on public.aliados_cambios_cuenta(aliado_id) where estado='pendiente';

create table public.contratos_aliado (
 id uuid primary key default gen_random_uuid(),
 aliado_id uuid not null unique references public.aliados(id),
 version text not null,
 texto jsonb not null,
 datos jsonb not null,
 firma_base64 text not null check (firma_base64 like 'data:image/png;base64,%' and length(firma_base64)<=1500000),
 fecha_firma timestamptz not null default now(),
 ip text, user_agent text,
 hash text not null,
 firmado boolean not null default true
);

create table public.historial_aliado (
 id bigint generated always as identity primary key,
 aliado_id uuid not null references public.aliados(id),
 campo text not null, valor_anterior text, valor_nuevo text,
 usuario uuid references public.profiles(id), fecha_hora timestamptz not null default now()
);

alter table public.contratos
 add column if not exists tiene_aliado boolean not null default false,
 add column if not exists aliado_id uuid references public.aliados(id),
 add column if not exists linea_id smallint references public.lineas_aliado(id),
 add column if not exists comision_calculada numeric(14,2),
 add column if not exists aliado_datos jsonb;

create table public.pagos_aliado (
 id uuid primary key default gen_random_uuid(),
 contrato_cliente_id uuid not null unique references public.contratos(id) on delete cascade,
 aliado_id uuid not null references public.aliados(id),
 sede_id uuid references public.sedes(id),
 valor numeric(14,2) not null default 0,
 estado text not null default 'en_espera' check (estado in ('en_espera','por_pagar','pagado','anulado')),
 fecha_pago timestamptz, comprobante_path text, pagado_por uuid references public.profiles(id),
 actualizado_at timestamptz not null default now()
);

-- RLS: lectura directa solo Administración y Contabilidad; el resto usa las funciones de abajo.
alter table public.tipos_aliado enable row level security;
alter table public.lineas_aliado enable row level security;
alter table public.aliados enable row level security;
alter table public.aliados_cambios_cuenta enable row level security;
alter table public.contratos_aliado enable row level security;
alter table public.historial_aliado enable row level security;
alter table public.pagos_aliado enable row level security;
revoke all on public.tipos_aliado,public.lineas_aliado,public.aliados,public.aliados_cambios_cuenta,public.contratos_aliado,public.historial_aliado,public.pagos_aliado from public,anon,authenticated;
grant select on public.tipos_aliado,public.lineas_aliado,public.aliados,public.aliados_cambios_cuenta,public.contratos_aliado,public.historial_aliado,public.pagos_aliado to authenticated;
grant insert,update on public.tipos_aliado,public.lineas_aliado to authenticated;
create function private.aliados_gestion() returns boolean language sql stable security definer set search_path='' as $$ select public.es_admin() or private.es_contabilidad(); $$;
create policy tipos_aliado_leer on public.tipos_aliado for select to authenticated using (true);
create policy lineas_aliado_leer on public.lineas_aliado for select to authenticated using (true);
create policy tipos_aliado_admin_insert on public.tipos_aliado for insert to authenticated with check ((select public.es_admin()));
create policy tipos_aliado_admin_update on public.tipos_aliado for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy lineas_aliado_admin_update on public.lineas_aliado for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy aliados_gestion_leer on public.aliados for select to authenticated using ((select private.aliados_gestion()));
create policy aliados_cambios_leer on public.aliados_cambios_cuenta for select to authenticated using ((select private.aliados_gestion()));
create policy contratos_aliado_leer on public.contratos_aliado for select to authenticated using ((select private.aliados_gestion()));
create policy historial_aliado_leer on public.historial_aliado for select to authenticated using ((select private.aliados_gestion()));
create policy pagos_aliado_leer on public.pagos_aliado for select to authenticated using ((select private.aliados_gestion()));

-- Historial de cambios del perfil.
create function private.historial_aliado_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; a jsonb:=to_jsonb(old); b jsonb:=to_jsonb(new);
begin
 for k in select jsonb_object_keys(b) loop
  if k in ('id','fecha_creacion','creado_por') then continue; end if;
  if a->k is distinct from b->k then
   insert into public.historial_aliado(aliado_id,campo,valor_anterior,valor_nuevo,usuario)
   values(new.id,k,case when k='numero_cuenta' then '****'||right(coalesce(a->>k,''),4) else a->>k end,case when k='numero_cuenta' then '****'||right(coalesce(b->>k,''),4) else b->>k end,auth.uid());
  end if;
 end loop;
 return new;
end $$;
create trigger aliados_historial after update on public.aliados for each row execute function private.historial_aliado_trigger();

-- Sección Aliado del contrato del cliente: valida, copia los datos del aliado y calcula la comisión.
create function private.contrato_aliado_antes() returns trigger language plpgsql security definer set search_path='' as $$
declare al public.aliados; li public.lineas_aliado; t text;
begin
 if not coalesce(new.tiene_aliado,false) then
  new.aliado_id:=null; new.linea_id:=null; new.comision_calculada:=null; new.aliado_datos:=null; return new;
 end if;
 if new.aliado_id is null or new.linea_id is null then raise exception 'Con Aliado = Sí debes elegir el tipo, el aliado y la línea.'; end if;
 select * into al from public.aliados where id=new.aliado_id;
 if al.id is null then raise exception 'Aliado no encontrado.'; end if;
 if tg_op='INSERT' or new.aliado_id is distinct from old.aliado_id then
  if al.estado<>'activo' then raise exception 'El aliado % no está activo (debe tener el contrato firmado).',al.nombre_completo; end if;
  select nombre into t from public.tipos_aliado where id=al.tipo_aliado_id;
  new.aliado_datos:=jsonb_build_object('nombre',al.nombre_completo,'cedula',al.cedula,'celular',al.celular,'correo',al.correo,'direccion',al.direccion,'tipo',t,'copiado_at',now());
 end if;
 select * into li from public.lineas_aliado where id=new.linea_id;
 new.comision_calculada:=round(case when li.tipo_comision='porcentaje' then coalesce(new.valor_total,0)*li.valor_comision/100 else li.valor_comision end,2);
 return new;
end $$;
create trigger contratos_aliado_antes before insert or update of tiene_aliado,aliado_id,linea_id,valor_total on public.contratos for each row execute function private.contrato_aliado_antes();

-- Estado de la comisión: En espera (saldo pendiente), Por pagar (saldo cero), Anulado (contrato cancelado o sin aliado).
create function private.contrato_aliado_despues() returns trigger language plpgsql security definer set search_path='' as $$
declare cancelado boolean:=lower(coalesce(new.estado,'')) in ('cancelado','anulado','rechazado');
begin
 if coalesce(new.tiene_aliado,false) and new.aliado_id is not null then
  insert into public.pagos_aliado(contrato_cliente_id,aliado_id,sede_id,valor,estado)
  values(new.id,new.aliado_id,new.sede_id,coalesce(new.comision_calculada,0),case when cancelado then 'anulado' when coalesce(new.saldo,0)<=0 then 'por_pagar' else 'en_espera' end)
  on conflict (contrato_cliente_id) do update set aliado_id=excluded.aliado_id,sede_id=excluded.sede_id,valor=excluded.valor,estado=excluded.estado,actualizado_at=now()
  where public.pagos_aliado.estado<>'pagado';
 else
  update public.pagos_aliado set estado='anulado',actualizado_at=now() where contrato_cliente_id=new.id and estado<>'pagado';
 end if;
 return new;
end $$;
create trigger contratos_aliado_despues after insert or update of tiene_aliado,aliado_id,linea_id,valor_total,comision_calculada,saldo,estado,sede_id on public.contratos for each row execute function private.contrato_aliado_despues();

-- Alcance por sede (como Metas y Ventas): null = todas.
create function private.aliados_sede_usuario() returns uuid language sql stable security definer set search_path='' as $$
 select case when private.aliados_gestion() then null else private.metas_sede_usuario() end;
$$;
create function private.mask_cuenta(p text) returns text language sql immutable set search_path='' as $$ select case when p is null or p='' then null else 'terminada en '||right(p,4) end; $$;

-- Perfil (Administrador): crear o editar. Un cambio de cuenta bancaria queda pendiente hasta que Contabilidad lo apruebe.
create function private.guardar_aliado(p_id uuid,p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.aliados; ced text:=regexp_replace(coalesce(p_datos->>'cedula',''),'\D','','g'); nid uuid;
 v_banco text:=nullif(btrim(p_datos->>'banco'),''); v_tcta text:=nullif(btrim(p_datos->>'tipo_cuenta'),''); v_num text:=nullif(regexp_replace(coalesce(p_datos->>'numero_cuenta',''),'\s','','g'),''); v_tit text:=nullif(btrim(p_datos->>'titular_cuenta'),'');
begin
 if not public.es_admin() then raise exception 'Solo el Administrador crea y edita aliados.' using errcode='42501'; end if;
 if exists(select 1 from public.aliados x where x.cedula=ced and x.id is distinct from p_id) then raise exception 'Ya existe un aliado con la cédula %.',ced; end if;
 if p_id is null then
  insert into public.aliados(nombre_completo,cedula,celular,correo,direccion,tipo_aliado_id,sede_principal,banco,tipo_cuenta,numero_cuenta,titular_cuenta,creado_por)
  values(btrim(p_datos->>'nombre_completo'),ced,btrim(p_datos->>'celular'),lower(btrim(p_datos->>'correo')),btrim(p_datos->>'direccion'),(p_datos->>'tipo_aliado_id')::smallint,nullif(p_datos->>'sede_principal','')::uuid,v_banco,v_tcta,v_num,v_tit,auth.uid())
  returning id into nid;
  return nid;
 end if;
 select * into a from public.aliados where id=p_id for update;
 if a.id is null then raise exception 'Aliado no encontrado.'; end if;
 update public.aliados set nombre_completo=btrim(p_datos->>'nombre_completo'),cedula=ced,celular=btrim(p_datos->>'celular'),correo=lower(btrim(p_datos->>'correo')),direccion=btrim(p_datos->>'direccion'),
  tipo_aliado_id=(p_datos->>'tipo_aliado_id')::smallint,sede_principal=nullif(p_datos->>'sede_principal','')::uuid,
  estado=case when p_datos->>'estado' in ('activo','inactivo') and exists(select 1 from public.contratos_aliado c where c.aliado_id=a.id) then p_datos->>'estado' else a.estado end
 where id=a.id;
 -- Cuenta: si nunca tuvo, se guarda; si cambia, queda como solicitud para Contabilidad.
 if v_num is not null and (v_banco,v_tcta,v_num,v_tit) is distinct from (a.banco,a.tipo_cuenta,a.numero_cuenta,a.titular_cuenta) then
  if a.numero_cuenta is null then update public.aliados set banco=v_banco,tipo_cuenta=v_tcta,numero_cuenta=v_num,titular_cuenta=v_tit where id=a.id;
  else
   if v_banco is null or v_tcta is null or v_tit is null then raise exception 'Completa banco, tipo, número y titular de la nueva cuenta.'; end if;
   insert into public.aliados_cambios_cuenta(aliado_id,banco,tipo_cuenta,numero_cuenta,titular_cuenta,solicitado_por) values(a.id,v_banco,v_tcta,v_num,v_tit,auth.uid())
   on conflict (aliado_id) where estado='pendiente' do update set banco=excluded.banco,tipo_cuenta=excluded.tipo_cuenta,numero_cuenta=excluded.numero_cuenta,titular_cuenta=excluded.titular_cuenta,solicitado_por=excluded.solicitado_por,solicitado_at=now();
  end if;
 end if;
 return a.id;
end $$;

-- Contabilidad: validar cuenta (con certificación) y aprobar o rechazar cambios de cuenta.
create function private.validar_cuenta_aliado(p_aliado uuid,p_certificacion text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.aliados_gestion() then raise exception 'Solo Contabilidad o el Administrador validan cuentas.' using errcode='42501'; end if;
 if nullif(p_certificacion,'') is not null and not exists(select 1 from storage.objects where bucket_id='aliados_documentos' and name=p_certificacion) then raise exception 'La certificación bancaria no se encontró.'; end if;
 update public.aliados set cuenta_validada=true,cuenta_validada_por=auth.uid(),cuenta_validada_at=now(),certificacion_path=coalesce(nullif(p_certificacion,''),certificacion_path) where id=p_aliado and numero_cuenta is not null;
 if not found then raise exception 'El aliado no tiene cuenta registrada.'; end if;
end $$;
create function private.resolver_cambio_cuenta(p_id bigint,p_aprobar boolean) returns void language plpgsql security definer set search_path='' as $$
declare c public.aliados_cambios_cuenta;
begin
 if not private.aliados_gestion() then raise exception 'Solo Contabilidad o el Administrador aprueban cambios de cuenta.' using errcode='42501'; end if;
 select * into c from public.aliados_cambios_cuenta where id=p_id and estado='pendiente' for update;
 if c.id is null then raise exception 'Solicitud no encontrada o ya resuelta.'; end if;
 update public.aliados_cambios_cuenta set estado=case when p_aprobar then 'aprobado' else 'rechazado' end,revisado_por=auth.uid(),revisado_at=now() where id=c.id;
 if p_aprobar then update public.aliados set banco=c.banco,tipo_cuenta=c.tipo_cuenta,numero_cuenta=c.numero_cuenta,titular_cuenta=c.titular_cuenta,cuenta_validada=false,cuenta_validada_por=null,cuenta_validada_at=null where id=c.aliado_id; end if;
end $$;

-- Contabilidad: marcar Pagado exige comprobante y cuenta validada.
create function private.pagar_comision_aliado(p_pago uuid,p_comprobante text) returns void language plpgsql security definer set search_path='' as $$
declare p public.pagos_aliado;
begin
 if not private.aliados_gestion() then raise exception 'Solo Contabilidad o el Administrador registran pagos a aliados.' using errcode='42501'; end if;
 select * into p from public.pagos_aliado where id=p_pago for update;
 if p.id is null then raise exception 'Comisión no encontrada.'; end if;
 if p.estado<>'por_pagar' then raise exception 'Solo se pagan comisiones en estado Por pagar.'; end if;
 if not exists(select 1 from public.aliados where id=p.aliado_id and cuenta_validada) then raise exception 'La cuenta bancaria del aliado no está validada por Contabilidad.'; end if;
 if nullif(p_comprobante,'') is null or not exists(select 1 from storage.objects where bucket_id='aliados_documentos' and name=p_comprobante) then raise exception 'Adjunta el comprobante del pago.'; end if;
 update public.pagos_aliado set estado='pagado',fecha_pago=now(),comprobante_path=p_comprobante,pagado_por=auth.uid(),actualizado_at=now() where id=p.id;
end $$;

-- Buscador del contrato del cliente: solo aliados Activos (contrato firmado), sin datos bancarios.
create function private.buscar_aliados(p_tipo smallint,p_q text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text:=lower(btrim(coalesce(p_q,'')));
begin
 if auth.uid() is null or private.prov_rol() in ('','proveedor') then raise exception 'No autorizado.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'nombre',a.nombre_completo,'cedula',a.cedula,'celular',a.celular,'correo',a.correo,'direccion',a.direccion,'tipo_aliado_id',a.tipo_aliado_id,'tipo',t.nombre) order by a.nombre_completo)
  from public.aliados a join public.tipos_aliado t on t.id=a.tipo_aliado_id
  where a.estado='activo' and (p_tipo is null or a.tipo_aliado_id=p_tipo) and (q='' or private.norm_nombre(a.nombre_completo) like '%'||private.norm_nombre(q)||'%' or a.cedula like '%'||regexp_replace(q,'\D','','g')||'%' and regexp_replace(q,'\D','','g')<>'')
  limit 20),'[]'::jsonb);
end $$;

-- Contratos y pagos por aliado (vista por sede).
create function private.aliados_resumen() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare limite uuid:=private.aliados_sede_usuario(); gestion boolean:=private.aliados_gestion();
begin
 if auth.uid() is null or private.prov_rol() in ('','proveedor') then raise exception 'No autorizado.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(x order by x->>'nombre') from (select jsonb_build_object('id',a.id,'nombre',a.nombre_completo,'cedula',a.cedula,'celular',a.celular,'correo',a.correo,'direccion',a.direccion,
   'tipo_aliado_id',a.tipo_aliado_id,'tipo',t.nombre,'sede_principal',a.sede_principal,'sede',s.nombre,'estado',a.estado,
   'banco',a.banco,'tipo_cuenta',a.tipo_cuenta,'numero_cuenta',case when gestion then a.numero_cuenta else private.mask_cuenta(a.numero_cuenta) end,'cuenta_mascara',private.mask_cuenta(a.numero_cuenta),'titular_cuenta',a.titular_cuenta,
   'cuenta_validada',a.cuenta_validada,'certificacion_path',case when gestion then a.certificacion_path end,
   'cambio_pendiente',(select jsonb_build_object('id',c.id,'banco',c.banco,'tipo_cuenta',c.tipo_cuenta,'numero_cuenta',case when gestion then c.numero_cuenta else private.mask_cuenta(c.numero_cuenta) end,'titular_cuenta',c.titular_cuenta,'solicitado_at',c.solicitado_at) from public.aliados_cambios_cuenta c where c.aliado_id=a.id and c.estado='pendiente'),
   'firma',(select jsonb_build_object('fecha',f.fecha_firma,'version',f.version,'codigo',upper(left(f.hash,12))) from public.contratos_aliado f where f.aliado_id=a.id),
   'contratos',coalesce(k.n,0),'ventas',coalesce(k.ventas,0),'por_pagar',coalesce(k.por_pagar,0),'en_espera',coalesce(k.en_espera,0),'pagado',coalesce(k.pagado,0)) x
  from public.aliados a join public.tipos_aliado t on t.id=a.tipo_aliado_id left join public.sedes s on s.id=a.sede_principal
  left join lateral (select count(*) n,sum(c.valor_total) ventas,sum(p.valor) filter (where p.estado='por_pagar') por_pagar,sum(p.valor) filter (where p.estado='en_espera') en_espera,sum(p.valor) filter (where p.estado='pagado') pagado
   from public.pagos_aliado p join public.contratos c on c.id=p.contrato_cliente_id where p.aliado_id=a.id and p.estado<>'anulado' and (limite is null or p.sede_id=limite)) k on true
  where limite is null or a.sede_principal=limite or coalesce(k.n,0)>0) t2(x)),'[]'::jsonb);
end $$;
create function private.aliado_contratos(p_aliado uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare limite uuid:=private.aliados_sede_usuario();
begin
 if auth.uid() is null or private.prov_rol() in ('','proveedor') then raise exception 'No autorizado.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('pago_id',p.id,'contrato_id',c.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'sede',s.nombre,'fecha',(c.created_at at time zone 'America/Bogota')::date,
   'linea',l.nombre,'valor_contrato',c.valor_total,'saldo',c.saldo,'comision',p.valor,'estado',p.estado,'fecha_pago',p.fecha_pago,'comprobante',case when private.aliados_gestion() then p.comprobante_path end) order by c.created_at desc)
  from public.pagos_aliado p join public.contratos c on c.id=p.contrato_cliente_id left join public.sedes s on s.id=c.sede_id left join public.lineas_aliado l on l.id=c.linea_id
  where p.aliado_id=p_aliado and (limite is null or p.sede_id=limite)),'[]'::jsonb);
end $$;

-- Wrappers públicos.
create function public.guardar_aliado(p_id uuid,p_datos jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.guardar_aliado(p_id,p_datos); $$;
create function public.validar_cuenta_aliado(p_aliado uuid,p_certificacion text) returns void language sql security invoker set search_path='' as $$ select private.validar_cuenta_aliado(p_aliado,p_certificacion); $$;
create function public.resolver_cambio_cuenta(p_id bigint,p_aprobar boolean) returns void language sql security invoker set search_path='' as $$ select private.resolver_cambio_cuenta(p_id,p_aprobar); $$;
create function public.pagar_comision_aliado(p_pago uuid,p_comprobante text) returns void language sql security invoker set search_path='' as $$ select private.pagar_comision_aliado(p_pago,p_comprobante); $$;
create function public.buscar_aliados(p_tipo smallint,p_q text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.buscar_aliados(p_tipo,p_q); $$;
create function public.aliados_resumen() returns jsonb language sql stable security invoker set search_path='' as $$ select private.aliados_resumen(); $$;
create function public.aliado_contratos(p_aliado uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.aliado_contratos(p_aliado); $$;
revoke all on function private.aliados_gestion(),private.aliados_sede_usuario(),private.mask_cuenta(text),private.guardar_aliado(uuid,jsonb),private.validar_cuenta_aliado(uuid,text),private.resolver_cambio_cuenta(bigint,boolean),
 private.pagar_comision_aliado(uuid,text),private.buscar_aliados(smallint,text),private.aliados_resumen(),private.aliado_contratos(uuid),
 public.guardar_aliado(uuid,jsonb),public.validar_cuenta_aliado(uuid,text),public.resolver_cambio_cuenta(bigint,boolean),public.pagar_comision_aliado(uuid,text),public.buscar_aliados(smallint,text),public.aliados_resumen(),public.aliado_contratos(uuid) from public,anon;
grant execute on function private.aliados_gestion(),private.aliados_sede_usuario(),private.mask_cuenta(text),private.guardar_aliado(uuid,jsonb),private.validar_cuenta_aliado(uuid,text),private.resolver_cambio_cuenta(bigint,boolean),
 private.pagar_comision_aliado(uuid,text),private.buscar_aliados(smallint,text),private.aliados_resumen(),private.aliado_contratos(uuid),
 public.guardar_aliado(uuid,jsonb),public.validar_cuenta_aliado(uuid,text),public.resolver_cambio_cuenta(bigint,boolean),public.pagar_comision_aliado(uuid,text),public.buscar_aliados(smallint,text),public.aliados_resumen(),public.aliado_contratos(uuid) to authenticated;

-- Documentos privados: comprobantes de pago y certificaciones bancarias (Administración y Contabilidad).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('aliados_documentos','aliados_documentos',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
create policy aliados_documentos_leer on storage.objects for select to authenticated using (bucket_id='aliados_documentos' and private.aliados_gestion());
create policy aliados_documentos_subir on storage.objects for insert to authenticated with check (bucket_id='aliados_documentos' and private.aliados_gestion());
-- Contabilidad estaba limitada a los buckets de depósitos y caja: se le abre también el de aliados.
alter policy contabilidad_solo_comprobantes on storage.objects
 using ((((select private.current_profile_role()) is distinct from 'contabilidad') or (bucket_id = any (array['comprobantes_depositos','comprobantes_caja','soportes_pagos','aliados_documentos']))))
 with check ((((select private.current_profile_role()) is distinct from 'contabilidad') or (bucket_id = any (array['comprobantes_depositos','aliados_documentos']))));
alter policy contabilidad_comprobantes_pendientes on storage.objects
 using (((not private.es_contabilidad()) or ((bucket_id = 'comprobantes_depositos') and private.comprobante_contabilidad(name, true)) or (bucket_id = any (array['comprobantes_caja','soportes_pagos','aliados_documentos']))));
alter policy contabilidad_comprobante_salida on storage.objects
 with check (((not private.es_contabilidad()) or ((bucket_id = 'comprobantes_depositos') and private.comprobante_contabilidad(name, false)) or bucket_id='aliados_documentos'));

-- Buscador con parámetro integer (PostgREST) y panel nuevo otorgable en Accesos por perfil.
create or replace function private.guardar_accesos_panel(p_usuario uuid,p_cambios jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare
 otorgables constant text[]:=array['dashboard','calendario','primeras-citas','disponibilidad','pedidos_estrene','depositos','inventory','reports','caja','proveedores-catalogo','metas','aliados_admin','comisiones','liquidaciones','horarios','manual','aliados_directos'];
 todos constant text[]:=otorgables||array['proveedores','proveedores-pagos','users','config','clausulas','siigo'];
 destino public.profiles; c jsonb; v_panel text; v_estado text; anterior text; n integer:=0;
begin
 if not public.es_admin() then raise exception 'Solo un administrador puede cambiar accesos.' using errcode='42501'; end if;
 select * into destino from public.profiles where id=p_usuario;
 if destino.id is null then raise exception 'Usuario no encontrado.'; end if;
 if lower(btrim(coalesce(destino.rol,'')))='proveedor' then raise exception 'Los proveedores solo usan su portal; sus accesos no se configuran aquí.'; end if;
 if jsonb_typeof(p_cambios)<>'array' or jsonb_array_length(p_cambios)>100 then raise exception 'Cambios inválidos.'; end if;
 for c in select * from jsonb_array_elements(p_cambios) loop
  v_panel:=c->>'panel'; v_estado:=c->>'estado';
  if v_panel is null or not (v_panel=any(todos)) then raise exception 'Panel desconocido: %',coalesce(v_panel,'(vacío)'); end if;
  if v_estado is null or v_estado not in ('permitido','bloqueado','defecto') then raise exception 'Estado inválido para %',v_panel; end if;
  if v_estado='permitido' and not (v_panel=any(otorgables)) then raise exception 'El panel % es exclusivo de administración: solo se puede quitar.',v_panel; end if;
  select a.estado into anterior from public.accesos_paneles a where a.usuario_id=p_usuario and a.panel=v_panel;
  if coalesce(anterior,'defecto')=v_estado then continue; end if;
  insert into public.accesos_paneles(usuario_id,panel,estado,actualizado_por,actualizado_at) values(p_usuario,v_panel,v_estado,auth.uid(),now())
  on conflict (usuario_id,panel) do update set estado=excluded.estado,actualizado_por=excluded.actualizado_por,actualizado_at=excluded.actualizado_at;
  insert into public.accesos_paneles_bitacora(usuario_id,panel,estado_anterior,estado_nuevo,cambiado_por) values(p_usuario,v_panel,coalesce(anterior,'defecto'),v_estado,auth.uid());
  n:=n+1;
 end loop;
 return n;
end $$;

create function private.buscar_aliados_directos(p_tipo integer,p_q text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text:=lower(btrim(coalesce(p_q,''))); d text:=regexp_replace(coalesce(p_q,''),'\D','','g');
begin
 if auth.uid() is null or private.prov_rol() in ('','proveedor') then raise exception 'No autorizado.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'nombre',a.nombre_completo,'cedula',a.cedula,'celular',a.celular,'correo',a.correo,'direccion',a.direccion,'tipo_aliado_id',a.tipo_aliado_id,'tipo',t.nombre) order by a.nombre_completo)
  from (select * from public.aliados a where a.estado='activo' and (p_tipo is null or a.tipo_aliado_id=p_tipo)
   and (q='' or private.norm_nombre(a.nombre_completo) like '%'||private.norm_nombre(q)||'%' or (d<>'' and a.cedula like '%'||d||'%')) order by a.nombre_completo limit 20) a
  join public.tipos_aliado t on t.id=a.tipo_aliado_id),'[]'::jsonb);
end $$;
create function public.buscar_aliados_directos(p_tipo integer,p_q text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.buscar_aliados_directos(p_tipo,p_q); $$;
revoke all on function private.buscar_aliados_directos(integer,text),public.buscar_aliados_directos(integer,text),public.buscar_aliados(smallint,text) from public,anon,authenticated;
grant execute on function private.buscar_aliados_directos(integer,text),public.buscar_aliados_directos(integer,text) to authenticated;
