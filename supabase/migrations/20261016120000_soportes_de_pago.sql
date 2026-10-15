-- Soporte obligatorio en anticipos y abonos, enlazado al cierre de caja.
-- • Cada pago nuevo debe tener al menos un archivo soporte (foto o PDF). Se valida en la base de datos:
--   un pago insertado sin soporte se rechaza al confirmar la transacción.
-- • Los pagos anteriores a este cambio quedan como "histórico" y no bloquean el cierre.
-- • La asesora no puede borrar ni cambiar un soporte guardado; solo administración, y queda en la bitácora.
-- • El cierre de caja no se confirma si hay ingresos del día sin soporte.

create table public.soportes_pago (
 id uuid primary key default gen_random_uuid(),
 pago_id uuid not null references public.pagos(id) on delete cascade,
 archivo_path text not null unique,
 nombre text not null check (length(nombre) between 1 and 200),
 tipo text not null,
 tamano integer check (tamano between 0 and 10485760),
 subido_por uuid references public.profiles(id) default auth.uid(),
 subido_at timestamptz not null default now(),
 activo boolean not null default true,
 retirado_at timestamptz,
 retirado_por uuid references public.profiles(id),
 motivo_retiro text
);
create index soportes_pago_pago on public.soportes_pago(pago_id) where activo;
alter table public.soportes_pago enable row level security;
revoke all on public.soportes_pago from public,anon,authenticated;
grant select on public.soportes_pago to authenticated;
-- Se ve si se puede ver el pago (RLS de pagos y contratos, evaluado como el usuario).
create policy soportes_pago_leer on public.soportes_pago for select to authenticated
 using (exists(select 1 from public.pagos p join public.contratos c on c.id=p.contrato_id where p.id=pago_id));

