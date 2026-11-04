-- Inventario › Traslados: solicitud → aprobación → envío → recepción (y devolución en préstamos), con historial.
-- Reutiliza traslados_bitacora (los 356 traslados directos hechos desde Inventario quedan como «Directo», sin cambios).
-- Tipos: definitivo (cambia la sede principal) y préstamo (vuelve a su sede; fecha de devolución escrita a mano).
-- Aprueba la sede dueña del vestido o administración. Transportadora, guía y costo del envío son opcionales.
-- Revert: drop function public.traslados_lista(), public.traslado_solicitar(jsonb), public.traslado_aprobar(uuid,boolean,text),
--   public.traslado_enviar(uuid,jsonb), public.traslado_recibir(uuid,text), public.traslado_devolver(uuid), public.traslado_cancelar(uuid,text),
--   private.traslado_en_sede(uuid), private.traslado_permiso(text);
--   alter table public.traslados_bitacora drop column tipo, drop column fecha_devolucion, drop column contrato_id, drop column solicitado_por,
--   drop column aprobado_at, drop column transportadora, drop column guia, drop column costo_envio, drop column observacion,
--   drop column traslado_padre_id, drop column updated_at;
--   delete from public.roles_permisos where permiso in ('panel.traslados','traslados.solicitar','traslados.aprobar','traslados.mover');
--   delete from public.permisos where codigo in ('panel.traslados','traslados.solicitar','traslados.aprobar','traslados.mover');
alter table public.traslados_bitacora
 add column if not exists tipo text check (tipo is null or tipo in ('definitivo','prestamo','devolucion')),
 add column if not exists fecha_devolucion date,
 add column if not exists contrato_id uuid references public.contratos(id),
 add column if not exists solicitado_por uuid references public.profiles(id),
 add column if not exists aprobado_at timestamptz,
 add column if not exists transportadora text check (transportadora is null or length(transportadora)<=80),
 add column if not exists guia text check (guia is null or length(guia)<=80),
 add column if not exists costo_envio numeric check (costo_envio is null or costo_envio>=0),
 add column if not exists observacion text check (observacion is null or length(observacion)<=500),
 add column if not exists traslado_padre_id uuid references public.traslados_bitacora(id),
 add column if not exists updated_at timestamptz;
create index if not exists traslados_bitacora_flujo on public.traslados_bitacora(estado) where solicitado_por is not null;

insert into public.permisos(codigo,modulo,accion,descripcion,solo_admin,orden) values
 ('panel.traslados','Inventario','Ver Traslados','Bandejas de traslados y préstamos de vestidos entre sedes',false,17),
 ('traslados.solicitar','Inventario','Solicitar traslados','Pedir un vestido de otra sede (definitivo o préstamo)',false,18),
 ('traslados.aprobar','Inventario','Aprobar traslados','Aprobar o rechazar las solicitudes de vestidos de su sede',false,19),
 ('traslados.mover','Inventario','Enviar y recibir traslados','Marcar envíos, recepciones y devoluciones',false,20)
on conflict (codigo) do nothing;
insert into public.roles_permisos(rol_id,permiso,activo)
 select r,p,true from unnest(array['asesora_lider','franquiciado']) r, unnest(array['panel.traslados','traslados.solicitar','traslados.aprobar','traslados.mover']) p
 where exists(select 1 from public.roles where id=r)
on conflict do nothing;

create or replace function private.traslado_permiso(p_codigo text) returns boolean language sql stable security definer set search_path='' as $$
 select public.es_admin() or private.tiene_permiso(p_codigo)
