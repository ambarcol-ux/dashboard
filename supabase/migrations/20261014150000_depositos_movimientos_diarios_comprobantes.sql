-- Deposits: a daily statement of money movements and audited receipt corrections.
-- Both reuse the existing records: movimientos_depositos (every ingreso and every paid devolución,
-- cash or transfer), contratos, sedes and profiles; corrections are logged in bitacora_contratos.
-- Old receipt files stay in storage, so the audit trail can always open them.

-- Movements registered between two days (Bogotá time), limited by the existing deposit access:
-- admin and contabilidad see every site, other users only their site, scoped accounts their one site.
create function private.movimientos_depositos_dia(p_desde date,p_hasta date)
returns table(id uuid,tipo text,monto numeric,descuento numeric,fecha date,registrado_at timestamptz,metodo text,motivo text,observaciones text,comprobante_path text,
 contrato_id uuid,numero_contrato text,numero_factura text,cliente_nombre text,cliente_documento text,sede text,sede_id uuid,usuario text)
language sql stable security definer set search_path='' as $$
 select m.id,m.tipo,m.monto,m.descuento,m.fecha,m.created_at,m.metodo,m.motivo,m.observaciones,m.comprobante_path,
  c.id,c.numero_contrato,c.numero_factura,c.cliente_nombre,c.cliente_documento,coalesce(s.nombre,c.sede),c.sede_id,coalesce(p.nombre,p.email,'Usuario no disponible')
 from public.movimientos_depositos m
 join public.contratos c on c.id=m.contrato_id
 left join public.sedes s on s.id=c.sede_id
 left join public.profiles p on p.id=m.usuario_id
 where p_desde is not null and p_hasta is not null and p_hasta>=p_desde and p_hasta-p_desde<=92
  and (m.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
  and private.acceso_deposito(c.id)
  and ((select private.sede_operativa_limitada()) is null or c.sede_id=(select private.sede_operativa_limitada()))
 order by m.created_at desc;
$$;
create function public.movimientos_depositos_dia(p_desde date,p_hasta date)
returns table(id uuid,tipo text,monto numeric,descuento numeric,fecha date,registrado_at timestamptz,metodo text,motivo text,observaciones text,comprobante_path text,
 contrato_id uuid,numero_contrato text,numero_factura text,cliente_nombre text,cliente_documento text,sede text,sede_id uuid,usuario text)
language sql stable security invoker set search_path='' as $$ select * from private.movimientos_depositos_dia(p_desde,p_hasta); $$;

-- Replace or remove the receipt of a movement (or of a previous-deposit support) without touching
-- amounts, dates or methods. Only admin and contabilidad; the reason, old and new file are audited.
create function private.cambiar_comprobante_deposito(p_tipo text,p_id uuid,p_path text,p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare u public.profiles; mov public.movimientos_depositos; cid uuid; anterior text;
 nuevo text:=nullif(btrim(coalesce(p_path,'')),''); reason text:=btrim(coalesce(p_motivo,''));
begin
 select * into u from public.profiles where id=auth.uid() and coalesce(activo,true) and lower(btrim(rol)) in ('admin','contabilidad');
 if not found then raise exception 'Solo Contabilidad o un administrador pueden cambiar comprobantes.' using errcode='42501'; end if;
 if length(reason) not between 5 and 500 then raise exception 'Escribe el motivo del cambio (mínimo 5 caracteres).'; end if;
 if p_tipo='movimiento' then
  select * into mov from public.movimientos_depositos where id=p_id for update;
  if not found then raise exception 'Movimiento no encontrado.'; end if;
  cid:=mov.contrato_id;anterior:=mov.comprobante_path;
 elsif p_tipo='soporte' then
  select s.comprobante_path into anterior from public.soportes_depositos_anteriores s where s.contrato_id=p_id for update;
  if not found then raise exception 'Comprobante del depósito anterior no encontrado.'; end if;
  if nuevo is null then raise exception 'El comprobante del depósito anterior solo se puede reemplazar.'; end if;
  cid:=p_id;
 else raise exception 'Tipo de comprobante inválido.';
 end if;
 if not private.acceso_deposito(cid) or ((select private.sede_operativa_limitada()) is not null and not exists(select 1 from public.contratos c where c.id=cid and c.sede_id=(select private.sede_operativa_limitada()))) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 if nuevo is not distinct from anterior then raise exception 'Selecciona un comprobante diferente al actual.'; end if;
 if nuevo is not null then perform private.comprobante_deposito(cid,nuevo); end if;
 if p_tipo='movimiento' then
  update public.movimientos_depositos set comprobante_path=nuevo where id=mov.id;
  -- A transfer refund shows its receipt from the request too; keep both in step.
  update public.solicitudes_depositos set comprobante_path=nuevo where id=mov.id;
 else
  update public.soportes_depositos_anteriores set comprobante_path=nuevo where contrato_id=cid;
 end if;
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario)
 values(cid,case when nuevo is null then 'Comprobante de depósito eliminado' when anterior is null then 'Comprobante de depósito adjuntado' else 'Comprobante de depósito reemplazado' end,
  jsonb_build_object('registro',p_tipo,'id',p_id,'tipo_movimiento',mov.tipo,'monto',mov.monto,'anterior',anterior,'nuevo',nuevo,'motivo',reason,'usuario_id',u.id)::text,coalesce(u.nombre,u.email));
end $$;
create function public.cambiar_comprobante_deposito(p_tipo text,p_id uuid,p_path text,p_motivo text)
returns void language sql security invoker set search_path='' as $$ select private.cambiar_comprobante_deposito(p_tipo,p_id,p_path,p_motivo); $$;

revoke all on function private.movimientos_depositos_dia(date,date),public.movimientos_depositos_dia(date,date),
 private.cambiar_comprobante_deposito(text,uuid,text,text),public.cambiar_comprobante_deposito(text,uuid,text,text) from public,anon;
grant execute on function private.movimientos_depositos_dia(date,date),public.movimientos_depositos_dia(date,date),
 private.cambiar_comprobante_deposito(text,uuid,text,text),public.cambiar_comprobante_deposito(text,uuid,text,text) to authenticated;