-- Desde cuándo se exige soporte (los pagos anteriores son históricos). Se fija al activar la obligación
-- (migración soportes_obligatorios); hasta entonces todos los pagos cuentan como históricos.
create function private.soportes_desde() returns timestamptz language sql stable set search_path='' as $$ select '2100-01-01T00:00:00Z'::timestamptz $$;
grant execute on function private.soportes_desde() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('soportes_pagos','soportes_pagos',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

-- Archivos subidos por quien registra el pago y aún no enlazados a otro pago.
create function private.soportes_validos(p_soportes jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb; out jsonb:='[]'::jsonb; path text;
begin
 if jsonb_typeof(p_soportes)<>'array' or jsonb_array_length(p_soportes)=0 then raise exception 'Adjunta el soporte del pago (foto o PDF).'; end if;
 if jsonb_array_length(p_soportes)>10 then raise exception 'Máximo 10 archivos por pago.'; end if;
 for s in select * from jsonb_array_elements(p_soportes) loop
  path:=s->>'path';
  if path is null or not exists(select 1 from storage.objects o where o.bucket_id='soportes_pagos' and o.name=path and o.owner_id=auth.uid()::text) then
   raise exception 'Uno de los soportes no terminó de subir. Vuelve a adjuntarlo.'; end if;
  if exists(select 1 from public.soportes_pago where archivo_path=path) then raise exception 'Ese soporte ya está enlazado a otro pago.'; end if;
  out:=out||jsonb_build_array(jsonb_build_object('path',path,'nombre',left(coalesce(nullif(btrim(s->>'nombre'),''),'soporte'),200),
   'tipo',coalesce(nullif(s->>'tipo',''),'application/octet-stream'),'tamano',nullif(s->>'tamano','')::int));
 end loop;
 return out;
end $$;

create function private.registrar_pago_con_soporte(p_contrato uuid,p_valor numeric,p_medio text,p_recibo text,p_observaciones text,p_soportes jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare files jsonb; new_id uuid; c record; s jsonb;
begin
 if not private.prov_es_personal() then raise exception 'No puedes registrar pagos.' using errcode='42501'; end if;
 select id,numero_contrato into c from public.contratos where id=p_contrato;
 if c.id is null then raise exception 'Contrato no encontrado.'; end if;
 if p_valor is null or p_valor<=0 or p_valor<>round(p_valor,2) then raise exception 'Revisa el valor del pago.'; end if;
 if length(btrim(coalesce(p_medio,'')))<2 then raise exception 'Indica el medio de pago.'; end if;
 files:=private.soportes_validos(p_soportes);
 insert into public.pagos(contrato_id,valor_pagado,medio_pago,numero_recibo,observaciones,fecha_pago)
 values(p_contrato,p_valor,btrim(p_medio),coalesce(btrim(p_recibo),''),coalesce(p_observaciones,''),((now() at time zone 'America/Bogota')::date)::timestamp at time zone 'UTC')
 returning id into new_id;
 for s in select * from jsonb_array_elements(files) loop
  insert into public.soportes_pago(pago_id,archivo_path,nombre,tipo,tamano) values(new_id,s->>'path',s->>'nombre',s->>'tipo',(s->>'tamano')::int);
 end loop;
 return new_id;
end $$;

-- Adjuntar soporte a un pago que no tiene (p. ej. desde el cierre de caja). Si ya tiene, solo administración.
create function private.agregar_soporte_pago(p_pago uuid,p_soportes jsonb,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare files jsonb; s jsonb; c record; admin boolean:=public.es_admin(); u public.profiles;
begin
 u:=private.caja_perfil();
 select p.id,ct.id contrato_id,ct.sede_id,ct.numero_contrato into c from public.pagos p join public.contratos ct on ct.id=p.contrato_id where p.id=p_pago;
 if c.id is null then raise exception 'Pago no encontrado.'; end if;
 if not admin and not (private.prov_es_personal() and private.caja_operar(c.sede_id)) then raise exception 'No puedes adjuntar soportes en esta sede.' using errcode='42501'; end if;
 if not admin and exists(select 1 from public.soportes_pago where pago_id=p_pago and activo) then raise exception 'Este pago ya tiene soporte; solo administración puede cambiarlo.' using errcode='42501'; end if;
 files:=private.soportes_validos(p_soportes);
 for s in select * from jsonb_array_elements(files) loop
  insert into public.soportes_pago(pago_id,archivo_path,nombre,tipo,tamano) values(p_pago,s->>'path',s->>'nombre',s->>'tipo',(s->>'tamano')::int);
 end loop;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario,usuario_email)
 values(c.contrato_id,'Soporte de pago agregado',format('%s soporte(s) agregado(s) al pago %s.%s',jsonb_array_length(files),p_pago,coalesce(' Motivo: '||nullif(btrim(p_motivo),''),'')),coalesce(u.nombre,u.email),u.email);
end $$;

-- Solo administración retira (o reemplaza) un soporte guardado; queda en la bitácora.
create function private.retirar_soporte_pago(p_soporte uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare s public.soportes_pago; c uuid; u public.profiles; reason text:=btrim(coalesce(p_motivo,''));
begin
 if not public.es_admin() then raise exception 'Solo administración puede cambiar un soporte guardado.' using errcode='42501'; end if;
 u:=private.caja_perfil();
 select * into s from public.soportes_pago where id=p_soporte for update;
 if s.id is null or not s.activo then raise exception 'Soporte no disponible.'; end if;
 if length(reason)<5 then raise exception 'Escribe el motivo del cambio.'; end if;
 update public.soportes_pago set activo=false,retirado_at=now(),retirado_por=auth.uid(),motivo_retiro=reason where id=p_soporte;
 select contrato_id into c from public.pagos where id=s.pago_id;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario,usuario_email)
 values(c,'Soporte de pago retirado',format('Se retiró el soporte «%s» del pago %s. Motivo: %s',s.nombre,s.pago_id,reason),coalesce(u.nombre,u.email),u.email);
end $$;

-- ── Archivos: suben quienes registran pagos; los ve quien puede ver la caja de la sede del contrato ──
create function private.soporte_pago_legible(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select public.es_admin() or exists(select 1 from public.soportes_pago s join public.pagos p on p.id=s.pago_id join public.contratos c on c.id=p.contrato_id
  where s.archivo_path=p_name and private.caja_ver(c.sede_id));
$$;
grant execute on function private.soporte_pago_legible(text) to authenticated;
create policy soportes_pagos_leer on storage.objects for select to authenticated
 using (bucket_id='soportes_pagos' and (owner_id=(select auth.uid())::text or private.soporte_pago_legible(name)));
create policy soportes_pagos_subir on storage.objects for insert to authenticated
 with check (bucket_id='soportes_pagos' and (select private.prov_es_personal()));
-- Contabilidad puede ver (no subir) los soportes de pago.
alter policy contabilidad_solo_comprobantes on storage.objects
 using (((select private.current_profile_role()) is distinct from 'contabilidad') or bucket_id in ('comprobantes_depositos','comprobantes_caja','soportes_pagos'))
 with check (((select private.current_profile_role()) is distinct from 'contabilidad') or bucket_id='comprobantes_depositos');
alter policy contabilidad_comprobantes_pendientes on storage.objects
 using ((not private.es_contabilidad()) or (bucket_id='comprobantes_depositos' and private.comprobante_contabilidad(name,true)) or bucket_id in ('comprobantes_caja','soportes_pagos'));

-- ── Wrappers públicos (la visibilidad del contrato la decide el RLS como el usuario) ─────────────
create function public.registrar_pago_con_soporte(p_contrato uuid,p_valor numeric,p_medio text,p_recibo text,p_observaciones text,p_soportes jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.contratos where id=p_contrato) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 return private.registrar_pago_con_soporte(p_contrato,p_valor,p_medio,p_recibo,p_observaciones,p_soportes);
end $$;
create function public.agregar_soporte_pago(p_pago uuid,p_soportes jsonb,p_motivo text) returns void language sql security invoker set search_path='' as $$ select private.agregar_soporte_pago(p_pago,p_soportes,p_motivo); $$;
create function public.retirar_soporte_pago(p_soporte uuid,p_motivo text) returns void language sql security invoker set search_path='' as $$ select private.retirar_soporte_pago(p_soporte,p_motivo); $$;

revoke all on function private.soportes_validos(jsonb),private.registrar_pago_con_soporte(uuid,numeric,text,text,text,jsonb),
 private.agregar_soporte_pago(uuid,jsonb,text),private.retirar_soporte_pago(uuid,text),
 public.registrar_pago_con_soporte(uuid,numeric,text,text,text,jsonb),public.agregar_soporte_pago(uuid,jsonb,text),public.retirar_soporte_pago(uuid,text) from public,anon;
grant execute on function private.soportes_validos(jsonb),private.registrar_pago_con_soporte(uuid,numeric,text,text,text,jsonb),private.agregar_soporte_pago(uuid,jsonb,text),private.retirar_soporte_pago(uuid,text),
 public.registrar_pago_con_soporte(uuid,numeric,text,text,text,jsonb),public.agregar_soporte_pago(uuid,jsonb,text),public.retirar_soporte_pago(uuid,text) to authenticated;

-- ── Cierre de caja: soporte por ingreso y bloqueo si falta alguno ────────────────────────────────
create function private.soportes_json(p_pago uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'path',s.archivo_path,'nombre',s.nombre,'tipo',s.tipo,'subido_at',s.subido_at,'subido_por',coalesce(u.nombre,u.email)) order by s.subido_at),'[]'::jsonb)
 from public.soportes_pago s left join public.profiles u on u.id=s.subido_por where s.pago_id=p_pago and s.activo;
$$;
create function private.pagos_sin_soporte(p_sede uuid,p_fecha date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('pago_id',p.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'valor',p.valor_pagado,'medio',p.medio_pago,'recibo',p.numero_recibo) order by p.created_at),'[]'::jsonb)
 from public.pagos p join public.contratos c on c.id=p.contrato_id
 where c.sede_id=p_sede and (p.fecha_pago at time zone 'UTC')::date=p_fecha and p.valor_pagado>0 and p.created_at>=private.soportes_desde()
  and not exists(select 1 from public.soportes_pago s where s.pago_id=p.id and s.activo);
$$;
revoke all on function private.soportes_json(uuid),private.pagos_sin_soporte(uuid,date) from public,anon;
grant execute on function private.soportes_json(uuid),private.pagos_sin_soporte(uuid,date) to authenticated;

create or replace function private.caja_dia(p_sede uuid,p_fecha date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare inicial numeric; movs jsonb; tot jsonb; cierre jsonb; sug jsonb; faltan jsonb; pagos_dia int; desde timestamptz:=private.soportes_desde();
begin
 if p_sede is null or p_fecha is null or not private.caja_ver(p_sede) then raise exception 'No tienes acceso a la caja de esta sede.' using errcode='42501'; end if;
 inicial:=private.caja_saldo_inicial(p_sede,p_fecha);
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'tipo',m.tipo,'categoria',m.categoria,'medio',m.medio,'valor',m.valor,'descripcion',m.descripcion,
  'contrato_id',m.contrato_id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'origen',m.origen,'comprobante_path',m.comprobante_path,
  'usuario',coalesce(u.nombre,u.email),'created_at',m.created_at,'anulado_at',m.anulado_at,'motivo_anulacion',m.motivo_anulacion,'anulado_por',coalesce(a.nombre,a.email),
  'pago_id',case when m.origen='pago' then m.origen_id end,
  'soportes',case when m.origen='pago' then private.soportes_json(m.origen_id) end,
  'soporte_historico',case when m.origen='pago' then coalesce((select p.created_at<desde from public.pagos p where p.id=m.origen_id),false) end) order by m.created_at),'[]'::jsonb)
 into movs from public.caja_movimientos m left join public.contratos c on c.id=m.contrato_id left join public.profiles u on u.id=m.usuario_id left join public.profiles a on a.id=m.anulado_por
 where m.sede_id=p_sede and m.fecha=p_fecha;
 select jsonb_build_object(
  'ingresos',coalesce(sum(valor) filter (where tipo='ingreso'),0),'egresos',coalesce(sum(valor) filter (where tipo='egreso'),0),
  'ingresos_efectivo',coalesce(sum(valor) filter (where tipo='ingreso' and medio='Efectivo'),0),'egresos_efectivo',coalesce(sum(valor) filter (where tipo='egreso' and medio='Efectivo'),0),
  'por_medio',coalesce((select jsonb_object_agg(medio,jsonb_build_object('ingresos',i,'egresos',e)) from (select medio,sum(valor) filter (where tipo='ingreso') i,sum(valor) filter (where tipo='egreso') e from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null group by medio) x),'{}'::jsonb))
 into tot from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null;
 select to_jsonb(k)||jsonb_build_object('cerrado_por_nombre',(select coalesce(nombre,email) from public.profiles where id=k.cerrado_por)) into cierre
  from public.caja_cierres k where k.sede_id=p_sede and k.fecha=p_fecha and k.reabierto_at is null;
 select coalesce(jsonb_agg(s order by s->>'hora'),'[]'::jsonb) into sug from (
  select jsonb_build_object('origen','pago','origen_id',p.id,'tipo','ingreso','categoria','Pago de contrato','medio',case when p.medio_pago in ('Efectivo','Transferencia','Tarjeta') then p.medio_pago else '' end,
   'valor',p.valor_pagado,'contrato_id',c.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'hora',p.fecha_pago,
   'soportes',private.soportes_json(p.id),'soporte_historico',p.created_at<desde) s
  from public.pagos p join public.contratos c on c.id=p.contrato_id
  where c.sede_id=p_sede and (p.fecha_pago at time zone 'UTC')::date=p_fecha and p.valor_pagado>0
   and not exists(select 1 from public.caja_movimientos x where x.origen='pago' and x.origen_id=p.id and x.anulado_at is null)
  union all
  select jsonb_build_object('origen',case when d.tipo='ingreso' then 'deposito' else 'devolucion' end,'origen_id',d.id,'tipo',case when d.tipo='ingreso' then 'ingreso' else 'egreso' end,
   'categoria',case when d.tipo='ingreso' then 'Depósito en garantía' else 'Devolución de depósito' end,'medio',case when d.metodo in ('Efectivo','Transferencia','Tarjeta','Otro') then d.metodo else '' end,
   'valor',d.monto,'contrato_id',c.id,'numero_contrato',c.numero_contrato,'cliente',c.cliente_nombre,'hora',d.created_at)
  from public.movimientos_depositos d join public.contratos c on c.id=d.contrato_id
  where c.sede_id=p_sede and (d.created_at at time zone 'America/Bogota')::date=p_fecha and d.monto>0
   and not exists(select 1 from public.caja_movimientos x where x.origen in ('deposito','devolucion') and x.origen_id=d.id and x.anulado_at is null)
 ) q;
 faltan:=private.pagos_sin_soporte(p_sede,p_fecha);
 select count(*) into pagos_dia from public.pagos p join public.contratos c on c.id=p.contrato_id
  where c.sede_id=p_sede and (p.fecha_pago at time zone 'UTC')::date=p_fecha and p.valor_pagado>0 and p.created_at>=desde;
 return jsonb_build_object('sede_id',p_sede,'fecha',p_fecha,'saldo_inicial',inicial,'movimientos',movs,'totales',tot,'cierre',cierre,'sugerencias',sug,
  'puede_operar',private.caja_operar(p_sede),'es_hoy',p_fecha=private.caja_hoy(),
  'pagos_sin_soporte',faltan,'soportes',jsonb_build_object('pagos',pagos_dia,'con_soporte',pagos_dia-jsonb_array_length(faltan)));