$$;
-- The user works at that site (or sees every site).
create or replace function private.traslado_en_sede(p_sede uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.es_admin() or private.sedes_limitadas() is null or p_sede=any(private.sedes_limitadas())
$$;
grant execute on function private.traslado_permiso(text),private.traslado_en_sede(uuid) to authenticated;

-- Transfers the user takes part in (origin or destination site); everything for administration.
create or replace function public.traslados_lista() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.traslado_permiso('panel.traslados') then raise exception 'Sin acceso a Traslados.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
  select jsonb_build_object('id',t.id,'tipo',coalesce(t.tipo,'directo'),'estado',case when t.solicitado_por is null then 'directo' else t.estado end,
   'vestido_id',t.vestido_id,'codigo',v.codigo,'nombre',v.nombre,'talla',v.talla,'color',v.color,
   'sede_origen_id',t.sede_origen_id,'sede_origen',so.nombre,'sede_destino_id',t.sede_destino_id,'sede_destino',sd.nombre,
   'motivo',t.motivo,'fecha_devolucion',t.fecha_devolucion,'contrato',c.numero_contrato,'transportadora',t.transportadora,'guia',t.guia,'costo_envio',t.costo_envio,
   'observacion',t.observacion,'traslado_padre_id',t.traslado_padre_id,
   'solicitado_por',ps.nombre,'aprobado_por',pa.nombre,'enviado_por',pr.nombre,'recibido_por',pc.nombre,
   'created_at',t.created_at,'aprobado_at',t.aprobado_at,'fecha_envio',t.fecha_envio,'fecha_recepcion',t.fecha_recepcion,
   'en_origen',private.traslado_en_sede(t.sede_origen_id),'en_destino',private.traslado_en_sede(t.sede_destino_id)) x
  from public.traslados_bitacora t
  left join public.vestidos v on v.id=t.vestido_id
  left join public.sedes so on so.id=t.sede_origen_id left join public.sedes sd on sd.id=t.sede_destino_id
  left join public.contratos c on c.id=t.contrato_id
  left join public.profiles ps on ps.id=t.solicitado_por left join public.profiles pa on pa.id=t.autorizado_por
  left join public.profiles pr on pr.id=t.realizado_por left join public.profiles pc on pc.id=t.recibido_por
  where private.traslado_en_sede(t.sede_origen_id) or private.traslado_en_sede(t.sede_destino_id)
  order by t.created_at desc limit 500) q),'[]'::jsonb);
end $$;

