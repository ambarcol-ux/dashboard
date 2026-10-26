-- Depósitos: editar las cuatro clases de filas del historial (movimiento, devolución anterior, comprobante de ingreso anterior, comprobante de entrega). Sin eliminar.
-- Siempre con permiso, motivo y auditoría (antes/después).
alter table public.depositos_ediciones alter column registro_id type text using registro_id::text;

create or replace function private.editar_movimiento_deposito(p_origen text,p_id uuid,p_datos jsonb) returns void language plpgsql security definer set search_path='' as $$
declare m public.movimientos_depositos; d public.devoluciones_depositos; s public.soportes_depositos_anteriores; e public.entregas_bitacora; c public.contratos; usado numeric;
 n numeric:=(p_datos->>'monto')::numeric; desc_ numeric:=coalesce((p_datos->>'descuento')::numeric,0); f date:=(p_datos->>'fecha')::date;
 met text:=nullif(btrim(p_datos->>'metodo'),''); obs text:=nullif(btrim(p_datos->>'observaciones'),''); mot text:=nullif(btrim(p_datos->>'motivo_descuento'),'');
 razon text:=btrim(coalesce(p_datos->>'motivo_cambio','')); cid uuid; antes jsonb;
begin
 if not (public.es_admin() or private.tiene_permiso('depositos.modificar_valor')) then raise exception 'No tienes permiso para editar movimientos de depósito.' using errcode='42501'; end if;
 if length(razon)<5 then raise exception 'Escribe el motivo del cambio (mínimo 5 caracteres).'; end if;
 if met is not null and met not in ('Efectivo','Transferencia','Tarjeta','Otro') then raise exception 'Método no válido.'; end if;
 if p_origen in ('movimiento','anterior','soporte') and (n is null or n<0 or desc_<0 or n+desc_<=0 or n<>round(n,2) or desc_<>round(desc_,2)) then raise exception 'Revisa los montos.'; end if;
 if p_origen in ('movimiento','anterior') and (f is null or f>(now() at time zone 'America/Bogota')::date) then raise exception 'Revisa la fecha (no puede ser futura).'; end if;
 if p_origen='movimiento' then select * into m from public.movimientos_depositos where id=p_id for update; cid:=m.contrato_id; antes:=to_jsonb(m);
 elsif p_origen='anterior' then select * into d from public.devoluciones_depositos where id=p_id for update; cid:=d.contrato_id; antes:=to_jsonb(d);
 elsif p_origen='soporte' then select * into s from public.soportes_depositos_anteriores where contrato_id=p_id for update; cid:=s.contrato_id; antes:=to_jsonb(s);
 elsif p_origen='entrega' then select * into e from public.entregas_bitacora where id=p_id for update; cid:=e.contrato_id; antes:=jsonb_build_object('metodo',e.metodo_deposito,'comprobante',e.comprobante_deposito_path);
 else raise exception 'Movimiento no válido.'; end if;
 if cid is null then raise exception 'Registro no encontrado.'; end if;
 if not public.es_admin() and not private.acceso_deposito(cid) then raise exception 'No tienes acceso a este contrato.' using errcode='42501'; end if;
 select * into c from public.contratos where id=cid for update;
 select coalesce(sum(monto_devuelto+coalesce(monto_descuento,0)),0) into usado from public.devoluciones_depositos where contrato_id=cid and coalesce(lower(estado),'completado') not in ('cancelado','anulado','rechazado');
 if p_origen='movimiento' and m.tipo='ingreso' then
  if desc_<>0 then raise exception 'Un ingreso no lleva descuento.'; end if;
  if coalesce(c.valor_deposito,0)+(n-m.monto)<usado then raise exception 'Con ese valor el depósito quedaría por debajo de lo ya devuelto.'; end if;
  update public.contratos set valor_deposito=coalesce(valor_deposito,0)+(n-m.monto) where id=cid;
  update public.movimientos_depositos set monto=n,fecha=f,metodo=coalesce(met,metodo),observaciones=obs where id=m.id;
 elsif p_origen='movimiento' then
  if desc_>0 and mot is null then raise exception 'Escribe el motivo del descuento.'; end if;
  update public.movimientos_depositos set monto=n,descuento=desc_,fecha=f,metodo=coalesce(met,metodo),motivo=mot,observaciones=obs where id=m.id;
  if m.devolucion_id is not null then update public.devoluciones_depositos set monto_devuelto=n,monto_descuento=desc_,fecha_devolucion=f,motivo_descuento=mot,observaciones=obs where id=m.devolucion_id; end if;
 elsif p_origen='anterior' then
  if desc_>0 and mot is null then raise exception 'Escribe el motivo del descuento.'; end if;
  update public.devoluciones_depositos set monto_devuelto=n,monto_descuento=desc_,fecha_devolucion=f,motivo_descuento=mot,observaciones=obs where id=d.id;
 elsif p_origen='soporte' then
  if n<=0 then raise exception 'El valor debe ser mayor que cero.'; end if;
  update public.soportes_depositos_anteriores set monto=n,metodo=coalesce(met,metodo) where contrato_id=s.contrato_id;
 else
  update public.entregas_bitacora set metodo_deposito=coalesce(met,metodo_deposito) where id=e.id;
 end if;
 insert into public.depositos_ediciones(contrato_id,origen,registro_id,antes,despues,motivo,usuario_id) values(cid,p_origen,p_id::text,antes,p_datos-'motivo_cambio',razon,auth.uid());
 insert into public.bitacora_contratos(contrato_id,accion,detalle,usuario) values(cid,'Movimiento de depósito editado',jsonb_build_object('registro',p_id,'antes',antes,'despues',p_datos)::text,(select nombre from public.profiles where id=auth.uid()));
end $$;