end $$;

create or replace function private.cerrar_caja(p_sede uuid,p_fecha date,p_contado numeric,p_observaciones text) returns uuid language plpgsql security definer set search_path='' as $$
declare u public.profiles; inicial numeric; ie numeric; ee numeric; esperado numeric; tot jsonb; new_id uuid; obs text:=btrim(coalesce(p_observaciones,'')); faltan int;
begin
 u:=private.caja_perfil();
 if u.id is null or p_sede is null or not private.caja_operar(p_sede) then raise exception 'No puedes cerrar la caja de esta sede.' using errcode='42501'; end if;
 if p_fecha is null or p_fecha>private.caja_hoy() then raise exception 'No se puede cerrar un día futuro.'; end if;
 if p_contado is null or p_contado<0 or p_contado<>round(p_contado,2) then raise exception 'Escribe el efectivo contado.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('caja:'||p_sede::text||':'||p_fecha::text,0));
 if private.caja_dia_cerrado(p_sede,p_fecha) then raise exception 'La caja de ese día ya está cerrada.'; end if;
 faltan:=jsonb_array_length(private.pagos_sin_soporte(p_sede,p_fecha));
 if faltan>0 then raise exception 'Hay % ingreso(s) del día sin soporte. Adjunta el soporte para poder confirmar el cierre.',faltan; end if;
 inicial:=private.caja_saldo_inicial(p_sede,p_fecha);
 select coalesce(sum(valor) filter (where tipo='ingreso' and medio='Efectivo'),0),coalesce(sum(valor) filter (where tipo='egreso' and medio='Efectivo'),0),
  jsonb_build_object('ingresos',coalesce(sum(valor) filter (where tipo='ingreso'),0),'egresos',coalesce(sum(valor) filter (where tipo='egreso'),0),'movimientos',count(*))
  into ie,ee,tot from public.caja_movimientos where sede_id=p_sede and fecha=p_fecha and anulado_at is null;
 esperado:=inicial+ie-ee;
 if p_contado<>esperado and length(obs)<5 then raise exception 'Hay diferencia entre lo contado y lo esperado: explica el motivo en observaciones.'; end if;
 insert into public.caja_cierres(sede_id,fecha,saldo_inicial,ingresos_efectivo,egresos_efectivo,esperado,contado,diferencia,totales,observaciones,cerrado_por)
 values(p_sede,p_fecha,inicial,ie,ee,esperado,p_contado,p_contado-esperado,tot,obs,u.id) returning id into new_id;
 return new_id;
end $$;