-- 1. Request: the dress goes from its current site to the destination site.
create or replace function public.traslado_solicitar(p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v public.vestidos; destino uuid:=nullif(p_datos->>'sede_destino_id','')::uuid; tipo text:=coalesce(nullif(p_datos->>'tipo',''),'prestamo');
 devolucion date:=nullif(p_datos->>'fecha_devolucion','')::date; motivo text:=nullif(btrim(coalesce(p_datos->>'motivo','')),'');
 contrato uuid; numero text:=nullif(btrim(coalesce(p_datos->>'numero_contrato','')),''); nuevo uuid;
begin
 if not private.traslado_permiso('traslados.solicitar') then raise exception 'No tienes permiso para solicitar traslados.' using errcode='42501'; end if;
 select * into v from public.vestidos where id=nullif(p_datos->>'vestido_id','')::uuid for update;
 if not found then raise exception 'Vestido no encontrado.'; end if;
 if coalesce(v.archivado,false) or lower(coalesce(v.estado,'')) in ('vendido','dañado/baja','de baja') then raise exception 'El vestido % no se puede trasladar (estado: %).',v.codigo,v.estado; end if;
 if v.sede_actual_id is null then raise exception 'El vestido % no tiene sede actual; asígnala en Inventario.',v.codigo; end if;
 if destino is null or not exists(select 1 from public.sedes where id=destino) then raise exception 'Elige la sede destino.'; end if;
 if destino=v.sede_actual_id then raise exception 'El vestido ya está en esa sede.'; end if;
 if tipo not in ('definitivo','prestamo') then raise exception 'Tipo de traslado no válido.'; end if;
 if not (private.traslado_en_sede(destino) or private.traslado_en_sede(v.sede_actual_id)) then raise exception 'Solo puedes solicitar traslados hacia o desde tus sedes.' using errcode='42501'; end if;
 if tipo='prestamo' and (devolucion is null or devolucion<(now() at time zone 'America/Bogota')::date) then raise exception 'Escribe la fecha de devolución del préstamo (hoy o después).'; end if;
 if motivo is null or length(motivo)>500 then raise exception 'Escribe el motivo del traslado.'; end if;
 if numero is not null then select id into contrato from public.contratos where numero_contrato=numero limit 1; if contrato is null then raise exception 'No existe el contrato %.',numero; end if; end if;
 if exists(select 1 from public.traslados_bitacora where vestido_id=v.id and solicitado_por is not null and estado in ('solicitado','aprobado','enviado')) then raise exception 'El vestido % ya tiene un traslado en curso.',v.codigo; end if;
 insert into public.traslados_bitacora(vestido_id,sede_origen_id,sede_destino_id,sede_origen,sede_destino,estado,tipo,motivo,fecha_devolucion,contrato_id,solicitado_por,updated_at)
 values(v.id,v.sede_actual_id,destino,(select nombre from public.sedes where id=v.sede_actual_id),(select nombre from public.sedes where id=destino),'solicitado',tipo,motivo,case when tipo='prestamo' then devolucion end,contrato,auth.uid(),now())
 returning id into nuevo;
 return nuevo;
end $$;

-- 2. Approve or reject: the site that owns the dress (where it is now) or administration.
create or replace function public.traslado_aprobar(p_id uuid,p_aprobar boolean,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare t public.traslados_bitacora;
begin
 if not private.traslado_permiso('traslados.aprobar') then raise exception 'No tienes permiso para aprobar traslados.' using errcode='42501'; end if;
 select * into t from public.traslados_bitacora where id=p_id for update;
 if not found or t.solicitado_por is null then raise exception 'Traslado no encontrado.'; end if;
 if t.estado<>'solicitado' then raise exception 'Este traslado ya fue %.',t.estado; end if;
 if not private.traslado_en_sede(t.sede_origen_id) then raise exception 'Lo aprueba la sede donde está el vestido o administración.' using errcode='42501'; end if;
 if not p_aprobar and nullif(btrim(coalesce(p_motivo,'')),'') is null then raise exception 'Escribe por qué se rechaza.'; end if;
 update public.traslados_bitacora set estado=case when p_aprobar then 'aprobado' else 'rechazado' end,autorizado_por=auth.uid(),aprobado_at=now(),
  observacion=case when p_aprobar then observacion else left(btrim(p_motivo),500) end,updated_at=now() where id=p_id;
end $$;

-- 3. Ship: the origin site hands it over (carrier, tracking and cost optional).
create or replace function public.traslado_enviar(p_id uuid,p_datos jsonb) returns void language plpgsql security definer set search_path='' as $$
declare t public.traslados_bitacora; costo numeric:=nullif(p_datos->>'costo_envio','')::numeric;
begin
 if not private.traslado_permiso('traslados.mover') then raise exception 'No tienes permiso para enviar traslados.' using errcode='42501'; end if;
 select * into t from public.traslados_bitacora where id=p_id for update;
 if not found or t.solicitado_por is null then raise exception 'Traslado no encontrado.'; end if;
 if t.estado<>'aprobado' then raise exception 'Solo se envía un traslado aprobado (está %).',t.estado; end if;
 if not private.traslado_en_sede(t.sede_origen_id) then raise exception 'Lo envía la sede donde está el vestido.' using errcode='42501'; end if;
 if costo is not null and costo<0 then raise exception 'El costo del envío no puede ser negativo.'; end if;
 update public.traslados_bitacora set estado='enviado',fecha_envio=now(),realizado_por=auth.uid(),
  transportadora=nullif(left(btrim(coalesce(p_datos->>'transportadora','')),80),''),guia=nullif(left(btrim(coalesce(p_datos->>'guia','')),80),''),costo_envio=costo,updated_at=now() where id=p_id;
 update public.vestidos set estado='Traslado' where id=t.vestido_id;
end $$;

-- 4. Receive: the destination site confirms; the dress changes site (and owner site when definitive).
create or replace function public.traslado_recibir(p_id uuid,p_observacion text) returns void language plpgsql security definer set search_path='' as $$
declare t public.traslados_bitacora;
begin
 if not private.traslado_permiso('traslados.mover') then raise exception 'No tienes permiso para recibir traslados.' using errcode='42501'; end if;
 select * into t from public.traslados_bitacora where id=p_id for update;
 if not found or t.solicitado_por is null then raise exception 'Traslado no encontrado.'; end if;
 if t.estado<>'enviado' then raise exception 'Solo se recibe un traslado enviado (está %).',t.estado; end if;
 if not private.traslado_en_sede(t.sede_destino_id) then raise exception 'Lo recibe la sede destino.' using errcode='42501'; end if;
 update public.traslados_bitacora set estado='recibido',fecha_recepcion=now(),recibido_por=auth.uid(),
  observacion=coalesce(nullif(left(btrim(coalesce(p_observacion,'')),500),''),observacion),updated_at=now() where id=p_id;
 update public.vestidos set sede_actual_id=t.sede_destino_id,sede_principal_id=case when t.tipo='definitivo' then t.sede_destino_id else sede_principal_id end where id=t.vestido_id;
 if t.tipo='devolucion' and t.traslado_padre_id is not null then update public.traslados_bitacora set estado='devuelto',updated_at=now() where id=t.traslado_padre_id; end if;
 perform private.refrescar_prenda_operaciones(t.vestido_id);
end $$;

-- 5. Return of a loan: the borrowing site starts it (already approved; then ship and receive as usual).
create or replace function public.traslado_devolver(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.traslados_bitacora; nuevo uuid;
begin
 if not private.traslado_permiso('traslados.mover') then raise exception 'No tienes permiso para devolver préstamos.' using errcode='42501'; end if;
 select * into t from public.traslados_bitacora where id=p_id for update;
 if not found or t.tipo<>'prestamo' then raise exception 'Préstamo no encontrado.'; end if;
 if t.estado<>'recibido' then raise exception 'Solo se devuelve un préstamo recibido (está %).',t.estado; end if;
 if not (private.traslado_en_sede(t.sede_destino_id) or private.traslado_en_sede(t.sede_origen_id)) then raise exception 'Solo las sedes del préstamo pueden devolverlo.' using errcode='42501'; end if;
 if exists(select 1 from public.traslados_bitacora where traslado_padre_id=t.id and estado in ('aprobado','enviado')) then raise exception 'La devolución ya está en curso.'; end if;
 insert into public.traslados_bitacora(vestido_id,sede_origen_id,sede_destino_id,sede_origen,sede_destino,estado,tipo,motivo,contrato_id,solicitado_por,autorizado_por,aprobado_at,traslado_padre_id,updated_at)
 values(t.vestido_id,t.sede_destino_id,t.sede_origen_id,t.sede_destino,t.sede_origen,'aprobado','devolucion','Devolución de préstamo',t.contrato_id,auth.uid(),auth.uid(),now(),t.id,now())
 returning id into nuevo;
 update public.traslados_bitacora set estado='en_devolucion',updated_at=now() where id=t.id;
 return nuevo;
end $$;

-- Cancel before shipping: the requester, either site of the transfer, or administration.
create or replace function public.traslado_cancelar(p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare t public.traslados_bitacora;
begin
 select * into t from public.traslados_bitacora where id=p_id for update;
 if not found or t.solicitado_por is null then raise exception 'Traslado no encontrado.'; end if;
 if t.estado not in ('solicitado','aprobado') then raise exception 'Solo se cancela antes del envío (está %).',t.estado; end if;
 if not (public.es_admin() or t.solicitado_por=auth.uid() or ((private.traslado_en_sede(t.sede_origen_id) or private.traslado_en_sede(t.sede_destino_id)) and private.traslado_permiso('traslados.solicitar'))) then raise exception 'No puedes cancelar este traslado.' using errcode='42501'; end if;
 update public.traslados_bitacora set estado='cancelado',observacion=coalesce(nullif(left(btrim(coalesce(p_motivo,'')),500),''),observacion),updated_at=now() where id=p_id;
 if t.tipo='devolucion' and t.traslado_padre_id is not null then update public.traslados_bitacora set estado='recibido',updated_at=now() where id=t.traslado_padre_id; end if;
end $$;

revoke all on function public.traslados_lista(),public.traslado_solicitar(jsonb),public.traslado_aprobar(uuid,boolean,text),public.traslado_enviar(uuid,jsonb),
 public.traslado_recibir(uuid,text),public.traslado_devolver(uuid),public.traslado_cancelar(uuid,text) from public,anon;
grant execute on function public.traslados_lista(),public.traslado_solicitar(jsonb),public.traslado_aprobar(uuid,boolean,text),public.traslado_enviar(uuid,jsonb),
 public.traslado_recibir(uuid,text),public.traslado_devolver(uuid),public.traslado_cancelar(uuid,text) to authenticated;
